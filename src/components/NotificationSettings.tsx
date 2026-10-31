import { useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import './NotificationSettings.css'

interface NotificationSettingsProps {
  title?: string
}

export default function NotificationSettings({ title }: NotificationSettingsProps) {
  const { t } = useI18n()
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

  let statusLabel: MessageKey = 'shared.pushSettings.statusInactive'
  let statusClass = 'idle'
  if (loading) {
    statusLabel = 'shared.pushSettings.statusLoading'
    statusClass = 'idle'
  } else if (!supported) {
    statusLabel = 'shared.pushSettings.statusUnsupported'
    statusClass = 'idle'
  } else if (permission === 'denied') {
    statusLabel = 'shared.pushSettings.statusBlocked'
    statusClass = 'warn'
  } else if (subscribed) {
    statusLabel = 'shared.pushSettings.statusActive'
    statusClass = 'ok'
  } else {
    statusLabel = 'shared.pushSettings.statusInactive'
    statusClass = 'idle'
  }

  const buttonDisabled = loading || working || !supported || permission === 'denied'
  const buttonLabel = working
    ? subscribed
      ? t('shared.pushSettings.disabling')
      : t('shared.pushSettings.enabling')
    : subscribed
      ? t('shared.pushSettings.disable')
      : t('shared.pushSettings.enable')

  return (
    <section className="notification-settings">
      <header className="notification-settings-header">
        <h3>{title ?? t('shared.pushSettings.defaultTitle')}</h3>
        <span className={`notification-settings-status notification-settings-status-${statusClass}`}>
          <span className="notification-settings-dot" aria-hidden="true" />
          {t(statusLabel)}
        </span>
      </header>
      <p className="notification-settings-help">{t('shared.pushSettings.help')}</p>
      {permission === 'denied' && (
        <p className="notification-settings-blocked">{t('shared.pushSettings.blockedHelp')}</p>
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
