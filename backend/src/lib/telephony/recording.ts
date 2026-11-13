import type { Types } from 'mongoose'
import Call, { type ICall, type ICallRecording } from '../../models/Call.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import CallTranscript from '../../models/CallTranscript.js'
import CrmSettings, { DEFAULT_RECORDING_NOTICE } from '../../models/CrmSettings.js'
import type { ICrmSettings } from '../../types/models/index.js'
import logger from '../logger.js'
import { dropCachedAudio } from '../recordingAudioCache.js'
import {
  discardTranscripts,
  onTranscriptDone,
  requestTranscription,
  setTranscriptionAudioSource,
  type TranscriptDone,
} from '../transcription/index.js'
import { isConfigured as isTranscriptionConfigured } from '../transcription/assemblyai.js'
import { enqueueAnalysis } from '../callAnalysis/index.js'
import { telephonyConfig } from './index.js'
import { deleteProviderRecording, fetchProviderRecording, stopProviderRecording } from './rest.js'

/**
 * Enregistrement des appels et chaîne qui en part (vague 2, lot F1) :
 * enregistrement prêt → transcript → analyse.
 *
 * Règles :
 * - l'audio n'est lu qu'en mémoire et n'est effacé chez l'opérateur qu'une fois
 *   le transcript terminé (`DONE`, ou échec définitif, ou transcription
 *   impossible), plus `keepAudioDays` ; l'opposition et l'anonymisation
 *   l'effacent sans attendre ;
 * - une opposition empêche tout transcript et toute analyse ;
 * - aucune donnée d'appel dans les journaux : identifiants et codes seulement.
 */

const DAY_MS = 24 * 60 * 60_000
const BATCH = 50
/** Un appel encore `CREATED` après ce délai n'a jamais été relié à l'opérateur (ou l'a perdu). */
const STALE_CALL_MS = 30 * 60_000
const TERMINAL_TRANSCRIPT = ['DONE', 'FAILED', 'SKIPPED']
/** États où un audio peut encore exister chez l'opérateur. */
const HELD_STATUSES = ['RECORDING', 'STOPPED', 'READY']

export function recordingSettings(settings: Pick<ICrmSettings, 'callRecording'>): ICrmSettings['callRecording'] {
  const value = settings.callRecording
  return {
    enabled: value?.enabled ?? true,
    notice: {
      enabled: value?.notice?.enabled ?? true,
      text: value?.notice?.text?.trim() || DEFAULT_RECORDING_NOTICE,
    },
    keepAudioDays: value?.keepAudioDays ?? 0,
  }
}

/** On n'enregistre que si l'audio sert : transcription possible, ou audio conservé. */
export function recordingEnabled(settings: ICrmSettings): boolean {
  const recording = recordingSettings(settings)
  if (!recording.enabled || !telephonyConfig()) return false
  const transcribes = isTranscriptionConfigured() && settings.callTranscription?.enabled !== false
  return transcribes || recording.keepAudioDays > 0
}

/** Ce que voit le navigateur : `GET /calls/config`. */
export function recordingConfig(settings: ICrmSettings) {
  const enabled = recordingEnabled(settings)
  return { enabled, notice: enabled && recordingSettings(settings).notice.enabled }
}

function emptyRecording(): ICallRecording {
  return {
    status: 'NONE',
    notice: false,
    objection: false,
    objectionAt: null,
    sid: null,
    channels: null,
    durationSec: null,
    completedAt: null,
    deleteAt: null,
    deletedAt: null,
  }
}

/** État posé à la mise en relation ; `null` si l'appel n'est pas enregistré. */
export function initialRecording(settings: ICrmSettings): ICallRecording | null {
  if (!recordingEnabled(settings)) return null
  return { ...emptyRecording(), notice: recordingSettings(settings).notice.enabled }
}

export function publicRecording(call: Pick<ICall, 'recording'>) {
  return { status: call.recording?.status ?? 'NONE', objection: call.recording?.objection ?? false }
}

function warn(call: Pick<ICall, '_id'>, code: string, err?: unknown) {
  const detail = err instanceof Error ? err.message.slice(0, 120) : undefined
  logger.warn({ callId: String(call._id), code, detail }, 'enregistrement: échec')
}

/** Efface l'audio chez l'opérateur ; `false` si c'est à rejouer (opérateur injoignable, enregistrement pas terminé). */
export async function deleteRecording(call: Pick<ICall, '_id' | 'recording'>): Promise<boolean> {
  const recording = call.recording
  if (!recording || recording.status === 'DELETED' || !recording.sid) return true
  const config = telephonyConfig()
  if (!config) return false
  try {
    await deleteProviderRecording(config, recording.sid)
  } catch (err) {
    warn(call, 'DELETE_FAILED', err)
    return false
  }
  await Call.updateOne(
    { _id: call._id, 'recording.sid': recording.sid },
    { $set: { 'recording.status': 'DELETED', 'recording.deletedAt': new Date() } },
  )
  dropCachedAudio(call._id)
  return true
}

