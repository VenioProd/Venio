import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { canAdministerCrm } from '../../../lib/crmAccess'
import type { AdminUser } from '../../../types/crm.types'
import type { CrmSettingsData, CrmSettingsMessage } from './types'
import CallsSection from './CallsSection'
import AssignmentSection from './AssignmentSection'
import QualificationSection from './QualificationSection'
import StatusSection from './StatusSection'
import NotificationsSection from './NotificationsSection'
import AlertsSection from './AlertsSection'
import EscalationSection from './EscalationSection'
import ScoringSection from './ScoringSection'
import DuplicatesSection from './DuplicatesSection'
import ReportsSection from './ReportsSection'
import RetentionSection from './RetentionSection'
import SuppressionSection from './SuppressionSection'
import TelephonySection from './TelephonySection'
import RecordingSection from './RecordingSection'
import TranscriptionSection from './TranscriptionSection'
import AnalysisSection from './AnalysisSection'
import type { Providers } from './callAiModel'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

export default function CrmSettings() {
  const { user } = useAuth()
  const { t } = useI18n()
  const canManage = canAdministerCrm(user)

  const [settings, setSettings] = useState<CrmSettingsData | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [providers, setProviders] = useState<Providers | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<CrmSettingsMessage | null>(null)

  // Fetch settings and admins
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, adminsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiFetch<{ settings?: Record<string, any>; providers?: Providers }>('/api/admin/crm/settings'),
        apiFetch<{ users?: AdminUser[] }>('/api/admin/admins'),
      ])
      setSettings(settingsRes.settings || null)
      setProviders(settingsRes.providers ?? null)
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

  const updateSettings = async (updates: Record<string, unknown>) => {
    if (!canManage) return
    const previous = Object.fromEntries(Object.keys(updates).map((key) => [key, settings?.[key]]))
    setSettings((current) => (current ? { ...current, ...updates } : current))
    try {
      setSaving(true)
      await apiFetch('/api/admin/crm/settings', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      setMessage({ type: 'success', text: t('crm.settings.updated') })
      setTimeout(() => setMessage(null), 2000)
    } catch {
      setSettings((current) => (current ? { ...current, ...previous } : current))
      setMessage({ type: 'error', text: t('crm.settings.updateError') })
    } finally {
      setSaving(false)
    }
  }
  const updateSetting = (key: string, value: unknown) => updateSettings({ [key]: value })

  // Les blocs d'appel s'enregistrent en entier et montrent le refus du serveur à côté de leurs champs.
  const saveBlock = async (name: string, value: unknown): Promise<string | null> => {
    if (!canManage) return null
    try {
      setSaving(true)
      await apiFetch('/api/admin/crm/settings', { method: 'PATCH', body: JSON.stringify({ [name]: value }) })
      setSettings((current) => (current ? { ...current, [name]: value } : current))
      setMessage({ type: 'success', text: t('crmCallAi.saved') })
      setTimeout(() => setMessage(null), 2000)
      return null
    } catch (err) {
      return (err as Error).message || t('crm.settings.updateError')
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
    } catch {
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
  const callAiProps = { settings, providers, canManage, saveBlock }

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

      {message &&
        createPortal(
          <div role="status" className={`crm-settings-toast crm-settings-message crm-settings-message-${message.type}`}>
            {message.text}
          </div>,
          document.body,
        )}

      {!canManage && (
        <div className="crm-settings-message crm-settings-readonly" role="note">
          {t('crm.settings.readOnly')}
        </div>
      )}

      <nav className="crm-settings-summary" aria-label={t('crm.settings.summary')}>
        {(['qualification', 'followup', 'callsAi', 'calls', 'compliance', 'reports'] as const).map((group) => (
          <a key={group} href={`#crm-settings-${group}`}>
            {t(`crm.settings.group.${group}`)}
          </a>
        ))}
      </nav>
      <div className="crm-settings-grid">
        <section id="crm-settings-qualification" className="crm-settings-group">
          <h2>{t('crm.settings.group.qualification')}</h2>
          <AssignmentSection {...sectionProps} admins={admins} />
          <QualificationSection {...sectionProps} />
          <StatusSection {...sectionProps} />
          <ScoringSection {...sectionProps} updateNestedSetting={updateNestedSetting} />
          <DuplicatesSection {...sectionProps} />
        </section>
        <section id="crm-settings-followup" className="crm-settings-group">
          <h2>{t('crm.settings.group.followup')}</h2>
          <NotificationsSection {...sectionProps} />
          <AlertsSection {...sectionProps} />
          <EscalationSection {...sectionProps} admins={admins} />
        </section>
        <section id="crm-settings-callsAi" className="crm-settings-group">
          <h2>{t('crm.settings.group.callsAi')}</h2>
          <p className="crm-ai-intro">{t('crmCallAi.intro')}</p>
          <div className="crm-ai-columns">
            <TelephonySection {...callAiProps} />
            <div className="crm-ai-stack">
              <RecordingSection {...callAiProps} />
              <TranscriptionSection {...callAiProps} />
            </div>
          </div>
          <AnalysisSection {...callAiProps} />
        </section>
        <section id="crm-settings-calls" className="crm-settings-group">
          <h2>{t('crm.settings.group.calls')}</h2>
          <CallsSection {...sectionProps} updateSettings={updateSettings} />
        </section>
        <section id="crm-settings-compliance" className="crm-settings-group">
          <h2>{t('crm.settings.group.compliance')}</h2>
          <RetentionSection {...sectionProps} />
          <SuppressionSection canManage={canManage} />
        </section>
        <section id="crm-settings-reports" className="crm-settings-group">
          <h2>{t('crm.settings.group.reports')}</h2>
          <ReportsSection {...sectionProps} handleRecipientsChange={handleRecipientsChange} />
        </section>
      </div>

      {saving &&
        createPortal(
          <div className="crm-settings-saving" role="status">
            {t('crm.common.saving')}
          </div>,
          document.body,
        )}
    </div>
  )
}
