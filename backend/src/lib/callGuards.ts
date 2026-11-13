import type { ClientSession, PipelineStage, Types } from 'mongoose'
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js'
import SuppressionEntry, { type SuppressionReason } from '../models/SuppressionEntry.js'
import Call from '../models/Call.js'
import { normalizePhone } from './callImports.js'
import { telephonyError } from './telephony/index.js'
import { callCountryRules, phoneTarget, type PhoneTarget } from './telephony/countries.js'
import type { ICrmSettings, ILead } from '../types/models/index.js'

/**
 * Gardes d'un appel sortant (lot A). Le serveur les passe au lancement et les
 * repasse quand l'opérateur demande la mise en relation : le navigateur ne
 * choisit jamais le numéro ni le moment.
 */

const CALLABLE_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Jour (AAAA-MM-JJ), jour de semaine (0 = dimanche) et minute de la journée dans le fuseau donné. */
export function localClock(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(parts.weekday!),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours! * 60 + minutes!
}

/** Dans la plage d'appel dans **chacun** des fuseaux possibles du prospect (lot P) ; jamais sans fuseau. */
export function withinCallingHours(
  now: Date,
  hours: ICrmSettings['telephony']['callingHours'],
  timeZones: string[],
): boolean {
  if (!timeZones.length) return false
  const start = minutesOf(hours.start)
  const end = minutesOf(hours.end)
  return timeZones.every((timeZone) => {
    const clock = localClock(now, timeZone)
    return hours.days.includes(clock.weekday) && clock.minutes >= start && clock.minutes < end
  })
}

export function attemptWindowOf(settings: Pick<ICrmSettings, 'telephony'>) {
  return { days: settings.telephony.attemptWindow?.days ?? 14, max: settings.telephony.attemptWindow?.max ?? 6 }
}

type CallableLead = Pick<
  ILead,
  | 'status'
  | 'closingHandoff'
  | 'archivedAt'
  | 'doNotContact'
  | 'doNotCall'
  | 'phoneInvalid'
  | 'contactPhone'
  | 'callHold'
  | 'businessContact'
  | 'callUnreachableAt'
>

/**
 * Ce qui empêche d'appeler ce numéro maintenant, hors fiche et plafonds (lot P) :
 * contact non professionnel, pays fermé, fuseau inconnu, hors plage dans le fuseau
 * du prospect. Sert aussi à la file pour dire pourquoi une fiche attend.
 */
export function callWindowCheck(
  lead: Pick<CallableLead, 'contactPhone' | 'businessContact'>,
  settings: ICrmSettings,
  now: Date,
): { target: PhoneTarget | null; block: CallBlock | null } {
  const target = phoneTarget(String(lead.contactPhone ?? ''), settings.callDefaultRegion)
  let block: CallBlock | null = null
  if (!target) block = 'LEAD_NOT_CALLABLE'
  else if (!lead.businessContact) block = 'NOT_BUSINESS_CONTACT'
  else if (!callCountryRules(settings).some((rule) => rule.enabled && rule.code === target.country))
    block = 'COUNTRY_NOT_ALLOWED'
  else if (!target.timeZones.length) block = 'TIMEZONE_UNKNOWN'
  else if (!withinCallingHours(now, settings.telephony.callingHours, target.timeZones)) block = 'OUTSIDE_CALLING_HOURS'
  return { target, block }
}

export type CallBlock =
  'LEAD_NOT_CALLABLE' | 'NOT_BUSINESS_CONTACT' | 'COUNTRY_NOT_ALLOWED' | 'TIMEZONE_UNKNOWN' | 'OUTSIDE_CALLING_HOURS'

/** Jour local du prospect qui sert au plafond quotidien : celui de son premier fuseau possible. */
export function attemptDayOf(now: Date, target: PhoneTarget): string {
  return localClock(now, target.timeZones[0] ?? 'Europe/Paris').day
}

/**
 * Lève une erreur 409 portant le code du contrat si l'appel n'est pas permis maintenant ;
 * rend le numéro résolu (E.164, pays, fuseaux).
 */
export function assertCallable(
  lead: CallableLead,
  ctx: {
    now: Date
    settings: ICrmSettings
    /** Tentatives déjà faites vers ce numéro : ce jour local, et sur la fenêtre glissante. */
    attempts: { today: number; window: number }
    /** L'équipe appelle aussi une fiche transmise au closer ; l'externe s'arrête au passage. */
    scope?: 'rep' | 'team'
  },
): PhoneTarget {
  if (
    (ctx.scope !== 'team' && lead.closingHandoff) ||
    !CALLABLE_STATUSES.includes(lead.status) ||
    lead.archivedAt ||
    lead.doNotContact ||
    lead.doNotCall ||
    lead.phoneInvalid ||
    // Opposition détectée par l'analyse, en attente d'une décision humaine.
    lead.callHold
  )
    throw telephonyError(409, 'LEAD_NOT_CALLABLE')
  if (lead.callUnreachableAt) throw telephonyError(409, 'LEAD_UNREACHABLE')
  const { target, block } = callWindowCheck(lead, ctx.settings, ctx.now)
  if (block) throw telephonyError(409, block)
  if (ctx.attempts.today >= ctx.settings.telephony.attemptCapPerDay) throw telephonyError(409, 'ATTEMPT_CAP_REACHED')
  if (ctx.attempts.window >= attemptWindowOf(ctx.settings).max) throw telephonyError(409, 'ATTEMPT_WINDOW_REACHED')
  return target!
}

