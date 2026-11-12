import type { ClientSession, PipelineStage, Types } from 'mongoose'
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js'
import SuppressionEntry, { type SuppressionReason } from '../models/SuppressionEntry.js'
import Call from '../models/Call.js'
import { normalizePhone } from './callImports.js'
import { telephonyError } from './telephony/index.js'
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

export function withinCallingHours(now: Date, hours: ICrmSettings['telephony']['callingHours']): boolean {
  const clock = localClock(now, hours.timezone)
  const start = minutesOf(hours.start)
  const end = minutesOf(hours.end)
  const inWindow =
    start < end ? clock.minutes >= start && clock.minutes < end : clock.minutes >= start || clock.minutes < end
  return hours.days.includes(clock.weekday) && inWindow
}

/** Lève une erreur 409 portant le code du contrat si l'appel n'est pas permis maintenant. */
export function assertCallable(
  lead: Pick<
    ILead,
    | 'status'
    | 'closingHandoff'
    | 'archivedAt'
    | 'doNotContact'
    | 'doNotCall'
    | 'phoneInvalid'
    | 'contactPhone'
    | 'callHold'
  >,
  ctx: { now: Date; settings: ICrmSettings; attemptsToday: number },
): void {
  if (
    lead.closingHandoff ||
    !CALLABLE_STATUSES.includes(lead.status) ||
    lead.archivedAt ||
    lead.doNotContact ||
    lead.doNotCall ||
    lead.phoneInvalid ||
    // Opposition détectée par l'analyse, en attente d'une décision humaine.
    lead.callHold ||
    !normalizePhone(String(lead.contactPhone ?? ''), ctx.settings.callDefaultRegion)
  )
    throw telephonyError(409, 'LEAD_NOT_CALLABLE')
  if (!withinCallingHours(ctx.now, ctx.settings.telephony.callingHours))
    throw telephonyError(409, 'OUTSIDE_CALLING_HOURS')
  if (ctx.attemptsToday >= ctx.settings.telephony.attemptCapPerDay) throw telephonyError(409, 'ATTEMPT_CAP_REACHED')
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
