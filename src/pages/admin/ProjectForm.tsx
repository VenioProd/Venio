import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { AdminUser } from '../../types/crm.types'
import {
  formatCurrency,
  parseCurrency,
  toDateTimeLocal,
  fromDateTimeLocal,
  SUGGESTIONS_SERVICE_TYPES,
  SUGGESTIONS_DELIVERABLE_TYPES,
  SUGGESTIONS_TAGS,
} from '../../lib/formatUtils'
import type { User } from '../../types/auth.types'
import type { Project } from '../../types/project.types'
import type { ProjectTemplate } from '../../types/template.types'
import { fetchTemplates } from '../../services/templates'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const ProjectForm = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [clients, setClients] = useState<User[]>([])
  const [form, setForm] = useState<{
    clientId: string
    name: string
    description: string
    status: string
    projectNumber: string
    startDate: string
    endDate: string
    deliveredAt: string
    priority: string
    responsible: string
    assignedTo: string
    summary: string
    internalNotes: string
    serviceTypes: string[]
    deliverableTypes: string[]
    deadlines: { label: string; dueAt: string }[]
    budget: { amount: number | ''; currency: string; note: string }
    tags: string[]
    billing: { amountInvoiced: number | ''; billingStatus: string; quoteReference: string }
    reminderAt: string
    isArchived: boolean
  }>({
    clientId: searchParams.get('clientId') || '',
    name: '',
    description: '',
    status: 'EN_COURS',
    projectNumber: '',
    startDate: '',
    endDate: '',
    deliveredAt: '',
    priority: 'NORMALE',
    responsible: '',
    assignedTo: '',
    summary: '',
    internalNotes: '',
    serviceTypes: [],
    deliverableTypes: [],
    deadlines: [],
    budget: { amount: '', currency: 'EUR', note: '' },
    tags: [],
    billing: { amountInvoiced: '', billingStatus: 'NON_FACTURE', quoteReference: '' },
    reminderAt: '',
    isArchived: false,
  })
  const [serviceTypeInput, setServiceTypeInput] = useState<string>('')
  const [deliverableTypeInput, setDeliverableTypeInput] = useState<string>('')
  const [tagInput, setTagInput] = useState<string>('')
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsData, templatesData, adminsData] = await Promise.all([
          apiFetch<{ users?: User[] }>('/api/admin/users?role=CLIENT'),
          fetchTemplates().catch(() => []),
          apiFetch<{ users?: AdminUser[] }>('/api/admin/admins').catch(() => ({ users: [] })),
        ])
        setClients(clientsData.users || [])
        setTemplates(templatesData)
        setAdmins(adminsData.users || [])
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement comptes')
      }
    }
    load()
  }, [])

  const applyTemplate = (templateId: string) => {
    const t = templates.find((tpl) => tpl._id === templateId)
    if (!t) return
    setForm((prev) => ({
      ...prev,
      description: t.description || prev.description,
      serviceTypes: t.serviceTypes.length > 0 ? t.serviceTypes : prev.serviceTypes,
      deliverableTypes: t.deliverableTypes.length > 0 ? t.deliverableTypes : prev.deliverableTypes,
      tags: t.tags.length > 0 ? t.tags : prev.tags,
      priority: t.priority || prev.priority,
      budget: t.budget?.amount ? { amount: t.budget.amount, currency: t.budget.currency || 'EUR', note: '' } : prev.budget,
    }))
  }

  const addServiceType = () => {
    const v = serviceTypeInput.trim()
    if (v && !form.serviceTypes.includes(v)) {
      setForm({ ...form, serviceTypes: [...form.serviceTypes, v] })
      setServiceTypeInput('')
    }
  }

  const removeServiceType = (index: number) => {
    setForm({ ...form, serviceTypes: form.serviceTypes.filter((_, i) => i !== index) })
  }

  const addDeliverableType = () => {
    const v = deliverableTypeInput.trim()
    if (v && !form.deliverableTypes.includes(v)) {
      setForm({ ...form, deliverableTypes: [...form.deliverableTypes, v] })
      setDeliverableTypeInput('')
    }
  }

  const removeDeliverableType = (index: number) => {
    setForm({ ...form, deliverableTypes: form.deliverableTypes.filter((_, i) => i !== index) })
  }

  const addDeadline = () => {
    setForm({
      ...form,
      deadlines: [...form.deadlines, { label: '', dueAt: '' }],
    })
  }

  const updateDeadline = (index: number, field: string, value: string) => {
    const next = [...form.deadlines]
    next[index] = { ...next[index], [field]: value }
    setForm({ ...form, deadlines: next })
  }

  const deadlineDueAtDisplay = (dueAt: string): string => (dueAt ? toDateTimeLocal(dueAt) : '')

  const removeDeadline = (index: number) => {
    setForm({ ...form, deadlines: form.deadlines.filter((_, i) => i !== index) })
  }

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !form.tags.includes(v)) {
      setForm({ ...form, tags: [...form.tags, v] })
      setTagInput('')
    }
  }

  const removeTag = (index: number) => {
    setForm({ ...form, tags: form.tags.filter((_, i) => i !== index) })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        clientId: form.clientId,
        name: form.name,
        description: form.description,
        status: form.status,
        projectNumber: form.projectNumber || '',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        deliveredAt: form.deliveredAt ? new Date(form.deliveredAt).toISOString() : null,
        priority: form.priority,
        responsible: form.responsible || '',
        assignedTo: form.assignedTo || null,
        summary: form.summary || '',
        internalNotes: form.internalNotes || '',
        serviceTypes: form.serviceTypes,
        deliverableTypes: form.deliverableTypes,
        deadlines: form.deadlines
          .filter((d) => d.label?.trim() || d.dueAt)
          .map((d) => ({
            label: d.label || '',
            dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null,
          })),
        budget: {
          amount: form.budget.amount === '' ? null : Number(form.budget.amount),
          currency: form.budget.currency || 'EUR',
          note: form.budget.note || '',
        },
        tags: form.tags,
        billing: {
          amountInvoiced: form.billing.amountInvoiced === '' ? null : Number(form.billing.amountInvoiced),
          billingStatus: form.billing.billingStatus || 'NON_FACTURE',
          quoteReference: form.billing.quoteReference || '',
        },
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        isArchived: form.isArchived,
      }
      if (Number.isNaN(payload.budget.amount)) payload.budget.amount = null
      if (Number.isNaN(payload.billing.amountInvoiced)) payload.billing.amountInvoiced = null
      const data = await apiFetch<{ project: Project }>('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      navigate(`/admin/projets/${data.project._id}`)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur creation projet')
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Nouveau projet</span>
        </div>
        <div className="admin-header">
          <div>
            <h1>Créer un nouveau projet</h1>
            <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0', fontSize: '15px' }}>
              Configurez tous les paramètres du projet pour une gestion optimale
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {templates.length > 0 && (
          <div className="project-form-section" style={{ marginBottom: 16 }}>
            <div className="project-form-section-header">
              <div className="project-form-section-icon">{'\u{1F4CB}'}</div>
              <div>
                <h2 className="project-form-section-title">Template</h2>
                <p className="project-form-section-subtitle">Pre-remplir a partir d'un modele existant</p>
              </div>
            </div>
            <div className="portal-list">
              <CustomSelect
                className="portal-input"
                value=""
                onChange={(v) => { if (v) applyTemplate(v) }}
                options={[{ value: '', label: '-- Aucun template (formulaire vide) --' }, ...templates.map((t) => ({ value: t._id, label: t.name }))]}
              />
            </div>
          </div>
        )}
        <div className="project-form-container">
          {/* Section 1: Informations de base */}
          <div className="project-form-section">
            <div className="project-form-section-header">
              <div className="project-form-section-icon">📋</div>
              <div>
                <h2 className="project-form-section-title">Informations de base</h2>
                <p className="project-form-section-subtitle">Client, nom et description du projet</p>
              </div>
            </div>
            <div className="portal-list">
              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">👤</span>
                  Client
                </label>
                <CustomSelect
                  className="portal-input"
                  value={form.clientId}
                  onChange={(v) => setForm({ ...form, clientId: v })}
                  options={[{ value: '', label: 'Sélectionner un client' }, ...clients.map((c) => ({ value: c._id, label: `${c.name} - ${c.email}` }))]}
                />
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">📝</span>
                  Nom du projet
                </label>
                <input
                  className="portal-input"
                  placeholder="Ex: Site web corporate"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">💬</span>
                  Résumé
                </label>
                <input
                  className="portal-input"
                  placeholder="Résumé en une phrase"
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">📄</span>
                  Description détaillée
                </label>
                <textarea
                  className="portal-input"
                  placeholder="Description complète du projet"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="project-form-grid">
                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">📊</span>
                    Statut
                  </label>
                  <CustomSelect
                    className="portal-input"
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                    options={[
                      { value: 'EN_COURS', label: 'En cours' },
                      { value: 'EN_ATTENTE', label: 'En attente' },
                      { value: 'TERMINE', label: 'Terminé' },
                    ]}
                  />
                </div>

                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">🔢</span>
                    Numéro de projet
                  </label>
                  <input
                    className="portal-input"
                    placeholder="Laissé vide = généré auto (ex: PROJ-0001)"
                    value={form.projectNumber}
                    onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Planning */}
          <div className="project-form-section">
            <div className="project-form-section-header">
              <div className="project-form-section-icon">📅</div>
              <div>
                <h2 className="project-form-section-title">Planning & Dates</h2>
                <p className="project-form-section-subtitle">Dates clés et jalons du projet</p>
              </div>
            </div>
            <div className="portal-list">
              <div className="project-form-grid">
                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">🚀</span>
                    Date de début
                  </label>
                  <input
                    className="portal-input"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>

                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">🎯</span>
                    Fin prévue
                  </label>
                  <input
                    className="portal-input"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>

                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">✅</span>
                    Livraison réelle
                  </label>
                  <input
                    className="portal-input"
                    type="date"
                    value={form.deliveredAt}
                    onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">⏰</span>
                  Deadlines & Jalons
                </label>
                {form.deadlines.map((d, i) => (
                  <div key={i} className="deadline-row">
                    <input
                      className="portal-input"
                      placeholder="Libellé du jalon"
                      value={d.label}
                      onChange={(e) => updateDeadline(i, 'label', e.target.value)}
                      style={{ flex: 1, margin: 0 }}
                    />
                    <input
                      className="portal-input"
                      type="datetime-local"
                      value={deadlineDueAtDisplay(d.dueAt)}
                      onChange={(e) => updateDeadline(i, 'dueAt', e.target.value || '')}
                      style={{ width: 200, margin: 0 }}
                    />
                    <button
                      type="button"
                      className="portal-button secondary"
                      onClick={() => removeDeadline(i)}
                      style={{ padding: '10px 14px' }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={addDeadline}
                  style={{ marginTop: 8 }}
                >
                  + Ajouter un jalon
                </button>
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">🔔</span>
                  Date de rappel
                </label>
                <input
                  className="portal-input"
                  type="datetime-local"
                  value={toDateTimeLocal(form.reminderAt)}
                  onChange={(e) => setForm({ ...form, reminderAt: e.target.value || '' })}
                  style={{ maxWidth: 260 }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Gestion */}
          <div className="project-form-section">
            <div className="project-form-section-header">
              <div className="project-form-section-icon">⚙️</div>
              <div>
                <h2 className="project-form-section-title">Gestion & Organisation</h2>
                <p className="project-form-section-subtitle">Priorité, responsable et suivi</p>
              </div>
            </div>
            <div className="portal-list">
              <div className="project-form-grid">
                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">🎚️</span>
                    Priorité
                  </label>
                  <CustomSelect
                    className="portal-input"
                    value={form.priority}
                    onChange={(v) => setForm({ ...form, priority: v })}
                    options={[
                      { value: 'BASSE', label: '🟢 Basse' },
                      { value: 'NORMALE', label: '🔵 Normale' },
                      { value: 'HAUTE', label: '🟡 Haute' },
                      { value: 'URGENTE', label: '🔴 Urgente' },
                    ]}
                  />
                </div>

                <div className="project-form-field">
                  <label className="project-form-label">
                    <span className="project-form-label-icon">👨‍💼</span>
                    Responsable (admin assigne)
                  </label>
                  <CustomSelect
                    className="portal-input"
                    value={form.assignedTo}
                    onChange={(v) => setForm({ ...form, assignedTo: v })}
                    options={[{ value: '', label: 'Non assigne' }, ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` }))]}
                  />
                </div>
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">📝</span>
                  Notes internes
                </label>
                <textarea
                  className="portal-input"
                  placeholder="Notes privées, non visibles par le client"
                  value={form.internalNotes}
                  onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">🏷️</span>
                  Tags
                </label>
                <datalist id="tags-suggestions">
                  {SUGGESTIONS_TAGS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <div className="project-form-input-group">
                  <input
                    className="portal-input"
                    list="tags-suggestions"
                    placeholder="Ex: urgent, refonte (suggestions ou libre)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="portal-button secondary" onClick={addTag}>
                    Ajouter
                  </button>
                </div>
                {form.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {form.tags.map((t, i) => (
                      <span key={i} className="admin-tag">
                        {t}
                        <button type="button" onClick={() => removeTag(i)} aria-label="Retirer">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: 'transparent', borderRadius: '8px' }}>
                <input
                  type="checkbox"
                  checked={form.isArchived}
                  onChange={(e) => setForm({ ...form, isArchived: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>📦 Projet archivé</span>
              </label>
            </div>
          </div>

          {/* Section 4: Types & Modules */}
          <div className="project-form-section">
            <div className="project-form-section-header">
              <div className="project-form-section-icon">🎨</div>
              <div>
                <h2 className="project-form-section-title">Types & Modules</h2>
                <p className="project-form-section-subtitle">Prestations et livrables du projet</p>
              </div>
            </div>
            <div className="portal-list">
              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">🛠️</span>
                  Types de prestation
                </label>
                <datalist id="service-types-suggestions">
                  {SUGGESTIONS_SERVICE_TYPES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <div className="project-form-input-group">
                  <input
                    className="portal-input"
                    list="service-types-suggestions"
                    placeholder="Choisir ou saisir (ex: Design, Développement)"
                    value={serviceTypeInput}
                    onChange={(e) => setServiceTypeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addServiceType())}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="portal-button secondary" onClick={addServiceType}>
                    Ajouter
                  </button>
                </div>
                {form.serviceTypes.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {form.serviceTypes.map((s, i) => (
                      <span key={i} className="admin-tag">
                        {s}
                        <button type="button" onClick={() => removeServiceType(i)} aria-label="Retirer">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">📦</span>
                  Types de livrables
                </label>
                <datalist id="deliverable-types-suggestions">
                  {SUGGESTIONS_DELIVERABLE_TYPES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <div className="project-form-input-group">
                  <input
                    className="portal-input"
                    list="deliverable-types-suggestions"
                    placeholder="Choisir ou saisir (ex: Maquettes, Code source)"
                    value={deliverableTypeInput}
                    onChange={(e) => setDeliverableTypeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDeliverableType())}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="portal-button secondary" onClick={addDeliverableType}>
                    Ajouter
                  </button>
                </div>
                {form.deliverableTypes.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {form.deliverableTypes.map((s, i) => (
                      <span key={i} className="admin-tag">
                        {s}
                        <button type="button" onClick={() => removeDeliverableType(i)} aria-label="Retirer">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Budget & Facturation */}
          <div className="project-form-section">
            <div className="project-form-section-header">
              <div className="project-form-section-icon">💰</div>
              <div>
                <h2 className="project-form-section-title">Budget & Facturation</h2>
                <p className="project-form-section-subtitle">Gestion financière du projet</p>
              </div>
            </div>
            <div className="portal-list">
              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">💵</span>
                  Budget estimé
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input
                    className="portal-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.budget.amount !== '' && form.budget.amount != null ? formatCurrency(form.budget.amount) : ''}
                    onChange={(e) => {
                      const parsed = parseCurrency(e.target.value)
                      setForm({ ...form, budget: { ...form.budget, amount: parsed === '' ? '' : parsed } })
                    }}
                    style={{ width: 160 }}
                  />
                  <CustomSelect
                    className="portal-input"
                    value={form.budget.currency}
                    onChange={(v) => setForm({ ...form, budget: { ...form.budget, currency: v } })}
                    options={[
                      { value: 'EUR', label: 'EUR €' },
                      { value: 'USD', label: 'USD $' },
                      { value: 'CHF', label: 'CHF' },
                    ]}
                  />
                </div>
                <input
                  className="portal-input"
                  placeholder="Note sur le budget"
                  value={form.budget.note}
                  onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
                  style={{ marginTop: 8 }}
                />
              </div>

              <div className="project-form-field">
                <label className="project-form-label">
                  <span className="project-form-label-icon">🧾</span>
                  Facturation
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="portal-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.billing.amountInvoiced !== '' && form.billing.amountInvoiced != null ? formatCurrency(form.billing.amountInvoiced) : ''}
                    onChange={(e) => {
                      const parsed = parseCurrency(e.target.value)
                      setForm({ ...form, billing: { ...form.billing, amountInvoiced: parsed === '' ? '' : parsed } })
                    }}
                    style={{ width: 160 }}
                  />
                  <CustomSelect
                    className="portal-input"
                    value={form.billing.billingStatus}
                    onChange={(v) => setForm({ ...form, billing: { ...form.billing, billingStatus: v } })}
                    options={[
                      { value: 'NON_FACTURE', label: 'Non facturé' },
                      { value: 'PARTIEL', label: 'Partiel' },
                      { value: 'FACTURE', label: 'Facturé' },
                    ]}
                  />
                </div>
                <input
                  className="portal-input"
                  placeholder="Référence devis (ex: DEV-2026-001)"
                  value={form.billing.quoteReference}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
                  style={{ marginTop: 8 }}
                />
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error" style={{ marginTop: 24 }}>{error}</div>}

        {/* Submit Section */}
        <div className="project-form-submit">
          <div className="admin-button-group" style={{ justifyContent: 'center' }}>
            <button className="portal-button" type="submit" style={{ minWidth: 200, fontSize: 16, padding: '14px 32px' }}>
              ✨ Créer le projet
            </button>
            <Link className="portal-button secondary" to="/admin" style={{ minWidth: 120, fontSize: 16, padding: '14px 32px' }}>
              Annuler
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}

export default ProjectForm
