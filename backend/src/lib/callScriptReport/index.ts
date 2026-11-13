import mongoose, { type Types } from 'mongoose'
import Call from '../../models/Call.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import CallScriptReport, { type ICallScriptReport, type ScriptReportStats } from '../../models/CallScriptReport.js'
import CallTranscript from '../../models/CallTranscript.js'
import CrmSettings from '../../models/CrmSettings.js'
import Interaction from '../../models/Interaction.js'
import Lead from '../../models/Lead.js'
import { acquireSchedulerLock, releaseSchedulerLock } from '../../models/SchedulerLock.js'
import { parisParts, parisWallTimeToDate, parisWeekKey } from '../../automation/jobs/crmParisTime.js'
import type { ICrmSettings } from '../../types/models/index.js'
import { isAnalysisConfigured } from '../callAnalysis/model.js'
import { indexTranscript, isQuoteInTranscript, type TranscriptIndex } from '../callAnalysis/quotes.js'
import { callerScope } from '../callDeskScope.js'
import logger from '../logger.js'
import { sendScriptReportEmail } from './email.js'
import { callReportModel, reportModel, type ReportModelResult } from './model.js'
import { scriptReportSettings, type CallScriptReportSettings } from './settings.js'
import type { ScriptReportModelOutput, ScriptReportOutput } from './schema.js'

/**
 * Rapport hebdomadaire des scripts d'appel (vague 4, lot K).
 *
 * Chaque semaine, pour chaque auteur d'appels, Claude lit les transcripts de la
 * semaine écoulée et rend : lecture du taux de conversion, objections
 * récurrentes, passages qui font avancer ou perdre, formulations à essayer.
 *
 * Cloisonnement : un rapport ne porte que sur les appels de son auteur, sur les
 * fiches de son périmètre d'appel relu au moment du calcul (`callerScope`) :
 * l'externe, ses fiches (`repLeadFilter`) ; l'équipe, son périmètre d'écriture
 * hors listes d'un externe non transmises (`teamLeadFilter`). Le modèle ne voit
 * ni nom, ni numéro, ni entreprise ; ce qu'il rend est vérifié (citations
 * retrouvées dans le transcript de l'appel cité) puis masqué (noms, entreprises,
 * numéros, adresses des fiches de la semaine).
 *
 * Idempotence : un rapport par auteur et par semaine ISO (index unique) ; la
 * planification d'une semaine est verrouillée ; l'exécution d'un rapport se
 * réserve par `lockedAt` ; l'e-mail se réserve par `emailState`.
 */

const DAY_MS = 86_400_000
const LOCK_MS = 15 * 60_000
const MAX_ATTEMPTS = 4
const RETRY_DELAYS_MIN = [15, 60, 240, 720]
const PLAN_HOUR = 6
const PER_PASS = 5
const MAX_QUOTE_CHARS = 200
/** Estimation prudente du nombre de jetons d'un texte français (≈ 3 caractères par jeton). */
const estimateTokens = (text: string) => Math.ceil(text.length / 3)
const RESERVED_TOKENS = 1_500

type Range = { $gte: Date; $lt: Date }
type Scope = NonNullable<Awaited<ReturnType<typeof callerScope>>>

/** Dernière semaine ISO achevée (lundi 00:00 → lundi 00:00, heure de Paris) avant `now`. */
export function lastCompleteWeek(now: Date): { weekKey: string; weekStart: Date; weekEnd: Date } {
  const p = parisParts(now)
  const thisMonday = Date.UTC(p.year, p.month - 1, p.day) - ((p.weekday + 6) % 7) * DAY_MS
  const at = (utcDay: number) => {
    const d = new Date(utcDay)
    return parisWallTimeToDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0)
  }
  const weekStart = at(thisMonday - 7 * DAY_MS)
  return { weekKey: parisWeekKey(weekStart), weekStart, weekEnd: at(thisMonday) }
}

/** Vrai à partir de 06:00 (Paris) le jour réglé, et jusqu'à la fin de la semaine ISO (rattrapage). */
export function isPlanningDue(now: Date, day: number): boolean {
  const p = parisParts(now)
  const rank = (d: number) => (d + 6) % 7
  if (rank(p.weekday) !== rank(day)) return rank(p.weekday) > rank(day)
  return p.minutesOfDay >= PLAN_HOUR * 60
}

