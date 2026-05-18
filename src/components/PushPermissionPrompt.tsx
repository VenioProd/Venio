import { useEffect, useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import './PushPermissionPrompt.css'

const SNOOZE_KEY = 'venio-push-snoozed-until'
const SNOOZE_DAYS = 7

function isSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (Number.isNaN(ts)) return false
    return Date.now() < ts
  } catch {
    return false
  }
}

function snooze(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000))
  } catch {
    /* noop */
  }
}

interface PushPermissionPromptProps {
  variant?: 'admin' | 'client'
}

/**
 * Bannière discrète qui propose d'activer les notifications push.
 * Visible uniquement si :
 *  - le navigateur supporte le push
 *  - l'utilisateur n'a pas encore décidé (permission === 'default')
 *  - pas snoozée dans les 7 derniers jours
 */
export default function PushPermissionPrompt({ variant = 'admin' }: PushPermissionPromptProps) {
  const { supported, permission, subscribed, loading, error, enable } = usePushNotifications()
  const [dismissed, setDismissed] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (loading) return
    const shouldShow = supported && permission === 'default' && !subscribed && !isSnoozed()
    setDismissed(!shouldShow)
  }, [loading, supported, permission, subscribed])

  if (dismissed) return null

  const handleEnable = async () => {
    setWorking(true)
    const result = await enable()
    setWorking(false)
    if (result.ok) {
      setDismissed(true)
    }
  }

  const handleDismiss = () => {
    snooze()
    setDismissed(true)
  }

  return (
    <div className={`push-prompt push-prompt-${variant}`} role="region" aria-label="Notifications push">
      <div className="push-prompt-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
      <div className="push-prompt-body">
        <strong>Activer les notifications</strong>
        <span>Reçois un signal instantané pour les messages, livrables et alertes importants.</span>
        {error && <small className="push-prompt-error">{error}</small>}
      </div>
      <div className="push-prompt-actions">
        <button type="button" className="push-prompt-cta" onClick={handleEnable} disabled={working}>
          {working ? 'Activation…' : 'Activer'}
        </button>
        <button type="button" className="push-prompt-dismiss" onClick={handleDismiss} aria-label="Plus tard">
          Plus tard
        </button>
      </div>
    </div>
  )
}
