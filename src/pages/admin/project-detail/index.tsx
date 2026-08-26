import React, { useEffect, useState } from 'react'
import { useConfirm } from '../../../hooks/useConfirm'
import { Link, useParams } from 'react-router-dom'
import { useTabState } from '../../../hooks/useTabState'
import { apiDownload, apiFetch, apiUpload } from '../../../lib/api'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { Project, ProjectDocument, ProjectUpdate, ProjectSection, ProjectItem } from '../../../types/project.types'
import type { BillingDocument } from '../../../types/client.types'
import type { AdminUser } from '../../../types/crm.types'
import TaskBoard from '../../../components/admin/TaskBoard'
import ActivityTimeline from '../../../components/admin/ActivityTimeline'
import ProjectChat from '../../../components/admin/ProjectChat'
import type { ProjectFormState } from './types'
import ProjectDetailsTab from './ProjectDetailsTab'
import ProjectContentTab from './ProjectContentTab'
import ProjectUpdatesTab from './ProjectUpdatesTab'
import ProjectDocumentsTab from './ProjectDocumentsTab'
import ProjectPhasesTab from './ProjectPhasesTab'
import { useProjectContent } from './hooks/useProjectContent'
import { useProjectPhases } from './hooks/useProjectPhases'

const AdminProjectDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [sections, setSections] = useState<ProjectSection[]>([])
  const [items, setItems] = useState<ProjectItem[]>([])
  const [form, setForm] = useState<ProjectFormState>({
    name: '',
    description: '',
    status: '',
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
  const [updateForm, setUpdateForm] = useState<{ title: string; description: string }>({ title: '', description: '' })
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [billingDocuments, setBillingDocuments] = useState<BillingDocument[]>([])
  const [error, setError] = useState<string>('')
  const [activeTab, setActiveTab] = useTabState('content')
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canEditContent = hasPermission(user, PERMISSIONS.EDIT_CONTENT)
  const canManageBilling = hasPermission(user, PERMISSIONS.MANAGE_BILLING)
  const canViewContent = hasPermission(user, PERMISSIONS.VIEW_CONTENT)
  const canViewBilling = hasPermission(user, PERMISSIONS.VIEW_BILLING)
  const canViewPhases = hasPermission(user, PERMISSIONS.VIEW_PHASES)
  const canManagePhases = hasPermission(user, PERMISSIONS.MANAGE_PHASES)

  const ensurePermission = (allowed: boolean, message: string): boolean => {
    if (!allowed) {
      setError(message)
      return false
    }
    return true
  }

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'EN_COURS':
        return 'status-en-cours'
      case 'EN_ATTENTE':
        return 'status-en-attente'
      case 'TERMINE':
        return 'status-termine'
      default:
        return ''
    }
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'EN_COURS':
        return 'En cours'
      case 'EN_ATTENTE':
        return 'En attente'
      case 'TERMINE':
        return 'Terminé'
      default:
        return status
    }
  }

  const load = async () => {
    try {
      const [projectRes, documentsRes, updatesRes, sectionsRes, itemsRes, billingRes] = await Promise.all([
        apiFetch<{ project?: Project }>(`/api/admin/projects/${id}`),
        apiFetch<{ documents?: ProjectDocument[] }>(`/api/admin/projects/${id}/documents`),
        apiFetch<{ updates?: ProjectUpdate[] }>(`/api/admin/projects/${id}/updates`),
        canViewContent
          ? apiFetch<{ sections?: ProjectSection[] }>(`/api/admin/projects/${id}/sections`)
          : Promise.resolve({ sections: [] as ProjectSection[] }),
        canViewContent
          ? apiFetch<{ items?: ProjectItem[] }>(`/api/admin/projects/${id}/items`)
          : Promise.resolve({ items: [] as ProjectItem[] }),
        canViewBilling
          ? apiFetch<{ documents?: BillingDocument[] }>(`/api/admin/billing/projects/${id}/billing-documents`).catch(
              () => ({ documents: [] as BillingDocument[] }),
            )
          : Promise.resolve({ documents: [] as BillingDocument[] }),
      ])
      setProject(projectRes.project || null)
      setDocuments(documentsRes.documents || [])
      setUpdates(updatesRes.updates || [])
      setSections(sectionsRes.sections || [])
      setItems(itemsRes.items || [])
      setBillingDocuments(billingRes.documents || [])
      // Load admins for assignedTo dropdown
      try {
        const adminsData = await apiFetch<{ users?: AdminUser[] }>('/api/admin/admins')
        setAdmins(adminsData.users || [])
      } catch {
        setAdmins([])
      }
      if (projectRes.project) {
        const p = projectRes.project
        const deadlines = (p.deadlines || []).map((d) => ({
          label: d.label || '',
          dueAt: d.dueAt ? (typeof d.dueAt === 'string' ? d.dueAt : new Date(d.dueAt).toISOString()) : '',
        }))
        const budget: { amount: number | ''; currency: string; note: string } =
          p.budget && typeof p.budget === 'object'
            ? {
                amount: p.budget.amount != null && p.budget.amount !== '' ? Number(p.budget.amount) : '',
                currency: p.budget.currency || 'EUR',
                note: p.budget.note || '',
              }
            : { amount: '', currency: 'EUR', note: '' }
        const billing: { amountInvoiced: number | ''; billingStatus: string; quoteReference: string } =
          p.billing && typeof p.billing === 'object'
            ? {
                amountInvoiced: p.billing.amountInvoiced != null ? Number(p.billing.amountInvoiced) : '',
                billingStatus: p.billing.billingStatus || 'NON_FACTURE',
                quoteReference: p.billing.quoteReference || '',
              }
            : { amountInvoiced: '', billingStatus: 'NON_FACTURE', quoteReference: '' }
        setForm({
          name: p.name,
          description: p.description || '',
          status: p.status,
          projectNumber: p.projectNumber || '',
          startDate: p.startDate
            ? typeof p.startDate === 'string'
              ? p.startDate.slice(0, 10)
              : new Date(p.startDate).toISOString().slice(0, 10)
            : '',
          endDate: p.endDate
            ? typeof p.endDate === 'string'
              ? p.endDate.slice(0, 10)
              : new Date(p.endDate).toISOString().slice(0, 10)
            : '',
          deliveredAt: p.deliveredAt
            ? typeof p.deliveredAt === 'string'
              ? p.deliveredAt.slice(0, 10)
              : new Date(p.deliveredAt).toISOString().slice(0, 10)
            : '',
          priority: p.priority || 'NORMALE',
          responsible: p.responsible || '',
          assignedTo: (p as any).assignedTo?._id || (p as any).assignedTo || '',
          summary: p.summary || '',
          internalNotes: p.internalNotes || '',
          serviceTypes: Array.isArray(p.serviceTypes) ? p.serviceTypes : [],
          deliverableTypes: Array.isArray(p.deliverableTypes) ? p.deliverableTypes : [],
          deadlines,
          budget,
          tags: Array.isArray(p.tags) ? p.tags : [],
          billing,
          reminderAt: p.reminderAt
            ? typeof p.reminderAt === 'string'
              ? p.reminderAt
              : new Date(p.reminderAt).toISOString()
            : '',
          isArchived: Boolean(p.isArchived),
        })
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement projet')
    }
  }

  const projectContent = useProjectContent({
    projectId: id,
    canEditContent,
    canViewContent,
    confirm,
    ensurePermission,
    load,
    setError,
  })

  const projectPhases = useProjectPhases({
    projectId: id,
    canViewPhases,
    canManagePhases,
    confirm,
    ensurePermission,
    setError,
  })

  useEffect(() => {
    load()
  }, [id, canViewContent, canViewBilling])

  const { loadPhases } = projectPhases
  useEffect(() => {
    loadPhases()
  }, [loadPhases])

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditProjects, 'Accès en lecture seule.')) return
    try {
      const payload = {
        name: form.name,
        description: form.description,
        status: form.status,
        projectNumber: form.projectNumber || '',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        deliveredAt: form.deliveredAt ? new Date(form.deliveredAt).toISOString() : null,
        priority: form.priority || 'NORMALE',
        responsible: form.responsible || '',
        assignedTo: form.assignedTo || null,
        summary: form.summary || '',
        internalNotes: form.internalNotes || '',
        serviceTypes: form.serviceTypes || [],
        deliverableTypes: form.deliverableTypes || [],
        deadlines: (form.deadlines || [])
          .filter((d) => d.label?.trim() || d.dueAt)
          .map((d) => ({
            label: d.label || '',
            dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null,
          })),
        budget: {
          amount: (form.budget?.amount ?? '') === '' ? null : Number(form.budget.amount),
          currency: form.budget?.currency || 'EUR',
          note: form.budget?.note || '',
        },
        tags: form.tags || [],
        billing: {
          amountInvoiced: (form.billing?.amountInvoiced ?? '') === '' ? null : Number(form.billing.amountInvoiced),
          billingStatus: form.billing?.billingStatus || 'NON_FACTURE',
          quoteReference: form.billing?.quoteReference || '',
        },
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        isArchived: form.isArchived,
      }
      if (Number.isNaN(payload.budget.amount)) payload.budget.amount = null
      if (Number.isNaN(payload.billing.amountInvoiced)) payload.billing.amountInvoiced = null
      const data = await apiFetch<{ project?: Project }>(`/api/admin/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setProject(data.project || null)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise a jour')
    }
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
      deadlines: [...(form.deadlines || []), { label: '', dueAt: '' }],
    })
  }

  const updateDeadline = (index: number, field: string, value: string) => {
    const next = [...(form.deadlines || [])]
    next[index] = { ...next[index], [field]: value }
    setForm({ ...form, deadlines: next })
  }

  const removeDeadline = (index: number) => {
    setForm({ ...form, deadlines: (form.deadlines || []).filter((_, i) => i !== index) })
  }

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !(form.tags || []).includes(v)) {
      setForm({ ...form, tags: [...(form.tags || []), v] })
      setTagInput('')
    }
  }

  const removeTag = (index: number) => {
    setForm({ ...form, tags: (form.tags || []).filter((_, i) => i !== index) })
  }

  const refreshBillingDocuments = async () => {
    try {
      const data = await apiFetch<{ documents?: BillingDocument[] }>(
        `/api/admin/billing/projects/${id}/billing-documents`,
      )
      setBillingDocuments(data.documents || [])
    } catch (_: unknown) {
      setBillingDocuments([])
    }
  }

  const handleCreateQuote = async () => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/projects/${id}/quotes`, { method: 'POST', body: JSON.stringify({}) })
      await refreshBillingDocuments()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur création devis')
    }
  }

  const handleCreateInvoice = async () => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/projects/${id}/invoices`, { method: 'POST', body: JSON.stringify({}) })
      await refreshBillingDocuments()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur création facture')
    }
  }

  const handleGeneratePdf = async (docId: string) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}/generate-pdf`, { method: 'POST' })
      await refreshBillingDocuments()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur génération PDF')
    }
  }

  const handleMarkSent = async (docId: string) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}/send`, { method: 'POST' })
      await refreshBillingDocuments()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur')
    }
  }

  const handleMarkPaid = async (docId: string) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'PAID', paidAt: new Date().toISOString() }),
      })
      await refreshBillingDocuments()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur')
    }
  }

  const handleAddUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditProjects, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${id}/updates`, {
        method: 'POST',
        body: JSON.stringify(updateForm),
      })
      setUpdateForm({ title: '', description: '' })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur ajout mise a jour')
    }
  }

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditProjects, 'Accès en lecture seule.')) return
    const formEl = event.target as HTMLFormElement
    try {
      const formData = new FormData(formEl)
      await apiUpload(`/api/admin/projects/${id}/documents`, formData)
      await load()
      formEl.reset()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur upload')
    }
  }

  return (
    <div className="portal-container">
      {ConfirmDialog}
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{project?.name || 'Projet'}</span>
        </div>
        {project && (
          <div className="admin-header">
            <div>
              <h1 style={{ marginBottom: '8px' }}>{project.name}</h1>
              <span className={`admin-badge ${getStatusBadgeClass(project.status)}`}>
                {getStatusLabel(project.status)}
              </span>
            </div>
            <button
              className="admin-button secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={async () => {
                try {
                  const { blob, filename } = await apiDownload(`/api/admin/projects/${id}/recap-pdf`)
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = filename ?? `Recap_${project.name.replace(/\s+/g, '_')}.pdf`
                  a.click()
                  window.URL.revokeObjectURL(url)
                } catch {
                  alert('Erreur lors de la génération du PDF')
                }
              }}
            >
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Récap PDF
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      {/* Onglets */}
      <div className="admin-tabs" style={{ marginTop: 24 }}>
        <button
          className={`admin-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Détails
        </button>
        <button
          className={`admin-tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Contenu du projet
        </button>
        {canViewPhases && (
          <button
            className={`admin-tab ${activeTab === 'phases' ? 'active' : ''}`}
            onClick={() => setActiveTab('phases')}
          >
            Étapes
          </button>
        )}
        <button className={`admin-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
          Taches
        </button>
        <button
          className={`admin-tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activite
        </button>
        <button
          className={`admin-tab ${activeTab === 'updates' ? 'active' : ''}`}
          onClick={() => setActiveTab('updates')}
        >
          Mises à jour
        </button>
        <button
          className={`admin-tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents (ancien)
        </button>
        <button
          className={`admin-tab ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
        </button>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'details' && (
        <ProjectDetailsTab
          project={project}
          form={form}
          setForm={setForm}
          admins={admins}
          billingDocuments={billingDocuments}
          canEditProjects={canEditProjects}
          canManageBilling={canManageBilling}
          canViewBilling={canViewBilling}
          serviceTypeInput={serviceTypeInput}
          setServiceTypeInput={setServiceTypeInput}
          deliverableTypeInput={deliverableTypeInput}
          setDeliverableTypeInput={setDeliverableTypeInput}
          tagInput={tagInput}
          setTagInput={setTagInput}
          setError={setError}
          onSave={handleSave}
          onAddServiceType={addServiceType}
          onRemoveServiceType={removeServiceType}
          onAddDeliverableType={addDeliverableType}
          onRemoveDeliverableType={removeDeliverableType}
          onAddDeadline={addDeadline}
          onUpdateDeadline={updateDeadline}
          onRemoveDeadline={removeDeadline}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onCreateQuote={handleCreateQuote}
          onCreateInvoice={handleCreateInvoice}
          onGeneratePdf={handleGeneratePdf}
          onMarkSent={handleMarkSent}
          onMarkPaid={handleMarkPaid}
        />
      )}

      {activeTab === 'content' && id && (
        <ProjectContentTab
          projectId={id}
          sections={sections}
          items={items}
          sectionForm={projectContent.sectionForm}
          setSectionForm={projectContent.setSectionForm}
          itemForm={projectContent.itemForm}
          setItemForm={projectContent.setItemForm}
          selectedFile={projectContent.selectedFile}
          setSelectedFile={projectContent.setSelectedFile}
          canEditContent={canEditContent}
          canViewContent={canViewContent}
          onAddSection={projectContent.handleAddSection}
          onDeleteSection={projectContent.handleDeleteSection}
          onToggleSectionVisibility={projectContent.handleToggleSectionVisibility}
          onAddItem={projectContent.handleAddItem}
          onDeleteItem={projectContent.handleDeleteItem}
          onToggleItemVisibility={projectContent.handleToggleItemVisibility}
          onDownloadItem={projectContent.handleDownloadItem}
        />
      )}

      {activeTab === 'phases' && id && canViewPhases && (
        <ProjectPhasesTab
          phases={projectPhases.phases}
          items={items}
          phaseForm={projectPhases.phaseForm}
          setPhaseForm={projectPhases.setPhaseForm}
          editingPhaseId={projectPhases.editingPhaseId}
          canManagePhases={canManagePhases}
          onSubmitPhase={projectPhases.handleSubmitPhase}
          onStartEdit={projectPhases.startEditPhase}
          onCancelEdit={projectPhases.cancelEditPhase}
          onDeletePhase={projectPhases.handleDeletePhase}
          onTransition={projectPhases.handleTransition}
          onMovePhase={projectPhases.handleMovePhase}
          onResolveRevision={projectPhases.handleResolveRevision}
        />
      )}

      {activeTab === 'tasks' && id && (
        <div style={{ marginTop: 24 }}>
          <TaskBoard projectId={id} />
        </div>
      )}

      {activeTab === 'activity' && id && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <h2>Activite du projet</h2>
          <ActivityTimeline projectId={id} />
        </div>
      )}

      {activeTab === 'updates' && (
        <ProjectUpdatesTab
          updates={updates}
          updateForm={updateForm}
          setUpdateForm={setUpdateForm}
          canEditProjects={canEditProjects}
          onAddUpdate={handleAddUpdate}
        />
      )}

      {activeTab === 'documents' && (
        <ProjectDocumentsTab
          documents={documents}
          canEditProjects={canEditProjects}
          onUpload={handleUpload}
          projectId={id ?? ''}
        />
      )}

      {activeTab === 'messages' && id && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <h2>Messages</h2>
          <ProjectChat projectId={id} />
        </div>
      )}
    </div>
  )
}

export default AdminProjectDetail
