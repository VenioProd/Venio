import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { createCallsApi, DEFAULT_CALLS_PREFIX, DEFAULT_DIALER, type DialerConfig } from '../../../services/calls'
import {
  isSoftphoneSupported,
  listMicrophones,
  softphone,
  type SettledCall,
  type Softphone,
  type SoftphoneFallback,
  type SoftphoneSnapshot,
} from './engine'
import { SharedSoftphoneContext } from './shared'

type ConfigState = 'loading' | 'enabled' | 'disabled' | 'error'

export interface RecordingConfig {
  /** L'enregistrement est actif : l'indicateur s'affiche pendant l'appel. */
  enabled: boolean
  /** Une annonce automatique prévient le prospect. */
  notice: boolean
}

/** Ce que le serveur et le navigateur permettent, lu une fois par poste. */
export interface SoftphoneSession {
  /** Raison du repli sur `tel:`, ou null quand la barre peut appeler. */
  unavailable: SoftphoneFallback | null
  checking: boolean
  recording: RecordingConfig
  /** Routeur d'appels de l'écran (volet de transcription en direct). */
  apiPrefix: string
  /** Réglages de la composition enchaînée (lot I). */
  dialer: DialerConfig
  /** Lot P : les appels de l'utilisateur passent par son portable vérifié ; l'enchaînement se limite au clic. */
  bridgeMode: boolean
  microphones: { id: string; label: string }[]
}

export interface SoftphoneController extends SoftphoneSnapshot, SoftphoneSession {
  /** Vrai tant qu'un appel est en préparation, en cours ou en cours de clôture. */
  active: boolean
  /** `mode: 'power'` quand le power dialer lance l'appel. */
  start: (leadId: string, mode?: 'power') => void
  hangup: () => void
  toggleMute: () => void
  sendDigit: (digit: string) => void
  setMicrophone: (deviceId: string) => void
  retry: () => void
  stopRecording: () => void
}

/** Configuration de la téléphonie et micros du poste ; rien n'est lu tant que `enabled` est faux. */
export function useSoftphoneSession(prefix: string, engine: Softphone, enabled = true): SoftphoneSession {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const [config, setConfig] = useState<ConfigState>('loading')
  const [recording, setRecording] = useState<RecordingConfig>({ enabled: false, notice: false })
  const [dialer, setDialer] = useState<DialerConfig>(DEFAULT_DIALER)
  const [microphones, setMicrophones] = useState<{ id: string; label: string }[]>([])
  const [bridge, setBridge] = useState(false)
  const supported = isSoftphoneSupported()

  useEffect(() => {
    if (!enabled) return
    let current = true
    createCallsApi(prefix)
      .config()
      .then((value) => {
        if (!current) return
        engine.configure({ edge: value.edge, bridge: Boolean(value.enabled && value.bridge?.active) })
        setBridge(Boolean(value.enabled && value.bridge?.active))
        setRecording({ enabled: Boolean(value.recording?.enabled), notice: Boolean(value.recording?.notice) })
        if (value.dialer) setDialer(value.dialer)
        setConfig(value.enabled ? 'enabled' : 'disabled')
      })
      .catch(() => current && setConfig('error'))
    return () => {
      current = false
    }
  }, [engine, prefix, enabled])

  useEffect(() => {
    if (!enabled || !supported) return
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
  }, [enabled, supported, snapshot.phase])

  // Mode pont (lot P) : ni micro ni WebRTC, seul le serveur compte.
  const unavailable: SoftphoneFallback | null =
    config === 'disabled'
      ? 'DISABLED'
      : config === 'error'
        ? 'UNAVAILABLE'
        : bridge
          ? null
          : (snapshot.fallback ?? (!supported ? 'UNSUPPORTED' : null))

  const checking = !unavailable && config === 'loading'
  return useMemo(
    () => ({ unavailable, checking, recording, apiPrefix: prefix, dialer, bridgeMode: bridge, microphones }),
    [unavailable, checking, recording, prefix, dialer, bridge, microphones],
  )
}

/**
 * Pendant un appel, fermer ou recharger la page et suivre un lien demandent confirmation.
 * `stays` : liens qui ne raccrochent pas (ceux qui restent sous le softphone partagé).
 */