// ─── Données de la semaine ────────────────────────────────────────────────

interface WeekMaterial {
  stats: ScriptReportStats
  /** Un bloc par appel transcrit, dans l'ordre, déjà borné par le plafond de jetons. */
  blocks: string[]
  transcripts: Map<string, TranscriptIndex>
  redactTerms: string[]
}

async function collectWeek(
  authorId: Types.ObjectId,
  scope: Scope,
  range: Range,
  settings: ICrmSettings,
  report: CallScriptReportSettings,
): Promise<WeekMaterial> {
  const [calls, interactions] = await Promise.all([
    Call.find({ author: authorId, createdAt: range })
      .select('_id lead interaction createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    Interaction.find({ kind: 'CALL', subjectType: 'LEAD', author: authorId, occurredAt: range })
      .select('_id subjectId outcome scriptTag')
      .lean(),
  ])
  const leadIds = [...new Set([...calls.map((c) => String(c.lead)), ...interactions.map((i) => String(i.subjectId))])]
  // Périmètre relu maintenant : une fiche sortie du périmètre de l'auteur sort de son rapport.
  const leads = await Lead.find({ ...scope.filter, _id: { $in: leadIds }, anonymizedAt: null })
    .select('company contactName contactEmail contactPhone')
    .lean()
  const allowed = new Set(leads.map((l) => String(l._id)))
  const ownCalls = calls.filter((c) => allowed.has(String(c.lead)))
  const logged = interactions.filter((i) => allowed.has(String(i.subjectId)))

  const outcomes = new Map(settings.callOutcomes.map((o) => [o.value, o]))
  const byScript = new Map<string, ScriptReportStats['byScript'][number]>()
  let reached = 0
  let conversions = 0
  for (const item of logged) {
    const outcome = outcomes.get(item.outcome ?? '')
    const tag = item.scriptTag ?? ''
    const row = byScript.get(tag) ?? { tag, calls: 0, reached: 0, conversions: 0 }
    row.calls++
    if (outcome?.reached) {
      row.reached++
      reached++
    }
    if (outcome?.effect === 'MEETING') {
      row.conversions++
      conversions++
    }
    byScript.set(tag, row)
  }

  const callIds = ownCalls.map((c) => c._id)
  const [transcriptDocs, analyses] = await Promise.all([
    CallTranscript.find({ call: { $in: callIds }, author: authorId, status: 'DONE' })
      .select('call segments')
      .lean(),
    CallAnalysis.find({ call: { $in: callIds }, author: authorId, status: { $in: ['READY', 'APPLIED', 'PARTIAL'] } })
      .select('call output.heat.level')
      .lean(),
  ])
  const segmentsOf = new Map(transcriptDocs.map((t) => [String(t.call), t.segments]))
  const heatOf = new Map(analyses.map((a) => [String(a.call), a.output?.heat?.level ?? null]))
  const loggedById = new Map(logged.map((i) => [String(i._id), i]))

  const budget = report.maxInputTokens - RESERVED_TOKENS
  let used = 0
  const blocks: string[] = []
  const transcripts = new Map<string, TranscriptIndex>()
  let transcribed = 0
  for (const call of ownCalls) {
    const segments = segmentsOf.get(String(call._id))?.filter((s) => s.text?.trim())
    if (!segments?.length) continue
    transcribed++
    const ref = `C${transcribed}`
    const entry = call.interaction ? loggedById.get(String(call.interaction)) : undefined
    const outcome = entry ? outcomes.get(entry.outcome ?? '') : undefined
    const header = [
      `### ${ref}`,
      `résultat : ${outcome ? outcome.fr : 'non renseigné'}${outcome?.effect === 'MEETING' ? ' (rendez-vous obtenu)' : ''}`,
      `script : ${entry?.scriptTag || 'aucun'}`,
      `chaleur : ${heatOf.get(String(call._id)) ?? 'inconnue'}`,
    ].join(' — ')
    const lines = segments.map((s) => `${s.speaker === 'REP' ? 'Commercial' : 'Prospect'} : ${s.text.trim()}`)
    const block = [header, ...lines].join('\n')
    const cost = estimateTokens(block)
    if (used + cost > budget) continue
    used += cost
    blocks.push(block)
    transcripts.set(ref, indexTranscript(segments))
  }

  const redactTerms = leads.flatMap((l) => [
    l.company,
    l.contactName,
    ...(l.contactName ?? '').split(/\s+/),
    l.contactEmail,
    l.contactPhone,
  ])
  return {
    stats: {
      calls: logged.length,
      reached,
      conversions,
      conversionRate: reached > 0 ? Math.round((conversions / reached) * 100) : null,
      targetConversionRate: report.targetConversionRate,
      transcripts: transcribed,
      transcriptsAnalyzed: blocks.length,
      byScript: [...byScript.values()].sort((a, b) => b.calls - a.calls),
    },
    blocks,
    transcripts,
    redactTerms: [...new Set(redactTerms.map((t) => (t ?? '').trim()).filter((t) => t.length >= 3))],
  }
}

// ─── Masquage et vérification ─────────────────────────────────────────────

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/gu
const PHONE_PATTERN = /\+?\d(?:[\s.-]?\d){7,}/gu
/** Civilité suivie d'un nom : une personne nommée au téléphone sans figurer sur la fiche. */
const TITLED_NAME =
  /(?<![\p{L}])(?:M\.|Mme|Mlle|Mr|Monsieur|Madame|Mademoiselle)\s+\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*)?/gu
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Retire adresses, numéros et les noms des fiches de la semaine. */
export function redact(text: string, terms: string[]): string {
  let result = text.replace(EMAIL_PATTERN, '[…]').replace(PHONE_PATTERN, '[…]').replace(TITLED_NAME, '[…]')
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu'), '[…]')
  }
  return result
}

