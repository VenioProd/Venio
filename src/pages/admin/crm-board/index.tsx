import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { exportToCsv } from '../../../lib/exportCsv'
import { logInteraction } from '../../../services/interactions'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ConfirmModal from '../../../components/ConfirmModal'
import type {
  Lead,
  LeadFormData,
  PipelineColumn,
  AdminUser,
  CrmStatusConfig,
  WorklistResponse,
} from '../../../types/crm.types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

import PipelineColumnComponent from './PipelineColumn'
import LeadTable from './LeadTable'
import LeadFormPanel from './LeadFormPanel'
import LeadDetailModal from './LeadDetailModal'
import WorklistView from './worklist/WorklistView'
import LostReasonDialog from './LostReasonDialog'
import { DEFAULT_FOLLOW_UP } from './worklist/helpers'
import { CrmThresholdsContext } from './thresholdsContext'
import {
  DEFAULT_WORKLIST_THRESHOLDS,
  CRM_STATUSES,
  CRM_PRIORITIES,
  STATUS_MAP,
  PRIORITY_MAP,
  EMPTY_FORM,
} from './constants'
import SchoolTable from '../arrow-prospection/SchoolTable'
import SchoolFormPanel from '../arrow-prospection/SchoolFormPanel'
import SchoolDetailModal from '../arrow-prospection/SchoolDetailModal'
import { EMPTY_FORM as EMPTY_SCHOOL_FORM } from '../arrow-prospection/constants'
import type { ArrowSchool, ArrowSchoolFormData } from '../../../types/arrow.types'

