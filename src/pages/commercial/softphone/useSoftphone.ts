import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { callsApi } from '../../../services/calls'
import {
  isSoftphoneSupported,
  listMicrophones,
  softphone,
  type SettledCall,
  type Softphone,
  type SoftphoneFallback,
  type SoftphoneSnapshot,
} from './engine'

type ConfigState = 'loading' | 'enabled' | 'disabled' | 'error'

export interface SoftphoneController extends SoftphoneSnapshot {
  /** Vrai tant qu'un appel est en préparation, en cours ou en cours de clôture. */
  active: boolean
  /** Raison du repli sur `tel:`, ou null quand la barre peut appeler. */
  unavailable: SoftphoneFallback | null
  checking: boolean
  microphones: { id: string; label: string }[]
  start: (leadId: string) => void
  hangup: () => void
  toggleMute: () => void
  sendDigit: (digit: string) => void
  setMicrophone: (deviceId: string) => void
  retry: () => void
}

/**
 * État du softphone pour un écran. Le moteur est unique : deux écrans ne peuvent pas appeler en même temps.
 * Quitter la page (fermeture, rechargement, lien interne) pendant un appel demande confirmation ;
 * démonter l'écran raccroche.
 */
export function useSoftphone(
  options: { onSettled?: (call: SettledCall) => void } = {},
  engine: Softphone = softphone,
): SoftphoneController {
  const { t } = useI18n()
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const [config, setConfig] = useState<ConfigState>('loading')
  const [microphones, setMicrophones] = useState<{ id: string; label: string }[]>([])
  const supported = isSoftphoneSupported()
  const active = snapshot.phase !== 'idle'

  useEffect(() => {
    let current = true
    callsApi
      .config()
      .then((value) => current && setConfig(value.enabled ? 'enabled' : 'disabled'))
      .catch(() => current && setConfig('error'))
    return () => {
      current = false
    }
  }, [])

  const onSettled = useRef(options.onSettled)
  useEffect(() => {
    onSettled.current = options.onSettled
  })
  // Un résultat déjà présent au montage a été traité par l'écran précédent.
  const seen = useRef(snapshot.lastCall)
  useEffect(() => {
    if (snapshot.lastCall && snapshot.lastCall !== seen.current) {
      seen.current = snapshot.lastCall
      onSettled.current?.(snapshot.lastCall)
    }
  }, [snapshot.lastCall])

  useEffect(() => {
    if (!supported) return
    let current = true
    const refresh = () =>
      void listMicrophones().then((list) => {
        if (current) setMicrophones(list)
      })
    refresh()
    navigator.mediaDevices.addEventListener?.('devicechange', refresh)
    return () => {
      current = false
      navigator.mediaDevices.removeEventListener?.('devicechange', refresh)
    }
  }, [supported, snapshot.phase])

  useEffect(() => {
    if (!active) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || link.protocol === 'tel:' || link.protocol === 'mailto:') return
      if (link.origin === window.location.origin && link.pathname === window.location.pathname && link.hash) return
      if (!window.confirm(t('calls.leaveConfirm'))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
    }
  }, [active, t])

  useEffect(
    () => () => {
      if (engine.busy) engine.hangup()
    },
    [engine],
  )

  const unavailable: SoftphoneFallback | null =
    snapshot.fallback ??
    (!supported ? 'UNSUPPORTED' : config === 'disabled' ? 'DISABLED' : config === 'error' ? 'UNAVAILABLE' : null)

  return {
    ...snapshot,
    active,
    unavailable,
    checking: !unavailable && config === 'loading',
    microphones,
    start: useCallback((leadId: string) => void engine.start(leadId), [engine]),
    hangup: useCallback(() => engine.hangup(), [engine]),
    toggleMute: useCallback(() => engine.toggleMute(), [engine]),
    sendDigit: useCallback((digit: string) => engine.sendDigit(digit), [engine]),
    setMicrophone: useCallback((deviceId: string) => void engine.setMicrophone(deviceId), [engine]),
    retry: useCallback(() => engine.retry(), [engine]),
  }
}
