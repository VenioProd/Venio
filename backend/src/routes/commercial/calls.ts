import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { body, validationResult } from 'express-validator'
import Call, { TERMINAL_CALL_STATUSES, type ICall } from '../../models/Call.js'
import Lead from '../../models/Lead.js'
import CrmSettings from '../../models/CrmSettings.js'
import { findReadableCall, readableAuthors, repCallScope, type CallDeskScope } from '../../lib/callDeskScope.js'
import User from '../../models/User.js'
import {
  assertCallable,
  attemptDayOf,
  attemptWindowOf,
  isPhoneSuppressed,
  localClock,
  windowAttempts,
} from '../../lib/callGuards.js'
import { callCountryRules, callerIdFor, phoneTarget } from '../../lib/telephony/countries.js'
import {
  activeBridgePhone,
  bridgeAnswerUrl,
  bridgeStatusUrl,
  confirmBridgeCode,
  publicBridge,
  sendBridgeCode,
} from '../../lib/telephony/bridge.js'
import CallerProfile from '../../models/CallerProfile.js'
import { applyLeadChange } from '../../lib/crmLeadService.js'
import type { ICrmSettings } from '../../types/models/index.js'
import {
  createVoiceToken,
  requireTelephony,
  suggestedOutcome,
  telephonyConfig,
  telephonyError,
  type TelephonyConfig,
} from '../../lib/telephony/index.js'
import { createBridgeCall, fetchProviderRecording, hangupProviderCall } from '../../lib/telephony/rest.js'
import {
  claimLine,
  confirmLine,
  dialerSettings,
  powerDialerBlocked,
  releaseLine,
  repointLine,
} from '../../lib/telephony/dialer.js'
import {
  objectToRecording,
  publicRecording,
  recordingConfig,
  recordingSettings,
} from '../../lib/telephony/recording.js'
import { cachedAudio, dropCachedAudio } from '../../lib/recordingAudioCache.js'
import CallTranscript from '../../models/CallTranscript.js'
import CallAnalysis from '../../models/CallAnalysis.js'

/**
 * Appels (lot A). On lance un appel par l'identifiant du lead, jamais par un
 * numéro : le serveur résout le numéro et passe les gardes. Un appel se lit par
 * son auteur, tant que le lead est dans son périmètre ; l'équipe lit aussi
 * celui de l'externe d'une fiche transmise (`lib/callDeskScope.ts`).
 */

const isDuplicate = (err: unknown, field: string) =>
  (err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 &&
  Boolean((err as { keyPattern?: Record<string, unknown> }).keyPattern?.[field])

type CallRecordingDoc = NonNullable<ICall['recording']>

/** L'audio peut être relayé : prêt, non contesté, pas échu, et conservé après transcription (`keepAudioDays` > 0). */
const isAudioHeld = (recording: CallRecordingDoc | null | undefined, keepAudioDays: number) =>
  recording?.status === 'READY' &&
  !recording.objection &&
  Boolean(recording.sid) &&
  (!recording.deleteAt || recording.deleteAt > new Date()) &&
  keepAudioDays > 0

/**
 * Où en est l'audio d'un enregistrement prêt : lisible (`PLAYABLE`), ou gardé le temps du transcript puis
 * effacé (`AWAITING_TRANSCRIPT`, `keepAudioDays` = 0). Absent sinon (échu, effacé, contesté, pas prêt).
 */
const audioState = (recording: CallRecordingDoc | null | undefined, keepAudioDays: number) => {
  if (isAudioHeld(recording, keepAudioDays)) return 'PLAYABLE' as const
  if (recording?.status === 'READY' && !recording.objection && !recording.deleteAt && keepAudioDays === 0)
    return 'AWAITING_TRANSCRIPT' as const
  return null
}

/** L'état public de l'enregistrement ; `audio` seulement quand il est prêt (les autres états se suffisent). */
const withAudio = (call: Pick<ICall, 'recording'>, keepAudioDays: number) => ({
  ...publicRecording(call),
  ...(call.recording?.status === 'READY' ? { audio: audioState(call.recording, keepAudioDays) } : {}),
})

/** Plafond de la fenêtre atteint sans jamais joindre personne : « non joignable », par `applyLeadChange` (lot P). */
async function markUnreachable(leadId: string, actor: string, settings: ICrmSettings, now: Date) {
  const lead = await Lead.findOne({ _id: leadId, callUnreachableAt: null })
  if (lead) await applyLeadChange(lead, { callUnreachableAt: now }, { actor, source: 'bulk', settings, emit: false })
}

/**
 * Mode pont : l'opérateur appelle le portable du commercial. Un échec annule l'appel (rien n'est parti
 * vers le prospect) ; la tentative reste comptée, comme un appel du navigateur qui ne se relie pas.
 */
async function dialBridge(config: TelephonyConfig, callId: mongoose.Types.ObjectId, phone: string) {
  try {
    const sid = await createBridgeCall(config, {
      to: phone,
      from: config.callerId,
      url: bridgeAnswerUrl(config, String(callId)),
      statusCallback: bridgeStatusUrl(config, String(callId)),
    })
    await Call.updateOne({ _id: callId }, { $set: { bridgeCallSid: sid } })
  } catch {
    const now = new Date()
    await Call.updateOne(
      { _id: callId, status: 'CREATED', providerCallSid: null },
      { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: 'BRIDGE_FAILED', at: now } } },
    )
    throw telephonyError(502, 'BRIDGE_FAILED')
  }
}