const CrmBoard = () => {
  const { user } = useAuth()
  const canManageCrm = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const [columns, setColumns] = useState<PipelineColumn[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewMode, setViewMode] = useState<string>(() => (searchParams.get('mode') === 'file' ? 'file' : 'table'))

  // File de travail : groupes, seuils d'alerte effectifs et délais de relance,
  // tous servis par /crm/worklist. Les seuils alimentent aussi les badges des
  // vues Tableau et Kanban via CrmThresholdsContext.
  const [worklist, setWorklist] = useState<WorklistResponse | null>(null)
  const [worklistLoading, setWorklistLoading] = useState<boolean>(false)
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null)
  // Une action menée depuis la file périme le pipeline, qu'on ne recharge
  // qu'au retour sur une vue qui l'affiche.
  const [pipelineStale, setPipelineStale] = useState<boolean>(false)
  // Patch mis en attente le temps que l'utilisateur donne un motif de perte.
  const [lostTarget, setLostTarget] = useState<{
    lead: Lead
    apply: (patch: Record<string, unknown>) => Promise<unknown>
  } | null>(null)
  const [showForm, setShowForm] = useState<boolean>(false)

  // Table view state
  const [search, setSearch] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [sortField, setSortField] = useState<string>('updatedAt')
  const [sortDir, setSortDir] = useState<string>('desc')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [form, setForm] = useState<LeadFormData>({ ...EMPTY_FORM })

  const [expandedLead, setExpandedLead] = useState<Lead | null>(null)

  // ── Arrow Prospection ──
  const [section, setSection] = useState<'leads' | 'arrow'>('leads')
  const [schools, setSchools] = useState<ArrowSchool[]>([])
  const [arrowLoading, setArrowLoading] = useState(false)
  const [showSchoolForm, setShowSchoolForm] = useState(false)
  const [editingSchool, setEditingSchool] = useState<ArrowSchool | null>(null)
  const [schoolForm, setSchoolForm] = useState<ArrowSchoolFormData>({ ...EMPTY_SCHOOL_FORM })
  const [selectedSchool, setSelectedSchool] = useState<ArrowSchool | null>(null)
  const [schoolFocusSection, setSchoolFocusSection] = useState<'ecole' | 'contact' | 'prospection' | undefined>()
  const [schoolSaving, setSchoolSaving] = useState(false)

  const loadArrow = useCallback(async () => {
    setArrowLoading(true)
    try {
      const data = await apiFetch<{ schools: ArrowSchool[] }>('/api/admin/arrow-prospection')
      setSchools(data.schools)
    } catch {
    } finally {
      setArrowLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section === 'arrow') loadArrow()
  }, [section, loadArrow])

  const handleSchoolPatch = async (id: string, patch: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/admin/arrow-prospection/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await loadArrow()
    } catch {}
  }

  const handleSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSchoolSaving(true)
    try {
      const payload = {
        ...schoolForm,
        studentCount: schoolForm.studentCount ? Number(schoolForm.studentCount) : null,
        nextActionAt: schoolForm.nextActionAt || null,
        lastContactAt: schoolForm.lastContactAt || null,
        assignedTo: schoolForm.assignedTo || null,
      }
      if (editingSchool) {
        await apiFetch(`/api/admin/arrow-prospection/${editingSchool._id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch('/api/admin/arrow-prospection', { method: 'POST', body: JSON.stringify(payload) })
      }
      setShowSchoolForm(false)
      setEditingSchool(null)
      await loadArrow()
    } catch {
    } finally {
      setSchoolSaving(false)
    }
  }

  const openSchoolEdit = (school: ArrowSchool) => {
    setEditingSchool(school)
    setSchoolForm({
      name: school.name,
      schoolType: school.schoolType,
      city: school.city,
      region: school.region,
      studentCount: school.studentCount !== null ? String(school.studentCount) : '',
      emailGeneral: school.emailGeneral,
      contactName: school.contactName,
      contactRole: school.contactRole,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      status: school.status,
      temperature: school.temperature,
      source: school.source,
      notes: school.notes,
      nextActionAt: school.nextActionAt ? school.nextActionAt.slice(0, 10) : '',
      lastContactAt: school.lastContactAt ? school.lastContactAt.slice(0, 10) : '',
      assignedTo: school.assignedTo?._id || '',
      relances: school.relances ?? [],
    })
    setShowSchoolForm(true)
    setSelectedSchool(null)
  }

  const handleSchoolDelete = async (id: string) => {
    try {
      await apiFetch(`/api/admin/arrow-prospection/${id}`, { method: 'DELETE' })
      await loadArrow()
    } catch {}
  }

  const handleTransferToArrow = async (leadId: string) => {
    if (!window.confirm('Transférer ce lead vers Arrow Écoles ? Il sera retiré du CRM.')) return
    try {
      await apiFetch(`/api/admin/arrow-prospection/transfer-lead/${leadId}`, { method: 'POST' })
      await load()
      setSection('arrow')
      await loadArrow()
    } catch (err: any) {
      alert(err.message || 'Erreur lors du transfert')
    }
  }

  const handleTransferAllToArrow = async () => {
    if (!window.confirm(`Transférer les ${totalLeads} leads vers Arrow Écoles ? Ils seront tous retirés du CRM.`))
      return
    try {
      for (const lead of filteredLeads) {
        await apiFetch(`/api/admin/arrow-prospection/transfer-lead/${lead._id}`, { method: 'POST' })
      }
      await load()
      setSection('arrow')
      await loadArrow()
    } catch (err: any) {
      alert(err.message || 'Erreur lors du transfert')
    }
  }

  const adminsById = useMemo(() => {
    const map: Record<string, AdminUser> = {}
    admins.forEach((admin) => {
      map[admin._id] = admin
    })
    return map
  }, [admins])

  const loadWorklist = useCallback(async () => {
    setWorklistLoading(true)
    try {
      setWorklist(await apiFetch<WorklistResponse>('/api/admin/crm/worklist'))
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement de la file')
    } finally {
      setWorklistLoading(false)
    }
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [pipelineRes, adminRes, worklistRes] = await Promise.all([
        apiFetch<{ columns?: PipelineColumn[] }>('/api/admin/crm/pipeline'),
        apiFetch<{ users?: AdminUser[] }>('/api/admin/admins'),
        apiFetch<WorklistResponse>('/api/admin/crm/worklist'),
      ])
      setColumns(pipelineRes.columns || [])
      setAdmins(adminRes.users || [])
      setWorklist(worklistRes)
      setPipelineStale(false)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement CRM')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Le pipeline périmé par une action de la file est rechargé à la demande,
  // au moment où une vue qui l'affiche redevient visible.
  useEffect(() => {
    if (viewMode !== 'file' && pipelineStale) load()
  }, [viewMode, pipelineStale])

  const changeViewMode = (mode: string) => {
    setViewMode(mode)
    setSearchParams(
      (params) => {
        if (mode === 'file') params.set('mode', 'file')
        else params.delete('mode')
        return params
      },
      { replace: true },
    )
  }

  // Une action de la file verrouille sa ligne, puis recharge la file seule :
  // traiter dix relances ne doit pas déclencher dix rechargements du board.
  // En cas d'échec, le rechargement remet la ligne dans son état réel et
  // l'erreur reste affichée.
  const runLeadAction = async (leadId: string, action: () => Promise<unknown>) => {
    setError('')
    setBusyLeadId(leadId)
    let succeeded = false
    try {
      await action()
      setPipelineStale(true)
      succeeded = true
    } catch (err: unknown) {
      setError((err as Error).message || 'Action impossible sur ce lead')
    } finally {
      await loadWorklist()
      setBusyLeadId(null)
    }
    return succeeded
  }

  const handleWorklistPatch = async (leadId: string, patch: Record<string, unknown>) => {
    const lead = findLead(leadId)
    if (needsLostReason(patch) && lead) {
      setLostTarget({
        lead,
        apply: (extra) => runLeadAction(leadId, () => patchLead(leadId, { ...patch, ...extra })),
      })
      return false
    }
    return runLeadAction(leadId, () => patchLead(leadId, patch))
  }

  const handleLogContact = (leadId: string, payload: { nextActionAt: string | null; note: string }) =>
    runLeadAction(leadId, async () => {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lastContactAt: new Date().toISOString(), nextActionAt: payload.nextActionAt }),
      })
      if (payload.note) {
        await logInteraction('LEAD', leadId, { kind: 'NOTE', body: payload.note })
      }
    })

  const handleAddNote = (leadId: string, text: string) =>
    runLeadAction(leadId, () => logInteraction('LEAD', leadId, { kind: 'NOTE', body: text }))

  // Flatten all leads from columns
  const allLeads = useMemo(() => {
    const leads: Lead[] = []
    columns.forEach((col) => {
      ;(col.leads || []).forEach((lead) => leads.push(lead))
    })
    return leads
  }, [columns])

  // Filtered & sorted leads for table view
  const filteredLeads = useMemo(() => {
    let leads = [...allLeads]

    if (search) {
      const q = search.toLowerCase()
      leads = leads.filter(
        (l) =>
          (l.company || '').toLowerCase().includes(q) ||
          (l.contactName || '').toLowerCase().includes(q) ||
          (l.contactEmail || '').toLowerCase().includes(q),
      )
    }
    if (filterStatus) leads = leads.filter((l) => l.status === filterStatus)
    if (filterPriority) leads = leads.filter((l) => l.priority === filterPriority)
    if (filterAssignee) leads = leads.filter((l) => l.assignedTo === filterAssignee)

    leads.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let va: any = (a as any)[sortField]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vb: any = (b as any)[sortField]
      if (sortField === 'budget') {
        va = va ?? -1
        vb = vb ?? -1
      }
      if (sortField === 'status') {
        va = CRM_STATUSES.findIndex((s) => s.key === va)
        vb = CRM_STATUSES.findIndex((s) => s.key === vb)
      }
      if (sortField === 'priority') {
        va = CRM_PRIORITIES.findIndex((p) => p.key === va)
        vb = CRM_PRIORITIES.findIndex((p) => p.key === vb)
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return leads
  }, [allLeads, search, filterStatus, filterPriority, filterAssignee, sortField, sortDir])

  // Group leads by status for Monday.com style
  const groupedLeads = useMemo(() => {
    const groups: (CrmStatusConfig & { leads: Lead[] })[] = []
    CRM_STATUSES.forEach((status) => {
      const leads = filteredLeads.filter((l) => l.status === status.key)
      if (leads.length > 0 || !filterStatus) {
        groups.push({ ...status, leads })
      }
    })
    return groups
  }, [filteredLeads, filterStatus])

  const handleCreateLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        company: form.company,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        source: form.source,
        budget: form.budget === '' ? null : Number(form.budget),
        priority: form.priority,
        status: form.status,
        nextActionAt: form.nextActionAt ? new Date(form.nextActionAt).toISOString() : null,
        notes: form.notes,
        serviceType: form.serviceType,
        leadTemperature: form.leadTemperature,
        interactionNotes: form.interactionNotes,
        assignedTo: form.assignedTo || null,
      }
      await apiFetch('/api/admin/crm/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setForm({ ...EMPTY_FORM })
      setShowForm(false)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur création lead')
    }
  }

  /**
   * Vrai si le patch ferme une affaire sans dire pourquoi. Le motif est demandé
   * ici plutôt qu'exigé par l'API, qui doit rester ouverte à l'agent et aux
   * automatisations.
   */
  const needsLostReason = (patch: Record<string, unknown>) =>
    patch.status === 'LOST' && !patch.lostReason && lostReasons.length > 0

  const findLead = (leadId: string) => allLeads.find((item) => item._id === leadId) ?? null

  const patchLead = (leadId: string, patch: Record<string, unknown>) =>
    apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) })

  const handleUpdateLead = async (leadId: string, patch: Record<string, unknown>) => {
    const lead = findLead(leadId)
    if (needsLostReason(patch) && lead) {
      setLostTarget({
        lead,
        apply: async (extra) => {
          await patchLead(leadId, { ...patch, ...extra })
          await load()
        },
      })
      return
    }

    setError('')
    try {
      await patchLead(leadId, patch)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour lead')
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    setError('')
    try {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression lead')
    }
  }

  const [converting, setConverting] = useState<string | null>(null)
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)

  const handleConvertToClient = (lead: Lead) => {
    setConvertTarget(lead)
  }

  const confirmConvertToClient = async () => {
    if (!convertTarget) return
    const lead = convertTarget
    setConvertTarget(null)
    setError('')
    setConverting(lead._id)
    try {
      const res = await apiFetch<{ client?: { name: string } }>(`/api/admin/crm/leads/${lead._id}/convert-to-client`, {
        method: 'POST',
      })
      if (res.client) {
        setError('')
        await load()
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur conversion en client')
    } finally {
      setConverting(null)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault()
    const leadId = event.dataTransfer.getData('text/plain')
    if (!leadId) return
    await handleUpdateLead(leadId, { status })
  }

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, leadId: string) => {
    event.dataTransfer.setData('text/plain', leadId)
  }

  const toggleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField],
  )

  const toggleGroup = useCallback((statusKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [statusKey]: !prev[statusKey] }))
  }, [])

  const allCollapsed = useMemo(() => CRM_STATUSES.every((s) => collapsedGroups[s.key]), [collapsedGroups])

  const toggleAllGroups = useCallback(() => {
    if (allCollapsed) {
      setCollapsedGroups({})
    } else {
      const all: Record<string, boolean> = {}
      CRM_STATUSES.forEach((s) => {
        all[s.key] = true
      })
      setCollapsedGroups(all)
    }
  }, [allCollapsed])

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterStatus('')
    setFilterPriority('')
    setFilterAssignee('')
  }, [])

  const worklistOverdueCount = worklist?.counts.overdue ?? 0
  const lostReasons = worklist?.lostReasons ?? []
  const totalLeads = allLeads.length
  const activeFilters = [filterStatus, filterPriority, filterAssignee, search].filter(Boolean).length

  return (
    <CrmThresholdsContext.Provider value={worklist?.thresholds ?? DEFAULT_WORKLIST_THRESHOLDS}>
      <div className="portal-container crm-page-container">
        <div className="portal-card">
          <div className="admin-breadcrumb">
            <Link to="/admin">Admin</Link>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>CRM & Prospection</span>
          </div>
          <div className="admin-header">
            <div>
              <h1>CRM & Prospection</h1>
              <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0', fontSize: '15px' }}>
                {section === 'leads'
                  ? 'Pipeline commercial avec attribution, relances et automatisations'
                  : 'Prospection des établissements scolaires pour Arrow'}
              </p>
              {/* Onglets */}
              <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
                {(
                  [
                    ['leads', 'Leads & Clients'],
                    ['arrow', '🎯 Arrow — Écoles'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSection(key)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      border: '1px solid',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      transition: 'all 0.15s',
                      borderColor: section === key ? 'var(--primary)' : 'var(--border)',
                      background: section === key ? 'var(--primary)' : 'transparent',
                      color: section === key ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-actions portal-actions-reveal" style={{ gap: 8 }}>
              {/* View toggle */}
              <div className="crm-view-toggle">
                <button
                  className={`crm-view-btn ${viewMode === 'file' ? 'active' : ''}`}
                  onClick={() => changeViewMode('file')}
                  title="Ma file de travail"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="9" y1="6" x2="21" y2="6" />
                    <line x1="9" y1="12" x2="21" y2="12" />
                    <line x1="9" y1="18" x2="21" y2="18" />
                    <polyline points="3 6 4 7 6 5" />
                    <polyline points="3 12 4 13 6 11" />
                    <circle cx="4" cy="18" r="1" />
                  </svg>
                  {worklistOverdueCount > 0 && <span className="crm-view-btn-count">{worklistOverdueCount}</span>}
                </button>
                <button
                  className={`crm-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => changeViewMode('table')}
                  title="Vue tableau"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </button>
                <button
                  className={`crm-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                  onClick={() => changeViewMode('kanban')}
                  title="Vue Kanban"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="6" height="18" rx="1" />
                    <rect x="9" y="3" width="6" height="12" rx="1" />
                    <rect x="16" y="3" width="6" height="15" rx="1" />
                  </svg>
                </button>
              </div>
              <button
                className="portal-button secondary portal-action-link"
                type="button"
                title="Exporter CSV"
                onClick={() => {
                  const headers = ['Entreprise', 'Contact', 'Email', 'Statut', 'Priorite', 'Budget', 'Assigne']
                  const rows = filteredLeads.map((lead) => [
                    lead.company || '',
                    lead.contactName || '',
                    lead.contactEmail || '',
                    STATUS_MAP[lead.status]?.label || lead.status || '',
                    PRIORITY_MAP[lead.priority || '']?.label || lead.priority || '',
                    lead.budget != null ? String(lead.budget) : '',
                    adminsById[lead.assignedTo || '']?.name || 'Non assigne',
                  ])
                  exportToCsv('leads.csv', headers, rows)
                }}
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span className="portal-action-label">Exporter CSV</span>
              </button>
              {section === 'leads' && canManageCrm && (
                <>
                  <button
                    className="portal-button secondary"
                    onClick={handleTransferAllToArrow}
                    title="Transférer tous les leads vers Arrow Écoles"
                  >
                    Tout transférer → Arrow
                  </button>
                  <button className="portal-button" onClick={() => setShowForm((v) => !v)}>
                    {showForm ? 'Masquer le formulaire' : '+ Nouveau lead'}
                  </button>
                </>
              )}
              {section === 'arrow' && canManageCrm && (
                <button
                  className="portal-button"
                  onClick={() => {
                    setEditingSchool(null)
                    setSchoolForm({ ...EMPTY_SCHOOL_FORM, assignedTo: user?._id || '' })
                    setShowSchoolForm(true)
                  }}
                >
                  + Ajouter une école
                </button>
              )}
              {canManageCrm && (
                <Link className="crm-settings-link" to="/admin/crm/settings" title="Paramètres des automatisations">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Automatisations
                </Link>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="admin-error" style={{ marginTop: 24 }}>
            {error}
          </div>
        )}

        {/* Lead creation form (collapsible) */}
        {section === 'leads' && showForm && canManageCrm && (
          <LeadFormPanel
            form={form}
            admins={admins}
            isSuperAdmin={user?.role === 'SUPER_ADMIN'}
            canManageCrm={canManageCrm}
            onFormChange={setForm}
            onSubmit={handleCreateLead}
          />
        )}

        {/* Arrow school form panel */}
        {section === 'arrow' && showSchoolForm && (
          <SchoolFormPanel
            form={schoolForm}
            setForm={setSchoolForm}
            onSubmit={handleSchoolSubmit}
            onCancel={() => {
              setShowSchoolForm(false)
              setEditingSchool(null)
            }}
            loading={schoolSaving}
            editing={editingSchool}
            admins={admins}
          />
        )}

        {/* Main content area */}
        <div
          className="portal-card"
          style={{
            marginTop: 24,
            padding: section === 'arrow' || viewMode === 'table' ? 0 : undefined,
            overflow: 'visible',
          }}
        >
          {/* ── Section Arrow ── */}
          {section === 'arrow' ? (
            arrowLoading ? (
              <div className="admin-loading" style={{ padding: 32 }}>
                Chargement...
              </div>
            ) : (
              <SchoolTable
                schools={schools}
                admins={admins}
                onEdit={openSchoolEdit}
                onDelete={handleSchoolDelete}
                onSelect={(s, section) => {
                  setSelectedSchool(s)
                  setSchoolFocusSection(section)
                }}
                onPatch={handleSchoolPatch}
                canManage={canManageCrm}
              />
            )
          ) : viewMode === 'file' ? (
            <WorklistView
              groups={worklist?.groups ?? null}
              thresholds={worklist?.thresholds ?? DEFAULT_WORKLIST_THRESHOLDS}
              followUp={worklist?.followUp ?? DEFAULT_FOLLOW_UP}
              adminsById={adminsById}
              canManageCrm={canManageCrm}
              loading={loading || worklistLoading}
              busyLeadId={busyLeadId}
              onPatch={handleWorklistPatch}
              onLogContact={handleLogContact}
              onAddNote={handleAddNote}
              onOpenDetail={setExpandedLead}
            />
          ) : loading ? (
            <div className="admin-loading" style={{ padding: 32 }}>
              Chargement du pipeline...
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="crm-board">
              {columns.map((column) => (
                <PipelineColumnComponent
                  key={column.status}
                  column={column}
                  admins={admins}
                  adminsById={adminsById}
                  canManageCrm={canManageCrm}
                  converting={converting}
                  onUpdateLead={handleUpdateLead}
                  onConvertToClient={handleConvertToClient}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          ) : (
            <LeadTable
              groupedLeads={groupedLeads}
              filteredLeads={filteredLeads}
              totalLeads={totalLeads}
              search={search}
              filterStatus={filterStatus}
              filterPriority={filterPriority}
              filterAssignee={filterAssignee}
              sortField={sortField}
              sortDir={sortDir}
              collapsedGroups={collapsedGroups}
              admins={admins}
              adminsById={adminsById}
              canManageCrm={canManageCrm}
              converting={converting}
              deleteConfirm={deleteConfirm}
              activeFilters={activeFilters}
              isSuperAdmin={user?.role === 'SUPER_ADMIN'}
              onSearchChange={setSearch}
              onFilterStatusChange={setFilterStatus}
              onFilterPriorityChange={setFilterPriority}
              onFilterAssigneeChange={setFilterAssignee}
              allCollapsed={allCollapsed}
              onClearFilters={clearFilters}
              onToggleAll={toggleAllGroups}
              onToggleSort={toggleSort}
              onToggleGroup={toggleGroup}
              onUpdateLead={handleUpdateLead}
              onConvertToClient={handleConvertToClient}
              onDeleteLead={handleDeleteLead}
              onSetDeleteConfirm={setDeleteConfirm}
              onExpandLead={setExpandedLead}
              onTransferToArrow={handleTransferToArrow}
              onTransferSelectionToArrow={async (ids) => {
                if (!window.confirm(`Transférer ${ids.length} lead${ids.length > 1 ? 's' : ''} vers Arrow Écoles ?`))
                  return
                for (const id of ids) {
                  await apiFetch(`/api/admin/arrow-prospection/transfer-lead/${id}`, { method: 'POST' }).catch(() => {})
                }
                await load()
                setSection('arrow')
                await loadArrow()
              }}
            />
          )}
        </div>

        {/* Modal détail école Arrow */}
        {selectedSchool && (
          <SchoolDetailModal
            school={selectedSchool}
            admins={admins}
            focusSection={schoolFocusSection}
            onClose={() => {
              setSelectedSchool(null)
              setSchoolFocusSection(undefined)
            }}
            onSave={async (id, data) => {
              await apiFetch(`/api/admin/arrow-prospection/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
              await loadArrow()
            }}
            canManage={canManageCrm}
          />
        )}

        {/* Modal for interaction notes */}
        {expandedLead && (
          <LeadDetailModal
            lead={expandedLead}
            admins={admins}
            canManageCrm={canManageCrm}
            converting={converting}
            onClose={() => setExpandedLead(null)}
            onLeadChange={setExpandedLead}
            onUpdateLead={handleUpdateLead}
            onConvertToClient={handleConvertToClient}
          />
        )}

        {lostTarget && (
          <LostReasonDialog
            company={lostTarget.lead.company}
            reasons={lostReasons}
            saving={busyLeadId === lostTarget.lead._id}
            onCancel={() => setLostTarget(null)}
            onConfirm={async (payload) => {
              const target = lostTarget
              setLostTarget(null)
              await target.apply(payload)
            }}
          />
        )}

        <ConfirmModal
          isOpen={convertTarget !== null}
          title="Convertir en client"
          message={convertTarget ? `Convertir "${convertTarget.company}" en client ?` : ''}
          confirmLabel="Convertir"
          cancelLabel="Annuler"
          variant="info"
          onConfirm={confirmConvertToClient}
          onCancel={() => setConvertTarget(null)}
        />
      </div>
    </CrmThresholdsContext.Provider>
  )
}

export default CrmBoard
