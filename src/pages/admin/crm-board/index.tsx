import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { exportToCsv } from '../../../lib/exportCsv'
import { logInteraction } from '../../../services/interactions'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ConfirmModal from '../../../components/ConfirmModal'
import type { Lead, LeadFormData, PipelineColumn, AdminUser, WorklistResponse } from '../../../types/crm.types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

import PipelineColumnComponent from './PipelineColumn'
import LeadTable from './LeadTable'
import RichLeadTable from './rich/RichLeadTable'
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
  CRM_PROJECTS,
  CRM_ENTITIES,
  leadEntity,
  parseEntityParam,
  STATUS_MAP,
  PRIORITY_MAP,
  EMPTY_FORM,
  type CrmOption,
} from './constants'

const CrmBoard = () => {
  const { user } = useAuth()
  const { t } = useI18n()
  const canManageCrm = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const [columns, setColumns] = useState<PipelineColumn[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode')
  const viewMode =
    requestedMode === 'file' || requestedMode === 'table' || requestedMode === 'kanban' ? requestedMode : 'liste'
  const setParam = useCallback(
    (key: string, value: string) =>
      setSearchParams(
        (params) => {
          if (value) params.set(key, value)
          else params.delete(key)
          return params
        },
        { replace: true },
      ),
    [setSearchParams],
  )

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
  const search = searchParams.get('q') || ''
  const setSearch = (value: string) => setParam('q', value)
  const filterStatus = searchParams.get('status') || ''
  const setFilterStatus = (value: string) => setParam('status', value)
  const filterPriority = searchParams.get('priority') || ''
  const setFilterPriority = (value: string) => setParam('priority', value)
  const filterAssignee = searchParams.get('owner') || ''
  const setFilterAssignee = (value: string) => setParam('owner', value)
  const requestedProject = searchParams.get('project') || ''
  const filterProject = CRM_PROJECTS.some((project) => project.key === requestedProject) ? requestedProject : ''
  const setFilterProject = useCallback(
    (project: string) => {
      setSearchParams(
        (params) => {
          if (project) params.set('project', project)
          else params.delete('project')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  // Entité du groupe, portée par l'URL (?entity=) comme le projet : commune à toutes les vues.
  const filterEntity = parseEntityParam(searchParams.get('entity'))
  const setFilterEntity = useCallback(
    (entity: string) => {
      setSearchParams(
        (params) => {
          if (entity) params.set('entity', entity)
          else params.delete('entity')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const matchesEntity = useCallback((lead: Lead) => !filterEntity || leadEntity(lead) === filterEntity, [filterEntity])
  const sortField = searchParams.get('sort') || 'updatedAt'
  const setSortField = (value: string) => setParam('sort', value)
  const sortDir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const setSortDir = (value: string) => setParam('dir', value)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [form, setForm] = useState<LeadFormData>({ ...EMPTY_FORM })

  const [expandedLead, setExpandedLead] = useState<Lead | null>(null)

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
      setError((err as Error).message || translate('crm.error.loadWorklist'))
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
      setError((err as Error).message || t('crm.error.load'))
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
    setSearchParams(
      (params) => {
        params.set('mode', mode)
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
      setError((err as Error).message || t('crm.error.leadAction'))
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
  const entityLeads = useMemo(() => allLeads.filter(matchesEntity), [allLeads, matchesEntity])

  // Les notifications pointent /admin/crm/leads/:leadId : la fiche s'ouvre une fois le pipeline chargé.
  const { leadId: linkedLeadId } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    if (!linkedLeadId) return
    const linked = allLeads.find((lead) => lead._id === linkedLeadId)
    if (linked) setExpandedLead(linked)
  }, [linkedLeadId, allLeads])

  // Filtered & sorted leads for table view
  const filteredLeads = useMemo(() => {
    let leads = [...entityLeads]

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
    if (filterProject) leads = leads.filter((l) => l.project === filterProject)

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
  }, [entityLeads, search, filterStatus, filterPriority, filterAssignee, filterProject, sortField, sortDir])

  // Group leads by status for Monday.com style
  const groupedLeads = useMemo(() => {
    const groups: (CrmOption & { leads: Lead[] })[] = []
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
        project: form.project,
        // Sans choix explicite, le serveur déduit l'entité du projet.
        ...(form.entity ? { entity: form.entity } : {}),
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
      setError((err as Error).message || t('crm.error.create'))
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
      setError((err as Error).message || t('crm.error.update'))
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    setError('')
    try {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || t('crm.error.delete'))
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
      setError((err as Error).message || t('crm.error.convert'))
    } finally {
      setConverting(null)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault()
    if (!canManageCrm) return
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
        setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField, sortDir, setParam],
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
    setSearchParams(
      (params) => {
        for (const key of ['q', 'status', 'priority', 'owner', 'project', 'entity']) params.delete(key)
        return params
      },
      { replace: true },
    )
  }, [setSearchParams])

  const keepLead = (lead: Lead) => (!filterProject || lead.project === filterProject) && matchesEntity(lead)
  const projectColumns = columns.map((column) => ({
    ...column,
    leads: (column.leads || []).filter(keepLead),
  }))
  const projectGroups = worklist
    ? {
        overdue: worklist.groups.overdue.filter(keepLead),
        today: worklist.groups.today.filter(keepLead),
        upcoming: worklist.groups.upcoming.filter(keepLead),
        drifting: worklist.groups.drifting.filter(keepLead),
      }
    : null

  const worklistOverdueCount = projectGroups?.overdue.length ?? 0
  const lostReasons = worklist?.lostReasons ?? []
  const totalLeads = entityLeads.length
  const activeFilters = [filterStatus, filterPriority, filterAssignee, filterProject, filterEntity, search].filter(
    Boolean,
  ).length

  const entityFilterControl = (
    <label className="crm-entity-filter">
      {t('crm.col.entity')}
      <select value={filterEntity} onChange={(event) => setFilterEntity(event.target.value)}>
        <option value="">{t('crm.filters.allEntities')}</option>
        {CRM_ENTITIES.map((entity) => (
          <option key={entity.key} value={entity.key}>
            {t(entity.labelKey)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <CrmThresholdsContext.Provider value={worklist?.thresholds ?? DEFAULT_WORKLIST_THRESHOLDS}>
      <div className="portal-container crm-page-container pilotage-page pipeline-page">
        <PageHeader
          eyebrow={t('adminOps.pilotage.zone.commercial')}
          title={t('crm.page.title')}
          subtitle={t('crm.page.subtitleLeads')}
          actions={
            <div className="admin-actions portal-actions-reveal" style={{ gap: 8 }}>
              {/* View toggle */}
              <div className="crm-view-toggle">
                <button
                  className={`crm-view-btn ${viewMode === 'file' ? 'active' : ''}`}
                  onClick={() => changeViewMode('file')}
                  title={t('crm.page.viewQueue')}
                  aria-pressed={viewMode === 'file'}
                  aria-label={t('crm.page.viewQueue')}
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
                  <span className="crm-view-label">{t('crm.page.viewQueue')}</span>
                  {worklistOverdueCount > 0 && <span className="crm-view-btn-count">{worklistOverdueCount}</span>}
                </button>
                <button
                  className={`crm-view-btn ${viewMode === 'liste' ? 'active' : ''}`}
                  onClick={() => changeViewMode('liste')}
                  title={t('crmRich.view.enrichedTable')}
                  aria-pressed={viewMode === 'liste'}
                  aria-label={t('crmRich.view.enrichedTable')}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  <span className="crm-view-label">{t('crmRich.view.enrichedTable')}</span>
                </button>
                <button
                  className={`crm-view-btn crm-view-legacy ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => changeViewMode('table')}
                  title={t('crm.page.viewTable')}
                  aria-pressed={viewMode === 'table'}
                  aria-label={t('crm.page.viewTable')}
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
                  <span className="crm-view-label">{t('crm.page.viewTable')}</span>
                </button>
                <button
                  className={`crm-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                  onClick={() => changeViewMode('kanban')}
                  title={t('crm.page.viewKanban')}
                  aria-pressed={viewMode === 'kanban'}
                  aria-label={t('crm.page.viewKanban')}
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
                  <span className="crm-view-label">{t('crm.page.viewKanban')}</span>
                </button>
              </div>
              <button
                className="portal-button secondary portal-action-link"
                type="button"
                title={t('crm.page.exportCsv')}
                onClick={() => {
                  const headers = [
                    t('crm.col.company'),
                    t('crm.col.contact'),
                    t('crm.col.email'),
                    t('crm.detail.status'),
                    t('crm.export.priority'),
                    t('crm.col.budget'),
                    t('crm.export.assignee'),
                  ]
                  const rows = filteredLeads.map((lead) => [
                    lead.company || '',
                    lead.contactName || '',
                    lead.contactEmail || '',
                    STATUS_MAP[lead.status] ? t(STATUS_MAP[lead.status].labelKey) : lead.status || '',
                    PRIORITY_MAP[lead.priority || '']
                      ? t(PRIORITY_MAP[lead.priority || ''].labelKey)
                      : lead.priority || '',
                    lead.budget != null ? String(lead.budget) : '',
                    adminsById[lead.assignedTo || '']?.name || t('crm.export.unassigned'),
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
                <span className="portal-action-label">{t('crm.page.exportCsv')}</span>
              </button>
              {canManageCrm && (
                <button className="portal-button" onClick={() => setShowForm((v) => !v)}>
                  {showForm ? t('crm.page.hideForm') : t('crm.page.newLead')}
                </button>
              )}
              {canManageCrm && (
                <Link className="crm-settings-link" to="/admin/crm/settings" title={t('crm.page.automationSettings')}>
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
                  {t('crm.page.automations')}
                </Link>
              )}
            </div>
          }
        />

        {error && (
          <div className="admin-error" style={{ marginTop: 24 }}>
            {error}
          </div>
        )}

        {/* Lead creation form (collapsible) */}
        {showForm && canManageCrm && (
          <LeadFormPanel
            form={form}
            admins={admins}
            isSuperAdmin={user?.role === 'SUPER_ADMIN'}
            canManageCrm={canManageCrm}
            onFormChange={setForm}
            onSubmit={handleCreateLead}
            onClose={() => setShowForm(false)}
          />
        )}

        {/* Main content area */}
        <div
          className="portal-card"
          style={{
            marginTop: 12,
            padding: viewMode === 'table' || viewMode === 'liste' ? 0 : undefined,
            overflow: 'visible',
          }}
        >
          {viewMode !== 'liste' && entityFilterControl}
          {viewMode !== 'table' && viewMode !== 'liste' && (
            <label className="crm-table-toolbar">
              {t('crm.col.project')}
              <select value={filterProject} onChange={(event) => setFilterProject(event.target.value)}>
                <option value="">{t('crm.filters.allProjects')}</option>
                {CRM_PROJECTS.map((project) => (
                  <option key={project.key} value={project.key}>
                    {t(project.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {viewMode === 'file' ? (
            <WorklistView
              groups={projectGroups}
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
          ) : loading && !(viewMode === 'liste' && allLeads.length > 0) ? (
            <div className="admin-loading" style={{ padding: 32 }}>
              {t('crm.page.loadingPipeline')}
            </div>
          ) : viewMode === 'liste' ? (
            <RichLeadTable
              leads={entityLeads}
              admins={admins}
              adminsById={adminsById}
              canManageCrm={canManageCrm}
              currentUserId={user?._id}
              onOpenLead={setExpandedLead}
              onReload={load}
              onError={setError}
              entityFilter={entityFilterControl}
              project={filterProject}
              onProjectChange={setFilterProject}
            />
          ) : viewMode === 'kanban' ? (
            <div className="crm-board">
              {projectColumns.map((column) => (
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
                  onOpenDetail={setExpandedLead}
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
              filterProject={filterProject}
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
              onFilterProjectChange={setFilterProject}
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
            />
          )}
        </div>

        {/* Modal for interaction notes */}
        {expandedLead && (
          <LeadDetailModal
            lead={expandedLead}
            admins={admins}
            canManageCrm={canManageCrm}
            converting={converting}
            onClose={() => {
              setExpandedLead(null)
              if (linkedLeadId) navigate('/admin/crm', { replace: true })
            }}
            onLeadChange={setExpandedLead}
            onUpdateLead={handleUpdateLead}
            onConvertToClient={handleConvertToClient}
            mergeCandidates={allLeads}
            onMerged={async () => {
              // Le lead de la fiche a été absorbé puis supprimé : on ferme la fiche et on recharge.
              setExpandedLead(null)
              if (linkedLeadId) navigate('/admin/crm', { replace: true })
              await load()
            }}
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
          title={t('crm.row.convertToClient')}
          message={convertTarget ? t('crm.convert.message', { company: convertTarget.company }) : ''}
          confirmLabel={t('crm.convert.confirm')}
          cancelLabel={t('common.cancel')}
          variant="info"
          onConfirm={confirmConvertToClient}
          onCancel={() => setConvertTarget(null)}
        />
      </div>
    </CrmThresholdsContext.Provider>
  )
}

export default CrmBoard