/**
 * Tentatives vers ce numéro sur la fenêtre glissante (tous commerciaux), et si
 * l'une d'elles a joint une personne. `before` : seulement les appels lancés
 * avant celui-ci (ordre des identifiants), pour départager deux lancements simultanés.
 */
export async function windowAttempts(
  to: string,
  now: Date,
  settings: ICrmSettings,
  before?: Types.ObjectId,
): Promise<{ count: number; reached: boolean }> {
  const since = new Date(now.getTime() - attemptWindowOf(settings).days * 86_400_000)
  const calls = await Call.find({ to, createdAt: { $gte: since }, ...(before ? { _id: { $lt: before } } : {}) })
    .select('answeredAt answeredBy')
    .lean()
  return {
    count: calls.length,
    reached: calls.some((call) => Boolean(call.answeredAt) && call.answeredBy !== 'MACHINE'),
  }
}

export async function isPhoneSuppressed(
  phone: string,
  region: string,
  session: ClientSession | null = null,
): Promise<boolean> {
  const phoneNormalized = normalizePhone(phone, region)
  return Boolean(phoneNormalized && (await SuppressionEntry.exists({ phoneNormalized }).session(session)))
}

/** Inscrit un numéro sur la liste d'opposition ; `true` si l'inscription est nouvelle. */
export async function addPhoneSuppression(
  phone: string,
  opts: {
    reason: SuppressionReason
    createdBy: string | Types.ObjectId | null
    leadId: string | Types.ObjectId | null
    region?: string
    session?: ClientSession
  },
): Promise<boolean> {
  const phoneNormalized = normalizePhone(phone, opts.region ?? 'FR')
  if (!phoneNormalized) return false
  const result = await SuppressionEntry.updateOne(
    { phoneNormalized },
    { $setOnInsert: { phoneNormalized, reason: opts.reason, createdBy: opts.createdBy, leadId: opts.leadId } },
    { upsert: true, session: opts.session },
  )
  return result.upsertedCount > 0
}

/**
 * Étapes d'agrégation qui écartent les leads dont le numéro est opposé. Le
 * numéro du lead est ramené en E.164 depuis `contactPhoneNormalized` (format du
 * dédoublonnage : national pour la France, chiffres bruts sinon). Un format
 * exotique peut passer ce filtre : le lancement d'appel repasse la garde exacte.
 */
export function suppressedPhoneStages(region: string): PipelineStage[] {
  const callingCode = getCountryCallingCode(region as CountryCode)
  const digits = { $ifNull: ['$contactPhoneNormalized', ''] }
  return [
    {
      $set: {
        _suppressionPhone: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $substrCP: [digits, 0, 2] }, '00'] },
                then: { $concat: ['+', { $substrCP: [digits, 2, 30] }] },
              },
              {
                case: { $eq: [{ $substrCP: [digits, 0, 1] }, '0'] },
                then: { $concat: ['+', callingCode, { $substrCP: [digits, 1, 30] }] },
              },
            ],
            default: { $concat: ['+', digits] },
          },
        },
      },
    },
    {
      $lookup: {
        from: SuppressionEntry.collection.name,
        localField: '_suppressionPhone',
        foreignField: 'phoneNormalized',
        as: '_suppressed',
      },
    },
    { $match: { '_suppressed.0': { $exists: false } } },
    { $unset: ['_suppressionPhone', '_suppressed'] },
  ]
}

/**
 * Migration 014 : l'index unique historique sur `emailNormalized` n'était pas
 * partiel ; il refuserait la deuxième entrée « numéro » (adresse absente = null).
 */
export async function ensurePhoneSuppressionIndexes(dryRun = false) {
  const indexes = await SuppressionEntry.collection.indexes().catch(() => [])
  const legacy = indexes.find((index) => index.name === 'emailNormalized_1' && !index.partialFilterExpression)
  if (dryRun) return { dryRun: true, legacyEmailIndex: Boolean(legacy) }
  if (legacy) await SuppressionEntry.collection.dropIndex('emailNormalized_1')
  await SuppressionEntry.createIndexes()
  await Call.createIndexes()
  return { dryRun: false, legacyEmailIndexDropped: Boolean(legacy) }
}
