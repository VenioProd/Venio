import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
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
        apiFetch<{ admins?: AdminUser[] }>('/api/admin/admins'),
      ])
      setSettings(settingsRes.settings || null)
      setAdmins(adminsRes.admins || [])
    } catch (err: unknown) {
      console.error('Error fetching CRM settings:', err)
      setMessage({ type: 'error', text: 'Erreur lors du chargement des paramètres' })
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
    setSettings((s) => s ? { ...s, [key]: value } : s)

    try {
      setSaving(true)
      await apiFetch('/api/admin/crm/settings', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      })
      setMessage({ type: 'success', text: 'Paramètre mis à jour' })
      setTimeout(() => setMessage(null), 2000)
    } catch (err: unknown) {
      setSettings((s) => s ? { ...s, [key]: prev } : s)
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour' })
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
      setMessage({ type: 'success', text: 'Paramètre mis à jour' })
      setTimeout(() => setMessage(null), 2000)
    } catch (err: unknown) {
      setSettings((s) => {
        if (!s) return s
        return { ...s, [parent]: { ...s[parent], [key]: prev } }
      })
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour' })
    } finally {
      setSaving(false)
    }
  }

  const handleRecipientsChange = async (value: string) => {
    const emails = value.split(',').map((e) => e.trim()).filter(Boolean)
    await updateSetting('weeklyReportRecipients', emails)
  }

  if (loading) {
    return (
      <div className="portal-container crm-page-container">
        <div className="portal-loading">Chargement...</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="portal-container crm-page-container">
        <div className="portal-error">Impossible de charger les paramètres</div>
      </div>
    )
  }

  const sectionProps = { settings, canManage, updateSetting }

  return (
    <div className="portal-container crm-page-container">
      <div className="portal-header">
        <Link to="/admin/crm" className="portal-back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour au CRM
        </Link>
        <h1>Configuration des automatisations CRM</h1>
      </div>

      {message && (
        <div className={`crm-settings-message crm-settings-message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="crm-settings-grid">
        <AssignmentSection {...sectionProps} />
        <QualificationSection {...sectionProps} />
        <StatusSection {...sectionProps} />
        <NotificationsSection {...sectionProps} />
        <AlertsSection {...sectionProps} />
        <EscalationSection {...sectionProps} admins={admins} />
        <ScoringSection {...sectionProps} updateNestedSetting={updateNestedSetting} />
        <DuplicatesSection {...sectionProps} />
        <ReportsSection {...sectionProps} handleRecipientsChange={handleRecipientsChange} />
      </div>

      {saving && <div className="crm-settings-saving">Enregistrement...</div>}
    </div>
  )
}
