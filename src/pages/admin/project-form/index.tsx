import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import type { AdminUser } from '../../../types/crm.types'
import { fromDateTimeLocal } from '../../../lib/formatUtils'
import type { User } from '../../../types/auth.types'
import type { Project } from '../../../types/project.types'
import type { ProjectTemplate } from '../../../types/template.types'
import { fetchTemplates } from '../../../services/templates'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { ProjectFormData } from './types'
import ProjectInfoSection from './ProjectInfoSection'
import ProjectDatesSection from './ProjectDatesSection'
import ProjectManagementSection from './ProjectManagementSection'
import ProjectTypesSection from './ProjectTypesSection'
import ProjectBudgetSection from './ProjectBudgetSection'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const ProjectForm = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [clients, setClients] = useState<User[]>([])
  const [form, setForm] = useState<ProjectFormData>({
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
          <ProjectInfoSection form={form} setForm={setForm} clients={clients} />
          <ProjectDatesSection form={form} setForm={setForm} />
          <ProjectManagementSection
            form={form}
            setForm={setForm}
            admins={admins}
            tagInput={tagInput}
            setTagInput={setTagInput}
            addTag={addTag}
            removeTag={removeTag}
          />
          <ProjectTypesSection
            form={form}
            setForm={setForm}
            serviceTypeInput={serviceTypeInput}
            setServiceTypeInput={setServiceTypeInput}
            addServiceType={addServiceType}
            removeServiceType={removeServiceType}
            deliverableTypeInput={deliverableTypeInput}
            setDeliverableTypeInput={setDeliverableTypeInput}
            addDeliverableType={addDeliverableType}
            removeDeliverableType={removeDeliverableType}
          />
          <ProjectBudgetSection form={form} setForm={setForm} />
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
