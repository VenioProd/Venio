import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallErrorCode, DialerConfig } from '../../../services/calls'
import { listMicrophones, softphone as defaultEngine, type Softphone } from './engine'
import type { SoftphoneController } from './useSoftphone'

/**
 * Composition enchaînée (lot I), côté navigateur. Trois modes :
 * - `click` : le commercial lance chaque appel ;
 * - `preview` : la fiche suivante s'ouvre, l'appel part au clic ou après `previewDelaySec` ;
 * - `power` : progressif, un appel à la fois ; le suivant part `powerDelaySec` après la saisie du résultat.
 *
 * Le serveur repasse ses gardes à chaque lancement et refuse un deuxième appel simultané
 * (`CALL_IN_PROGRESS`). L'enchaînement s'arrête net, sans couper l'appel en cours, sur pause,
 * départ de la page, perte du micro, opposition ou refus ; il ne reprend jamais seul.
 */

export type DialerMode = 'click' | 'preview' | 'power'
export const DIALER_MODES: readonly DialerMode[] = ['click', 'preview', 'power']

export type DialerStopReason = 'PAUSED' | 'MIC_LOST' | 'OPPOSITION' | 'REFUSED' | 'FAILED' | 'EMPTY' | 'HIDDEN'
export interface DialerStop {
  reason: DialerStopReason
  code?: CallErrorCode
}

/**
 * Refus qui écartent seulement la fiche : l'enchaînement continue avec la suivante. Le power dialer
 * est refusé vers les États-Unis (+1 hors Canada) jusqu'à avis juridique ; l'aperçu et le clic restent permis.
 */
const SKIPPED: readonly CallErrorCode[] = ['LEAD_NOT_CALLABLE', 'ATTEMPT_CAP_REACHED', 'POWER_DIALER_BLOCKED']
const TICK_MS = 200

type Phone = Pick<SoftphoneController, 'active' | 'lastCall' | 'start'>

export interface DialerOptions {
  mode: DialerMode
  config: DialerConfig
  /** Fiche ouverte : la prochaine à appeler. */
  leadId: string | null
  /** La file n'enregistre ni ne charge rien. */
  idle: boolean
  /** La fiche ouverte peut être appelée (numéro présent, pas de retenue, poste disponible). */
  ready: boolean
  /** Un appel a eu lieu sur cette fiche et son résultat n'est pas encore saisi. */
  pendingOutcome: boolean
  softphone: Phone
  /** Écarte la fiche refusée par une garde (plafond, fiche plus appelable) et ouvre la suivante. */
  onSkip: (leadId: string) => void
  engine?: Softphone
  now?: () => number
}

export interface Dialer {
  running: boolean
  /** Raison de l'arrêt affichée ; `EMPTY` tant que la file est vide en cours d'enchaînement. */
  stop: DialerStop | null
  /** Secondes avant l'appel automatique ; `null` si rien n'est programmé. */
  countdown: number | null
  /** Aperçu sans délai : la fiche est prête, l'appel attend le clic. */
  waitingClick: boolean
  start: () => void
  pause: () => void
  halt: (reason: DialerStopReason, code?: CallErrorCode) => void
  callNow: () => void
}

