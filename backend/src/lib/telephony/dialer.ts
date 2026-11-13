import mongoose, { Schema, type Types } from 'mongoose'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import Call, { type ICall } from '../../models/Call.js'
import type { ICrmSettings } from '../../types/models/index.js'
import { DIAL_TIME_LIMIT_SEC, telephonyError } from './index.js'

/**
 * Composition enchaînée (vague 4, lot I). Le navigateur enchaîne les fiches ;
 * le serveur garantit qu'un utilisateur n'a jamais deux appels en même temps,
 * quel que soit l'onglet, l'écran (externe ou équipe) ou la course entre deux
 * lancements.
 *
 * La « ligne » d'un utilisateur désigne son dernier appel lancé. Un lancement ne
 * la prend que si cet appel est terminé, mort ou jamais relié à l'opérateur, et
 * par une comparaison-échange : de deux lancements simultanés, un seul gagne.
 */

export const DIALER_DEFAULTS = { voicemailDetection: true, previewDelaySec: 10, powerDelaySec: 3 }

export function dialerSettings(settings: Pick<ICrmSettings, 'telephony'>) {
  const value = settings.telephony?.dialer
  return {
    voicemailDetection: value?.voicemailDetection ?? DIALER_DEFAULTS.voicemailDetection,
    previewDelaySec: value?.previewDelaySec ?? DIALER_DEFAULTS.previewDelaySec,
    powerDelaySec: value?.powerDelaySec ?? DIALER_DEFAULTS.powerDelaySec,
  }
}

/**
 * Décision du propriétaire (13 nov. 2026) : pas de power dialer vers les États-Unis jusqu'à avis
 * juridique (TCPA). Bloqué : tout +1 hors Canada (numéros verts compris, faute de pouvoir les situer).
 * L'aperçu et le clic restent permis.
 */
export function powerDialerBlocked(to: string | null | undefined): boolean {
  return Boolean(to?.startsWith('+1')) && parsePhoneNumberFromString(to!)?.country !== 'CA'
}

interface ICallerLine {
  /** L'utilisateur qui appelle. */
  _id: Types.ObjectId
  call: Types.ObjectId | null
  claimedAt: Date
}

const CallerLine = mongoose.model<ICallerLine>(
  'CallerLine',
  new Schema<ICallerLine>(
    {
      _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      call: { type: Schema.Types.ObjectId, ref: 'Call', default: null },
      claimedAt: { type: Date, required: true },
    },
    { versionKey: false },
  ),
)

/** Lancement en vol : l'appel n'existe pas encore, la ligne est déjà réservée. */
const LAUNCH_WINDOW_MS = 15_000
/** Lancé mais jamais relié par le navigateur : au-delà, un nouveau lancement l'annule. */
const UNCONNECTED_MS = 60_000
/** Relié, pas encore décroché : au-delà, l'opérateur a forcément fini de sonner (rappel perdu). */
const UNANSWERED_MS = 3 * 60_000
/** En communication : `<Dial timeLimit>` plus une marge, au-delà le rappel final s'est perdu. */
const ANSWERED_MS = (DIAL_TIME_LIMIT_SEC + 300) * 1000

type LineCall = Pick<ICall, '_id' | 'status' | 'providerCallSid' | 'createdAt' | 'startedAt' | 'answeredAt'>

/** L'appel occupe encore la ligne de son auteur. */
export function holdsLine(call: LineCall, now: Date): boolean {
  const age = (since: Date | null) => now.getTime() - (since ?? call.createdAt).getTime()
  if (call.status === 'IN_PROGRESS') return age(call.answeredAt ?? call.startedAt) < ANSWERED_MS
  if (call.status === 'RINGING' || (call.status === 'CREATED' && call.providerCallSid))
    return age(call.startedAt) < UNANSWERED_MS
  if (call.status === 'CREATED') return age(call.createdAt) < UNCONNECTED_MS
  return false
}

const lineBusy = () => telephonyError(409, 'CALL_IN_PROGRESS')

/**
 * Réserve la ligne de `authorId` pour l'appel `callId` (pas encore créé). Lève
 * 409 `CALL_IN_PROGRESS` si un autre appel l'occupe. Un appel lancé mais jamais
 * relié depuis plus d'une minute est annulé : la route voice le refusera.
 */
export async function claimLine(authorId: string, callId: Types.ObjectId, now = new Date()): Promise<void> {
  for (let tries = 0; tries < 3; tries++) {
    const line = await CallerLine.findById(authorId).lean()
    const previous = line?.call ?? null
    if (previous) {
      const call = await Call.findById(previous)
        .select('status providerCallSid createdAt startedAt answeredAt')
        .lean<LineCall>()
      if (!call && now.getTime() - line!.claimedAt.getTime() < LAUNCH_WINDOW_MS) throw lineBusy()
      if (call && holdsLine(call, now)) throw lineBusy()
      if (call?.status === 'CREATED' && !call.providerCallSid) {
        const canceled = await Call.updateOne(
          { _id: call._id, status: 'CREATED', providerCallSid: null },
          { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: 'SUPERSEDED', at: now } } },
        )
        // Relié entre-temps par l'opérateur : on relit.
        if (!canceled.modifiedCount) continue
      }
    }
    if (line) {
      const taken = await CallerLine.updateOne(
        { _id: authorId, call: previous },
        { $set: { call: callId, claimedAt: now } },
      )
      if (taken.modifiedCount) return
      continue
    }
    try {
      await CallerLine.create({ _id: authorId, call: callId, claimedAt: now })
      return
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err
    }
  }
  throw lineBusy()
}

/** Le lancement a échoué avant de créer l'appel (garde, plafond) : la ligne redevient libre. */
export async function releaseLine(authorId: string, callId: Types.ObjectId): Promise<void> {
  await CallerLine.updateOne({ _id: authorId, call: callId }, { $set: { call: null } })
}

/**
 * Après création : l'appel garde-t-il la ligne ? Sinon (lancement trop lent,
 * repris par un autre), il est annulé et le lancement échoue.
 */
export async function confirmLine(authorId: string, callId: Types.ObjectId, now = new Date()): Promise<void> {
  if (await CallerLine.exists({ _id: authorId, call: callId })) return
  await Call.updateOne(
    { _id: callId, status: 'CREATED', providerCallSid: null },
    { $set: { status: 'CANCELED', endedAt: now }, $push: { events: { status: 'SUPERSEDED', at: now } } },
  )
  throw lineBusy()
}

/** Un lancement rejoué rend l'appel existant : la ligne le désigne à nouveau. */
export async function repointLine(authorId: string, from: Types.ObjectId, to: Types.ObjectId): Promise<void> {
  await CallerLine.updateOne({ _id: authorId, call: from }, { $set: { call: to } })
}
