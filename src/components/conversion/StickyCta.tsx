import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { isAdminRole } from '../../lib/permissions'
import DualCta from './DualCta'
import './StickyCta.css'

/**
 * Clé de consentement recopiée de CookieConsent.tsx, qui ne l'exporte pas.
 * C'est la seule source de vérité : le bandeau s'affiche tant que la clé est
 * absente, la barre flottante doit donc rester masquée dans ce cas — les deux
 * occupent le même bas d'écran, et le bandeau est à z-index 9998.
 */
const CONSENT_KEY = 'venio_cookie_consent'

/** Le choix cookie n'émet pas d'événement dans l'onglet courant : on sonde. */
const CONSENT_POLL_MS = 800

/** Part du premier écran à franchir avant que la barre n'apparaisse. */
const REVEAL_RATIO = 0.9

const hasCookieChoice = (): boolean => {
  try {
    return Boolean(window.localStorage.getItem(CONSENT_KEY))
  } catch {
    // Stockage inaccessible : le bandeau ne s'affiche pas non plus, la barre
    // n'a donc rien à esquiver.
    return true
  }
}

/**
 * Barre d'action persistante du site public. Elle n'apparaît qu'après le
 * premier écran pour ne pas doubler le DualCta du hero, se tient sous la
 * navbar (z-index 900 contre 1000), cède la place au bandeau cookies et
 * réserve sa hauteur au pied de page via --mc-sticky-h.
 */
const StickyCta = () => {
  const { user } = useAuth()
  const barRef = useRef<HTMLDivElement>(null)
  const [scrolledPast, setScrolledPast] = useState(false)
  const [consentSettled, setConsentSettled] = useState(hasCookieChoice)

  useEffect(() => {
    const evaluate = () => {
      setScrolledPast(window.scrollY > window.innerHeight * REVEAL_RATIO)
    }
    evaluate()
    window.addEventListener('scroll', evaluate, { passive: true })
    window.addEventListener('resize', evaluate)
    return () => {
      window.removeEventListener('scroll', evaluate)
      window.removeEventListener('resize', evaluate)
    }
  }, [])

  useEffect(() => {
    if (consentSettled) return
    const check = () => {
      if (hasCookieChoice()) setConsentSettled(true)
    }
    const timer = window.setInterval(check, CONSENT_POLL_MS)
    window.addEventListener('storage', check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', check)
    }
  }, [consentSettled])

  const isAdmin = Boolean(user && isAdminRole(user.role))
  const visible = scrolledPast && consentSettled && !isAdmin

  // La hauteur réelle est posée sur <html> : le pied de page la consomme en
  // padding-bottom (voir StickyCta.css), et elle retombe à sa valeur par
  // défaut dès que la barre disparaît.
  useEffect(() => {
    if (!visible) return
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--mc-sticky-h', `${barRef.current?.offsetHeight ?? 0}px`)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--mc-sticky-h')
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="mc-sticky" ref={barRef} role="region" aria-label="Prendre rendez-vous">
      <div className="mc-sticky-inner mc-container">
        <p className="mc-sticky-label">Parlons de votre projet</p>
        <DualCta />
      </div>
    </div>
  )
}

export default StickyCta