async function stopRecording(call: ICall): Promise<void> {
  const config = telephonyConfig()
  if (!config || !call.providerCallSid || !call.recording?.sid) return
  try {
    await stopProviderRecording(config, call.providerCallSid, call.recording.sid)
  } catch (err) {
    // Déjà terminé ou opérateur injoignable : le rappel `completed` effacera l'audio.
    return warn(call, 'STOP_FAILED', err)
  }
  await Call.updateOne({ _id: call._id, 'recording.status': 'RECORDING' }, { $set: { 'recording.status': 'STOPPED' } })
}

/** Audio en mémoire, relu à chaque demande : refusé dès qu'une opposition ou une échéance d'effacement existe. */
async function readAudio(callId: string): Promise<Buffer> {
  const call = await Call.findById(callId).select('recording').lean()
  const recording = call?.recording
  const config = telephonyConfig()
  if (!config || !recording || recording.status !== 'READY' || recording.objection || recording.deleteAt)
    throw new Error('RECORDING_UNAVAILABLE')
  return fetchProviderRecording(config, recording.sid!, recording.channels === 1 ? 1 : 2)
}

/**
 * Le transcript est terminé : l'audio est effacé après `keepAudioDays`
 * (aujourd'hui même si 0). Rend l'appel si l'échéance vient d'être fixée.
 */
async function scheduleAudioDeletion(callId: Types.ObjectId | string, now = new Date()): Promise<ICall | null> {
  const transcript = await CallTranscript.findOne({ call: callId }).select('status').lean()
  if (!transcript || !TERMINAL_TRANSCRIPT.includes(transcript.status)) return null
  const keepDays = recordingSettings(await CrmSettings.getSettings()).keepAudioDays
  const scheduled = await Call.findOneAndUpdate(
    { _id: callId, 'recording.status': 'READY', 'recording.deleteAt': null },
    { $set: { 'recording.deleteAt': new Date(now.getTime() + keepDays * DAY_MS) } },
    { new: true },
  )
  if (scheduled?.recording?.deleteAt && scheduled.recording.deleteAt <= now) await deleteRecording(scheduled)
  return scheduled
}

/** Enregistrement prêt → demande de transcript (le canal 1, appel parent, porte le commercial). */
export async function transcribeRecording(call: ICall): Promise<void> {
  const recording = call.recording
  if (!telephonyConfig() || !recording || recording.status !== 'READY' || recording.objection || recording.deleteAt)
    return
  const callId = String(call._id)
  await requestTranscription({
    callId,
    leadId: String(call.lead),
    authorId: String(call.author),
    audio: {
      fetch: () => readAudio(callId),
      mimeType: 'audio/mpeg',
      channels: recording.channels === 1 ? 1 : 2,
      repChannel: 0,
    },
  })
  // Transcription impossible (non configurée, coupée) : rien n'attend plus l'audio.
  await scheduleAudioDeletion(call._id)
}

/** Rappel d'enregistrement signé. Rend l'appel si l'audio vient d'être prêt (transcription à lancer). */
export async function onRecordingEvent(callId: string, body: Record<string, unknown>): Promise<ICall | null> {
  const call = await Call.findById(callId)
  const sid = typeof body.RecordingSid === 'string' ? body.RecordingSid.slice(0, 64) : ''
  // Le rappel doit venir de l'appel parent attaché à ce callId, et d'un seul enregistrement.
  if (!call?.recording || !sid || !call.providerCallSid || call.providerCallSid !== body.CallSid) return null
  if (call.recording.sid && call.recording.sid !== sid) return null
  const now = new Date()

  if (body.RecordingStatus === 'in-progress') {
    const started = await Call.findOneAndUpdate(
      { _id: call._id, 'recording.status': 'NONE', 'recording.sid': null },
      { $set: { 'recording.status': 'RECORDING', 'recording.sid': sid } },
      { new: true },
    )
    // Opposition posée avant que l'enregistrement ne démarre.
    if (started?.recording?.objection) await stopRecording(started)
    return null
  }
  if (body.RecordingStatus === 'completed') {
    const duration = Number(body.RecordingDuration)
    const completed = {
      'recording.sid': sid,
      'recording.channels': Number(body.RecordingChannels) === 1 ? 1 : 2,
      'recording.durationSec': Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
      'recording.completedAt': now,
    }
    const pending = { _id: call._id, 'recording.status': { $in: ['NONE', 'RECORDING', 'STOPPED'] } }
    const objected = await Call.findOneAndUpdate(
      { ...pending, 'recording.objection': true },
      { $set: { ...completed, 'recording.status': 'STOPPED', 'recording.deleteAt': now } },
      { new: true },
    )
    if (objected) {
      await deleteRecording(objected)
      return null
    }
    return Call.findOneAndUpdate(
      { ...pending, 'recording.objection': false },
      { $set: { ...completed, 'recording.status': 'READY' } },
      { new: true },
    )
  }
  if (body.RecordingStatus === 'absent') {
    await Call.updateOne(
      { _id: call._id, 'recording.status': { $in: ['NONE', 'RECORDING'] } },
      { $set: { 'recording.status': 'NONE', 'recording.completedAt': now } },
    )
  }
  return null
}

