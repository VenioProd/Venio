import crypto from 'node:crypto'
import twilio from 'twilio'
import CallerProfile from '../../models/CallerProfile.js'
import { phoneTarget } from './countries.js'
import { telephonyError, type TelephonyConfig } from './index.js'
import { placeCodeCall } from './rest.js'

/**
 * Mode pont (lot P, décision 5 du propriétaire) : en repli du navigateur,
 * Twilio appelle d'abord le portable du commercial, puis le prospect une fois
 * que le commercial a tapé 1 (un répondeur ne déclenche donc jamais l'appel).
 * Mêmes gardes, même enregistrement, même annonce que l'appel du navigateur.
 */

const CODE_TTL_MS = 10 * 60_000
const MAX_CODE_ATTEMPTS = 5
/** Envois de code par heure et par utilisateur. */
const MAX_CODES_PER_HOUR = 3

const hashCode = (userId: string, code: string) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex')

export function bridgeAnswerUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/bridge?callId=${callId}`
}

export function bridgeConfirmUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/bridge/confirm?callId=${callId}`
}

export function bridgeStatusUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/bridge/status?callId=${callId}`
}

/** À la décroche du commercial : rien ne part vers le prospect avant qu'il tape 1. */
export function bridgeGatherTwiml(config: TelephonyConfig, callId: string): string {
  const response = new twilio.twiml.VoiceResponse()
  const gather = response.gather({
    numDigits: 1,
    timeout: 8,
    action: bridgeConfirmUrl(config, callId),
    method: 'POST',
  })
  gather.say({ language: 'fr-FR' }, 'Venio. Appuyez sur 1 pour lancer votre appel.')
  response.say({ language: 'fr-FR' }, 'Appel annulé.')
  response.hangup()
  return response.toString()
}

/** Portable du mode pont s'il est activé et vérifié ; `null` sinon. */
export async function activeBridgePhone(userId: string): Promise<string | null> {
  const profile = await CallerProfile.findById(userId).select('bridge').lean()
  return profile?.bridge?.enabled && profile.bridge.phone && profile.bridge.verifiedAt ? profile.bridge.phone : null
}

export function publicBridge(
  profile: { bridge?: { enabled: boolean; phone: string | null; verifiedAt: Date | null } } | null,
) {
  return {
    enabled: Boolean(profile?.bridge?.enabled),
    phone: profile?.bridge?.phone ?? null,
    verified: Boolean(profile?.bridge?.verifiedAt),
  }
}

/** Envoie un code à 6 chiffres par un appel qui le lit ; trois envois par heure au plus. */
export async function sendBridgeCode(config: TelephonyConfig, userId: string, rawPhone: unknown, region: string) {
  const target = typeof rawPhone === 'string' ? phoneTarget(rawPhone, region) : null
  if (!target) throw telephonyError(400, 'INVALID_PHONE')
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 3_600_000)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  // Le plafond est posé avant l'appel, atomiquement : deux demandes simultanées ne passent pas toutes les deux.
  await CallerProfile.updateOne({ _id: userId }, { $setOnInsert: { _id: userId } }, { upsert: true })
  const claimed = await CallerProfile.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $lt: [
          { $size: { $filter: { input: { $ifNull: ['$codeSentAt', []] }, cond: { $gte: ['$$this', hourAgo] } } } },
          MAX_CODES_PER_HOUR,
        ],
      },
    },
    [
      {
        $set: {
          codeSentAt: {
            $slice: [
              {
                $concatArrays: [
                  { $filter: { input: { $ifNull: ['$codeSentAt', []] }, cond: { $gte: ['$$this', hourAgo] } } },
                  [now],
                ],
              },
              -MAX_CODES_PER_HOUR,
            ],
          },
          verification: {
            $literal: {
              phone: target.e164,
              codeHash: hashCode(userId, code),
              expiresAt: new Date(now.getTime() + CODE_TTL_MS),
              attempts: 0,
            },
          },
        },
      },
    ],
    { new: true },
  )
  if (!claimed) throw telephonyError(429, 'CODE_RATE_LIMITED')
  const response = new twilio.twiml.VoiceResponse()
  const spoken = code.split('').join(', ')
  response.say({ language: 'fr-FR' }, `Votre code Venio est : ${spoken}. Je répète : ${spoken}.`)
  await placeCodeCall(config, { to: target.e164, from: config.callerId, twiml: response.toString() })
  return { expiresAt: claimed.verification!.expiresAt }
}

/** Vérifie le code ; le portable devient celui du mode pont. Cinq essais par code. */
export async function confirmBridgeCode(userId: string, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw telephonyError(400, 'INVALID_CODE')
  const now = new Date()
  const profile = await CallerProfile.findOneAndUpdate(
    { _id: userId, 'verification.expiresAt': { $gt: now }, 'verification.attempts': { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { 'verification.attempts': 1 } },
    { new: true },
  )
  if (!profile?.verification) throw telephonyError(409, 'CODE_EXPIRED')
  const expected = Buffer.from(profile.verification.codeHash, 'hex')
  const given = Buffer.from(hashCode(userId, code), 'hex')
  if (!crypto.timingSafeEqual(expected, given)) throw telephonyError(400, 'INVALID_CODE')
  const verified = await CallerProfile.findOneAndUpdate(
    { _id: userId, 'verification.codeHash': profile.verification.codeHash },
    {
      $set: { 'bridge.phone': profile.verification.phone, 'bridge.verifiedAt': now, verification: null },
    },
    { new: true },
  )
  if (!verified) throw telephonyError(409, 'CODE_EXPIRED')
  return publicBridge(verified)
}
