import crypto from 'node:crypto'
import twilio from 'twilio'
import Call, { TERMINAL_CALL_STATUSES, type CallStatus, type ICall } from '../../models/Call.js'
import CrmSettings from '../../models/CrmSettings.js'
import { telephonyConfig, type TelephonyConfig } from '../telephony/index.js'
import logger from '../logger.js'
import { liveProviderConfig, openProviderStream, type ProviderStream } from './assemblyai.js'
import { stopTwilioStream } from './twilioStream.js'

/**
 * Transcription en direct (vague 4, lot J). Pendant l'appel, Twilio envoie les
 * deux voix (`<Start><Stream>`) à Venio, qui les relaie à AssemblyAI et diffuse
 * le texte au seul navigateur de l'auteur de l'appel.
 *
 * Le texte en direct est éphémère : il ne vit qu'en mémoire, le temps de
 * l'appel, et n'est jamais écrit en base. Il est effacé à la fin de l'appel et
 * dès une opposition. Le transcript qui fait foi reste celui d'après l'appel
 * (lot C), plus exact, avec sa propre rétention ; en garder un second doublerait
 * les données sans rien apporter.
 *
 * Conditions, toutes requises : téléphonie et clé AssemblyAI configurées,
 * `callTranscription.enabled` et `callTranscription.live` (désactivé par défaut),
 * appel enregistré et sans opposition (le prospect a été prévenu).
 */

export type LiveSpeaker = 'REP' | 'PROSPECT'
export interface LiveSegment {
  /** Identifiant stable d'un tour : le texte d'un même tour est complété puis corrigé. */
  id: string
  speaker: LiveSpeaker
  text: string
  final: boolean
  /** Millisecondes depuis le début du flux, à la première apparition du tour (ordre d'affichage). */
  at: number
}
export type LiveStatus = 'WAITING' | 'LIVE'
export type LiveEvent =
  { type: 'state'; status: LiveStatus | 'ENDED' } | { type: 'segment'; segment: LiveSegment } | { type: 'clear' }
type Listener = (event: LiveEvent) => void
export type LiveStopReason = 'OBJECTION' | 'ENDED' | 'PROVIDER' | 'TIMEOUT'

export const LIVE_STREAM_PATH = '/api/telephony/twilio/live-stream'
const STREAM_NAME = 'venio-live'
/** Rythme de relecture de l'appel : décroche, opposition, fin. */
export const LIVE_POLL_MS = 1000
/** Twilio envoie 20 ms par message ; le fournisseur conseille 50 à 100 ms par envoi. 800 octets µ-law = 100 ms. */
const CHUNK_BYTES = 800
/** Avant la décroche, on ne garde que la dernière seconde et demie (le « allô » du prospect). */
const PRE_ANSWER_CHUNKS = 15
const MAX_SEGMENTS = 400
/** Au-delà de la durée maximale d'une communication (`timeLimit` de `<Dial>`), on coupe. */
const MAX_SESSION_MS = 65 * 60_000

const sessions = new Map<string, LiveSession>()
const listeners = new Map<string, Set<Listener>>()
/** Droit de chaque abonné, relu au contrôle périodique de la séance. */
const accessChecks = new WeakMap<Listener, () => Promise<boolean>>()

function emit(callId: string, event: LiveEvent) {
  for (const listener of listeners.get(callId) ?? []) listener(event)
}

/** L'abonné qui n'a plus la fiche ne reçoit plus rien : texte effacé, flux fermé. Une erreur de relecture vaut refus. */
async function recheckSubscribers(callId: string) {
  for (const listener of [...(listeners.get(callId) ?? [])]) {
    const allowed = accessChecks.get(listener)
    if (!allowed || (await allowed().catch(() => false))) continue
    const set = listeners.get(callId)
    if (!set?.delete(listener)) continue
    listener({ type: 'clear' })
    listener({ type: 'state', status: 'ENDED' })
  }
}

/** Jeton qui lie un flux à son appel : `<Parameter>` n'est pas couvert par la signature de Twilio. */
export function streamToken(config: TelephonyConfig, callId: string): string {
  return crypto.createHmac('sha256', config.authToken).update(`live-transcription:${callId}`).digest('base64url')
}

