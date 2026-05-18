import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import './NotificationSettings.css'

interface NotificationSettingsProps {
  title?: string
}

export default function NotificationSettings({ title = 'Notifications push' }: NotificationSettingsProps) {
  const { supported, permission, subscribed, loading, error, enable, disable } = usePushNotifications()
  const [working, setWorking] = useState(false)

  const handleToggle = async () => {
    setWorking(true)
    if (subscribed) {
      await disable()
    } else {
      await enable()
    }
    setWorking(false)
  }

  let statusLabel = 'Inactives'
  let statusClass = 'idle'
  if (loading) {
    statusLabel = 'Chargement…'
    statusClass = 'idle'
  } else if (!supported) {
    statusLabel = 'Non supporté par ce navigateur'
    statusClass = 'idle'
  } else if (permission === 'denied') {
    statusLabel = 'Bloquées par le navigateur'
    statusClass = 'warn'
  } else if (subscribed) {
    statusLabel = 'Actives sur ce navigateur'
    statusClass = 'ok'
  } else {
    statusLabel = 'Inactives'
    statusClass = 'idle'
  }

  const buttonDisabled = loading || working || !supported || permission === 'denied'
  const buttonLabel = working
    ? subscribed ? 'Désactivation…' : 'Activation…'
    : subscribed ? 'Désactiver' : 'Activer'

  return (
    <section className="notification-settings">
      <header className="notification-settings-header">
        <h3>{title}</h3>
        <span className={`notification-settings-status notification-settings-status-${statusClass}`}>
          <span className="notification-settings-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </header>
      <p className="notification-settings-help">
        Quand actives, tu reçois une notification système (mobile et desktop) pour les nouveaux messages,
        mises à jour de projets, livrables et alertes — même quand Venio n'est pas ouvert.
      </p>
      {permission === 'denied' && (
        <p className="notification-settings-blocked">
          Le navigateur bloque les notifications pour ce site. Pour les réactiver,
          ouvre les réglages du site dans le navigateur, autorise les notifications,
          puis recharge cette page.
        </p>
      )}
      {error && <p className="notification-settings-error">{error}</p>}
      <div className="notification-settings-actions">
        <button
          type="button"
          className={`notification-settings-btn ${subscribed ? 'destructive' : 'primary'}`}
          onClick={handleToggle}
          disabled={buttonDisabled}
        >
          {buttonLabel}
        </button>
      </div>
    </section>
  )
}
