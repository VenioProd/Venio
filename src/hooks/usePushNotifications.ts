import { useCallback, useEffect, useState } from 'react'
import {
  getPushStatus,
  isPushSupported,
  subscribePush,
  unsubscribePush,
  type PushStatus,
} from '../services/pushNotifications'

interface UsePushNotificationsState extends PushStatus {
  loading: boolean
  error: string | null
}

export function usePushNotifications() {
  const [state, setState] = useState<UsePushNotificationsState>({
    supported: isPushSupported(),
    permission: 'default',
    subscribed: false,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    const status = await getPushStatus()
    setState((prev) => ({ ...prev, ...status, loading: false, error: null }))
  }, [])

  useEffect(() => {
    refresh()

    // Le SW peut signaler un changement (pushsubscriptionchange)
    if ('serviceWorker' in navigator) {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGE') {
          refresh()
        }
      }
      navigator.serviceWorker.addEventListener('message', handler)
      return () => navigator.serviceWorker.removeEventListener('message', handler)
    }
  }, [refresh])

  const enable = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const result = await subscribePush()
    if (!result.ok) {
      setState((prev) => ({ ...prev, loading: false, error: result.reason || 'Erreur inconnue' }))
      return result
    }
    await refresh()
    return result
  }, [refresh])

  const disable = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await unsubscribePush()
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      return
    }
    await refresh()
  }, [refresh])

  return { ...state, refresh, enable, disable }
}
