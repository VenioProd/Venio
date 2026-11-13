import { describe, expect, it, vi } from 'vitest'
import type { CallRecord } from '../../../services/calls'
import { Softphone } from '../softphone/engine'

const record = (status: CallRecord['status']): CallRecord => ({
  _id: 'call1',
  lead: 'lead1',
  status,
  startedAt: null,
  answeredAt: null,
  endedAt: null,
  durationSec: status === 'COMPLETED' ? 42 : null,
  answeredBy: 'HUMAN',
  suggestedOutcome: null,
})

/** Lot P : en mode pont, ni micro ni WebRTC ; l'écran suit l'appel que le serveur fait passer par le portable. */
describe('Softphone en mode pont', () => {
  it('lance par le serveur sans micro, suit l’appel jusqu’à sa fin, raccroche par le serveur', async () => {
    const states: CallRecord['status'][] = ['CREATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED']
    const api = {
      token: vi.fn(),
      create: vi.fn(async () => ({ callId: 'call1', via: 'BRIDGE' as const })),
      hangup: vi.fn(async () => ({ status: 'COMPLETED' as const })),
      stopRecording: vi.fn(),
      get: vi.fn(async () => record(states.shift() ?? 'COMPLETED')),
    }
    const loadSdk = vi.fn()
    const getUserMedia = vi.fn()
    const phone = new Softphone({
      api: api as never,
      loadSdk,
      getUserMedia,
      settle: vi.fn(async () => record('COMPLETED')),
      sleep: () => new Promise((resolve) => setTimeout(resolve, 1)),
      uuid: () => 'request-1',
      storage: null,
      now: () => 1000,
    })
    phone.configure({ edge: 'dublin', bridge: true })
    const phases: string[] = []
    phone.subscribe(() => phases.push(phone.getSnapshot().phase))
    await phone.start('lead1')
    expect(loadSdk).not.toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(api.token).not.toHaveBeenCalled()
    expect(api.create).toHaveBeenCalledWith('lead1', 'request-1')
    expect(phases).toEqual(expect.arrayContaining(['connecting', 'ringing', 'active', 'idle']))
    expect(phone.getSnapshot()).toMatchObject({ phase: 'idle', bridge: true, lastCall: { callId: 'call1' } })

    // Raccrocher pendant que le portable sonne : la demande part au serveur.
    api.get.mockImplementation(async () => record('RINGING'))
    const pending = phone.start('lead1')
    await vi.waitFor(() => expect(phone.getSnapshot().phase).toBe('ringing'))
    phone.hangup()
    await pending
    expect(api.hangup).toHaveBeenCalledWith('call1')
    expect(phone.getSnapshot().phase).toBe('idle')
  })
})
