import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { AdminUser } from '../../../types/crm.types'
import type { CrmSettingsData, CrmSettingsMessage } from './types'
import AssignmentSection from './AssignmentSection'
import QualificationSection from './QualificationSection'
import StatusSection from './StatusSection'
import NotificationsSection from './NotificationsSection'
import AlertsSection from './AlertsSection'
import EscalationSection from './EscalationSection'
import ScoringSection from './ScoringSection'
import DuplicatesSection from './DuplicatesSection'
import ReportsSection from './ReportsSection'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

export default function CrmSettings() {
  const { user } = useAuth()
  const { t } = useI18n()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_CRM)

  const [settings, setSettings] = useState<CrmSettingsData | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<CrmSettingsMessage | null>(null)

  // Fetch settings and admins
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, adminsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiFetch<{ settings?: Record<string, any> }>('/api/admin/crm/settings'),
        apiFetch<{ users?: AdminUser[] }>('/api/admin/admins'),
      ])
      setSettings(settingsRes.settings || null)
      setAdmins(adminsRes.users || [])
    } catch (err: unknown) {
      console.error('Error fetching CRM settings:', err)
      setMessage({ type: 'error', text: translate('crm.settings.loadError') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const updateSetting = async (key: string, value: unknown) => {
    if (!canManage) return

    const prev = settings?.[key]
    setSettings((s) => (s ? { ...s, [key]: value } : s))

    try {
      setSaving(true)
      await apiFetch('/api/admin/crm/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      })
      setMessage({ type: 'success', text: t('crm.settings.updated') })
      setTimeout(() => setMessage(null), 2000)
    } catch (err: unknown) {
      setSettings((s) => (s ? { ...s, [key]: prev } : s))
      setMessage({ type: 'error', text: t('crm.settings.updateError') })
    } finally {
      setSaving(false)
    }
  }

  const updateNestedSetting = async (parent: string, key: string, value: unknown) => {
    if (!canManage) return

    const prev = settings?.[parent]?.[key]
    setSettings((s) => {
      if (!s) return s
      return { ...s, [parent]: { ...s[parent], [key]: value } }
    })

    try {
      setSaving(true)
      await apiFetch('/api/admin/crm/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [`${parent}.${key}`]: value }),
      })
      setMessage({ type: 'success', text: t('crm.settings.updated') })
      setTimeout(() => setMessage(null), 2000)
    } catch (err: unknown) {
      setSettings((s) => {
        if (!s) return s
        return { ...s, [parent]: { ...s[parent], [key]: prev } }
      })
      setMessage({ type: 'error', text: t('crm.settings.updateError') })
    } finally {
      setSaving(false)
    }
  }

  const handleRecipientsChange = async (value: string) => {
    const emails = value
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    await updateSetting('weeklyReportRecipients', emails)
  }

  if (loading) {
    return (
      <div className="portal-container crm-page-container pilotage-page crm-settings-page">
        <div className="portal-loading">{t('common.loading')}</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="portal-container crm-page-container pilotage-page crm-settings-page">
        <div className="portal-error">{t('crm.settings.cannotLoad')}</div>
      </div>
    )
  }

  const sectionProps = { settings, canManage, updateSetting }

  return (
    <div className="portal-container crm-page-container pilotage-page crm-settings-page">
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.commercial')}
        title={t('crm.settings.title')}
        actions={
          <Link to="/admin/crm" className="portal-button secondary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('crm.settings.backToCrm')}
          </Link>
        }
      />

      {message && <div className={`crm-settings-message crm-settings-message-${message.type}`}>{message.text}</div>}

      <div className="crm-settings-grid">
        <AssignmentSection {...sectionProps} admins={admins} />
        <QualificationSection {...sectionProps} />
        <StatusSection {...sectionProps} />
        <NotificationsSection {...sectionProps} />
        <AlertsSection {...sectionProps} />
        <EscalationSection {...sectionProps} admins={admins} />
        <ScoringSection {...sectionProps} updateNestedSetting={updateNestedSetting} />
        <DuplicatesSection {...sectionProps} />
        <ReportsSection {...sectionProps} handleRecipientsChange={handleRecipientsChange} />
      </div>

      {saving && <div className="crm-settings-saving">{t('crm.common.saving')}</div>}
    </div>
  )
}