/**
 * Le prospect s'oppose à l'enregistrement : arrêt, effacement de ce qui a été
 * capté, aucun transcript ni analyse. Rejouable ; vaut aussi après l'appel.
 */
export async function objectToRecording(callId: Types.ObjectId): Promise<ICall> {
  const now = new Date()
  dropCachedAudio(callId)
  await Call.updateOne(
    { _id: callId, recording: null },
    { $set: { recording: { ...emptyRecording(), objection: true, objectionAt: now } } },
  )
  await Call.updateOne(
    { _id: callId, 'recording.objection': false },
    { $set: { 'recording.objection': true, 'recording.objectionAt': now, 'recording.deleteAt': now } },
  )
  let call = (await Call.findById(callId))!
  if (call.recording?.status === 'RECORDING') {
    await stopRecording(call)
    call = (await Call.findById(callId))!
  }
  // Seul un enregistrement terminé peut être effacé ; sinon le rappel `completed` ou le balayage s'en chargent.
  if (call.recording?.completedAt && HELD_STATUSES.includes(call.recording.status)) await deleteRecording(call)
  await discardTranscripts({ call: callId })
  await CallAnalysis.deleteMany({ call: callId })
  return (await Call.findById(callId))!
}

/** Transcript obtenu : échéance de l'audio, puis analyse en arrière-plan. */
export async function handleTranscriptDone(t: TranscriptDone): Promise<void> {
  const call = await Call.findById(t.callId).select('recording').lean()
  if (call?.recording?.objection) {
    await discardTranscripts({ call: t.callId })
    return
  }
  await scheduleAudioDeletion(t.callId)
  await enqueueAnalysis(t)
}

/**
 * Planificateur : rattrape la chaîne (transcript jamais demandé, échéance pas
 * encore fixée) et efface les audios arrivés à échéance (transcript obtenu,
 * opposition, anonymisation, conservation échue).
 */
export async function sweepRecordings(now = new Date()): Promise<{ requested: number; deleted: number }> {
  const result = { requested: 0, deleted: 0 }
  if (!telephonyConfig()) return result
  const ready = await Call.find({
    'recording.status': 'READY',
    'recording.objection': false,
    'recording.deleteAt': null,
  })
    .sort({ 'recording.completedAt': 1 })
    .limit(BATCH)
  for (const call of ready) {
    try {
      if (await CallTranscript.exists({ call: call._id })) await scheduleAudioDeletion(call._id, now)
      else {
        await transcribeRecording(call)
        result.requested += 1
      }
    } catch (err) {
      warn(call, 'TRANSCRIBE_FAILED', err)
    }
  }
  const due = await Call.find({ 'recording.status': { $in: HELD_STATUSES }, 'recording.deleteAt': { $lte: now } })
    .select('_id recording')
    .limit(BATCH)
  for (const call of due) if (await deleteRecording(call)) result.deleted += 1
  return result
}

/** Planificateur : clôt les appels jamais reliés à l'opérateur (navigateur fermé, connexion perdue). */
export async function closeStaleCalls(now = new Date()): Promise<{ closed: number }> {
  const { modifiedCount } = await Call.updateMany(
    { status: 'CREATED', createdAt: { $lt: new Date(now.getTime() - STALE_CALL_MS) } },
    { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: 'EXPIRED', at: now } } },
  )
  return { closed: modifiedCount }
}

/**
 * Anonymisation d'un lead : audios effacés chez l'opérateur (ou mis à
 * échéance immédiate si l'opérateur ne répond pas), transcripts et analyses
 * supprimés, numéros des appels neutralisés.
 */
export async function eraseLeadCalls(leadId: Types.ObjectId | string): Promise<void> {
  const now = new Date()
  const calls = await Call.find({ lead: leadId }).select('_id recording').lean()
  for (const call of calls) {
    const held = call.recording && HELD_STATUSES.includes(call.recording.status)
    await Call.updateOne(
      { _id: call._id },
      { $set: { to: `anonymise:${String(call._id)}`, ...(held ? { 'recording.deleteAt': now } : {}) } },
    )
  }
  await discardTranscripts({ lead: leadId })
  await CallAnalysis.deleteMany({ lead: leadId })
  const due = await Call.find({ lead: leadId, 'recording.status': { $in: HELD_STATUSES } }).select('_id recording')
  for (const call of due) if (call.recording?.completedAt) await deleteRecording(call)
}

let pipelineStarted = false

/** Branche la chaîne au démarrage du serveur : fin de transcript → analyse, reprise de l'audio. */
export function startCallPipeline(): void {
  if (pipelineStarted) return
  pipelineStarted = true
  onTranscriptDone(handleTranscriptDone)
  setTranscriptionAudioSource(async ({ callId }) => ({ fetch: () => readAudio(callId) }))
}
