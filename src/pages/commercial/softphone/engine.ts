import type { Call, Device } from '@twilio/voice-sdk'
import {
  callErrorCode,
  callsApi,
  createCallsApi,
  DEFAULT_CALLS_PREFIX,
  settleCall,
  FINAL_CALL_STATUSES,
  type CallErrorCode,
  type CallRecord,
  type VoiceToken,
} from '../../../services/calls'

/**
 * Enveloppe de `@twilio/voice-sdk` pour la barre d'appel.
 *
 * Le navigateur n'envoie jamais de numéro : il demande un appel au serveur (`callId`), puis
 * `device.connect({ params: { callId } })`. Un seul appel à la fois, quel que soit l'écran.
 */

export type SoftphonePhase = 'idle' | 'preparing' | 'connecting' | 'ringing' | 'active' | 'reconnecting' | 'ending'

/** Raisons pour lesquelles l'écran garde le lien `tel:`. */
export type SoftphoneFallback = 'DISABLED' | 'MIC_DENIED' | 'UNSUPPORTED' | 'UNAVAILABLE'

export type SoftphoneFailure =
  | { kind: SoftphoneFallback }
  | { kind: 'SERVER'; code: Exclude<CallErrorCode, 'TELEPHONY_DISABLED'> }
  | { kind: 'CALL' }
  | { kind: 'NETWORK' }

export interface SettledCall {
  callId: string
  leadId: string
  record: CallRecord | null
  /** Durée mesurée dans le navigateur, quand le serveur ne la donne pas encore. */
  elapsedSec: number
}

export interface SoftphoneSnapshot {
  phase: SoftphonePhase
  leadId: string | null
  callId: string | null
  muted: boolean
  /** Instant de décrochage, en millisecondes. */
  answeredAt: number | null
  failure: SoftphoneFailure | null
  /** Repli définitif pour la session : le lien `tel:` remplace la barre. */
  fallback: SoftphoneFallback | null
  lastCall: SettledCall | null
  microphoneId: string
  /** Le prospect refuse l'enregistrement : `pending` pendant la requête, `stopped` une fois l'arrêt confirmé par le serveur. */
  recordingStop: 'idle' | 'pending' | 'stopped' | 'failed'
  /** Lot P : l'appel passe par le portable du commercial (mode pont) ; ni micro, ni muet, ni clavier ici. */
  bridge: boolean
}

export interface SoftphoneDeps {
  loadSdk: () => Promise<{ Device: typeof Device }>
  api: Pick<typeof callsApi, 'token' | 'create' | 'hangup' | 'stopRecording'> & Partial<Pick<typeof callsApi, 'get'>>
  /** Les routes d'un autre préfixe que `/api/commercial` (l'équipe passe par `/api/admin/call-desk`). */
  apiFor: (prefix: string) => SoftphoneDeps['api']
  settle: (callId: string, prefix: string) => Promise<CallRecord | null>
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  now: () => number
  uuid: () => string
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  /** Attente entre deux relectures de l'appel en mode pont. */
  sleep: (ms: number) => Promise<void>
}

const MIC_KEY = 'venio-softphone-mic'
const MIC_ERROR_CODES = [31201, 31208]
const TOKEN_MARGIN_MS = 60_000
const BRIDGE_POLL_MS = 1500
/** Au-delà, l'écran cesse d'attendre l'appel en mode pont (la durée maximale d'un appel, plus une marge). */
const BRIDGE_MAX_POLLS = Math.ceil((65 * 60_000) / BRIDGE_POLL_MS)
const DIGITS = /^[0-9*#]$/

class Aborted extends Error {}

export function isSoftphoneSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.isSecureContext !== false &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof RTCPeerConnection !== 'undefined'
  )
}

/** Micros nommés ; vide tant que le navigateur n'a pas accordé l'accès. */
export async function listMicrophones(): Promise<{ id: string; label: string }[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'audioinput' && device.label)
      .map((device) => ({ id: device.deviceId, label: device.label }))
  } catch {
    return []
  }
}

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const initialSnapshot = (microphoneId: string): SoftphoneSnapshot => ({
  phase: 'idle',
  leadId: null,
  callId: null,
  muted: false,
  answeredAt: null,
  failure: null,
  fallback: null,
  lastCall: null,
  microphoneId,
  recordingStop: 'idle',
  bridge: false,
})

