import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import Call, { CALL_STATUSES, TERMINAL_CALL_STATUSES, type ICall } from '../../models/Call.js'
import Lead from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import CrmSettings from '../../models/CrmSettings.js'
import { callerScope } from '../../lib/callDeskScope.js'
import { assertCallable, isPhoneSuppressed } from '../../lib/callGuards.js'
import { normalizePhone } from '../../lib/callImports.js'
import {
  callStatusRank,
  dialTwiml,
  hangupTwiml,
  hasValidTwilioSignature,
  mapTwilioStatus,
  noticeTwiml,
  requireTelephony,
  telephonyConfig,
  userIdFromClient,
} from '../../lib/telephony/index.js'
import {
  initialRecording,
  onRecordingEvent,
  recordingSettings,
  transcribeRecording,
} from '../../lib/telephony/recording.js'
import { withLiveTranscription } from '../../lib/liveTranscription/index.js'
import logger from '../../lib/logger.js'

/**
 * Routes appelées par Twilio, publiques mais à signature vérifiée. Montées
 * avant le parseur JSON : Twilio poste en `application/x-www-form-urlencoded`
 * et la signature porte sur les champs reçus. Rejouer une requête n'a aucun
 * effet : la mise en relation ne s'attache qu'une fois à un appel, et un état
 * ne fait jamais reculer l'appel.
 */
const router = express.Router()

router.use(requireTelephony, express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 200 }))
router.use((req: Request, res: Response, next: NextFunction) => {
  if (hasValidTwilioSignature(telephonyConfig()!, req)) return next()
  res.status(403).json({ error: 'Signature Twilio absente ou invalide' })
})

function sendTwiml(res: Response, twiml: string) {
  res.type('text/xml').send(twiml)
}

async function cancelCall(call: ICall, reason: string) {
  const now = new Date()
  await Call.updateOne(
    { _id: call._id, status: 'CREATED' },
    { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: `REJECTED:${reason}`, at: now } } },
  )
}

/**
 * Mise en relation demandée par le navigateur (`device.connect({ params: { callId } })`).
 * L'appel est retrouvé par son identifiant **et** par l'identité du jeton ; le
 * numéro est relu sur le lead et les gardes sont repassées dans le périmètre
 * actuel de l'auteur, externe ou membre de l'équipe (`callerScope`) : auteur
 * désactivé, sans droit d'appel ou dont le périmètre ne couvre plus la fiche,
 * refusé. Tout autre champ (dont `To`) est ignoré.
 */
router.post('/twilio/voice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = telephonyConfig()!
    const callSid = typeof req.body.CallSid === 'string' ? req.body.CallSid : ''
    const authorId = userIdFromClient(req.body.From)
    const callId = req.body.callId
    if (!callSid || !authorId || !mongoose.isObjectIdOrHexString(callId)) return sendTwiml(res, hangupTwiml())
    const call = await Call.findOne({ _id: callId, author: authorId })
    if (!call) return sendTwiml(res, hangupTwiml())
    // Une même requête rejouée reçoit la même réponse ; un autre appel ne peut pas reprendre ce callId.
    if (call.providerCallSid) {
      return sendTwiml(
        res,
        call.providerCallSid === callSid && call.status !== 'CANCELED' ? dialTwiml(config, call) : hangupTwiml(),
      )
    }
    if (call.status !== 'CREATED') return sendTwiml(res, hangupTwiml())

    const [author, settings] = await Promise.all([callerScope(authorId), CrmSettings.getSettings()])
    const lead = author ? await Lead.findOne({ _id: call.lead, ...author.filter }) : null
    let refusal = ''
    if (!author || !lead) refusal = 'OUT_OF_SCOPE'
    else if (normalizePhone(String(lead.contactPhone ?? ''), settings.callDefaultRegion) !== call.to)
      refusal = 'PHONE_CHANGED'
    else if (await isPhoneSuppressed(call.to, settings.callDefaultRegion)) refusal = 'PHONE_SUPPRESSED'
    else {
      try {
        // Le rang réservé au lancement fait foi : les tentatives qui le précèdent sont celles du jour.
        assertCallable(lead, { now: new Date(), settings, attemptsToday: call.attemptNo - 1, scope: author.kind })
      } catch (err) {
        refusal = (err as { code?: string }).code ?? 'LEAD_NOT_CALLABLE'
      }
    }
    if (refusal) {
      await cancelCall(call, refusal)
      return sendTwiml(res, hangupTwiml())
    }

    const now = new Date()
    // L'enregistrement est décidé ici, une fois pour toutes ; une opposition déjà posée sur l'appel est gardée.
    const attached = await Call.findOneAndUpdate(
      { _id: call._id, status: 'CREATED', providerCallSid: null },
      [
        {
          $set: {
            providerCallSid: callSid,
            startedAt: now,
            recording: { $ifNull: ['$recording', { $literal: initialRecording(settings) }] },
            events: { $concatArrays: [{ $ifNull: ['$events', []] }, [{ status: 'CONNECTING', at: now }]] },
          },
        },
      ],
      { new: true },
    )
    if (!attached) {
      const current = await Call.findById(call._id).lean()
      return sendTwiml(res, current?.providerCallSid === callSid ? dialTwiml(config, call) : hangupTwiml())
    }
    sendTwiml(res, await withLiveTranscription(dialTwiml(config, attached), attached))
  } catch (err) {
    next(err)
  }
})

