import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, getToken } from '../../lib/api'
import {
  formatCurrency,
  parseCurrency,
  toDateTimeLocal,
  SUGGESTIONS_SERVICE_TYPES,
  SUGGESTIONS_DELIVERABLE_TYPES,
  SUGGESTIONS_TAGS,
} from '../../lib/formatUtils'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import BillingAccountingPanel from '../../components/BillingAccountingPanel'

const BILLING_STATUS_LABELS = { DRAFT: 'Brouillon', ISSUED: 'Émis', SENT: 'Envoyé', ACCEPTED: 'Accepté', PAID: 'Payé', CANCELLED: 'Annulé' }

const AdminProjectDetail = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  const [updates, setUpdates] = useState([])
  const [sections, setSections] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: '',
    projectNumber: '',
    startDate: '',
    endDate: '',
    deliveredAt: '',
    priority: 'NORMALE',
    responsible: '',
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
  const [serviceTypeInput, setServiceTypeInput] = useState('')
  const [deliverableTypeInput, setDeliverableTypeInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [updateForm, setUpdateForm] = useState({ title: '', description: '' })
  const [sectionForm, setSectionForm] = useState({ title: '', description: '', isVisible: true })
  const [itemForm, setItemForm] = useState({
    section: '',
    type: 'LIVRABLE',
    title: '',
    description: '',
    url: '',
    content: '',
    isVisible: true,
    isDownloadable: true,
    status: 'EN_ATTENTE',
  })
  const [selectedFile, setSelectedFile] = useState(null)
  const [billingDocuments, setBillingDocuments] = useState([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('content') // details, content, updates, documents
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canEditContent = hasPermission(user, PERMISSIONS.EDIT_CONTENT)
  const canManageBilling = hasPermission(user, PERMISSIONS.MANAGE_BILLING)
  const canViewContent = hasPermission(user, PERMISSIONS.VIEW_CONTENT)
  const canViewBilling = hasPermission(user, PERMISSIONS.VIEW_BILLING)

  const ensurePermission = (allowed, message) => {
    if (!allowed) {
      setError(message)
      return false
    }
    return true
  }

  const getStatusBadgeClass = (status) => {
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

  const getStatusLabel = (status) => {
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

  const getDocumentTypeLabel = (type) => {
    switch (type) {
      case 'DEVIS':
        return 'Devis'
      case 'FACTURE':
        return 'Facture'
      case 'FICHIER_PROJET':
        return 'Fichier projet'
      default:
        return type
    }
  }

  const getItemTypeLabel = (type) => {
    const labels = {
      LIVRABLE: 'Livrable',
      DEVIS: 'Devis',
      FACTURE: 'Facture',
      CONTRAT: 'Contrat',
      CAHIER_DES_CHARGES: 'Cahier des charges',
      MAQUETTE: 'Maquette',
      DOCUMENTATION: 'Documentation',
      LIEN: 'Lien',
      NOTE: 'Note',
      AUTRE: 'Autre',
    }
    return labels[type] || type
  }

  const getItemsBySection = (sectionId) => {
    return items.filter((item) => item.section?._id === sectionId || item.section === sectionId)
  }

  const getItemsWithoutSection = () => {
    return items.filter((item) => !item.section)
  }

  const load = async () => {
    try {
      const [projectRes, documentsRes, updatesRes, sectionsRes, itemsRes, billingRes] = await Promise.all([
        apiFetch(`/api/admin/projects/${id}`),
        apiFetch(`/api/admin/projects/${id}/documents`),
        apiFetch(`/api/admin/projects/${id}/updates`),
        canViewContent ? apiFetch(`/api/admin/projects/${id}/sections`) : Promise.resolve({ sections: [] }),
        canViewContent ? apiFetch(`/api/admin/projects/${id}/items`) : Promise.resolve({ items: [] }),
        canViewBilling
          ? apiFetch(`/api/admin/billing/projects/${id}/billing-documents`).catch(() => ({ documents: [] }))
          : Promise.resolve({ documents: [] }),
      ])
      setProject(projectRes.project)
      setDocuments(documentsRes.documents || [])
      setUpdates(updatesRes.updates || [])
      setSections(sectionsRes.sections || [])
      setItems(itemsRes.items || [])
      setBillingDocuments(billingRes.documents || [])
      if (projectRes.project) {
        const p = projectRes.project
        const deadlines = (p.deadlines || []).map((d) => ({
          label: d.label || '',
          dueAt: d.dueAt ? (typeof d.dueAt === 'string' ? d.dueAt : new Date(d.dueAt).toISOString()) : '',
        }))
        const budget = p.budget && typeof p.budget === 'object'
          ? {
              amount: p.budget.amount != null && p.budget.amount !== '' ? Number(p.budget.amount) : '',
              currency: p.budget.currency || 'EUR',
              note: p.budget.note || '',
            }
          : { amount: '', currency: 'EUR', note: '' }
        const billing = p.billing && typeof p.billing === 'object'
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
          startDate: p.startDate ? (typeof p.startDate === 'string' ? p.startDate.slice(0, 10) : new Date(p.startDate).toISOString().slice(0, 10)) : '',
          endDate: p.endDate ? (typeof p.endDate === 'string' ? p.endDate.slice(0, 10) : new Date(p.endDate).toISOString().slice(0, 10)) : '',
          deliveredAt: p.deliveredAt ? (typeof p.deliveredAt === 'string' ? p.deliveredAt.slice(0, 10) : new Date(p.deliveredAt).toISOString().slice(0, 10)) : '',
          priority: p.priority || 'NORMALE',
          responsible: p.responsible || '',
          summary: p.summary || '',
          internalNotes: p.internalNotes || '',
          serviceTypes: Array.isArray(p.serviceTypes) ? p.serviceTypes : [],
          deliverableTypes: Array.isArray(p.deliverableTypes) ? p.deliverableTypes : [],
          deadlines,
          budget,
          tags: Array.isArray(p.tags) ? p.tags : [],
          billing,
          reminderAt: p.reminderAt ? (typeof p.reminderAt === 'string' ? p.reminderAt : new Date(p.reminderAt).toISOString()) : '',
          isArchived: Boolean(p.isArchived),
        })
      }
    } catch (err) {
      setError(err.message || 'Erreur chargement projet')
    }
  }

  useEffect(() => {
    load()
  }, [id, canViewContent, canViewBilling])

  const handleSave = async (event) => {
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
      const data = await apiFetch(`/api/admin/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setProject(data.project)
    } catch (err) {
      setError(err.message || 'Erreur mise a jour')
    }
  }

  const addServiceType = () => {
    const v = serviceTypeInput.trim()
    if (v && !form.serviceTypes.includes(v)) {
      setForm({ ...form, serviceTypes: [...form.serviceTypes, v] })
      setServiceTypeInput('')
    }
  }

  const removeServiceType = (index) => {
    setForm({ ...form, serviceTypes: form.serviceTypes.filter((_, i) => i !== index) })
  }

  const addDeliverableType = () => {
    const v = deliverableTypeInput.trim()
    if (v && !form.deliverableTypes.includes(v)) {
      setForm({ ...form, deliverableTypes: [...form.deliverableTypes, v] })
      setDeliverableTypeInput('')
    }
  }

  const removeDeliverableType = (index) => {
    setForm({ ...form, deliverableTypes: form.deliverableTypes.filter((_, i) => i !== index) })
  }

  const addDeadline = () => {
    setForm({
      ...form,
      deadlines: [...(form.deadlines || []), { label: '', dueAt: '' }],
    })
  }

  const updateDeadline = (index, field, value) => {
    const next = [...(form.deadlines || [])]
    next[index] = { ...next[index], [field]: value }
    setForm({ ...form, deadlines: next })
  }

  const removeDeadline = (index) => {
    setForm({ ...form, deadlines: (form.deadlines || []).filter((_, i) => i !== index) })
  }

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !(form.tags || []).includes(v)) {
      setForm({ ...form, tags: [...(form.tags || []), v] })
      setTagInput('')
    }
  }

  const removeTag = (index) => {
    setForm({ ...form, tags: (form.tags || []).filter((_, i) => i !== index) })
  }

  const deadlineDueAtDisplay = (dueAt) => (dueAt ? toDateTimeLocal(dueAt) : '')

  const refreshBillingDocuments = async () => {
    try {
      const data = await apiFetch(`/api/admin/billing/projects/${id}/billing-documents`)
      setBillingDocuments(data.documents || [])
    } catch (_) {
      setBillingDocuments([])
    }
  }

  const handleCreateQuote = async () => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/projects/${id}/quotes`, { method: 'POST', body: JSON.stringify({}) })
      await refreshBillingDocuments()
    } catch (err) {
      setError(err.message || 'Erreur création devis')
    }
  }

  const handleCreateInvoice = async () => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/projects/${id}/invoices`, { method: 'POST', body: JSON.stringify({}) })
      await refreshBillingDocuments()
    } catch (err) {
      setError(err.message || 'Erreur création facture')
    }
  }

  const handleGeneratePdf = async (docId) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}/generate-pdf`, { method: 'POST' })
      await refreshBillingDocuments()
    } catch (err) {
      setError(err.message || 'Erreur génération PDF')
    }
  }

  const handleMarkSent = async (docId) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}/send`, { method: 'POST' })
      await refreshBillingDocuments()
    } catch (err) {
      setError(err.message || 'Erreur')
    }
  }

  const handleMarkPaid = async (docId) => {
    setError('')
    if (!ensurePermission(canManageBilling, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/billing/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'PAID', paidAt: new Date().toISOString() }),
      })
      await refreshBillingDocuments()
    } catch (err) {
      setError(err.message || 'Erreur')
    }
  }

  const handleAddUpdate = async (event) => {
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
    } catch (err) {
      setError(err.message || 'Erreur ajout mise a jour')
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditProjects, 'Accès en lecture seule.')) return
    const formEl = event.target
    try {
      const token = getToken()
      const formData = new FormData(formEl)
      const response = await fetch(`/api/admin/projects/${id}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erreur upload')
      }
      await load()
      formEl.reset()
    } catch (err) {
      setError(err.message || 'Erreur upload')
    }
  }

  const handleAddSection = async (event) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${id}/sections`, {
        method: 'POST',
        body: JSON.stringify(sectionForm),
      })
      setSectionForm({ title: '', description: '', isVisible: true })
      await load()
    } catch (err) {
      setError(err.message || 'Erreur ajout section')
    }
  }

  const handleDeleteSection = async (sectionId) => {
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    if (!confirm('Supprimer cette section ?')) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${id}/sections/${sectionId}`, {
        method: 'DELETE',
      })
      await load()
    } catch (err) {
      setError(err.message || 'Erreur suppression section')
    }
  }

  const handleToggleSectionVisibility = async (section) => {
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${id}/sections/${section._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible: !section.isVisible }),
      })
      await load()
    } catch (err) {
      setError(err.message || 'Erreur mise à jour section')
    }
  }

  const handleAddItem = async (event) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      const token = getToken()
      const formData = new FormData()
      
      Object.keys(itemForm).forEach((key) => {
        if (itemForm[key] !== '' && itemForm[key] !== null) {
          formData.append(key, itemForm[key])
        }
      })
      
      if (selectedFile) {
        formData.append('file', selectedFile)
      }
      
      const response = await fetch(`/api/admin/projects/${id}/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erreur ajout item')
      }
      
      setItemForm({
        section: '',
        type: 'LIVRABLE',
        title: '',
        description: '',
        url: '',
        content: '',
        isVisible: true,
        isDownloadable: true,
        status: 'EN_ATTENTE',
      })
      setSelectedFile(null)
      await load()
    } catch (err) {
      setError(err.message || 'Erreur ajout item')
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    if (!confirm('Supprimer cet élément ?')) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${id}/items/${itemId}`, {
        method: 'DELETE',
      })
      await load()
    } catch (err) {
      setError(err.message || 'Erreur suppression item')
    }
  }

  const handleToggleItemVisibility = async (item) => {
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${id}/items/${item._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible: !item.isVisible }),
      })
      await load()
    } catch (err) {
      setError(err.message || 'Erreur mise à jour item')
    }
  }

  const handleDownloadItem = async (itemId, fileName) => {
    if (!ensurePermission(canViewContent, 'Accès en lecture seule.')) return
    try {
      const token = getToken()
      const response = await fetch(`/api/admin/projects/${id}/items/${itemId}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error('Téléchargement impossible')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Téléchargement impossible')
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: '#ffffff' }}>{project?.name || 'Projet'}</span>
        </div>
        {project && (
          <div className="admin-header">
            <div>
              <h1 style={{ marginBottom: '8px' }}>{project.name}</h1>
              <span className={`admin-badge ${getStatusBadgeClass(project.status)}`}>
                {getStatusLabel(project.status)}
              </span>
            </div>
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
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'details' && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <h2>Détails du projet</h2>
          <form className="portal-list" onSubmit={handleSave}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Nom du projet
              </label>
              <input
                className="portal-input"
                placeholder="Nom"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Description
              </label>
              <textarea
                className="portal-input"
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows="4"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Statut
              </label>
              <select
                className="portal-input"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="EN_COURS">En cours</option>
                <option value="EN_ATTENTE">En attente</option>
                <option value="TERMINE">Terminé</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Numéro de projet
              </label>
              <input
                className="portal-input"
                placeholder="Ex: PROJ-2025-001"
                value={form.projectNumber ?? ''}
                onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Date de début
                </label>
                <input
                  className="portal-input"
                  type="date"
                  value={form.startDate ?? ''}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Fin prévue
                </label>
                <input
                  className="portal-input"
                  type="date"
                  value={form.endDate ?? ''}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Livraison réelle
                </label>
                <input
                  className="portal-input"
                  type="date"
                  value={form.deliveredAt ?? ''}
                  onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Priorité
              </label>
              <select
                className="portal-input"
                value={form.priority ?? 'NORMALE'}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="BASSE">Basse</option>
                <option value="NORMALE">Normale</option>
                <option value="HAUTE">Haute</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Responsable projet
              </label>
              <input
                className="portal-input"
                placeholder="Nom du responsable"
                value={form.responsible ?? ''}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Résumé (une phrase)
              </label>
              <input
                className="portal-input"
                placeholder="Résumé du projet"
                value={form.summary ?? ''}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Notes internes (admin uniquement)
              </label>
              <textarea
                className="portal-input"
                placeholder="Notes non visibles par le client"
                value={form.internalNotes ?? ''}
                onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                rows="3"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <h2 style={{ marginTop: 24, marginBottom: 16 }}>Options de module</h2>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Types de prestation
              </label>
              <datalist id="detail-service-types-suggestions">
                {SUGGESTIONS_SERVICE_TYPES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="portal-input"
                  list="detail-service-types-suggestions"
                  placeholder="Choisir ou saisir (ex: Design, Développement)"
                  value={serviceTypeInput}
                  onChange={(e) => setServiceTypeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addServiceType())}
                  style={{ flex: '1 1 200px', maxWidth: 280 }}
                />
                <button type="button" className="portal-button secondary" onClick={addServiceType}>
                  Ajouter
                </button>
              </div>
              {(form.serviceTypes || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {(form.serviceTypes || []).map((s, i) => (
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Types de livrables
              </label>
              <datalist id="detail-deliverable-types-suggestions">
                {SUGGESTIONS_DELIVERABLE_TYPES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="portal-input"
                  list="detail-deliverable-types-suggestions"
                  placeholder="Choisir ou saisir (ex: Maquettes, Code source)"
                  value={deliverableTypeInput}
                  onChange={(e) => setDeliverableTypeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDeliverableType())}
                  style={{ flex: '1 1 200px', maxWidth: 280 }}
                />
                <button type="button" className="portal-button secondary" onClick={addDeliverableType}>
                  Ajouter
                </button>
              </div>
              {(form.deliverableTypes || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {(form.deliverableTypes || []).map((s, i) => (
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Deadlines
              </label>
              {(form.deadlines || []).map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="portal-input"
                    placeholder="Libellé"
                    value={d.label}
                    onChange={(e) => updateDeadline(i, 'label', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      className="portal-input"
                      type="datetime-local"
                      value={deadlineDueAtDisplay(d.dueAt)}
                      onChange={(e) => updateDeadline(i, 'dueAt', e.target.value || '')}
                      style={{ width: 200 }}
                    />
                  </div>
                  <button type="button" className="portal-button secondary" onClick={() => removeDeadline(i)}>
                    Suppr.
                  </button>
                </div>
              ))}
              <button type="button" className="portal-button secondary" onClick={addDeadline}>
                + Ajouter une deadline
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Budget
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input
                  className="portal-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.budget?.amount !== '' && form.budget?.amount != null ? formatCurrency(form.budget.amount) : ''}
                  onChange={(e) => {
                    const parsed = parseCurrency(e.target.value)
                    setForm({ ...form, budget: { ...form.budget, amount: parsed === '' ? '' : parsed } })
                  }}
                  style={{ width: 140 }}
                />
                <select
                  className="portal-input"
                  value={form.budget?.currency ?? 'EUR'}
                  onChange={(e) => setForm({ ...form, budget: { ...form.budget, currency: e.target.value } })}
                  style={{ width: 100 }}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
              <input
                className="portal-input"
                placeholder="Note budget (optionnel)"
                value={form.budget?.note ?? ''}
                onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </div>

            <div style={{ marginTop: 20, marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Tags
              </label>
              <datalist id="detail-tags-suggestions">
                {SUGGESTIONS_TAGS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="portal-input"
                  list="detail-tags-suggestions"
                  placeholder="Ex: urgent, refonte (suggestions ou libre)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  style={{ flex: '1 1 200px', maxWidth: 280 }}
                />
                <button type="button" className="portal-button secondary" onClick={addTag}>
                  Ajouter
                </button>
              </div>
              {(form.tags || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {(form.tags || []).map((t, i) => (
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

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Facturation
              </label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="portal-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.billing?.amountInvoiced !== '' && form.billing?.amountInvoiced != null ? formatCurrency(form.billing.amountInvoiced) : ''}
                  onChange={(e) => {
                    const parsed = parseCurrency(e.target.value)
                    setForm({ ...form, billing: { ...form.billing, amountInvoiced: parsed === '' ? '' : parsed } })
                  }}
                  style={{ width: 140 }}
                />
                <select
                  className="portal-input"
                  value={form.billing?.billingStatus ?? 'NON_FACTURE'}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, billingStatus: e.target.value } })}
                  style={{ width: 160 }}
                >
                  <option value="NON_FACTURE">Non facturé</option>
                  <option value="PARTIEL">Partiel</option>
                  <option value="FACTURE">Facturé</option>
                </select>
              </div>
              <input
                className="portal-input"
                placeholder="Référence devis"
                value={form.billing?.quoteReference ?? ''}
                onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
                style={{ marginTop: 8 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Date de rappel
              </label>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <input
                  className="portal-input"
                  type="datetime-local"
                  value={toDateTimeLocal(form.reminderAt)}
                  onChange={(e) => setForm({ ...form, reminderAt: e.target.value || '' })}
                  style={{ width: 220 }}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isArchived}
                onChange={(e) => setForm({ ...form, isArchived: e.target.checked })}
              />
              <span style={{ fontSize: '14px' }}>Projet archivé</span>
            </label>

            <div className="project-form-section" style={{ marginTop: 32 }}>
              <div className="project-form-section-header">
                <div className="project-form-section-icon">🧾</div>
                <div>
                  <h2 className="project-form-section-title">Devis & Factures</h2>
                  <p className="project-form-section-subtitle">Génération et suivi des documents de facturation</p>
                </div>
              </div>
              <div className="portal-list">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                  <button
                    type="button"
                    className="portal-button secondary"
                    onClick={handleCreateQuote}
                    disabled={!canManageBilling}
                  >
                    + Générer un devis
                  </button>
                  <button
                    type="button"
                    className="portal-button secondary"
                    onClick={handleCreateInvoice}
                    disabled={!canManageBilling}
                  >
                    + Générer une facture
                  </button>
                </div>
                {!canManageBilling && (
                  <div className="admin-info" style={{ marginBottom: 16 }}>
                    Accès lecture seule à la facturation.
                  </div>
                )}
                {billingDocuments.length === 0 ? (
                  <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px' }}>
                    Aucun devis ou facture. Créez-en un avec les boutons ci-dessus.
                  </p>
                ) : (
                  <ul className="admin-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {billingDocuments.map((doc) => (
                      <li key={doc._id} className="admin-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600 }}>
                            {doc.type === 'QUOTE' ? 'Devis' : 'Facture'} {doc.number}
                          </span>
                          <span className="admin-badge" style={{ textTransform: 'capitalize' }}>
                            {BILLING_STATUS_LABELS[doc.status] || doc.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
                          Total : {Number(doc.total || 0).toFixed(2)} {doc.currency || 'EUR'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {canViewBilling && doc.pdfStoragePath && (
                            <button
                              type="button"
                              className="portal-button secondary"
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                              onClick={async () => {
                                try {
                                  const token = getToken()
                                  const res = await fetch(`/api/admin/billing/${doc._id}/pdf`, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                                  })
                                  if (!res.ok) throw new Error('PDF non disponible')
                                  const blob = await res.blob()
                                  const url = URL.createObjectURL(blob)
                                  window.open(url, '_blank')
                                } catch (e) {
                                  setError(e.message || 'Erreur téléchargement PDF')
                                }
                              }}
                            >
                              Télécharger PDF
                            </button>
                          )}
                          {canManageBilling && !doc.pdfStoragePath && (
                            <button
                              type="button"
                              className="portal-button secondary"
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                              onClick={() => handleGeneratePdf(doc._id)}
                            >
                              Générer PDF
                            </button>
                          )}
                          {canManageBilling && doc.status !== 'SENT' && doc.status !== 'PAID' && doc.type === 'INVOICE' && (
                            <button
                              type="button"
                              className="portal-button secondary"
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                              onClick={() => handleMarkSent(doc._id)}
                            >
                              Marquer envoyé
                            </button>
                          )}
                          {canManageBilling && doc.type === 'INVOICE' && doc.status !== 'PAID' && (
                            <button
                              type="button"
                              className="portal-button secondary"
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                              onClick={() => handleMarkPaid(doc._id)}
                            >
                              Marquer payé
                            </button>
                          )}
                          {canManageBilling && doc.type === 'QUOTE' && doc.status !== 'SENT' && (
                            <button
                              type="button"
                              className="portal-button secondary"
                              style={{ padding: '8px 12px', fontSize: '13px' }}
                              onClick={() => handleMarkSent(doc._id)}
                            >
                              Marquer envoyé
                            </button>
                          )}
                        </div>
                        <BillingAccountingPanel billingDoc={doc} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button className="portal-button" type="submit" style={{ marginTop: 24 }} disabled={!canEditProjects}>
              Enregistrer les modifications
            </button>
          </form>
        </div>
      )}

      {activeTab === 'content' && (
        <div style={{ marginTop: 24 }}>
          {/* Ajouter une section */}
          <div className="admin-form-section">
            <h2>Ajouter une section</h2>
            {canEditContent ? (
              <form className="portal-list" onSubmit={handleAddSection}>
                <input
                  className="portal-input"
                  placeholder="Titre de la section"
                  value={sectionForm.title}
                  onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })}
                  required
                />
                <textarea
                  className="portal-input"
                  placeholder="Description (optionnel)"
                  value={sectionForm.description}
                  onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                  rows="2"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sectionForm.isVisible}
                    onChange={(e) => setSectionForm({ ...sectionForm, isVisible: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Visible pour le client</span>
                </label>
                <button className="portal-button" type="submit">
                  + Créer la section
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule au contenu.</div>
            )}
          </div>

          {/* Ajouter un élément */}
          <div className="admin-form-section" style={{ marginTop: 24 }}>
            <h2>Ajouter un élément</h2>
            {canEditContent ? (
              <form className="portal-list" onSubmit={handleAddItem}>
              <select
                className="portal-input"
                value={itemForm.section}
                onChange={(e) => setItemForm({ ...itemForm, section: e.target.value })}
              >
                <option value="">Sans section</option>
                {sections.map((section) => (
                  <option key={section._id} value={section._id}>
                    {section.title}
                  </option>
                ))}
              </select>
              <select
                className="portal-input"
                value={itemForm.type}
                onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}
                required
              >
                <option value="LIVRABLE">Livrable</option>
                <option value="DEVIS">Devis</option>
                <option value="FACTURE">Facture</option>
                <option value="CONTRAT">Contrat</option>
                <option value="CAHIER_DES_CHARGES">Cahier des charges</option>
                <option value="MAQUETTE">Maquette</option>
                <option value="DOCUMENTATION">Documentation</option>
                <option value="LIEN">Lien</option>
                <option value="NOTE">Note</option>
                <option value="AUTRE">Autre</option>
              </select>
              <input
                className="portal-input"
                placeholder="Titre"
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                required
              />
              <textarea
                className="portal-input"
                placeholder="Description"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                rows="3"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
              {itemForm.type === 'LIEN' && (
                <input
                  className="portal-input"
                  placeholder="URL (https://...)"
                  value={itemForm.url}
                  onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
                />
              )}
              {itemForm.type === 'NOTE' && (
                <textarea
                  className="portal-input"
                  placeholder="Contenu de la note"
                  value={itemForm.content}
                  onChange={(e) => setItemForm({ ...itemForm, content: e.target.value })}
                  rows="4"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}
              {itemForm.type === 'LIVRABLE' && (
                <select
                  className="portal-input"
                  value={itemForm.status}
                  onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}
                >
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="TERMINE">Terminé</option>
                  <option value="VALIDE">Validé</option>
                </select>
              )}
              <input
                className="portal-input"
                type="file"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                style={{ padding: '8px 14px' }}
              />
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isVisible}
                    onChange={(e) => setItemForm({ ...itemForm, isVisible: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Visible</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={itemForm.isDownloadable}
                    onChange={(e) => setItemForm({ ...itemForm, isDownloadable: e.target.checked })}
                  />
                  <span style={{ fontSize: '14px' }}>Téléchargeable</span>
                </label>
              </div>
                <button className="portal-button" type="submit">
                  + Ajouter l'élément
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule au contenu.</div>
            )}
          </div>

          {/* Liste des sections et items */}
          <div style={{ marginTop: 24 }}>
            {/* Items sans section */}
            {getItemsWithoutSection().length > 0 && (
              <div className="admin-form-section" style={{ marginBottom: 24 }}>
                <h3>Éléments sans section</h3>
                <div className="admin-list">
                  {getItemsWithoutSection().map((item) => (
                    <div key={item._id} className="admin-list-item">
                      <div className="admin-list-item-content">
                        <h4 className="admin-list-item-title">
                          {item.title}
                          {!item.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>👁️ Masqué</span>}
                        </h4>
                        <p className="admin-list-item-subtitle">
                          <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                          {item.file && <span style={{ marginLeft: '8px' }}>📎 {item.file.originalName}</span>}
                        </p>
                      </div>
                      <div className="admin-list-item-actions">
                        {canEditContent && (
                          <button
                            className="portal-button secondary"
                            onClick={() => handleToggleItemVisibility(item)}
                            style={{ fontSize: '12px', padding: '8px 12px' }}
                          >
                            {item.isVisible ? '👁️ Masquer' : '👁️ Afficher'}
                          </button>
                        )}
                        {canViewContent && item.file && (
                          <button
                            className="portal-button secondary"
                            onClick={() => handleDownloadItem(item._id, item.file.originalName)}
                            style={{ fontSize: '12px', padding: '8px 12px' }}
                          >
                            📥
                          </button>
                        )}
                        {canEditContent && (
                          <button
                            className="portal-button secondary"
                            onClick={() => handleDeleteItem(item._id)}
                            style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections avec leurs items */}
            {sections.map((section) => (
              <div key={section._id} className="admin-form-section" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3>
                    {section.title}
                    {!section.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>👁️ Masqué</span>}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canEditContent && (
                      <button
                        className="portal-button secondary"
                        onClick={() => handleToggleSectionVisibility(section)}
                        style={{ fontSize: '12px', padding: '8px 12px' }}
                      >
                        {section.isVisible ? '👁️ Masquer' : '👁️ Afficher'}
                      </button>
                    )}
                    {canEditContent && (
                      <button
                        className="portal-button secondary"
                        onClick={() => handleDeleteSection(section._id)}
                        style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
                {section.description && (
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: 16 }}>{section.description}</p>
                )}
                <div className="admin-list">
                  {getItemsBySection(section._id).length === 0 ? (
                    <div className="admin-empty-state" style={{ padding: '24px' }}>
                      <p className="admin-empty-state-text">Aucun élément dans cette section</p>
                    </div>
                  ) : (
                    getItemsBySection(section._id).map((item) => (
                      <div key={item._id} className="admin-list-item">
                        <div className="admin-list-item-content">
                          <h4 className="admin-list-item-title">
                            {item.title}
                            {!item.isVisible && <span style={{ marginLeft: '8px', opacity: 0.5 }}>👁️ Masqué</span>}
                          </h4>
                          <p className="admin-list-item-subtitle">
                            <span className="admin-badge">{getItemTypeLabel(item.type)}</span>
                            {item.file && <span style={{ marginLeft: '8px' }}>📎 {item.file.originalName}</span>}
                            {!item.isDownloadable && <span style={{ marginLeft: '8px', opacity: 0.5 }}>🔒 Non téléchargeable</span>}
                          </p>
                        </div>
                        <div className="admin-list-item-actions">
                          {canEditContent && (
                            <button
                              className="portal-button secondary"
                              onClick={() => handleToggleItemVisibility(item)}
                              style={{ fontSize: '12px', padding: '8px 12px' }}
                            >
                              {item.isVisible ? '👁️ Masquer' : '👁️ Afficher'}
                            </button>
                          )}
                          {canViewContent && item.file && (
                            <button
                              className="portal-button secondary"
                              onClick={() => handleDownloadItem(item._id, item.file.originalName)}
                              style={{ fontSize: '12px', padding: '8px 12px' }}
                            >
                              📥
                            </button>
                          )}
                          {canEditContent && (
                            <button
                              className="portal-button secondary"
                              onClick={() => handleDeleteItem(item._id)}
                              style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}

            {sections.length === 0 && getItemsWithoutSection().length === 0 && (
              <div className="admin-empty-state" style={{ padding: '48px' }}>
                <div className="admin-empty-state-icon">📁</div>
                <p className="admin-empty-state-text">Aucun contenu pour ce projet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'updates' && (
        <div style={{ marginTop: 24 }}>
          <div className="admin-form-section">
            <h2>Ajouter une mise à jour</h2>
            {canEditProjects ? (
              <form className="portal-list" onSubmit={handleAddUpdate}>
                <input
                  className="portal-input"
                  placeholder="Titre de la mise à jour"
                  value={updateForm.title}
                  onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })}
                  required
                />
                <textarea
                  className="portal-input"
                  placeholder="Description"
                  value={updateForm.description}
                  onChange={(event) => setUpdateForm({ ...updateForm, description: event.target.value })}
                  rows="3"
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <button className="portal-button" type="submit">
                  + Ajouter une mise à jour
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule aux mises à jour.</div>
            )}
          </div>

          <div className="admin-form-section" style={{ marginTop: 24 }}>
            <h2>Historique des mises à jour</h2>
            <div className="portal-list">
              {updates.length === 0 ? (
                <div className="admin-empty-state" style={{ padding: '24px' }}>
                  <p className="admin-empty-state-text">Aucune mise à jour</p>
                </div>
              ) : (
                updates.map((update) => (
                  <div key={update._id} className="admin-update-item">
                    <strong>{update.title}</strong>
                    <p>{update.description}</p>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '8px' }}>
                      {new Date(update.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div style={{ marginTop: 24 }}>
          <div className="admin-form-section">
            <h2>Téléverser un document (ancien système)</h2>
            {canEditProjects ? (
              <form className="portal-list" onSubmit={handleUpload}>
                <select className="portal-input" name="type" required>
                  <option value="">Type de document</option>
                  <option value="DEVIS">Devis</option>
                  <option value="FACTURE">Facture</option>
                  <option value="FICHIER_PROJET">Fichier projet</option>
                </select>
                <input
                  className="portal-input"
                  type="file"
                  name="file"
                  required
                  style={{ padding: '8px 14px' }}
                />
                <button className="portal-button" type="submit">
                  📎 Téléverser
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule aux documents.</div>
            )}
          </div>

          <div className="admin-form-section" style={{ marginTop: 24 }}>
            <h2>Documents</h2>
            <div className="portal-list">
              {documents.length === 0 ? (
                <div className="admin-empty-state" style={{ padding: '24px' }}>
                  <p className="admin-empty-state-text">Aucun document</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <div key={doc._id} className="admin-document-item">
                    <strong>{doc.originalName}</strong>
                    <p>
                      <span className="admin-badge" style={{ marginRight: '8px' }}>
                        {getDocumentTypeLabel(doc.type)}
                      </span>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminProjectDetail
