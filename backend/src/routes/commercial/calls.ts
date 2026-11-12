import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { body, validationResult } from 'express-validator'
import Call, { TERMINAL_CALL_STATUSES, type ICall } from '../../models/Call.js'
import Lead from '../../models/Lead.js'
import CrmSettings from '../../models/CrmSettings.js'
import { repLeadFilter } from '../../lib/externalSales.js'
import { normalizePhone } from '../../lib/callImports.js'
import { assertCallable, isPhoneSuppressed, localClock } from '../../lib/callGuards.js'
import {
  createVoiceToken,
  requireTelephony,
  suggestedOutcome,
  telephonyConfig,
  telephonyError,
} from '../../lib/telephony/index.js'
import { fetchProviderRecording, hangupProviderCall } from '../../lib/telephony/rest.js'
import {
  objectToRecording,
  publicRecording,
  recordingConfig,
  recordingSettings,
} from '../../lib/telephony/recording.js'
import CallTranscript from '../../models/CallTranscript.js'
import CallAnalysis from '../../models/CallAnalysis.js'

/**
 * Appels du commercial externe (lot A). On lance un appel par l'identifiant du
 * lead, jamais par un numéro : le serveur résout le numéro et passe les gardes.
 * Un appel se lit seulement par son auteur, tant que le lead est dans son périmètre.
 */
const router = express.Router()

const isDuplicate = (err: unknown, field: string) =>
  (err as { code?: number; keyPattern?: Record<string, unknown> }).code === 11000 &&
  Boolean((err as { keyPattern?: Record<string, unknown> }).keyPattern?.[field])

async function findOwnCall(req: Request): Promise<ICall | null> {
  const id = String(req.params.id)
  if (!mongoose.isObjectIdOrHexString(id)) return null
  const call = await Call.findOne({ _id: id, author: req.user!.id })
  if (!call || !(await Lead.exists({ _id: call.lead, ...repLeadFilter(req.user!.id) }))) return null
  return call
}

router.get('/calls/config', async (_req, res, next) => {
  try {
    const config = telephonyConfig()
    const settings = await CrmSettings.getSettings()
    res.json({
      enabled: Boolean(config),
      callerId: config?.callerId ?? null,
      edge: config?.edge ?? null,
      callingHours: settings.telephony.callingHours,
      attemptCap: settings.telephony.attemptCapPerDay,
      recording: recordingConfig(settings),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/calls/token', requireTelephony, (req, res) => {
  res.json(createVoiceToken(telephonyConfig()!, String(req.user!.id)))
})

router.post(
  '/leads/:id/calls',
  requireTelephony,
  body('clientRequestId').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) throw telephonyError(400, 'VALIDATION_ERROR')
      const repId = String(req.user!.id)
      const leadId = String(req.params.id)
      const clientRequestId = String(req.body.clientRequestId).toLowerCase()
      const lead = mongoose.isObjectIdOrHexString(leadId)
        ? await Lead.findOne({ _id: leadId, ...repLeadFilter(repId) })
        : null
      if (!lead) throw telephonyError(404, 'NOT_FOUND')
      const replay = async () => {
        const existing = await Call.findOne({ author: repId, clientRequestId }).select('lead').lean()
        if (!existing) return false
        if (String(existing.lead) !== leadId) throw telephonyError(409, 'IDEMPOTENCY_CONFLICT')
        res.json({ callId: existing._id })
        return true
      }
      if (await replay()) return

      const config = telephonyConfig()!
      const settings = await CrmSettings.getSettings()
      const to = normalizePhone(String(lead.contactPhone ?? ''), settings.callDefaultRegion)
      if (to && (await isPhoneSuppressed(to, settings.callDefaultRegion))) throw telephonyError(409, 'PHONE_SUPPRESSED')
      const now = new Date()
      const attemptDay = localClock(now, settings.telephony.callingHours.timezone).day
      // Rang unique par numéro et par jour : un lancement concurrent qui prend le même rang recompte.
      for (let tries = 0; tries < 5; tries++) {
        const last = await Call.findOne({ to, attemptDay }).sort({ attemptNo: -1 }).select('attemptNo').lean()
        const attemptsToday = last?.attemptNo ?? 0
        assertCallable(lead, { now, settings, attemptsToday })
        try {
          const call = await Call.create({
            lead: lead._id,
            author: repId,
            to: to!,
            from: config.callerId,
            clientRequestId,
            attemptDay,
            attemptNo: attemptsToday + 1,
            events: [{ status: 'CREATED', at: now }],
          })
          return res.status(201).json({ callId: call._id })
        } catch (err) {
          if (isDuplicate(err, 'clientRequestId') && (await replay())) return
          if (!isDuplicate(err, 'attemptNo')) throw err
        }
      }
      throw telephonyError(409, 'ATTEMPT_CAP_REACHED')
    } catch (err) {
      next(err)
    }
  },
)

router.get('/calls/:id', async (req, res, next) => {
  try {
    const call = await findOwnCall(req)
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
      recording: publicRecording(call),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/calls/:id/hangup', async (req, res, next) => {
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
    if (canceled) return res.json({ status: canceled.status })
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
router.post('/calls/:id/recording/stop', async (req, res, next) => {
  try {
    const call = await findOwnCall(req)
    if (!call) throw telephonyError(404, 'NOT_FOUND')
    res.json({ recording: publicRecording(await objectToRecording(call._id)) })
  } catch (err) {
    next(err)
  }
})

/** Audio relayé par Venio, lu en mémoire : seulement s'il est conservé (`keepAudioDays` > 0) et encore là. */
router.get('/calls/:id/recording', async (req, res, next) => {
  try {
    const call = await findOwnCall(req)
    const recording = call?.recording
    const config = telephonyConfig()
    const settings = await CrmSettings.getSettings()
    const held =
      recording?.status === 'READY' &&
      !recording.objection &&
      recording.sid &&
      (!recording.deleteAt || recording.deleteAt > new Date()) &&
      recordingSettings(settings).keepAudioDays > 0
    if (!call || !held || !config) throw telephonyError(404, 'NOT_FOUND')
    const audio = await fetchProviderRecording(config, recording.sid!, recording.channels === 1 ? 1 : 2)
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': String(audio.length) })
    res.send(audio)
  } catch (err) {
    next(err)
  }
})

/** Les 20 derniers appels de l'auteur sur ce lead, du plus récent au plus ancien. */
router.get('/leads/:id/calls', async (req, res, next) => {
  try {
    const repId = String(req.user!.id)
    const leadId = String(req.params.id)
    const lead = mongoose.isObjectIdOrHexString(leadId)
      ? await Lead.exists({ _id: leadId, ...repLeadFilter(repId) })
      : null
    if (!lead) throw telephonyError(404, 'NOT_FOUND')
    const calls = await Call.find({ lead: leadId, author: repId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .select('status startedAt answeredAt endedAt durationSec recording')
      .lean()
    const ids = calls.map((call) => call._id)
    const [transcripts, analyses] = await Promise.all([
      CallTranscript.find({ call: { $in: ids }, author: repId })
        .select('call status')
        .lean(),
      CallAnalysis.find({ call: { $in: ids }, author: repId })
        .select('call status')
        .lean(),
    ])
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
        recording: publicRecording(call),
        transcriptStatus: transcriptStatus.get(String(call._id)) ?? null,
        analysisStatus: analysisStatus.get(String(call._id)) ?? null,
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

export default router