export class Softphone {
  private snapshotValue: SoftphoneSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly deps: SoftphoneDeps
  private device: Device | null = null
  private tokenExpiresAt = 0
  private edge: string | null = null
  /** Préfixe d'API de l'appel en cours (ou du dernier) : un seul moteur pour toute l'app, quel que soit l'écran. */
  private prefix = DEFAULT_CALLS_PREFIX
  private call: Call | null = null
  private aborted = false
  private bridgeMode = false

  constructor(deps: Partial<SoftphoneDeps> = {}) {
    this.deps = {
      loadSdk: () => import('@twilio/voice-sdk'),
      api: callsApi,
      apiFor: (prefix) => createCallsApi(prefix),
      settle: (callId, prefix) => settleCall(callId, { prefix }),
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      now: () => Date.now(),
      uuid: () => crypto.randomUUID(),
      storage: defaultStorage(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...deps,
    }
    let stored = ''
    try {
      stored = this.deps.storage?.getItem(MIC_KEY) ?? ''
    } catch {
      stored = ''
    }
    this.snapshotValue = initialSnapshot(stored)
  }

  getSnapshot = () => this.snapshotValue

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(change: Partial<SoftphoneSnapshot>) {
    this.snapshotValue = { ...this.snapshotValue, ...change }
    this.listeners.forEach((listener) => listener())
  }

  get busy() {
    return this.snapshotValue.phase !== 'idle'
  }

  private get api() {
    return this.prefix === DEFAULT_CALLS_PREFIX ? this.deps.api : this.deps.apiFor(this.prefix)
  }

  /** Réglages du serveur : l'edge de l'opérateur et le mode pont, lus dans `GET /calls/config`. */
  configure(options: { edge?: string | null; bridge?: boolean }) {
    this.edge = options.edge || null
    this.bridgeMode = Boolean(options.bridge)
  }

  /** Efface le dernier résultat et la dernière erreur (nouvel appel, changement de fiche). */
  dismiss() {
    if (!this.busy) this.update({ failure: null, lastCall: null })
  }

  /** Lève le repli mémorisé, par exemple une fois l'accès au micro rouvert dans le navigateur. */
  retry() {
    if (!this.busy) this.update({ fallback: null, failure: null })
  }

  async start(leadId: string, prefix: string = DEFAULT_CALLS_PREFIX, mode?: 'power') {
    if (this.busy) return
    this.aborted = false
    // Un jeton émis par un autre routeur n'est pas réutilisable.
    if (prefix !== this.prefix) this.destroyDevice()
    this.prefix = prefix
    this.update({
      phase: 'preparing',
      leadId,
      callId: null,
      muted: false,
      answeredAt: null,
      failure: null,
      lastCall: null,
      recordingStop: 'idle',
      bridge: this.bridgeMode,
    })
    if (this.bridgeMode) return this.startBridge(leadId, mode)
    try {
      if (!isSoftphoneSupported()) throw Object.assign(new Error('UNSUPPORTED'), { fallback: 'UNSUPPORTED' })
      await this.checkMicrophone()
      this.guard()
      const { Device: SdkDevice } = await this.deps.loadSdk()
      if (!SdkDevice.isSupported) throw Object.assign(new Error('UNSUPPORTED'), { fallback: 'UNSUPPORTED' })
      this.guard()
      const device = await this.prepareDevice(SdkDevice)
      this.guard()
      // Le serveur ne compte une tentative qu'une fois le micro et le jeton obtenus.
      const requestId = this.deps.uuid()
      const { callId } = await (mode ? this.api.create(leadId, requestId, mode) : this.api.create(leadId, requestId))
      this.update({ callId, phase: 'connecting' })
      this.guard()
      await this.applyMicrophone(device)
      const call = await device.connect({ params: { callId } })
      this.attach(call, leadId, callId)
      if (this.aborted) call.disconnect()
    } catch (err) {
      await this.fail(err, leadId)
    }
  }

  /**
   * Mode pont (lot P) : le serveur fait appeler le portable du commercial, puis le prospect une fois
   * qu'il a tapé 1. L'écran suit l'appel en le relisant ; raccrocher passe par le serveur.
   */
  private async startBridge(leadId: string, mode?: 'power') {
    try {
      const requestId = this.deps.uuid()
      const { callId } = await (mode ? this.api.create(leadId, requestId, mode) : this.api.create(leadId, requestId))
      this.update({ callId, phase: 'connecting' })
      for (let polls = 0; polls < BRIDGE_MAX_POLLS && !this.aborted; polls += 1) {
        await this.deps.sleep(BRIDGE_POLL_MS)
        const record = await this.api.get?.(callId).catch(() => null)
        if (!record) continue
        if (FINAL_CALL_STATUSES.includes(record.status)) break
        if (record.status === 'RINGING' && this.snapshotValue.phase === 'connecting') this.update({ phase: 'ringing' })
        if (record.status === 'IN_PROGRESS' && this.snapshotValue.phase !== 'active' && !this.aborted)
          this.update({ phase: 'active', answeredAt: this.deps.now() })
      }
      await this.finish(leadId, callId, null)
    } catch (err) {
      await this.fail(err, leadId)
    }
  }

  hangup() {
    const { phase, callId } = this.snapshotValue
    if (phase === 'idle' || phase === 'ending') return
    this.aborted = true
    this.update({ phase: 'ending' })
    if (callId) void this.api.hangup(callId).catch(() => undefined)
    this.call?.disconnect()
  }

  /**
   * Le prospect refuse l'enregistrement. Le serveur arrête la capture et efface ce qui a été enregistré ;
   * l'arrêt n'est affiché qu'une fois confirmé. Rejouable après un échec.
   */
  async stopRecording() {
    const { callId, phase, recordingStop } = this.snapshotValue
    if (!callId || phase === 'idle' || recordingStop === 'pending' || recordingStop === 'stopped') return
    this.update({ recordingStop: 'pending' })
    try {
      await this.api.stopRecording(callId)
      if (this.snapshotValue.callId === callId) this.update({ recordingStop: 'stopped' })
    } catch {
      if (this.snapshotValue.callId === callId) this.update({ recordingStop: 'failed' })
    }
  }

  toggleMute() {
    if (!this.call) return
    this.call.mute(!this.call.isMuted())
  }

  sendDigit(digit: string) {
    if (this.call && DIGITS.test(digit)) this.call.sendDigits(digit)
  }

  async setMicrophone(deviceId: string) {
    try {
      this.deps.storage?.setItem(MIC_KEY, deviceId)
    } catch {
      // Préférence facultative.
    }
    this.update({ microphoneId: deviceId })
    if (this.device) await this.applyMicrophone(this.device)
  }

  private guard() {
    if (this.aborted) throw new Aborted()
  }

  /** Demande l'accès au micro avant tout appel serveur, pour ne pas consommer une tentative pour rien. */
  private async checkMicrophone() {
    try {
      const stream = await this.deps.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch {
      // Refusé, absent ou occupé : l'écran garde le téléphone dans tous les cas.
      throw Object.assign(new Error('MIC_DENIED'), { fallback: 'MIC_DENIED' })
    }
  }

  private async fetchToken(): Promise<VoiceToken> {
    const token = await this.api.token()
    this.tokenExpiresAt = Date.parse(token.expiresAt) || 0
    return token
  }

  private async prepareDevice(SdkDevice: typeof Device) {
    if (this.device && this.tokenExpiresAt - this.deps.now() < TOKEN_MARGIN_MS) {
      this.device.updateToken((await this.fetchToken()).token)
    }
    if (this.device) return this.device
    const { token } = await this.fetchToken()
    const device = new SdkDevice(token, { logLevel: 'error', ...(this.edge ? { edge: this.edge } : {}) })
    device.on('tokenWillExpire', () => {
      void this.fetchToken()
        .then((fresh) => device.updateToken(fresh.token))
        .catch(() => undefined)
    })
    device.on('error', (error: { code?: number }) => {
      // Les erreurs d'appel arrivent aussi sur l'appel ; celle-ci couvre les erreurs du poste lui-même.
      if (error.code && MIC_ERROR_CODES.includes(error.code)) this.update({ fallback: 'MIC_DENIED' })
    })
    this.device = device
    return device
  }

  private async applyMicrophone(device: Device) {
    const id = this.snapshotValue.microphoneId
    if (!id || !device.audio) return
    try {
      await device.audio.setInputDevice(id)
    } catch {
      // Micro débranché depuis la dernière fois : le micro par défaut reste utilisé.
    }
  }

  private attach(call: Call, leadId: string, callId: string) {
    this.call = call
    let failure: SoftphoneFailure | null = null
    call.on('ringing', () => {
      if (this.snapshotValue.phase === 'connecting') this.update({ phase: 'ringing' })
    })
    call.on('accept', () => {
      this.update({ phase: 'active', answeredAt: this.deps.now() })
    })
    call.on('mute', (muted: boolean) => this.update({ muted }))
    call.on('reconnecting', () => this.update({ phase: 'reconnecting' }))
    call.on('reconnected', () => this.update({ phase: 'active' }))
    call.on('error', (error: { code?: number }) => {
      failure = error.code && MIC_ERROR_CODES.includes(error.code) ? { kind: 'MIC_DENIED' } : { kind: 'CALL' }
      if (failure.kind === 'MIC_DENIED') this.update({ fallback: 'MIC_DENIED' })
      this.update({ failure })
      call.disconnect()
    })
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      void this.finish(leadId, callId, failure)
    }
    call.on('disconnect', finish)
    call.on('cancel', finish)
    call.on('reject', finish)
  }

  private async finish(leadId: string, callId: string, failure: SoftphoneFailure | null) {
    const { answeredAt } = this.snapshotValue
    const elapsedSec = answeredAt ? Math.max(0, Math.round((this.deps.now() - answeredAt) / 1000)) : 0
    this.call = null
    this.update({ phase: 'ending', muted: false })
    this.destroyDevice()
    const record = await this.deps.settle(callId, this.prefix)
    this.update({
      phase: 'idle',
      answeredAt: null,
      failure: failure ?? this.snapshotValue.failure,
      lastCall: { callId, leadId, record, elapsedSec },
    })
  }

  private async fail(err: unknown, leadId: string) {
    const { callId } = this.snapshotValue
    this.call = null
    this.destroyDevice()
    let failure: SoftphoneFailure | null = null
    let fallback = this.snapshotValue.fallback
    const code = callErrorCode(err)
    const hinted = (err as { fallback?: SoftphoneFallback }).fallback
    if (err instanceof Aborted) failure = null
    else if (hinted) {
      fallback = hinted
      failure = { kind: hinted }
    } else if (code === 'TELEPHONY_DISABLED') {
      fallback = 'DISABLED'
      failure = { kind: 'DISABLED' }
    } else if (code) failure = { kind: 'SERVER', code }
    else if (MIC_ERROR_CODES.includes((err as { code?: number }).code ?? 0)) {
      fallback = 'MIC_DENIED'
      failure = { kind: 'MIC_DENIED' }
    } else if ((err as { status?: number }).status !== undefined) failure = { kind: 'NETWORK' }
    else failure = { kind: 'CALL' }

    if (callId) {
      // L'appel existe côté serveur mais n'a pas pu partir : on le ferme et on relit son état.
      void this.api.hangup(callId).catch(() => undefined)
      const record = err instanceof Aborted ? await this.deps.settle(callId, this.prefix) : null
      this.update({
        phase: 'idle',
        failure,
        fallback,
        answeredAt: null,
        lastCall: err instanceof Aborted ? { callId, leadId, record, elapsedSec: 0 } : null,
      })
      return
    }
    this.update({ phase: 'idle', failure, fallback, answeredAt: null })
  }

  private destroyDevice() {
    try {
      this.device?.destroy()
    } catch {
      // Déjà détruit.
    }
    this.device = null
    this.tokenExpiresAt = 0
  }
}

export const softphone = new Softphone()
