import mongoose, { type Types } from 'mongoose'
import CallTranscript, { type ICallTranscript, type TranscriptSegment } from '../../models/CallTranscript.js'
import CrmSettings from '../../models/CrmSettings.js'
import logger from '../logger.js'
import { ProviderError, deleteJob, getJob, isConfigured, submitJob, toSegments, uploadAudio } from './assemblyai.js'

/**
 * Transcription des appels après coup (lot C du poste d'appel).
 *
 * L'audio n'est lu qu'en mémoire (`audio.fetch()`) et transmis tel quel au
 * fournisseur : jamais écrit sur disque, jamais journalisé. Les journaux ne
 * portent que des identifiants et des codes, jamais le texte d'un transcript.
 * Rien ne déclenche encore cette chaîne : la vague 2 appelle
 * `requestTranscription` à la fin d'un enregistrement et branche les balayages
 * dans le planificateur.
 */

export type Segment = TranscriptSegment

export interface TranscriptionAudio {
  fetch(): Promise<Buffer>
  mimeType: string
  channels: 1 | 2
  repChannel: 0 | 1
}

export interface TranscriptDone {
  callId: string
  leadId: string
  authorId: string
  segments: Segment[]
  durationSec: number | null
}

type AudioSource = (t: { callId: string; leadId: string; authorId: string }) => Promise<{
  fetch(): Promise<Buffer>
} | null>

export const MAX_ATTEMPTS = 5
const LEASE_MS = 10 * 60_000
// Au-delà, un travail toujours en file chez le fournisseur est abandonné.
const JOB_DEADLINE_MS = 24 * 60 * 60_000
const BATCH = 50

const doneHandlers: Array<(t: TranscriptDone) => Promise<void>> = []
let audioSource: AudioSource | null = null

export function onTranscriptDone(handler: (t: TranscriptDone) => Promise<void>): void {
  doneHandlers.push(handler)
}

/**
 * Permet au balayage de reprendre une demande restée en plan avant le dépôt de
 * l'audio (redémarrage, panne du fournisseur) : la vague 2 y branche le relais
 * de l'enregistrement. Sans source, ces demandes finissent en échec borné.
 */
export function setTranscriptionAudioSource(source: AudioSource | null): void {
  audioSource = source
}