export function createCallsRoutes(scope: CallDeskScope) {
  const router = express.Router()

  const findCall = async (req: Request): Promise<ICall | null> =>
    (await findReadableCall(req, scope, String(req.params.id)))?.call ?? null
  // Raccrocher reste à celui qui appelle.
  const findOwnCall = async (req: Request): Promise<ICall | null> => {
    const found = await findReadableCall(req, scope, String(req.params.id))
    return found?.own ? found.call : null
  }

  router.get('/calls/config', scope.read, async (req, res, next) => {
    try {
      const config = telephonyConfig()
      const settings = await CrmSettings.getSettings()
      res.json({
        enabled: Boolean(config),
        callerId: config?.callerId ?? null,
        edge: config?.edge ?? null,
        callingHours: settings.telephony.callingHours,
        attemptCap: settings.telephony.attemptCapPerDay,
        attemptWindow: attemptWindowOf(settings),
        // Lot P : l'appel passe par le portable vérifié de l'utilisateur au lieu du navigateur.
        bridge: { active: Boolean(config && (await activeBridgePhone(String(req.user!.id)))) },
        recording: recordingConfig(settings),
        dialer: dialerSettings(settings),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/calls/token', scope.write, requireTelephony, (req, res) => {
    res.json(createVoiceToken(telephonyConfig()!, String(req.user!.id)))
  })

  router.post(
    '/leads/:id/calls',
    scope.write,
    requireTelephony,
    body('clientRequestId').isUUID(),
    // Mode d'appel du navigateur (lot I) : seul `power` change quelque chose (refus vers les États-Unis).
    body('mode').optional().isIn(['click', 'preview', 'power']),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!validationResult(req).isEmpty()) throw telephonyError(400, 'VALIDATION_ERROR')
        const repId = String(req.user!.id)
        const leadId = String(req.params.id)
        const clientRequestId = String(req.body.clientRequestId).toLowerCase()
        const lead = mongoose.isObjectIdOrHexString(leadId)
          ? await Lead.findOne({ _id: leadId, ...scope.leadFilter(req) })
          : null
        if (!lead) throw telephonyError(404, 'NOT_FOUND')
        const callId = new mongoose.Types.ObjectId()
        const replay = async () => {
          const existing = await Call.findOne({ author: repId, clientRequestId }).select('lead').lean()
          if (!existing) return false
          if (String(existing.lead) !== leadId) throw telephonyError(409, 'IDEMPOTENCY_CONFLICT')
          // Lancement rejoué en concurrence avec lui-même : la ligne revient à l'appel rendu (lot I).
          await repointLine(repId, callId, existing._id)
          res.json({ callId: existing._id })
          return true
        }
        if (await replay()) return

        const config = telephonyConfig()!
        const settings = await CrmSettings.getSettings()
        const target = phoneTarget(String(lead.contactPhone ?? ''), settings.callDefaultRegion)
        const to = target?.e164 ?? null
        if (to && (await isPhoneSuppressed(to, settings.callDefaultRegion)))
          throw telephonyError(409, 'PHONE_SUPPRESSED')
        if (req.body.mode === 'power' && powerDialerBlocked(to)) throw telephonyError(409, 'POWER_DIALER_BLOCKED')
        // Mode pont (lot P) : décidé par le serveur d'après le profil, un appel à la fois et au clic.
        const bridgePhone = await activeBridgePhone(repId)
        if (bridgePhone && req.body.mode === 'power') throw telephonyError(409, 'BRIDGE_CLICK_ONLY')
        const now = new Date()
        const attemptDay = target ? attemptDayOf(now, target) : localClock(now, 'Europe/Paris').day
        // Jamais deux appels à la fois pour un même utilisateur (lot I) : la ligne est réservée avant la
        // création, libérée si le lancement échoue, et revérifiée après.
        try {
          await claimLine(repId, callId, now)
        } catch (err) {
          // Le même lancement rejoué pendant qu'il aboutit : on rend l'appel créé.
          if (await replay()) return
          throw err
        }
        let created = false
        try {
          // Rang unique par numéro et par jour : un lancement concurrent qui prend le même rang recompte.
          for (let tries = 0; tries < 5; tries++) {
            const last = to
              ? await Call.findOne({ to, attemptDay }).sort({ attemptNo: -1 }).select('attemptNo').lean()
              : null
            const attemptsToday = last?.attemptNo ?? 0
            const window = to ? await windowAttempts(to, now, settings) : { count: 0, reached: false }
            try {
              assertCallable(lead, {
                now,
                settings,
                attempts: { today: attemptsToday, window: window.count },
                scope: scope.kind,
              })
            } catch (err) {
              // Plafond de la fenêtre atteint sans avoir jamais joint personne : la fiche passe « non joignable ».
              if ((err as { code?: string }).code === 'ATTEMPT_WINDOW_REACHED' && !window.reached)
                await markUnreachable(String(lead._id), repId, settings, now)
              throw err
            }
            const from = callerIdFor(target!.country, callCountryRules(settings), config.callerId)
            if (!from) throw telephonyError(409, 'NO_CALLER_ID')
            try {
              const call = await Call.create({
                _id: callId,
                lead: lead._id,
                author: repId,
                to: to!,
                from,
                clientRequestId,
                attemptDay,
                attemptNo: attemptsToday + 1,
                via: bridgePhone ? 'BRIDGE' : 'BROWSER',
                bridgeTo: bridgePhone,
                events: [{ status: 'CREATED', at: now }],
              })
              // Deux lancements simultanés sous le plafond de la fenêtre : le premier lancé (identifiant) passe.
              if ((await windowAttempts(to!, now, settings, call._id)).count >= attemptWindowOf(settings).max) {
                await Call.deleteOne({ _id: call._id })
                throw telephonyError(409, 'ATTEMPT_WINDOW_REACHED')
              }
              created = true
              await confirmLine(repId, call._id, now)
              if (bridgePhone) await dialBridge(config, call._id, bridgePhone)
              return res.status(201).json({ callId: call._id, via: call.via })
            } catch (err) {
              if (isDuplicate(err, 'clientRequestId') && (await replay())) return
              if (!isDuplicate(err, 'attemptNo')) throw err
            }
          }
          throw telephonyError(409, 'ATTEMPT_CAP_REACHED')
        } finally {
          if (!created) await releaseLine(repId, callId)
        }
      } catch (err) {
        next(err)
      }
    },
  )

  /** Mode pont : réglage de l'utilisateur, quel que soit son espace (lot P). */
  router.get('/calls/bridge', scope.read, async (req, res, next) => {
    try {
      res.json({ bridge: publicBridge(await CallerProfile.findById(req.user!.id).select('bridge').lean()) })
    } catch (err) {
      next(err)
    }
  })

  /** Envoie un code au portable à vérifier, par un appel qui le lit. */
  router.post('/calls/bridge/code', scope.write, requireTelephony, async (req, res, next) => {
    try {
      const settings = await CrmSettings.getSettings()
      res
        .status(202)
        .json(
          await sendBridgeCode(telephonyConfig()!, String(req.user!.id), req.body.phone, settings.callDefaultRegion),
        )
    } catch (err) {
      next(err)
    }
  })

  router.post('/calls/bridge/verify', scope.write, async (req, res, next) => {
    try {
      res.json({ bridge: await confirmBridgeCode(String(req.user!.id), req.body.code) })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/calls/bridge', scope.write, async (req, res, next) => {
    try {
      if (typeof req.body.enabled !== 'boolean') throw telephonyError(400, 'VALIDATION_ERROR')
      const profile = await CallerProfile.findOneAndUpdate(
        req.body.enabled
          ? { _id: req.user!.id, 'bridge.verifiedAt': { $ne: null }, 'bridge.phone': { $ne: null } }
          : { _id: req.user!.id },
        { $set: { 'bridge.enabled': req.body.enabled } },
        { new: true },
      )
      if (!profile && req.body.enabled) throw telephonyError(409, 'BRIDGE_NOT_VERIFIED')
      res.json({ bridge: publicBridge(profile) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/calls/:id', scope.read, async (req, res, next) => {
    try {
      const call = await findCall(req)
      if (!call) throw telephonyError(404, 'NOT_FOUND')
      const settings = await CrmSettings.getSettings()
      res.json({
        _id: call._id,
        lead: call.lead,
        status: call.status,
        startedAt: call.startedAt,
        answeredAt: call.answeredAt,
        endedAt: call.endedAt,
        durationSec: call.durationSec,
        answeredBy: call.answeredBy,
        suggestedOutcome: suggestedOutcome(call, settings.callOutcomes),
        recording: withAudio(call, recordingSettings(settings).keepAudioDays),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/calls/:id/hangup', scope.write, async (req, res, next) => {
    try {
      const call = await findOwnCall(req)
      if (!call) throw telephonyError(404, 'NOT_FOUND')
      if (TERMINAL_CALL_STATUSES.includes(call.status)) return res.json({ status: call.status })
      // Pas encore relié à l'opérateur : on l'annule ici, la route voice refusera ensuite la mise en relation.
      const now = new Date()
      const canceled = await Call.findOneAndUpdate(
        { _id: call._id, status: 'CREATED', providerCallSid: null },
        { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: 'HANGUP', at: now } } },
        { new: true },
      )
      if (canceled) {
        // Mode pont : le portable du commercial sonne peut-être encore.
        const config = telephonyConfig()
        if (canceled.bridgeCallSid && config)
          await hangupProviderCall(config, canceled.bridgeCallSid).catch(() => undefined)
        return res.json({ status: canceled.status })
      }
      const current = (await Call.findById(call._id))!
      if (TERMINAL_CALL_STATUSES.includes(current.status) || !current.providerCallSid)
        return res.json({ status: current.status })
      const config = telephonyConfig()
      if (!config) throw telephonyError(503, 'TELEPHONY_DISABLED')
      // L'état final arrive ensuite par le rappel d'états de Twilio.
      await hangupProviderCall(config, current.providerCallSid)
      res.json({ status: current.status })
    } catch (err) {
      next(err)
    }
  })

  /** Le prospect s'oppose à l'enregistrement : arrêt, effacement, aucun transcript. Rejouable. */
  router.post('/calls/:id/recording/stop', scope.write, async (req, res, next) => {
    try {
      const call = await findCall(req)
      if (!call) throw telephonyError(404, 'NOT_FOUND')
      res.json({ recording: publicRecording(await objectToRecording(call._id)) })
    } catch (err) {
      next(err)
    }
  })

  /** Audio relayé par Venio, lu en mémoire : seulement s'il est conservé (`keepAudioDays` > 0) et encore là. */
  router.get('/calls/:id/recording', scope.read, async (req, res, next) => {
    try {
      const call = await findCall(req)
      const recording = call?.recording
      const config = telephonyConfig()
      const settings = await CrmSettings.getSettings()
      const held = isAudioHeld(recording, recordingSettings(settings).keepAudioDays)
      if (!call || !held || !config) {
        // Effacé, contesté ou plus conservé : rien ne doit rester en mémoire.
        if (call) dropCachedAudio(call._id)
        throw telephonyError(404, 'NOT_FOUND')
      }
      // Lu une fois chez l'opérateur, puis servi par plages depuis la mémoire (borné, vidé à l'effacement).
      const audio = await cachedAudio(String(call._id), recording!.sid!, () =>
        fetchProviderRecording(config, recording!.sid!, recording!.channels === 1 ? 1 : 2),
      )
      // Effacé, contesté ou sorti du périmètre pendant la lecture : relu avant d'envoyer quoi que ce soit.
      const current = await findCall(req)
      if (
        !current ||
        current.recording?.sid !== recording!.sid ||
        !isAudioHeld(current.recording, recordingSettings(settings).keepAudioDays)
      ) {
        dropCachedAudio(call._id)
        throw telephonyError(404, 'NOT_FOUND')
      }
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' })
      // Le lecteur demande des plages (Safari n'en lit pas d'autre) : une seule plage servie, sinon l'audio entier.
      const ranges = req.range(audio.length, { combine: true })
      if (ranges === -1) return res.status(416).set('Content-Range', `bytes */${audio.length}`).end()
      if (Array.isArray(ranges) && ranges.type === 'bytes' && ranges.length === 1) {
        const { start, end } = ranges[0]!
        res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${audio.length}` })
        res.set('Content-Length', String(end - start + 1))
        return res.end(audio.subarray(start, end + 1))
      }
      res.set('Content-Length', String(audio.length))
      res.send(audio)
    } catch (err) {
      next(err)
    }
  })

  /**
   * Les 20 derniers appels lisibles sur ce lead, du plus récent au plus ancien :
   * ceux de l'appelant ; pour l'équipe, aussi ceux de l'externe d'une fiche
   * transmise, chacun avec son auteur et `own`.
   */
  router.get('/leads/:id/calls', scope.read, async (req, res, next) => {
    try {
      const leadId = String(req.params.id)
      const lead = mongoose.isObjectIdOrHexString(leadId)
        ? await Lead.findOne({ _id: leadId, ...scope.leadFilter(req) })
            .select('closingHandoff externalRep')
            .lean()
        : null
      if (!lead) throw telephonyError(404, 'NOT_FOUND')
      const authors = readableAuthors(req, scope, lead)
      const author = authors.length === 1 ? authors[0] : { $in: authors }
      const calls = await Call.find({ lead: leadId, author })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .select('status startedAt answeredAt endedAt durationSec recording author')
        .lean()
      const ids = calls.map((call) => call._id)
      const [transcripts, analyses, names, settings] = await Promise.all([
        CallTranscript.find({ call: { $in: ids }, author })
          .select('call status')
          .lean(),
        CallAnalysis.find({ call: { $in: ids }, author })
          .select('call status')
          .lean(),
        scope.kind === 'team'
          ? User.find({ _id: { $in: authors } })
              .select('name')
              .lean()
          : [],
        CrmSettings.getSettings(),
      ])
      const keepAudioDays = recordingSettings(settings).keepAudioDays
      const nameOf = new Map(names.map((user) => [String(user._id), user.name]))
      const statusOf = (rows: { call: unknown; status: string }[]) =>
        new Map(rows.map((row) => [String(row.call), row.status]))
      const transcriptStatus = statusOf(transcripts)
      const analysisStatus = statusOf(analyses)
      res.json({
        calls: calls.map((call) => ({
          _id: call._id,
          status: call.status,
          startedAt: call.startedAt,
          answeredAt: call.answeredAt,
          endedAt: call.endedAt,
          durationSec: call.durationSec,
          recording: withAudio(call, keepAudioDays),
          transcriptStatus: transcriptStatus.get(String(call._id)) ?? null,
          analysisStatus: analysisStatus.get(String(call._id)) ?? null,
          ...(scope.kind === 'team'
            ? {
                author: { _id: call.author, name: nameOf.get(String(call.author)) ?? '' },
                own: String(call.author) === String(req.user!.id),
              }
            : {}),
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // Les erreurs de ce routeur portent le code du contrat ; les autres suivent le gestionnaire global.
  router.use((err: Error & { status?: number; code?: unknown }, _req: Request, res: Response, next: NextFunction) => {
    if (typeof err.code !== 'string' || !err.status) return next(err)
    res.status(err.status).json({ error: err.code, code: err.code })
  })

  return router
}

export default createCallsRoutes(repCallScope)