/** Sortie du modèle → forme rangée : citations retrouvées dans l'appel cité, tout le texte masqué. */
export function finalizeReport(
  raw: ScriptReportModelOutput,
  transcripts: Map<string, TranscriptIndex>,
  terms: string[],
): ScriptReportOutput {
  let dropped = 0
  const clean = (text: string, max: number) => redact(text.trim(), terms).slice(0, max)
  const verified = (call: string, quote: string): string | null => {
    const index = transcripts.get(call.trim())
    const text = quote.trim()
    if (!index || text.length > MAX_QUOTE_CHARS || !isQuoteInTranscript(text, index)) {
      dropped++
      return null
    }
    return redact(text, terms)
  }
  const moments = (items: ScriptReportModelOutput['advancing']) =>
    items.slice(0, 5).map((m) => ({ label: clean(m.label, 200), quote: verified(m.call, m.quote) }))
  const objections = raw.objections.slice(0, 5).map((o) => ({
    label: clean(o.label, 200),
    occurrences: Math.max(0, Math.round(o.occurrences)),
    quotes: o.quotes
      .slice(0, 2)
      .map((q) => verified(q.call, q.text))
      .filter((q): q is string => q !== null),
    response: clean(o.response, 600),
  }))
  return {
    summary: clean(raw.summary, 1200),
    conversionReading: clean(raw.conversionReading, 1200),
    objections,
    advancing: moments(raw.advancing),
    losing: moments(raw.losing),
    scriptChanges: raw.scriptChanges.slice(0, 5).map((c) => ({
      current: c.current ? clean(c.current, 400) : null,
      proposed: clean(c.proposed, 400),
      why: clean(c.why, 600),
    })),
    droppedQuotes: dropped,
  }
}

// ─── Planification ────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000

/** Crée les rapports de la semaine écoulée, un par auteur ayant appelé ; rejouable sans doublon. */
export async function planWeek(now: Date, settings: ICrmSettings): Promise<number> {
  const report = scriptReportSettings(settings.callScriptReport)
  const { weekKey, weekStart, weekEnd } = lastCompleteWeek(now)
  const range = { $gte: weekStart, $lt: weekEnd }
  const [callAuthors, loggedAuthors] = await Promise.all([
    Call.distinct('author', { createdAt: range }),
    Interaction.distinct('author', { kind: 'CALL', subjectType: 'LEAD', occurredAt: range, author: { $ne: null } }),
  ])
  const authors = [...new Set([...callAuthors, ...loggedAuthors].map(String))]
  const retention = settings.callAnalysis?.retentionMonths ?? 12
  let created = 0
  for (const id of authors) {
    if (await CallScriptReport.exists({ author: id, weekKey })) continue
    const scope = await callerScope(id)
    if (!scope) continue
    const author = new mongoose.Types.ObjectId(id)
    const material = await collectWeek(author, scope, range, settings, report)
    if (material.stats.calls === 0 && material.stats.transcripts === 0) continue
    try {
      await CallScriptReport.create({
        author,
        authorKind: scope.kind,
        weekKey,
        weekStart,
        weekEnd,
        stats: material.stats,
        status: 'PENDING',
        purgeAt: addMonths(weekEnd, retention),
      })
      created++
    } catch (err) {
      if (!isDuplicateKey(err)) throw err
    }
  }
  return created
}

