import mongoose, { type Types } from 'mongoose'
import CallAnalysis, { type ICallAnalysis } from '../../models/CallAnalysis.js'
import CrmSettings from '../../models/CrmSettings.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'
import type { ICrmSettings, ILead } from '../../types/models/index.js'
import { logLeadActivity } from '../crmAutomations.js'
import { applyLeadChange } from '../crmLeadService.js'
import { EXTERNAL_SALES_ROLE, isRepLead } from '../externalSales.js'
import logger from '../logger.js'
import { runInTransaction } from '../transaction.js'
import { coerceFieldValue, modelLeadContext, type ApplyScope } from './fields.js'
import { computeHeat, DEFAULT_CALL_ANALYSIS_SETTINGS, effectiveHeatGrid } from './heat.js'
import { analysisModel, callModel, isAnalysisConfigured, type ModelResult } from './model.js'
import { buildSystemPrompt, buildUserMessage, PROMPT_VERSION } from './prompt.js'
import { indexTranscript, isQuoteInTranscript } from './quotes.js'
import {
  callAnalysisOutputSchema,
  type CallAnalysisOutput,
  type FieldKey,
  type ModelOutput,
  type TranscriptSegment,
} from './schema.js'

export { applyCallAnalysis, rejectCallAnalysis, resolveCallHold } from './apply.js'
export type { TranscriptSegment as Segment } from './schema.js'

/**
 * Analyse d'un appel transcrit.
 *
 * `analyzeCall` range une proposition à part (`CallAnalysis`) ; il n'écrit
 * jamais sur le lead, sauf dans un cas, protecteur et réversible : une
 * opposition détectée retire la fiche de la file (`Lead.callHold`), consigné
 * dans l'historique, jusqu'à la décision d'un humain (`resolveCallHold`).
 * Tout le reste attend `applyCallAnalysis`, appelé par un humain.
 */

const LOCK_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MIN = [5, 30, 120, 360]

/** Filtre à ajouter à la file d'appels et aux gardes de lancement (vague 2) : une fiche retenue n'est pas proposée. */
export const CALL_QUEUE_HOLD_FILTER = { callHold: null } as const

function analysisSettings(settings: ICrmSettings) {
  return settings.callAnalysis ?? DEFAULT_CALL_ANALYSIS_SETTINGS
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000
}

type AnalysisInput = {
  callId: string
  leadId: string
  authorId: string
  segments: TranscriptSegment[]
  durationSec: number | null
}

/** Crée l'analyse `PENDING` ; une seule par appel, un second déclenchement renvoie la première. */
async function createAnalysis(input: AnalysisInput): Promise<{ analysis: ICallAnalysis; created: boolean }> {
  const settings = await CrmSettings.getSettings()
  const now = new Date()
  try {
    const analysis = await CallAnalysis.create({
      call: input.callId,
      lead: input.leadId,
      author: input.authorId,
      model: analysisModel(),
      promptVersion: PROMPT_VERSION,
      status: 'PENDING',
      callDate: now,
      durationSec: input.durationSec,
      purgeAt: addMonths(now, analysisSettings(settings).retentionMonths),
    })
    return { analysis, created: true }
  } catch (err) {
    if (!isDuplicateKey(err)) throw err
    return { analysis: (await CallAnalysis.findOne({ call: input.callId }))!, created: false }
  }
}

export async function analyzeCall(input: AnalysisInput): Promise<{ analysisId: string }> {
  const { analysis, created } = await createAnalysis(input)
  if (created) await runAnalysis(analysis._id, input.segments)
  return { analysisId: String(analysis._id) }
}

/**
 * Comme `analyzeCall`, sans attendre le modèle : l'analyse est créée, puis
 * exécutée en arrière-plan. Une analyse interrompue (redémarrage) reste
 * `PENDING` et le balayage la reprend.
 */
export async function enqueueAnalysis(input: AnalysisInput): Promise<ICallAnalysis> {
  const { analysis, created } = await createAnalysis(input)
  if (created) {
    void runAnalysis(analysis._id, input.segments).catch((err) =>
      logger.error({ err, analysisId: String(analysis._id) }, '[callAnalysis] Échec en arrière-plan'),
    )
  }
  return analysis
}

/** Transcript rangé par le lot C (`CallTranscript`), quand le modèle est chargé. Sert aux relances. */
async function loadTranscript(callId: Types.ObjectId): Promise<TranscriptSegment[] | null> {
  const model = mongoose.models.CallTranscript
  if (!model) return null
  const transcript = await model
    .findOne({ call: callId, status: 'DONE' })
    .select('segments')
    .lean<{ segments: TranscriptSegment[] }>()
  return transcript?.segments ?? null
}

