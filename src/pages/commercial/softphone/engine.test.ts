import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallRecord } from '../../../services/calls'
import { Softphone, type SoftphoneDeps } from './engine'

class FakeCall extends EventEmitter {
  muted = false
  sendDigits = vi.fn()
  disconnect = vi.fn(() => this.emit('disconnect'))
  isMuted = () => this.muted
  mute = (value = true) => {
    this.muted = value
    this.emit('mute', value)
  }
}

class FakeDevice extends EventEmitter {
  static isSupported = true
  static last: FakeDevice | null = null
  static call = new FakeCall()
  audio = { setInputDevice: vi.fn(async () => undefined) }
  updateToken = vi.fn()
  destroy = vi.fn()
  connect = vi.fn(async () => FakeDevice.call)
  constructor(
    public token: string,
    public options: Record<string, unknown> = {},
  ) {
    super()
    FakeDevice.last = this
  }
}

const record = (change: Partial<CallRecord> = {}): CallRecord => ({
  _id: 'call1',
  lead: 'lead1',
  status: 'COMPLETED',
  startedAt: null,
  answeredAt: null,
  endedAt: null,
  durationSec: 42,
  answeredBy: 'HUMAN',
  suggestedOutcome: null,
  ...change,
})

function setup(overrides: Partial<SoftphoneDeps> = {}) {
  const api = {
    token: vi.fn(async () => ({
      token: 'jwt',
      identity: 'user1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    })),
    create: vi.fn(async () => ({ callId: 'call1' })),
    hangup: vi.fn(async () => ({ status: 'CANCELED' as const })),
    stopRecording: vi.fn(async () => ({ recording: { status: 'STOPPED' as const, objection: true } })),
  }
  const stop = vi.fn()
  const phone = new Softphone({
    loadSdk: async () => ({ Device: FakeDevice as never }),
    api,
    settle: vi.fn(async () => record()),
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream),
    uuid: () => 'request-1',
    storage: null,
    ...overrides,
  })
  return { phone, api, stop }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Softphone', () => {
  beforeEach(() => {
    FakeDevice.call = new FakeCall()
    FakeDevice.isSupported = true
    vi.stubGlobal('RTCPeerConnection', class {})
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn(async () => []) },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('passe par les états de l’appel et ne transmet que le callId au SDK', async () => {
    const { phone, api, stop } = setup()
    const phases: string[] = []
    phone.subscribe(() => phases.push(phone.getSnapshot().phase))

    await phone.start('lead1')
    expect(api.create).toHaveBeenCalledWith('lead1', 'request-1')
    expect(FakeDevice.last?.connect).toHaveBeenCalledWith({ params: { callId: 'call1' } })
    expect(stop).toHaveBeenCalled() // le contrôle du micro libère la piste
    expect(phone.getSnapshot().phase).toBe('connecting')

    FakeDevice.call.emit('ringing', false)
    expect(phone.getSnapshot().phase).toBe('ringing')
    FakeDevice.call.emit('accept')
    expect(phone.getSnapshot().phase).toBe('active')
    expect(phone.getSnapshot().answeredAt).not.toBeNull()
    expect(phases).toEqual(expect.arrayContaining(['preparing', 'connecting', 'ringing', 'active']))
  })

  it('coupe le micro, envoie des touches et raccroche', async () => {
    const { phone, api } = setup()
    await phone.start('lead1')
    FakeDevice.call.emit('accept')

    phone.toggleMute()
    expect(phone.getSnapshot().muted).toBe(true)
    phone.sendDigit('5')
    phone.sendDigit('x') // refusée : seules les touches d’un clavier téléphonique partent
    expect(FakeDevice.call.sendDigits).toHaveBeenCalledTimes(1)
    expect(FakeDevice.call.sendDigits).toHaveBeenCalledWith('5')

    phone.hangup()
    expect(FakeDevice.call.disconnect).toHaveBeenCalled()
    expect(api.hangup).toHaveBeenCalledWith('call1')
    await flush()
    const snapshot = phone.getSnapshot()
    expect(snapshot.phase).toBe('idle')
    expect(snapshot.lastCall).toMatchObject({ callId: 'call1', leadId: 'lead1', record: { durationSec: 42 } })
    expect(FakeDevice.last?.destroy).toHaveBeenCalled()
  })

  it('refuse un deuxième appel tant que le premier n’est pas terminé', async () => {
    const { phone, api } = setup()
    await phone.start('lead1')
    await phone.start('lead2')
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(phone.getSnapshot().leadId).toBe('lead1')
  })

  it('garde le téléphone et ne crée aucun appel côté serveur quand le micro est refusé', async () => {
    const { phone, api } = setup({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
      }),
    })
    await phone.start('lead1')
    expect(api.create).not.toHaveBeenCalled()
    expect(phone.getSnapshot()).toMatchObject({ phase: 'idle', fallback: 'MIC_DENIED' })
    phone.retry()
    expect(phone.getSnapshot().fallback).toBeNull()
  })

  it('bascule sur le téléphone quand le serveur répond TELEPHONY_DISABLED', async () => {
    const { phone, api } = setup()
    api.token.mockRejectedValueOnce(Object.assign(new Error('TELEPHONY_DISABLED'), { status: 503 }))
    await phone.start('lead1')
    expect(api.create).not.toHaveBeenCalled()
    expect(phone.getSnapshot()).toMatchObject({ phase: 'idle', fallback: 'DISABLED' })
  })

  it('bascule sur le téléphone quand le SDK ne convient pas au navigateur', async () => {
    FakeDevice.isSupported = false
    const { phone, api } = setup()
    await phone.start('lead1')
    expect(api.create).not.toHaveBeenCalled()
    expect(phone.getSnapshot().fallback).toBe('UNSUPPORTED')
  })

  it('rend lisible un refus serveur sans basculer définitivement', async () => {
    const { phone, api } = setup()
    api.create.mockRejectedValueOnce(Object.assign(new Error('ATTEMPT_CAP_REACHED'), { status: 409 }))
    await phone.start('lead1')
    expect(phone.getSnapshot()).toMatchObject({
      phase: 'idle',
      fallback: null,
      failure: { kind: 'SERVER', code: 'ATTEMPT_CAP_REACHED' },
    })
    expect(FakeDevice.last?.destroy).toHaveBeenCalled()
  })

  it('ferme l’appel serveur quand le SDK échoue après sa création', async () => {
    class BrokenDevice extends FakeDevice {
      connect = vi.fn(async () => {
        throw Object.assign(new Error('boom'), { code: 31005 })
      })
    }
    const { phone, api } = setup({ loadSdk: async () => ({ Device: BrokenDevice as never }) })
    await phone.start('lead1')
    expect(api.hangup).toHaveBeenCalledWith('call1')
    expect(phone.getSnapshot()).toMatchObject({ phase: 'idle', failure: { kind: 'CALL' } })
  })

  it('reste sur le téléphone quand le SDK signale un micro refusé en cours d’appel', async () => {
    const { phone } = setup()
    await phone.start('lead1')
    FakeDevice.call.emit('error', { code: 31208 })
    await flush()
    expect(phone.getSnapshot()).toMatchObject({ phase: 'idle', fallback: 'MIC_DENIED' })
  })

  it('passe l’edge du serveur au Device', async () => {
    const { phone } = setup()
    phone.configure({ edge: 'dublin' })
    await phone.start('lead1')
    expect(FakeDevice.last?.options).toMatchObject({ edge: 'dublin' })
  })

  it('n’affiche l’arrêt de l’enregistrement qu’une fois confirmé par le serveur, et peut le rejouer', async () => {
    const { phone, api } = setup()
    await phone.start('lead1')
    FakeDevice.call.emit('accept')

    api.stopRecording.mockRejectedValueOnce(new Error('réseau'))
    await phone.stopRecording()
    expect(phone.getSnapshot().recordingStop).toBe('failed')

    const pending = phone.stopRecording()
    expect(phone.getSnapshot().recordingStop).toBe('pending')
    await pending
    expect(api.stopRecording).toHaveBeenCalledTimes(2)
    expect(api.stopRecording).toHaveBeenCalledWith('call1')
    expect(phone.getSnapshot().recordingStop).toBe('stopped')

    await phone.stopRecording() // déjà arrêté : aucune requête de plus
    expect(api.stopRecording).toHaveBeenCalledTimes(2)
  })
})