// ─── Exécution d'un rapport ───────────────────────────────────────────────

export async function processReport(id: Types.ObjectId, now: Date = new Date()): Promise<void> {
  const claimed = await CallScriptReport.findOneAndUpdate(
    {
      _id: id,
      status: 'PENDING',
      $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - LOCK_MS) } }],
    },
    { $set: { lockedAt: now }, $inc: { attempts: 1 } },
    { new: true },
  )
  if (!claimed) return
  const finish = (patch: Partial<ICallScriptReport>) =>
    CallScriptReport.updateOne({ _id: id, lockedAt: now }, { $set: { ...patch, lockedAt: null } })
  const fail = (code: string, detail: string, retryable: boolean) => {
    const canRetry = retryable && claimed.attempts < MAX_ATTEMPTS
    const delay = RETRY_DELAYS_MIN[Math.min(claimed.attempts, RETRY_DELAYS_MIN.length) - 1]!
    return finish({
      status: 'FAILED',
      errorCode: code,
      error: detail.slice(0, 500),
      retryable: canRetry,
      nextRetryAt: canRetry ? new Date(now.getTime() + delay * 60_000) : null,
      emailState: canRetry ? 'PENDING' : 'NONE',
    })
  }

  try {
    const settings = await CrmSettings.getSettings()
    const report = scriptReportSettings(settings.callScriptReport)
    const scope = await callerScope(String(claimed.author))
    // Rôle changé depuis la planification (externe devenu membre, ou l'inverse) : le rapport n'est pas produit.
    if (!scope || scope.kind !== claimed.authorKind)
      return void (await fail('AUTHOR_UNAVAILABLE', 'Auteur hors périmètre', false))
    const material = await collectWeek(
      claimed.author,
      scope,
      { $gte: claimed.weekStart, $lt: claimed.weekEnd },
      settings,
      report,
    )
    const skip = (skipReason: 'NO_TRANSCRIPT' | 'AI_DISABLED') =>
      finish({ status: 'SKIPPED', skipReason, stats: material.stats, errorCode: null, error: '', nextRetryAt: null })
    if (!material.blocks.length) return void (await skip('NO_TRANSCRIPT'))
    if (!isAnalysisConfigured()) return void (await skip('AI_DISABLED'))

    const { stats } = material
    const scripts = stats.byScript
      .map((s) => `${s.tag || 'aucun'} : ${s.calls} appels, ${s.reached} joints, ${s.conversions} rendez-vous`)
      .join(' ; ')
    const user = [
      `Semaine ${claimed.weekKey}.`,
      `Objectif de conversion : ${stats.targetConversionRate} %.`,
      `Appels consignés : ${stats.calls} ; prospects joints : ${stats.reached} ; rendez-vous : ${stats.conversions} ; taux : ${stats.conversionRate ?? '—'} %.`,
      scripts ? `Par script : ${scripts}.` : '',
      stats.transcripts > stats.transcriptsAnalyzed
        ? `${stats.transcripts - stats.transcriptsAnalyzed} transcript(s) non fourni(s) faute de place.`
        : '',
      '',
      ...material.blocks,
    ]
      .filter((line, i, all) => line || all[i - 1])
      .join('\n')

    const model = reportModel(report.model)
    let result: ReportModelResult = { kind: 'invalid', detail: '' }
    // Refus ou sortie invalide : une seconde demande dans la même tentative, puis échec définitif.
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await callReportModel(model, user)
      if (result.kind === 'ok' || result.kind === 'api_error') break
    }
    if (result.kind === 'api_error') return void (await fail('API_ERROR', result.detail, result.retryable))
    if (result.kind !== 'ok')
      return void (await fail(result.kind === 'refused' ? 'REFUSED' : 'INVALID_OUTPUT', result.detail, false))

    await finish({
      status: 'READY',
      skipReason: null,
      stats,
      output: finalizeReport(result.output, material.transcripts, material.redactTerms),
      model: result.model,
      usage: result.usage,
      errorCode: null,
      error: '',
      retryable: false,
      nextRetryAt: null,
    })
  } catch (err) {
    logger.error({ reportId: String(id), detail: (err as Error).message?.slice(0, 200) }, '[callScriptReport] échec')
    await fail('UNEXPECTED', (err as Error).message ?? 'Erreur inattendue', true)
  }
}

