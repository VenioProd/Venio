import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import type { AdminUser } from '../../types/crm.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const AUTOMATION_CATEGORIES = [
  {
    id: 'assignment',
    label: 'Attribution automatique',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'qualification',
    label: 'Qualification',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  {
    id: 'status',
    label: 'Changements de statut',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: 'alerts',
    label: 'Alertes & Rappels',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    id: 'escalation',
    label: 'Escalade',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    id: 'scoring',
    label: 'Scoring',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    id: 'duplicates',
    label: 'Détection doublons',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

export default function CrmSettings() {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_CRM)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<Record<string, any> | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null)

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
        {/* ASSIGNMENT */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'assignment')?.icon}
            <h2>Attribution automatique</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Round-robin</h3>
              <p>Attribuer automatiquement les nouveaux leads aux commerciaux à tour de rôle</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.roundRobinEnabled}
                onChange={(e) => updateSetting('roundRobinEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>
        </section>

        {/* QUALIFICATION */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'qualification')?.icon}
            <h2>Qualification</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Auto-qualification</h3>
              <p>Qualifier automatiquement les leads avec budget et source renseignés</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.autoQualifyEnabled}
                onChange={(e) => updateSetting('autoQualifyEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>
        </section>

        {/* STATUS CHANGES */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'status')?.icon}
            <h2>Changements de statut</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Mise à jour date de contact</h3>
              <p>Mettre à jour "Dernier contact" lors du passage en CONTACTÉ</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.autoLastContactOnContacted}
                onChange={(e) => updateSetting('autoLastContactOnContacted', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Rappel post-démo</h3>
              <p>Créer automatiquement une action de suivi après une démo</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.autoNextActionOnDemo}
                  onChange={(e) => updateSetting('autoNextActionOnDemo', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.autoNextActionOnDemo && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.demoFollowUpDays}
                    onChange={(e) => updateSetting('demoFollowUpDays', parseInt(e.target.value) || 1)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Rappel post-proposition</h3>
              <p>Créer automatiquement une action de suivi après envoi d'une proposition</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.autoNextActionOnProposal}
                  onChange={(e) => updateSetting('autoNextActionOnProposal', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.autoNextActionOnProposal && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.proposalFollowUpDays}
                    onChange={(e) => updateSetting('proposalFollowUpDays', parseInt(e.target.value) || 3)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Effacer action à la clôture</h3>
              <p>Effacer la prochaine action lors du passage en WON/LOST</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.clearNextActionOnClose}
                onChange={(e) => updateSetting('clearNextActionOnClose', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>
        </section>

        {/* NOTIFICATIONS */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'notifications')?.icon}
            <h2>Notifications</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Email à l'assignation</h3>
              <p>Envoyer un email au commercial lors de l'attribution d'un lead</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.emailOnAssignment}
                onChange={(e) => updateSetting('emailOnAssignment', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Journalisation des activités</h3>
              <p>Enregistrer un historique de toutes les actions sur les leads</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.activityLogging}
                onChange={(e) => updateSetting('activityLogging', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>
        </section>

        {/* ALERTS */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'alerts')?.icon}
            <h2>Alertes & Rappels</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Alerte leads froids</h3>
              <p>Afficher une alerte pour les leads sans contact depuis X jours</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.coldLeadAlertEnabled}
                  onChange={(e) => updateSetting('coldLeadAlertEnabled', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.coldLeadAlertEnabled && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.coldLeadThresholdDays}
                    onChange={(e) => updateSetting('coldLeadThresholdDays', parseInt(e.target.value) || 7)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>Email de rappel (leads froids)</h3>
              <p>Envoyer un email quotidien aux commerciaux pour leurs leads froids</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.coldLeadEmailEnabled}
                onChange={(e) => updateSetting('coldLeadEmailEnabled', e.target.checked)}
                disabled={!canManage || !settings.coldLeadAlertEnabled}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Alerte actions en retard</h3>
              <p>Afficher une alerte pour les leads avec une action en retard</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.overdueAlertEnabled}
                onChange={(e) => updateSetting('overdueAlertEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          <div className="crm-settings-item crm-settings-item-sub">
            <div className="crm-settings-item-info">
              <h3>Email quotidien (retards)</h3>
              <p>Envoyer un email quotidien récapitulant les actions en retard</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.dailyOverdueEmailEnabled}
                  onChange={(e) => updateSetting('dailyOverdueEmailEnabled', e.target.checked)}
                  disabled={!canManage || !settings.overdueAlertEnabled}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.dailyOverdueEmailEnabled && (
                <div className="crm-settings-inline-input">
                  <span>à</span>
                  <input
                    type="time"
                    value={settings.dailyOverdueEmailTime}
                    onChange={(e) => updateSetting('dailyOverdueEmailTime', e.target.value)}
                    disabled={!canManage}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Alerte leads bloqués</h3>
              <p>Afficher une alerte pour les leads sans changement de statut depuis X jours</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.staleLeadAlertEnabled}
                  onChange={(e) => updateSetting('staleLeadAlertEnabled', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.staleLeadAlertEnabled && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.staleLeadThresholdDays}
                    onChange={(e) => updateSetting('staleLeadThresholdDays', parseInt(e.target.value) || 14)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Rappel proposition</h3>
              <p>Envoyer un rappel pour les leads en PROPOSITION depuis X jours</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.proposalReminderEnabled}
                  onChange={(e) => updateSetting('proposalReminderEnabled', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.proposalReminderEnabled && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.proposalReminderDays}
                    onChange={(e) => updateSetting('proposalReminderDays', parseInt(e.target.value) || 7)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ESCALATION */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'escalation')?.icon}
            <h2>Escalade</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Escalade sur inactivité</h3>
              <p>Escalader automatiquement les leads sans activité depuis X jours</p>
            </div>
            <div className="crm-settings-item-controls">
              <label className="crm-toggle">
                <input
                  type="checkbox"
                  checked={settings.escalationEnabled}
                  onChange={(e) => updateSetting('escalationEnabled', e.target.checked)}
                  disabled={!canManage}
                />
                <span className="crm-toggle-slider" />
              </label>
              {settings.escalationEnabled && (
                <div className="crm-settings-inline-input">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={settings.escalationThresholdDays}
                    onChange={(e) => updateSetting('escalationThresholdDays', parseInt(e.target.value) || 10)}
                    disabled={!canManage}
                  />
                  <span>jour(s)</span>
                </div>
              )}
            </div>
          </div>

          {settings.escalationEnabled && (
            <>
              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Action d'escalade</h3>
                  <p>Que faire lors de l'escalade</p>
                </div>
                <CustomSelect
                  className="crm-settings-select"
                  value={settings.escalationAction}
                  onChange={(v) => updateSetting('escalationAction', v)}
                  options={[
                    { value: 'NOTIFY_MANAGER', label: 'Notifier le manager' },
                    { value: 'REASSIGN', label: 'Réassigner à un autre commercial' },
                    { value: 'BOTH', label: 'Les deux' },
                  ]}
                />
              </div>

              {(settings.escalationAction === 'NOTIFY_MANAGER' || settings.escalationAction === 'BOTH') && (
                <div className="crm-settings-item crm-settings-item-sub">
                  <div className="crm-settings-item-info">
                    <h3>Manager à notifier</h3>
                    <p>Sélectionner le manager qui recevra les notifications</p>
                  </div>
                  <CustomSelect
                    className="crm-settings-select"
                    value={settings.escalationManagerId || ''}
                    onChange={(v) => updateSetting('escalationManagerId', v || null)}
                    options={[{ value: '', label: '-- Sélectionner --' }, ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.email})` }))]}
                  />
                </div>
              )}
            </>
          )}
        </section>

        {/* SCORING */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'scoring')?.icon}
            <h2>Scoring automatique</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Activer le scoring</h3>
              <p>Calculer automatiquement un score pour chaque lead</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.scoringEnabled}
                onChange={(e) => updateSetting('scoringEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          {settings.scoringEnabled && (
            <div className="crm-settings-scoring-weights">
              <h4>Pondérations (sur 100 points)</h4>
              
              <div className="crm-settings-weight-group">
                <span className="crm-settings-weight-label">Budget</span>
                <div className="crm-settings-weight-row">
                  <label>&gt; 10K€</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.budgetHigh || 30}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'budgetHigh', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>1K-10K€</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.budgetMedium || 15}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'budgetMedium', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>&lt; 1K€</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.budgetLow || 5}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'budgetLow', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="crm-settings-weight-group">
                <span className="crm-settings-weight-label">Source</span>
                <div className="crm-settings-weight-row">
                  <label>Recommandation</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.sourceReferral || 25}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'sourceReferral', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>Publicité</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.sourceAds || 15}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'sourceAds', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>Autre</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.sourceOther || 10}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'sourceOther', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="crm-settings-weight-group">
                <span className="crm-settings-weight-label">Priorité</span>
                <div className="crm-settings-weight-row">
                  <label>Urgente</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.priorityUrgent || 20}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'priorityUrgent', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>Haute</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.priorityHigh || 15}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'priorityHigh', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>Normale</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.priorityNormal || 5}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'priorityNormal', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="crm-settings-weight-group">
                <span className="crm-settings-weight-label">Contact</span>
                <div className="crm-settings-weight-row">
                  <label>Email renseigné</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.hasEmail || 10}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'hasEmail', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
                <div className="crm-settings-weight-row">
                  <label>Téléphone renseigné</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={settings.scoringWeights?.hasPhone || 10}
                    onChange={(e) => updateNestedSetting('scoringWeights', 'hasPhone', parseInt(e.target.value) || 0)}
                    disabled={!canManage}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* DUPLICATES */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'duplicates')?.icon}
            <h2>Détection de doublons</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Activer la détection</h3>
              <p>Vérifier les doublons potentiels lors de la création d'un lead</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.duplicateDetectionEnabled}
                onChange={(e) => updateSetting('duplicateDetectionEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          {settings.duplicateDetectionEnabled && (
            <>
              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Vérifier l'email</h3>
                  <p>Détecter les leads avec le même email de contact</p>
                </div>
                <label className="crm-toggle">
                  <input
                    type="checkbox"
                    checked={settings.duplicateCheckEmail}
                    onChange={(e) => updateSetting('duplicateCheckEmail', e.target.checked)}
                    disabled={!canManage}
                  />
                  <span className="crm-toggle-slider" />
                </label>
              </div>

              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Vérifier l'entreprise</h3>
                  <p>Détecter les leads avec le même nom d'entreprise</p>
                </div>
                <label className="crm-toggle">
                  <input
                    type="checkbox"
                    checked={settings.duplicateCheckCompany}
                    onChange={(e) => updateSetting('duplicateCheckCompany', e.target.checked)}
                    disabled={!canManage}
                  />
                  <span className="crm-toggle-slider" />
                </label>
              </div>

              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Vérifier le téléphone</h3>
                  <p>Détecter les leads avec le même numéro de téléphone</p>
                </div>
                <label className="crm-toggle">
                  <input
                    type="checkbox"
                    checked={settings.duplicateCheckPhone}
                    onChange={(e) => updateSetting('duplicateCheckPhone', e.target.checked)}
                    disabled={!canManage}
                  />
                  <span className="crm-toggle-slider" />
                </label>
              </div>
            </>
          )}
        </section>

        {/* WEEKLY REPORT */}
        <section className="crm-settings-section">
          <div className="crm-settings-section-header">
            {AUTOMATION_CATEGORIES.find((c) => c.id === 'reports')?.icon}
            <h2>Rapport hebdomadaire</h2>
          </div>

          <div className="crm-settings-item">
            <div className="crm-settings-item-info">
              <h3>Activer le rapport</h3>
              <p>Envoyer un rapport hebdomadaire automatique</p>
            </div>
            <label className="crm-toggle">
              <input
                type="checkbox"
                checked={settings.weeklyReportEnabled}
                onChange={(e) => updateSetting('weeklyReportEnabled', e.target.checked)}
                disabled={!canManage}
              />
              <span className="crm-toggle-slider" />
            </label>
          </div>

          {settings.weeklyReportEnabled && (
            <>
              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Jour d'envoi</h3>
                  <p>Jour de la semaine pour l'envoi du rapport</p>
                </div>
                <CustomSelect
                  className="crm-settings-select"
                  value={String(settings.weeklyReportDay)}
                  onChange={(v) => updateSetting('weeklyReportDay', parseInt(v))}
                  options={[
                    { value: '0', label: 'Dimanche' },
                    { value: '1', label: 'Lundi' },
                    { value: '2', label: 'Mardi' },
                    { value: '3', label: 'Mercredi' },
                    { value: '4', label: 'Jeudi' },
                    { value: '5', label: 'Vendredi' },
                    { value: '6', label: 'Samedi' },
                  ]}
                />
              </div>

              <div className="crm-settings-item crm-settings-item-sub">
                <div className="crm-settings-item-info">
                  <h3>Heure d'envoi</h3>
                  <p>Heure à laquelle le rapport est envoyé</p>
                </div>
                <input
                  type="time"
                  className="crm-settings-time-input"
                  value={settings.weeklyReportTime}
                  onChange={(e) => updateSetting('weeklyReportTime', e.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="crm-settings-item crm-settings-item-sub crm-settings-item-full">
                <div className="crm-settings-item-info">
                  <h3>Destinataires</h3>
                  <p>Emails séparés par des virgules</p>
                </div>
                <input
                  type="text"
                  className="crm-settings-text-input"
                  placeholder="email1@example.com, email2@example.com"
                  value={(settings.weeklyReportRecipients || []).join(', ')}
                  onBlur={(e) => handleRecipientsChange(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {saving && <div className="crm-settings-saving">Enregistrement...</div>}
    </div>
  )
}
