import { describe, expect, it } from 'vitest'
import { subscriptionUsesKey } from './pushNotifications'

function toBase64Url(bytes: Uint8Array): string {
  return window
    .btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function subscriptionWithKey(key: Uint8Array | null): PushSubscription {
  return {
    options: {
      userVisibleOnly: true,
      applicationServerKey: key?.buffer || null,
    },
  } as PushSubscription
}

describe('subscriptionUsesKey', () => {
  it('reconnaît la clé VAPID utilisée par un abonnement', () => {
    const key = new Uint8Array([4, 12, 34, 56, 78, 90])

    expect(subscriptionUsesKey(subscriptionWithKey(key), toBase64Url(key))).toBe(true)
  })

  it('détecte une rotation de clé VAPID', () => {
    const oldKey = new Uint8Array([4, 1, 2, 3])
    const currentKey = new Uint8Array([4, 1, 2, 4])

    expect(subscriptionUsesKey(subscriptionWithKey(oldKey), toBase64Url(currentKey))).toBe(false)
  })

  it('refuse un abonnement sans clé applicative', () => {
    expect(subscriptionUsesKey(subscriptionWithKey(null), toBase64Url(new Uint8Array([4, 1])))).toBe(false)
  })
})