async function processDue(now: Date): Promise<number> {
  const stale = new Date(now.getTime() - LOCK_MS)
  const due = await CallScriptReport.find({
    $or: [
      { status: 'PENDING', $or: [{ lockedAt: null }, { lockedAt: { $lt: stale } }] },
      { status: 'FAILED', retryable: true, nextRetryAt: { $lte: now } },
    ],
  })
    .select('_id status')
    .sort({ createdAt: 1 })
    .limit(PER_PASS)
    .lean()
  let processed = 0
  for (const item of due) {
    if (item.status === 'FAILED') {
      const reopened = await CallScriptReport.updateOne(
        { _id: item._id, status: 'FAILED', retryable: true },
        { $set: { status: 'PENDING', nextRetryAt: null } },
      )
      if (reopened.modifiedCount === 0) continue
    }
    await processReport(item._id, now)
    processed++
  }
  return processed
}

async function sendDueEmails(report: CallScriptReportSettings): Promise<number> {
  const due = await CallScriptReport.find({ status: { $in: ['READY', 'SKIPPED'] }, emailState: 'PENDING' })
    .select('_id')
    .limit(20)
    .lean()
  let sent = 0
  for (const { _id } of due) {
    // Réservation : un e-mail part une fois, même avec plusieurs instances.
    const claimed = await CallScriptReport.findOneAndUpdate(
      { _id, emailState: 'PENDING' },
      { $set: { emailState: 'SENDING' } },
      { new: true },
    ).populate<{ author: { _id: Types.ObjectId; name: string; email: string; isActive: boolean } }>(
      'author',
      'name email isActive',
    )
    if (!claimed) continue
    const to = [
      ...(report.emailAuthors && claimed.author?.isActive && claimed.author.email ? [claimed.author.email] : []),
      // Les rapports d'un externe ne partent qu'à lui : l'équipe ne lit pas ses appels non transmis.
      ...(claimed.authorKind === 'team' ? report.recipients : []),
    ]
    const recipients = [...new Set(to.map((e) => e.toLowerCase()))]
    if (!recipients.length) {
      await CallScriptReport.updateOne({ _id }, { $set: { emailState: 'NONE' } })
      continue
    }
    const result = await sendScriptReportEmail({ to: recipients, report: claimed, authorName: claimed.author.name })
    await CallScriptReport.updateOne(
      { _id },
      { $set: result.sent ? { emailState: 'SENT', emailedAt: new Date() } : { emailState: 'FAILED' } },
    )
    if (result.sent) sent++
  }
  return sent
}

/**
 * Tâche du planificateur (`crmScheduler.ts`, toutes les 15 minutes) :
 * planifie la semaine écoulée le jour réglé, exécute les rapports en attente et
 * les reprises dues, envoie les e-mails, purge les rapports échus.
 */
export async function runCallScriptReports(
  now: Date = new Date(),
): Promise<{ planned: number; processed: number; emailed: number; purged: number }> {
  const purged = (await CallScriptReport.deleteMany({ purgeAt: { $lte: now } })).deletedCount
  const settings = await CrmSettings.getSettings()
  const report = scriptReportSettings(settings.callScriptReport)
  if (!report.enabled) return { planned: 0, processed: 0, emailed: 0, purged }
  let planned = 0
  if (isPlanningDue(now, report.day)) {
    const lock = `call-script-report:plan:${lastCompleteWeek(now).weekKey}`
    if (await acquireSchedulerLock(lock, 14 * DAY_MS, now)) {
      try {
        planned = await planWeek(now, settings)
      } catch (err) {
        await releaseSchedulerLock(lock).catch(() => {})
        throw err
      }
    }
  }
  const processed = await processDue(now)
  const emailed = await sendDueEmails(report)
  return { planned, processed, emailed, purged }
}