export function isValidStreamToken(config: TelephonyConfig, callId: string, token: unknown): boolean {
  const expected = Buffer.from(streamToken(config, callId))
  const given = Buffer.from(typeof token === 'string' ? token : '')
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

export function liveStreamUrl(config: TelephonyConfig): string {
  return `${config.publicBaseUrl.replace(/^https:/, 'wss:')}${LIVE_STREAM_PATH}`
}

const isTerminal = (status: CallStatus) => TERMINAL_CALL_STATUSES.includes(status)

/** L'appel peut être transcrit en direct, réglages relus en base. */
export async function liveEligible(call: Pick<ICall, 'status' | 'recording'>): Promise<boolean> {
  if (!call.recording || call.recording.objection || isTerminal(call.status)) return false
  if (!telephonyConfig() || !liveProviderConfig()) return false
  const settings = (await CrmSettings.getSettings()).callTranscription
  return settings?.enabled !== false && settings?.live === true
}

/**
 * Ajoute `<Start><Stream>` en tête du TwiML de composition quand l'appel peut
 * être transcrit en direct ; sinon rend le TwiML tel quel. Une panne ici ne
 * doit jamais empêcher l'appel.
 */
export async function withLiveTranscription(
  twiml: string,
  call: Pick<ICall, '_id' | 'status' | 'recording'>,
): Promise<string> {
  try {
    const config = telephonyConfig()
    if (!config || !(await liveEligible(call))) return twiml
    const callId = String(call._id)
    const response = new twilio.twiml.VoiceResponse()
    const stream = response.start().stream({ url: liveStreamUrl(config), track: 'both_tracks', name: STREAM_NAME })
    stream.parameter({ name: 'callId', value: callId })
    stream.parameter({ name: 'token', value: streamToken(config, callId) })
    const start = /<Response>([\s\S]*)<\/Response>/.exec(response.toString())?.[1]
    return start && twiml.includes('<Response>') ? twiml.replace('<Response>', `<Response>${start}`) : twiml
  } catch (err) {
    logger.warn({ callId: String(call._id), detail: (err as Error).message.slice(0, 120) }, 'direct: TwiML')
    return twiml
  }
}

/**
 * Séance d'un appel : les deux voix, leurs séances chez le fournisseur et le
 * texte courant. L'audio n'est relayé qu'à partir de la décroche ; avant, on
 * ne garde en mémoire que la dernière seconde et demie.
 */
class LiveSession {
  private readonly started = Date.now()
  private readonly pending: Record<LiveSpeaker, Buffer[]> = { REP: [], PROSPECT: [] }
  private readonly partial: Record<LiveSpeaker, Buffer[]> = { REP: [], PROSPECT: [] }
  private readonly providers: Record<LiveSpeaker, ProviderStream | null> = { REP: null, PROSPECT: null }
  private readonly segments = new Map<string, LiveSegment>()
  private answered = false
  private ended = false
  private readonly poll: NodeJS.Timeout
  private readonly limit: NodeJS.Timeout

  constructor(
    readonly callId: string,
    private readonly callSid: string,
    readonly streamSid: string,
    private readonly closeTwilio: () => void,
  ) {
    this.poll = setInterval(() => void this.check(), LIVE_POLL_MS)
    this.limit = setTimeout(() => this.stop('TIMEOUT'), MAX_SESSION_MS)
    this.poll.unref?.()
    this.limit.unref?.()
  }

  get status(): LiveStatus {
    return this.answered ? 'LIVE' : 'WAITING'
  }

  snapshot(): LiveSegment[] {
    return [...this.segments.values()].sort((a, b) => a.at - b.at)
  }

  /** Relit l'appel : décroche → séances ouvertes ; opposition ou fin → arrêt. Puis le droit de chaque abonné. */
  async check() {
    if (this.ended) return
    try {
      const call = await Call.findById(this.callId).select('status recording').lean()
      if (this.ended) return
      if (!call || call.recording?.objection) return this.stop('OBJECTION')
      if (isTerminal(call.status)) return this.stop('ENDED')
      if (!this.answered && call.status === 'IN_PROGRESS') this.answer()
      await recheckSubscribers(this.callId)
    } catch (err) {
      logger.warn({ callId: this.callId, detail: (err as Error).message.slice(0, 120) }, 'direct: relecture')
    }
  }

  private answer() {
    const config = liveProviderConfig()
    if (!config) return this.stop('PROVIDER')
    this.answered = true
    for (const speaker of ['REP', 'PROSPECT'] as const) {
      const provider = openProviderStream(config, {
        onTurn: (turn) => this.onTurn(speaker, turn.order, turn.text, turn.endOfTurn),
        onEnd: (code) => {
          if (this.ended) return
          logger.warn({ callId: this.callId, code }, 'direct: séance du fournisseur close')
          this.stop('PROVIDER')
        },
      })
      this.providers[speaker] = provider
      for (const chunk of this.pending[speaker].splice(0)) provider.send(chunk)
    }
    emit(this.callId, { type: 'state', status: 'LIVE' })
  }

  /** Un message `media` de Twilio : `inbound` = le commercial (navigateur), `outbound` = ce qu'il entend. */
  onMedia(track: unknown, payload: unknown) {
    if (this.ended || typeof payload !== 'string') return
    const speaker: LiveSpeaker | null = track === 'inbound' ? 'REP' : track === 'outbound' ? 'PROSPECT' : null
    if (!speaker) return
    const parts = this.partial[speaker]
    parts.push(Buffer.from(payload, 'base64'))
    if (parts.reduce((sum, part) => sum + part.length, 0) < CHUNK_BYTES) return
    const chunk = Buffer.concat(parts.splice(0))
    const provider = this.providers[speaker]
    if (provider) return provider.send(chunk)
    const pending = this.pending[speaker]
    pending.push(chunk)
    if (pending.length > PRE_ANSWER_CHUNKS) pending.shift()
  }

  private onTurn(speaker: LiveSpeaker, order: number, text: string, final: boolean) {
    if (this.ended || !text.trim()) return
    const id = `${speaker}-${order}`
    const segment = { id, speaker, text, final, at: this.segments.get(id)?.at ?? Date.now() - this.started }
    this.segments.set(id, segment)
    if (this.segments.size > MAX_SEGMENTS) this.segments.delete(this.segments.keys().next().value!)
    emit(this.callId, { type: 'segment', segment })
  }

  /**
   * Arrête tout, une seule fois : séances du fournisseur, flux Twilio, texte en
   * mémoire. Sur opposition, rien n'attend : coupure immédiate et demande
   * d'arrêt du flux chez Twilio.
   */
  stop(reason: LiveStopReason) {
    if (this.ended) return
    this.ended = true
    clearInterval(this.poll)
    clearTimeout(this.limit)
    sessions.delete(this.callId)
    const graceful = reason === 'ENDED'
    for (const speaker of ['REP', 'PROSPECT'] as const) {
      this.providers[speaker]?.close(graceful)
      this.providers[speaker] = null
      this.pending[speaker].length = 0
      this.partial[speaker].length = 0
    }
    this.segments.clear()
    this.closeTwilio()
    const config = telephonyConfig()
    if (reason !== 'ENDED' && config) {
      void stopTwilioStream(config, this.callSid, this.streamSid).catch((err: Error & { status?: number }) =>
        logger.warn({ callId: this.callId, status: err.status ?? null }, 'direct: arrêt du flux Twilio'),
      )
    }
    emit(this.callId, { type: 'clear' })
    emit(this.callId, { type: 'state', status: 'ENDED' })
  }
}

export function getLiveSession(callId: string): LiveSession | undefined {
  return sessions.get(callId)
}

/** Ouvre la séance d'un appel ; `null` si une autre séance tient déjà cet appel. */
export function openLiveSession(input: {
  callId: string
  callSid: string
  streamSid: string
  close: () => void
}): LiveSession | null {
  if (sessions.has(input.callId)) return null
  const session = new LiveSession(input.callId, input.callSid, input.streamSid, input.close)
  sessions.set(input.callId, session)
  emit(input.callId, { type: 'state', status: 'WAITING' })
  void session.check()
  return session
}

/** Arrêt immédiat, sans attendre la relecture de l'appel (opposition reçue, appel terminé). */
export function stopLiveTranscription(callId: string, reason: LiveStopReason = 'OBJECTION'): void {
  sessions.get(callId)?.stop(reason)
}

/**
 * Abonne le navigateur de l'auteur au texte d'un appel. L'état et le texte
 * courant partent tout de suite. `allowed` est relu à chaque contrôle de la
 * séance : faux, l'abonné est retiré. Retourne le désabonnement.
 */
export function subscribeLive(callId: string, listener: Listener, allowed?: () => Promise<boolean>): () => void {
  let set = listeners.get(callId)
  if (!set) listeners.set(callId, (set = new Set()))
  set.add(listener)
  if (allowed) accessChecks.set(listener, allowed)
  const session = sessions.get(callId)
  listener({ type: 'state', status: session?.status ?? 'WAITING' })
  for (const segment of session?.snapshot() ?? []) listener({ type: 'segment', segment })
  return () => {
    set.delete(listener)
    if (!set.size) listeners.delete(callId)
  }
}

/** Tests : coupe toutes les séances. */
export function stopAllLiveSessions(): void {
  for (const session of [...sessions.values()]) session.stop('ENDED')
}