/** Vue de la fiche que voit l'auteur ; `null` si l'auteur ne la voit plus (externe dessaisi). */
async function authorScope(lead: ILead, authorId: Types.ObjectId): Promise<ApplyScope | null> {
  const author = await User.findById(authorId).select('role').lean<{ role: string }>()
  if (!author) return null
  if (author.role !== EXTERNAL_SALES_ROLE) return 'team'
  return isRepLead(authorId, lead) ? 'rep' : null
}

/** Sortie du modèle complétée par le serveur : citations vérifiées, valeurs typées, chaleur recalculée. */
export function finalizeOutput(
  raw: ModelOutput,
  segments: TranscriptSegment[],
  settings: Pick<ICrmSettings, 'callOutcomes' | 'callAnalysis'>,
): CallAnalysisOutput {
  const transcript = indexTranscript(segments)
  const seen = new Set<FieldKey>()
  const fields: CallAnalysisOutput['fields'] = []
  for (const field of raw.fields) {
    if (seen.has(field.key)) continue
    const coerced = coerceFieldValue(field.key, field.value)
    if (!coerced.ok) continue
    seen.add(field.key)
    const value = coerced.value instanceof Date ? coerced.value.toISOString().slice(0, 10) : coerced.value
    fields.push({
      key: field.key,
      value,
      confidence: field.confidence,
      quote: field.quote.trim(),
      quoteVerified: isQuoteInTranscript(field.quote, transcript),
    })
  }
  const optOutQuote = raw.optOut.quote?.trim() || null
  const optOut = {
    detected: raw.optOut.detected,
    quote: optOutQuote,
    quoteVerified: optOutQuote !== null && isQuoteInTranscript(optOutQuote, transcript),
  }
  const outcomes = settings.callOutcomes.map((outcome) => outcome.value)
  const actions = optOut.detected
    ? []
    : raw.actions.slice(0, 3).map((action, index) => {
        const due = action.dueAt ? new Date(action.dueAt) : null
        return {
          id: `a${index + 1}`,
          type: action.type,
          label: action.label.trim().slice(0, 200),
          dueAt: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
          reason: action.reason.trim().slice(0, 500),
        }
      })
  return callAnalysisOutputSchema.parse({
    summary: raw.summary.trim().slice(0, 2000),
    suggestedOutcome: raw.suggestedOutcome && outcomes.includes(raw.suggestedOutcome) ? raw.suggestedOutcome : null,
    optOut,
    fields,
    heat: computeHeat(raw.heat, effectiveHeatGrid(settings), transcript, optOut.detected),
    actions,
  })
}

/** Exécute l'analyse d'un document `PENDING` ; un seul exécutant à la fois grâce au verrou. */
async function runAnalysis(id: Types.ObjectId, segments?: TranscriptSegment[]): Promise<void> {
  const now = new Date()
  const claimed = await CallAnalysis.findOneAndUpdate(
    { _id: id, status: 'PENDING', $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - LOCK_MS) } }] },
    { $set: { lockedAt: now } },
    { new: true },
  )
  if (!claimed) return
  const finish = (patch: Record<string, unknown>) =>
    CallAnalysis.updateOne({ _id: id, lockedAt: now }, { $set: { ...patch, lockedAt: null } })
  const fail = (code: string, detail: string, retryable = false) => {
    const delay = RETRY_DELAYS_MIN[Math.min(claimed.attempts, RETRY_DELAYS_MIN.length - 1)]!
    const canRetry = retryable && claimed.attempts < MAX_ATTEMPTS
    return finish({
      status: 'FAILED',
      errorCode: code,
      error: detail.slice(0, 500),
      retryable: canRetry,
      nextRetryAt: canRetry ? new Date(Date.now() + delay * 60_000) : null,
    })
  }

  try {
    const settings = await CrmSettings.getSettings()
    if (!analysisSettings(settings).enabled)
      return void (await fail('DISABLED', 'Analyse désactivée dans les réglages'))
    if (!isAnalysisConfigured()) return void (await fail('DISABLED', 'ANTHROPIC_API_KEY absente : analyse désactivée'))

    const transcript = segments ?? (await loadTranscript(claimed.call))
    if (!transcript) return void (await fail('TRANSCRIPT_UNAVAILABLE', 'Transcript introuvable'))
    if (!transcript.some((segment) => segment.text?.trim())) {
      return void (await fail('EMPTY_TRANSCRIPT', 'Transcript vide'))
    }
    const lead = await Lead.findById(claimed.lead)
    const scope = lead && !lead.anonymizedAt ? await authorScope(lead, claimed.author) : null
    if (!lead || !scope) return void (await fail('LEAD_UNAVAILABLE', 'Fiche inaccessible à l’auteur de l’appel'))

    const system = buildSystemPrompt(effectiveHeatGrid(settings), settings.callOutcomes)
    const user = buildUserMessage({
      callDate: claimed.callDate,
      durationSec: claimed.durationSec,
      lead: modelLeadContext(lead, scope),
      segments: transcript,
    })

    // Refus ou sortie invalide : une relance, puis échec. Erreur d'API : déjà relancée par le SDK, reprise par le balayage.
    let result: ModelResult = { kind: 'invalid', detail: '' }
    for (let attempt = 0; attempt < 2; attempt++) {
      await CallAnalysis.updateOne({ _id: id }, { $inc: { attempts: 1 } })
      claimed.attempts += 1
      result = await callModel(system, user)
      if (result.kind === 'ok' || result.kind === 'api_error') break
    }
    if (result.kind === 'refused') return void (await fail('REFUSED', result.detail))
    if (result.kind === 'invalid') return void (await fail('INVALID_OUTPUT', result.detail))
    if (result.kind === 'api_error') return void (await fail('API_ERROR', result.detail, result.retryable))

    let output: CallAnalysisOutput
    try {
      output = finalizeOutput(result.output, transcript, settings)
    } catch (err) {
      return void (await fail('INVALID_OUTPUT', `Sortie incohérente : ${(err as Error).message}`))
    }
    // Retrait de la file avant de publier l'analyse : s'il échoue, l'analyse reste à reprendre plutôt que prête sans retrait.
    if (output.optOut.detected) await holdForOptOut(claimed, output)
    await finish({
      status: 'READY',
      output,
      usage: result.usage,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      errorCode: null,
      error: '',
      retryable: false,
      nextRetryAt: null,
    })
  } catch (err) {
    logger.error({ err, analysisId: String(id) }, '[callAnalysis] Échec inattendu')
    await fail('API_ERROR', (err as Error).message ?? 'Erreur inattendue', true)
  }
}

