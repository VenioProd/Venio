import twilio from 'twilio'
import type { NextFunction, Request, Response } from 'express'
import type { CallStatus, ICall } from '../../models/Call.js'
import type { ICrmSettings } from '../../types/models/index.js'

/**
 * Téléphonie Twilio (lot A). Module étroit : jeton d'accès Voice, signature
 * des requêtes de l'opérateur, TwiML de composition, correspondance des états.
 * Sans ses variables d'environnement, la téléphonie est désactivée et les
 * routes qui en dépendent répondent 503 `TELEPHONY_DISABLED`.
 */

export interface TelephonyConfig {
  accountSid: string
  apiKeySid: string
  apiKeySecret: string
  /** Jeton d'authentification du compte (de la région) : seule clé qui signe les webhooks. */
  authToken: string
  twimlAppSid: string
  callerId: string
  /** Origine publique de l'API telle que Twilio l'appelle, sans barre finale (signature et rappels). */
  publicBaseUrl: string
  region: string
  edge: string
}

export const TOKEN_TTL_SEC = 600
/** Durée maximale d'une communication, en secondes (attribut `timeLimit` de `<Dial>`). */
export const DIAL_TIME_LIMIT_SEC = 3600

export function telephonyConfig(): TelephonyConfig | null {
  const env = process.env
  const config = {
    accountSid: env.TWILIO_ACCOUNT_SID ?? '',
    apiKeySid: env.TWILIO_API_KEY_SID ?? '',
    apiKeySecret: env.TWILIO_API_KEY_SECRET ?? '',
    authToken: env.TWILIO_AUTH_TOKEN ?? '',
    twimlAppSid: env.TWILIO_TWIML_APP_SID ?? '',
    callerId: env.TWILIO_CALLER_ID ?? '',
    publicBaseUrl: (env.TELEPHONY_PUBLIC_URL ?? '').replace(/\/+$/, ''),
    region: env.TWILIO_REGION || 'ie1',
    edge: env.TWILIO_EDGE || 'dublin',
  }
  if (Object.values(config).some((value) => !value)) return null
  if (!/^\+[1-9]\d{6,14}$/.test(config.callerId) || !/^https:\/\/[^/]+$/.test(config.publicBaseUrl)) return null
  return config
}

export function telephonyError(status: number, code: string) {
  return Object.assign(new Error(code), { status, code })
}

export function requireTelephony(_req: Request, res: Response, next: NextFunction) {
  if (telephonyConfig()) return next()
  res.status(503).json({ error: 'Téléphonie non configurée', code: 'TELEPHONY_DISABLED' })
}

/** Identité Voice : lettres, chiffres et `_` seulement (règle Twilio). */
export function identityFor(userId: string): string {
  return `u_${userId}`
}

/** Utilisateur d'un `From` de la TwiML App (`client:u_<id>`), ou `null`. */
export function userIdFromClient(from: unknown): string | null {
  const match = typeof from === 'string' ? /^client:u_([0-9a-f]{24})$/.exec(from) : null
  return match ? match[1]! : null
}

export function createVoiceToken(config: TelephonyConfig, userId: string) {
  const identity = identityFor(userId)
  const token = new twilio.jwt.AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
    identity,
    ttl: TOKEN_TTL_SEC,
    region: config.region,
  })
  token.addGrant(
    new twilio.jwt.AccessToken.VoiceGrant({ outgoingApplicationSid: config.twimlAppSid, incomingAllow: false }),
  )
  return { token: token.toJwt(), identity, expiresAt: new Date(Date.now() + TOKEN_TTL_SEC * 1000) }
}

/** Vérifie `X-Twilio-Signature` sur l'URL publique exacte (requête comprise) et les champs du formulaire. */
export function hasValidTwilioSignature(config: TelephonyConfig, req: Request): boolean {
  const signature = req.get('X-Twilio-Signature')
  if (!signature || !req.body || typeof req.body !== 'object') return false
  return twilio.validateRequest(config.authToken, signature, `${config.publicBaseUrl}${req.originalUrl}`, req.body)
}

export function statusCallbackUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/status?callId=${callId}`
}

/** Rappel de la détection de messagerie de `<Number>` (asynchrone : l'appelé est déjà relié au commercial). */
export function amdCallbackUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/amd?callId=${callId}`
}

/** Rappel de l'enregistrement de `<Dial>` (`in-progress`, `completed`, `absent`). */
export function recordingCallbackUrl(config: TelephonyConfig, callId: string): string {
  return `${config.publicBaseUrl}/api/telephony/twilio/recording?callId=${callId}`
}