export function useLeaveGuard(active: boolean, stays?: (link: HTMLAnchorElement) => boolean) {
  const { t } = useI18n()
  const staysRef = useRef(stays)
  useEffect(() => {
    staysRef.current = stays
  })
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
      if (link.origin === window.location.origin && staysRef.current?.(link)) return
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
}

/**
 * État du softphone pour un écran. Le moteur est unique : deux écrans ne peuvent pas appeler en même temps.
 *
 * Sans softphone partagé (espace du commercial externe), l'écran lit lui-même la configuration ; quitter la
 * page pendant un appel demande confirmation et démonter l'écran raccroche.
 * Sous un softphone partagé de même routeur (CRM de l'équipe), l'écran le consomme : l'appel survit à son
 * démontage, et un appel terminé pendant son absence lui est remis à son retour, dès que `lead` trouve la fiche.
 */
export function useSoftphone(
  options: {
    onSettled?: (call: SettledCall) => void
    /** Routeur d'appels de l'écran : `/api/commercial` par défaut, `/api/admin/call-desk` pour l'équipe. */
    apiPrefix?: string
    /** Fiche affichée par l'écran : son nom accompagne l'appel partagé, et l'écran prend un résultat dû quand il l'a. */
    lead?: (leadId: string) => { company: string } | null | undefined
  } = {},
  engine: Softphone = softphone,
): SoftphoneController {
  const context = useContext(SharedSoftphoneContext)
  const prefix = options.apiPrefix ?? DEFAULT_CALLS_PREFIX
  const shared = context && context.session.apiPrefix === prefix && context.engine === engine ? context : null
  const own = useSoftphoneSession(prefix, engine, !shared)
  const session = shared ? shared.session : own
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const active = snapshot.phase !== 'idle'
  useLeaveGuard(active && !shared)

  const onSettled = useRef(options.onSettled)
  const lookup = useRef(options.lead)
  useEffect(() => {
    onSettled.current = options.onSettled
    lookup.current = options.lead
  })
  // Un résultat déjà présent au montage a été traité par l'écran précédent.
  const seen = useRef(snapshot.lastCall)
  const owed = shared?.owed ?? null
  const atOrigin = Boolean(owed && owed.origin.path === shared?.path)
  const origin = shared?.origin
  const here = origin && origin.path === shared?.path ? origin.leadId : null
  useEffect(() => {
    const last = snapshot.lastCall
    if (!last || last === seen.current) return
    seen.current = last
    // Parti de cet écran : remis par l'effet suivant, comme résultat dû, une fois la fiche affichée.
    if (here === last.leadId) return
    onSettled.current?.(last)
  }, [snapshot.lastCall, here])
  const take = shared?.take
  // Résultat dû à cet écran : remis dès qu'il affiche la fiche appelée (à chaque rendu tant qu'il attend).
  useEffect(() => {
    if (!owed || !atOrigin || !take) return
    if (lookup.current && !lookup.current(owed.call.leadId)) return
    if (!take(owed)) return
    seen.current = owed.call
    onSettled.current?.(owed.call)
  })

  useEffect(() => {
    if (shared) return
    return () => {
      if (engine.busy) engine.hangup()
    }
  }, [engine, shared])

  const sharedStart = shared?.start
  return {
    ...snapshot,
    ...session,
    active,
    start: useCallback(
      (leadId: string, mode?: 'power') => {
        if (sharedStart) sharedStart(leadId, mode, lookup.current?.(leadId)?.company ?? null)
        else void engine.start(leadId, prefix, mode)
      },
      [engine, prefix, sharedStart],
    ),
    hangup: useCallback(() => engine.hangup(), [engine]),
    toggleMute: useCallback(() => engine.toggleMute(), [engine]),
    sendDigit: useCallback((digit: string) => engine.sendDigit(digit), [engine]),
    setMicrophone: useCallback((deviceId: string) => void engine.setMicrophone(deviceId), [engine]),
    retry: useCallback(() => engine.retry(), [engine]),
    stopRecording: useCallback(() => void engine.stopRecording(), [engine]),
  }
}