function objectId(value: string, name: string): Types.ObjectId {
  if (!mongoose.isObjectIdOrHexString(value)) throw new Error(`transcription: ${name} invalide`)
  return new mongoose.Types.ObjectId(value)
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function errorCode(err: unknown, fallback: string): string {
  return err instanceof ProviderError ? err.message : fallback
}

export async function requestTranscription(input: {
  callId: string
  leadId: string
  authorId: string
  audio: TranscriptionAudio
}): Promise<{ transcriptId: string }> {
  const call = objectId(input.callId, 'callId')
  const existing = await CallTranscript.findOne({ call }).select('_id').lean()
  if (existing) return { transcriptId: String(existing._id) }

  const settings = (await CrmSettings.getSettings()).callTranscription
  const now = new Date()
  const skipReason = !isConfigured() ? 'NOT_CONFIGURED' : settings?.enabled === false ? 'DISABLED' : ''
  let doc: ICallTranscript
  try {
    doc = await CallTranscript.create({
      call,
      lead: objectId(input.leadId, 'leadId'),
      author: objectId(input.authorId, 'authorId'),
      language: settings?.language || 'fr',
      status: skipReason ? 'SKIPPED' : 'PENDING',
      error: skipReason,
      channels: input.audio.channels === 1 ? 1 : 2,
      repChannel: input.audio.repChannel === 1 ? 1 : 0,
      purgeAt: addMonths(now, settings?.retentionMonths ?? 12),
      leaseUntil: skipReason ? null : new Date(now.getTime() + LEASE_MS),
    })
  } catch (err) {
    // Deux demandes simultanées pour le même appel : l'index unique tranche.
    if ((err as { code?: number }).code !== 11000) throw err
    const winner = await CallTranscript.findOne({ call }).select('_id').lean()
    return { transcriptId: String(winner!._id) }
  }
  if (!skipReason) await startJob(doc, input.audio)
  return { transcriptId: String(doc._id) }
}

async function recordFailure(doc: ICallTranscript, code: string): Promise<boolean> {
  const attempts = doc.attempts + 1
  const failed = attempts >= MAX_ATTEMPTS
  await CallTranscript.updateOne(
    { _id: doc._id },
    {
      $set: {
        attempts,
        error: code,
        ...(failed
          ? { status: 'FAILED', leaseUntil: null }
          : { leaseUntil: new Date(Date.now() + LEASE_MS * attempts) }),
      },
    },
  )
  logger.warn({ transcriptId: String(doc._id), code, attempts, failed }, 'transcription: essai en échec')
  if (failed && doc.providerJobId) await deleteAtProvider(doc._id, doc.providerJobId)
  return failed
}

async function startJob(doc: ICallTranscript, audio: { fetch(): Promise<Buffer> }): Promise<boolean> {
  let buffer: Buffer
  try {
    buffer = await audio.fetch()
    if (!buffer?.length) throw new Error('empty')
  } catch {
    return recordFailure(doc, 'AUDIO_UNAVAILABLE')
  }
  try {
    const audioUrl = await uploadAudio(buffer)
    const jobId = await submitJob({ audioUrl, language: doc.language, channels: doc.channels })
    const attached = await CallTranscript.updateOne(
      { _id: doc._id, status: { $in: ['PENDING', 'PROCESSING'] } },
      { $set: { status: 'PROCESSING', providerJobId: jobId, submittedAt: new Date(), leaseUntil: null, error: '' } },
    )
    // Transcript effacé pendant l'envoi (opposition, anonymisation) : le travail ne doit pas survivre chez le fournisseur.
    if (attached.matchedCount === 0) await deleteJob(jobId).catch(() => {})
    return false
  } catch (err) {
    return recordFailure(doc, errorCode(err, 'SUBMIT_FAILED'))
  }
}

async function deleteAtProvider(id: Types.ObjectId, jobId: string): Promise<void> {
  try {
    await deleteJob(jobId)
  } catch (err) {
    // Déjà supprimé chez le fournisseur : rien à refaire.
    if (!(err instanceof ProviderError && err.httpStatus === 404)) {
      logger.warn({ transcriptId: String(id), code: errorCode(err, 'DELETE_FAILED') }, 'transcription: suppression')
      return
    }
  }
  await CallTranscript.updateOne({ _id: id }, { $set: { providerDeletedAt: new Date() } })
}

async function notifyDone(doc: ICallTranscript): Promise<void> {
  if (doneHandlers.length === 0) return
  const payload: TranscriptDone = {
    callId: String(doc.call),
    leadId: String(doc.lead),
    authorId: String(doc.author),
    segments: doc.segments.map((s) => ({ speaker: s.speaker, startMs: s.startMs, endMs: s.endMs, text: s.text })),
    durationSec: doc.durationSec,
  }
  try {
    for (const handler of doneHandlers) await handler(payload)
    await CallTranscript.updateOne({ _id: doc._id }, { $set: { doneNotifiedAt: new Date() } })
  } catch {
    // Reprise au prochain balayage ; les gestionnaires doivent être idempotents.
    logger.warn({ transcriptId: String(doc._id) }, 'transcription: gestionnaire de fin en échec')
  }
}

/** Prend la main sur un transcript le temps d'un traitement. */
function claim(id: Types.ObjectId, now: Date) {
  return CallTranscript.findOneAndUpdate(
    {
      _id: id,
      status: { $in: ['PENDING', 'PROCESSING'] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    },
    { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS) } },
    { new: true },
  )
}

async function poll(doc: ICallTranscript, now: Date): Promise<'done' | 'failed' | 'waiting'> {
  let job
  try {
    job = await getJob(doc.providerJobId!)
  } catch (err) {
    return (await recordFailure(doc, errorCode(err, 'POLL_FAILED'))) ? 'failed' : 'waiting'
  }
  if (job.status === 'completed') {
    const segments = toSegments(job.utterances ?? [], doc.channels, doc.repChannel)
    const done = await CallTranscript.findOneAndUpdate(
      { _id: doc._id, status: 'PROCESSING' },
      {
        $set: {
          status: 'DONE',
          segments,
          durationSec: typeof job.audio_duration === 'number' ? job.audio_duration : null,
          error: '',
          leaseUntil: null,
        },
      },
      { new: true },
    )
    if (!done) return 'waiting'
    await deleteAtProvider(done._id, doc.providerJobId!)
    await notifyDone(done)
    return 'done'
  }
  const expired = doc.submittedAt && now.getTime() - doc.submittedAt.getTime() > JOB_DEADLINE_MS
  if (job.status === 'error' || expired) {
    const code = job.status === 'error' ? `PROVIDER_ERROR: ${String(job.error ?? '').slice(0, 200)}` : 'TIMEOUT'
    await CallTranscript.updateOne({ _id: doc._id }, { $set: { status: 'FAILED', error: code, leaseUntil: null } })
    logger.warn(
      { transcriptId: String(doc._id), code: job.status === 'error' ? 'PROVIDER_ERROR' : 'TIMEOUT' },
      'transcription: échec',
    )
    await deleteAtProvider(doc._id, doc.providerJobId!)
    return 'failed'
  }
  await CallTranscript.updateOne({ _id: doc._id }, { $set: { leaseUntil: null } })
  return 'waiting'
}