/** Seule écriture automatique : la fiche sort de la file, en attendant qu'un humain confirme ou lève l'opposition. */
async function holdForOptOut(analysis: ICallAnalysis, output: CallAnalysisOutput): Promise<void> {
  await runInTransaction(async (session) => {
    const lead = await Lead.findById(analysis.lead).session(session)
    if (!lead || lead.doNotCall || lead.callHold) return
    await applyLeadChange(
      lead,
      { callHold: { at: new Date(), reason: 'OPT_OUT_DETECTED', analysis: analysis._id, call: analysis.call } },
      { actor: null, source: 'analysis', session, emit: false, validateAssignee: false },
    )
    await logLeadActivity(
      lead._id as Types.ObjectId,
      'CALL_OPT_OUT_HOLD',
      'Opposition détectée par l’analyse d’appel : fiche retirée de la file en attendant une décision',
      {
        analysisId: String(analysis._id),
        callId: String(analysis.call),
        quote: output.optOut.quote,
        quoteVerified: output.optOut.quoteVerified,
      },
      null,
      session,
    )
  })
}

/**
 * Relance demandée par un humain : une analyse en échec, ou prête mais pas
 * encore relue. L'exécution part en arrière-plan ; le transcript est relu
 * depuis `CallTranscript`.
 */
export async function retryAnalysis(analysisId: Types.ObjectId | string) {
  const analysis = await CallAnalysis.findOneAndUpdate(
    { _id: analysisId, status: { $in: ['FAILED', 'READY'] }, lockedAt: null },
    { $set: { status: 'PENDING', errorCode: null, error: '', retryable: false, nextRetryAt: null } },
    { new: true },
  )
  if (!analysis) return null
  void runAnalysis(analysis._id).catch((err) => logger.error({ err }, '[callAnalysis] Relance en échec'))
  return analysis
}

/** Planificateur (vague 2) : reprend les analyses bloquées et les erreurs d'API passagères. */
export async function sweepAnalyses(now: Date = new Date()): Promise<{ retried: number }> {
  const stale = new Date(now.getTime() - LOCK_MS)
  const due = await CallAnalysis.find({
    $or: [
      { status: 'PENDING', $or: [{ lockedAt: { $lt: stale } }, { lockedAt: null, updatedAt: { $lt: stale } }] },
      { status: 'FAILED', retryable: true, nextRetryAt: { $lte: now } },
    ],
  })
    .select('_id status')
    .limit(20)
    .lean()
  let retried = 0
  for (const item of due) {
    if (item.status === 'FAILED') {
      const reopened = await CallAnalysis.updateOne(
        { _id: item._id, status: 'FAILED', retryable: true },
        { $set: { status: 'PENDING', nextRetryAt: null } },
      )
      if (reopened.modifiedCount === 0) continue
    }
    await runAnalysis(item._id)
    retried++
  }
  return { retried }
}

/** Planificateur (vague 2) : supprime les analyses arrivées à échéance de conservation. */
export async function purgeAnalyses(now: Date = new Date()): Promise<{ purged: number }> {
  const result = await CallAnalysis.deleteMany({ purgeAt: { $lte: now } })
  return { purged: result.deletedCount }
}