/**
 * Composition. Si l'appel est enregistré (`call.recording` posé à la mise en
 * relation, sans opposition), `<Dial>` enregistre en double piste à partir de
 * la décroche : canal 1 = appel parent (le commercial, dans le navigateur),
 * canal 2 = l'appelé. L'annonce, jouée à l'appelé seul après sa décroche et
 * avant la mise en relation, passe par l'attribut `url` de `<Number>`.
 */
export function dialTwiml(
  config: TelephonyConfig,
  call: Pick<ICall, '_id' | 'to' | 'from' | 'recording'>,
  options: { voicemailDetection?: boolean } = {},
): string {
  const callId = String(call._id)
  const recorded = Boolean(call.recording && !call.recording.objection)
  const response = new twilio.twiml.VoiceResponse()
  const dial = response.dial({
    callerId: call.from,
    answerOnBridge: true,
    timeLimit: DIAL_TIME_LIMIT_SEC,
    ...(recorded
      ? {
          record: 'record-from-answer-dual' as const,
          recordingTrack: 'both' as const,
          recordingStatusCallback: recordingCallbackUrl(config, callId),
          recordingStatusCallbackMethod: 'POST' as const,
          recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
        }
      : {}),
  })
  dial.number(
    {
      statusCallback: statusCallbackUrl(config, callId),
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      // Détection de messagerie (lot I) : `Enable` rend son verdict dès les premières secondes, sans
      // attendre le bip ; sur `<Number>` elle est toujours asynchrone (rappel `amdStatusCallback`).
      ...(options.voicemailDetection
        ? {
            machineDetection: 'Enable',
            amdStatusCallback: amdCallbackUrl(config, callId),
            amdStatusCallbackMethod: 'POST',
          }
        : {}),
      ...(recorded && call.recording?.notice
        ? { url: `${config.publicBaseUrl}/api/telephony/twilio/notice?callId=${callId}`, method: 'POST' as const }
        : {}),
    },
    call.to,
  )
  return response.toString()
}

/** Annonce d'enregistrement jouée à l'appelé (TwiML de `<Number url>`). */
export function noticeTwiml(text: string): string {
  const response = new twilio.twiml.VoiceResponse()
  if (text.trim()) response.say({ language: 'fr-FR' }, text.trim())
  return response.toString()
}

export function hangupTwiml(): string {
  const response = new twilio.twiml.VoiceResponse()
  response.hangup()
  return response.toString()
}

/** `CallStatus` de la branche composée → état du contrat ; `null` si inconnu. */
const TWILIO_STATUS: Record<string, CallStatus> = {
  queued: 'CREATED',
  initiated: 'CREATED',
  ringing: 'RINGING',
  'in-progress': 'IN_PROGRESS',
  answered: 'IN_PROGRESS',
  completed: 'COMPLETED',
  busy: 'BUSY',
  'no-answer': 'NO_ANSWER',
  failed: 'FAILED',
  canceled: 'CANCELED',
}

export function mapTwilioStatus(value: unknown): CallStatus | null {
  return typeof value === 'string' ? (TWILIO_STATUS[value] ?? null) : null
}

/** Rang d'un état : un événement rejoué ou arrivé en retard ne fait jamais reculer l'appel. */
export function callStatusRank(status: CallStatus): number {
  return { CREATED: 0, RINGING: 1, IN_PROGRESS: 2 }[status as string] ?? 3
}

/** Résultat proposé au commercial après l'appel, parmi les résultats configurés ; `null` si rien à déduire. */
export function suggestedOutcome(
  call: Pick<ICall, 'status' | 'answeredBy'>,
  outcomes: ICrmSettings['callOutcomes'],
): string | null {
  const effect =
    call.answeredBy === 'MACHINE' ? 'VOICEMAIL' : ['NO_ANSWER', 'BUSY', 'FAILED'].includes(call.status) ? 'NONE' : null
  return (effect && outcomes.find((outcome) => outcome.effect === effect)?.value) ?? null
}

/** Origines à ouvrir dans la CSP pour le SDK Voice du navigateur ; vides si la téléphonie est désactivée. */
export function telephonyCspSources(): { connectSrc: string[]; mediaSrc: string[] } {
  const config = telephonyConfig()
  if (!config) return { connectSrc: [], mediaSrc: [] }
  return {
    connectSrc: [
      `wss://voice-js.${config.edge}.twilio.com`,
      'https://eventgw.twilio.com',
      `https://eventgw.${config.region}.twilio.com`,
      'https://sdk.twilio.com',
    ],
    mediaSrc: ['https://sdk.twilio.com'],
  }
}