/**
 * Interroge les travaux en cours, reprend les demandes restées en plan, relance
 * les gestionnaires de fin et les suppressions chez le fournisseur qui ont échoué.
 */
export async function sweepTranscriptions(now = new Date()): Promise<{ polled: number; done: number; failed: number }> {
  const result = { polled: 0, done: 0, failed: 0 }
  if (!isConfigured()) return result

  const candidates = await CallTranscript.find({
    status: { $in: ['PENDING', 'PROCESSING'] },
    $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
  })
    .sort({ updatedAt: 1 })
    .limit(BATCH)
    .select('_id')
    .lean()
  for (const { _id } of candidates) {
    const doc = await claim(_id, now)
    if (!doc) continue
    if (doc.status === 'PROCESSING' && doc.providerJobId) {
      result.polled += 1
      const outcome = await poll(doc, now)
      if (outcome === 'done') result.done += 1
      if (outcome === 'failed') result.failed += 1
      continue
    }
    const audio = audioSource
      ? await audioSource({ callId: String(doc.call), leadId: String(doc.lead), authorId: String(doc.author) }).catch(
          () => null,
        )
      : null
    const failed = audio ? await startJob(doc, audio) : await recordFailure(doc, 'AUDIO_UNAVAILABLE')
    if (failed) result.failed += 1
  }

  if (doneHandlers.length > 0) {
    const pending = await CallTranscript.find({ status: 'DONE', doneNotifiedAt: null }).limit(BATCH)
    for (const doc of pending) await notifyDone(doc)
  }
  const undeleted = await CallTranscript.find({
    status: { $in: ['DONE', 'FAILED'] },
    providerJobId: { $ne: null },
    providerDeletedAt: null,
  })
    .limit(BATCH)
    .select('_id providerJobId')
    .lean()
  for (const doc of undeleted) await deleteAtProvider(doc._id, doc.providerJobId!)

  return result
}

/** Efface les transcripts arrivés à échéance de conservation. */
export async function purgeTranscripts(now = new Date()): Promise<{ purged: number }> {
  const due = { purgeAt: { $lte: now } }
  if (isConfigured()) {
    const leftovers = await CallTranscript.find({ ...due, providerJobId: { $ne: null }, providerDeletedAt: null })
      .select('_id providerJobId')
      .lean()
    for (const doc of leftovers) await deleteAtProvider(doc._id, doc.providerJobId!)
  }
  const { deletedCount } = await CallTranscript.deleteMany(due)
  if (deletedCount) logger.info({ purged: deletedCount }, 'transcription: purge')
  return { purged: deletedCount }
}

/**
 * Efface des transcripts avant leur échéance (opposition à l'enregistrement,
 * anonymisation), avec leur travail chez le fournisseur. Si le fournisseur ne
 * répond pas, il reste un marqueur vide (`FAILED`, `DISCARDED`, sans texte) :
 * il empêche toute nouvelle demande pour l'appel, le balayage rejoue la
 * suppression chez le fournisseur et la purge l'efface.
 */
export async function discardTranscripts(filter: {
  call?: Types.ObjectId | string
  lead?: Types.ObjectId | string
}): Promise<{ discarded: number }> {
  if (!filter.call && !filter.lead) return { discarded: 0 }
  const docs = await CallTranscript.find(filter).select('_id providerJobId providerDeletedAt').lean()
  for (const doc of docs) {
    let cleared = !doc.providerJobId || Boolean(doc.providerDeletedAt)
    if (!cleared && isConfigured()) {
      try {
        await deleteJob(doc.providerJobId!)
        cleared = true
      } catch (err) {
        cleared = err instanceof ProviderError && err.httpStatus === 404
      }
    }
    if (cleared) await CallTranscript.deleteOne({ _id: doc._id })
    else {
      const now = new Date()
      await CallTranscript.updateOne(
        { _id: doc._id },
        {
          $set: {
            status: 'FAILED',
            segments: [],
            durationSec: null,
            error: 'DISCARDED',
            purgeAt: now,
            leaseUntil: null,
            doneNotifiedAt: now,
          },
        },
      )
    }
  }
  if (docs.length) logger.info({ discarded: docs.length }, 'transcription: transcripts effacés')
  return { discarded: docs.length }
}