/** États de la branche composée (`statusCallback` de `<Number>`). */
router.post('/twilio/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = req.query.callId
    const status = mapTwilioStatus(req.body.CallStatus)
    if (!mongoose.isObjectIdOrHexString(callId) || !status) return res.sendStatus(204)
    const call = await Call.findById(callId)
    // La branche doit appartenir à l'appel parent attaché par la route voice.
    if (!call || !call.providerCallSid || call.providerCallSid !== req.body.ParentCallSid) return res.sendStatus(204)

    const stamp = Date.parse(String(req.body.Timestamp ?? ''))
    const at = Number.isFinite(stamp) ? new Date(stamp) : new Date()
    const lower = CALL_STATUSES.filter((item) => callStatusRank(item) < callStatusRank(status))
    if (!lower.includes(call.status)) return res.sendStatus(204)

    const set: Record<string, unknown> = { status }
    if (status === 'IN_PROGRESS') set.answeredAt = at
    if (TERMINAL_CALL_STATUSES.includes(status)) {
      set.endedAt = at
      const duration = Number(req.body.CallDuration)
      if (status === 'COMPLETED' && Number.isFinite(duration) && duration >= 0) {
        set.durationSec = Math.round(duration)
        if (!call.answeredAt) set.answeredAt = new Date(at.getTime() - Math.round(duration) * 1000)
      } else if (status !== 'COMPLETED') set.durationSec = 0
    }
    if (req.body.AnsweredBy === 'human') set.answeredBy = 'HUMAN'
    else if (typeof req.body.AnsweredBy === 'string' && req.body.AnsweredBy.startsWith('machine'))
      set.answeredBy = 'MACHINE'

    const updated = await Call.findOneAndUpdate(
      { _id: call._id, status: { $in: lower } },
      { $set: set, $push: { events: { status: String(req.body.CallStatus), at } } },
      { new: true },
    )
    // Résultat déjà saisi avant la fin de l'appel : la durée réelle rejoint l'échange.
    if (updated?.interaction && updated.durationSec !== null) {
      await Interaction.updateOne({ _id: updated.interaction }, { $set: { durationSec: updated.durationSec } })
    }
    res.sendStatus(204)
  } catch (err) {
    next(err)
  }
})

/**
 * Rappel de l'enregistrement de `<Dial>`. Rattaché à l'appel par `callId` et
 * par l'appel parent ; rejoué ou arrivé en retard, il ne change rien. La
 * transcription part après la réponse : Twilio n'attend pas l'envoi de l'audio.
 */
router.post('/twilio/recording', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = req.query.callId
    if (!mongoose.isObjectIdOrHexString(callId)) return res.sendStatus(204)
    const ready = await onRecordingEvent(String(callId), req.body)
    res.sendStatus(204)
    if (ready) {
      void transcribeRecording(ready).catch((err: Error) =>
        logger.warn({ callId: String(ready._id), detail: err.message.slice(0, 120) }, 'enregistrement: transcription'),
      )
    }
  } catch (err) {
    next(err)
  }
})

/** Annonce jouée à l'appelé après sa décroche, avant la mise en relation (`<Number url>`). */
router.post('/twilio/notice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const callId = req.query.callId
    const call = mongoose.isObjectIdOrHexString(callId) ? await Call.findById(callId).select('recording').lean() : null
    const recording = call?.recording
    if (!recording?.notice || recording.objection) return sendTwiml(res, noticeTwiml(''))
    sendTwiml(res, noticeTwiml(recordingSettings(await CrmSettings.getSettings()).notice.text))
  } catch (err) {
    next(err)
  }
})

export default router