export function useDialer(options: DialerOptions): Dialer {
  const {
    mode,
    config,
    leadId,
    idle,
    ready,
    pendingOutcome,
    softphone,
    engine = defaultEngine,
    now = Date.now,
  } = options
  const [running, setRunning] = useState(false)
  const [stop, setStop] = useState<DialerStop | null>(null)
  /** Numéro de la séance : « Reprendre » réarme même la fiche déjà ouverte. */
  const [run, setRun] = useState(0)
  /** Le premier appel après « Démarrer » part sans délai en mode power. */
  const [first, setFirst] = useState(false)
  const [arm, setArm] = useState<{ key: string; at: number } | null>(null)
  const [clock, setClock] = useState(0)
  const latest = useRef(options)
  const armRef = useRef(arm)
  const fired = useRef('')
  useEffect(() => {
    latest.current = options
    armRef.current = arm
  })

  const halt = useCallback((reason: DialerStopReason, code?: CallErrorCode) => {
    setRunning(false)
    setArm(null)
    setStop({ reason, ...(code ? { code } : {}) })
  }, [])

  const armed =
    running &&
    mode !== 'click' &&
    Boolean(leadId) &&
    ready &&
    !softphone.active &&
    !pendingOutcome &&
    softphone.lastCall?.leadId !== leadId
  const delay =
    mode === 'preview' ? (config.previewDelaySec > 0 ? config.previewDelaySec : null) : first ? 0 : config.powerDelaySec
  const armedKey = armed && delay !== null ? `${run}:${leadId}` : null

  // Compte à rebours : le minuteur pose l'instant d'armement, relit l'horloge et lance l'appel à l'échéance.
  useEffect(() => {
    if (!armedKey || delay === null) return
    const tick = () => {
      const current = now()
      setClock(current)
      setArm((previous) => (previous?.key === armedKey ? previous : { key: armedKey, at: current }))
    }
    const timer = setInterval(() => {
      tick()
      const { leadId: target, softphone: phone } = latest.current
      const startedAt = armRef.current?.key === armedKey ? armRef.current.at : null
      if (startedAt === null || now() < startedAt + delay * 1000 || fired.current === armedKey) return
      if (!target || phone.active) return
      fired.current = armedKey
      setFirst(false)
      phone.start(target, latest.current.mode === 'power' ? 'power' : undefined)
    }, TICK_MS)
    const kickoff = setTimeout(tick, 0)
    return () => {
      clearInterval(timer)
      clearTimeout(kickoff)
    }
  }, [armedKey, delay, now])

  // Refus, panne de micro ou opposition à l'enregistrement, lus sur le moteur d'appel.
  useEffect(() => {
    if (!running) return
    let previous = engine.getSnapshot()
    return engine.subscribe(() => {
      const snapshot = engine.getSnapshot()
      const before = previous
      previous = snapshot
      if (snapshot.phase !== 'idle' && before.phase === 'idle') setFirst(false)
      if (snapshot.fallback && !before.fallback) return halt(snapshot.fallback === 'MIC_DENIED' ? 'MIC_LOST' : 'FAILED')
      const objected = snapshot.recordingStop === 'pending' || snapshot.recordingStop === 'stopped'
      if (objected && snapshot.recordingStop !== before.recordingStop) return halt('OPPOSITION')
      const failure = snapshot.failure
      if (!failure || failure === before.failure) return
      if (failure.kind === 'SERVER' && SKIPPED.includes(failure.code)) {
        if (snapshot.leadId) latest.current.onSkip(snapshot.leadId)
        return
      }
      if (failure.kind === 'MIC_DENIED') halt('MIC_LOST')
      else if (failure.kind === 'SERVER')
        halt(failure.code === 'PHONE_SUPPRESSED' ? 'OPPOSITION' : 'REFUSED', failure.code)
      else halt('FAILED')
    })
  }, [running, engine, halt])

  // Écouteurs déconnectés : un micro connu disparaît.
  useEffect(() => {
    if (!running || typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return
    let known: string[] | null = null
    let current = true
    const check = () =>
      void listMicrophones().then((list) => {
        if (!current) return
        const ids = list.map((mic) => mic.id)
        if (known && known.some((id) => !ids.includes(id))) halt('MIC_LOST')
        known = ids
      })
    check()
    navigator.mediaDevices.addEventListener('devicechange', check)
    return () => {
      current = false
      navigator.mediaDevices.removeEventListener('devicechange', check)
    }
  }, [running, halt])

  // Onglet fermé ou mis en cache (retour arrière) : rien ne repart tout seul.
  useEffect(() => {
    if (!running) return
    const leave = () => halt('HIDDEN')
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [running, halt])

  const start = useCallback(() => {
    if (latest.current.mode === 'click') return
    setFirst(true)
    setRun((value) => value + 1)
    setStop(null)
    setRunning(true)
  }, [])
  const pause = useCallback(() => halt('PAUSED'), [halt])
  const callNow = useCallback(() => {
    const { leadId: target, softphone: phone } = latest.current
    if (!target || phone.active) return
    setArm(null)
    setFirst(false)
    phone.start(target, latest.current.mode === 'power' ? 'power' : undefined)
  }, [])

  const exhausted = running && idle && !leadId && !softphone.active
  const due = arm && armedKey && arm.key === armedKey && delay !== null ? arm.at + delay * 1000 : null
  return {
    running: running && !exhausted,
    stop: exhausted ? { reason: 'EMPTY' } : stop,
    countdown: due === null ? null : Math.max(0, Math.ceil((due - clock) / 1000)),
    waitingClick: armed && delay === null,
    start,
    pause,
    halt,
    callNow,
  }
}
