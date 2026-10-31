import { useEffect, useState } from 'react'
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_TYPE_LABEL_KEYS,
  type ChannelPreferences,
  type NotificationChannel,
  type NotificationType,
} from '../services/notificationPreferences'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import './NotificationPreferencesPanel.css'

const CHANNELS: { key: NotificationChannel; label: MessageKey; hint: MessageKey }[] = [
  { key: 'inApp', label: 'shared.notifPrefs.channelInApp', hint: 'shared.notifPrefs.channelInAppHint' },
  { key: 'push', label: 'shared.notifPrefs.channelPush', hint: 'shared.notifPrefs.channelPushHint' },
  { key: 'email', label: 'shared.notifPrefs.channelEmail', hint: 'shared.notifPrefs.channelEmailHint' },
]

export default function NotificationPreferencesPanel() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<Record<NotificationType, ChannelPreferences> | null>(null)
  const [types, setTypes] = useState<NotificationType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetchNotificationPreferences()
        if (cancelled) return
        setPrefs(res.preferences)
        setTypes(res.types)
      } catch (err) {
        if (!cancelled) setError((err as Error).message || t('shared.notifPrefs.loadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleToggle = async (type: NotificationType, channel: NotificationChannel) => {
    if (!prefs) return
    const next = {
      ...prefs,
      [type]: { ...prefs[type], [channel]: !prefs[type][channel] },
    }
    setPrefs(next)
    setSaving(true)
    setError(null)
    try {
      const res = await updateNotificationPreferences({ [type]: { [channel]: next[type][channel] } })
      setPrefs(res.preferences)
      setSavedAt(Date.now())
    } catch (err) {
      setError((err as Error).message || t('shared.notifPrefs.saveError'))
      // Rollback local
      setPrefs(prefs)
    } finally {
      setSaving(false)
    }
  }

  const handleBulk = async (channel: NotificationChannel, value: boolean) => {
    if (!prefs) return
    const next = { ...prefs }
    for (const type of types) {
      next[type] = { ...next[type], [channel]: value }
    }
    setPrefs(next)
    setSaving(true)
    setError(null)
    try {
      const payload = {} as Record<NotificationType, Partial<ChannelPreferences>>
      for (const type of types) payload[type] = { [channel]: value }
      const res = await updateNotificationPreferences(payload)
      setPrefs(res.preferences)
      setSavedAt(Date.now())
    } catch (err) {
      setError((err as Error).message || t('shared.notifPrefs.saveError'))
      setPrefs(prefs)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="notif-prefs">
      <header className="notif-prefs-header">
        <div>
          <h3>{t('shared.notifPrefs.title')}</h3>
          <p>{t('shared.notifPrefs.intro')}</p>
        </div>
        {saving && <span className="notif-prefs-status saving">{t('shared.notifPrefs.saving')}</span>}
        {!saving && savedAt && <span className="notif-prefs-status saved">{t('shared.notifPrefs.saved')}</span>}
      </header>

      {error && <p className="notif-prefs-error">{error}</p>}

      {loading ? (
        <div className="notif-prefs-loading">
          <span className="notif-prefs-spinner" aria-hidden="true" />
          <span>{t('shared.notifPrefs.loading')}</span>
        </div>
      ) : prefs ? (
        <div className="notif-prefs-table-wrap">
          <table className="notif-prefs-table">
            <thead>
              <tr>
                <th scope="col" className="notif-prefs-th-type">
                  {t('shared.notifPrefs.colType')}
                </th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} scope="col" className="notif-prefs-th-channel">
                    <span className="notif-prefs-channel-label">{t(channel.label)}</span>
                    <span className="notif-prefs-channel-hint">{t(channel.hint)}</span>
                    <div className="notif-prefs-bulk">
                      <button
                        type="button"
                        className="notif-prefs-bulk-btn"
                        onClick={() => handleBulk(channel.key, true)}
                        title={t('shared.notifPrefs.enableAllFor', { channel: t(channel.label) })}
                      >
                        {t('shared.notifPrefs.all')}
                      </button>
                      <button
                        type="button"
                        className="notif-prefs-bulk-btn"
                        onClick={() => handleBulk(channel.key, false)}
                        title={t('shared.notifPrefs.disableAllFor', { channel: t(channel.label) })}
                      >
                        {t('shared.notifPrefs.none')}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((type) => {
                const labelKeys = NOTIFICATION_TYPE_LABEL_KEYS[type]
                const label = labelKeys
                  ? { label: t(labelKeys.label), description: t(labelKeys.description) }
                  : { label: type, description: '' }
                return (
                  <tr key={type}>
                    <th scope="row" className="notif-prefs-row-type">
                      <strong>{label.label}</strong>
                      <span>{label.description}</span>
                    </th>
                    {CHANNELS.map((channel) => {
                      const checked = prefs[type]?.[channel.key] !== false
                      return (
                        <td key={channel.key} className="notif-prefs-td">
                          <label className="notif-toggle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggle(type, channel.key)}
                              aria-label={`${label.label} — ${t(channel.label)}`}
                            />
                            <span className="notif-toggle-slider" aria-hidden="true" />
                          </label>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
