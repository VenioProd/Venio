import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { createPortal } from 'react-dom'
import { logInteraction } from '../../../services/interactions'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ConfirmModal from '../../../components/ConfirmModal'
import type {
  Lead,
  LeadFormData,
  PipelineColumn,
  AdminUser,
  WorklistGroupKey,
  WorklistResponse,
} from '../../../types/crm.types'
import { CRM_PATHS, CRM_QUEUE_ORIGINS, crmQueueOrigin, resolveCrmTab } from '../../../lib/crmNavigation'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import './crm.css'

import PipelineColumnComponent from './PipelineColumn'
import RichLeadTable from './rich/RichLeadTable'
import LeadFormPanel from './LeadFormPanel'
import LeadDetailPage from './LeadDetailPage'
import WorklistView from './worklist/WorklistView'
import LostReasonDialog from './LostReasonDialog'
import Dialog from './automations/Dialog'
import './automations/automations.css'
import { DEFAULT_FOLLOW_UP } from './worklist/helpers'
import { CrmThresholdsContext } from './thresholdsContext'
import {
  DEFAULT_WORKLIST_THRESHOLDS,
  CRM_PROJECTS,
  CRM_ENTITIES,
  leadEntity,
  parseEntityParam,
  EMPTY_FORM,
} from './constants'

const CrmBoard = ({
  queue = false,
  worklistGroups,
  onWorklistCounts,
}: {
  queue?: boolean
  /** File seulement : groupes montrés (sous-onglets d'« Aujourd'hui »). Tous par défaut. */
  worklistGroups?: readonly WorklistGroupKey[]
  /** Compteurs de la file, remontés à la coque après chaque chargement. */
  onWorklistCounts?: (counts: WorklistResponse['counts']) => void
}) => {
  const { user } = useAuth()
  const { t } = useI18n()
  const canManageCrm = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const [columns, setColumns] = useState<PipelineColumn[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const { leadId: linkedLeadId } = useParams()
  const requestedMode = searchParams.get('mode')
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const viewMode = queue || requestedMode === 'file' ? 'file' : requestedMode === 'kanban' ? 'kanban' : 'liste'
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (linkedLeadId || viewMode === 'file' || mobile) return
    const board = boardRef.current
    const measure = () => {
      if (!board) return
      board.style.setProperty('--crm-board-top', `${board.getBoundingClientRect().top + window.scrollY}px`)
      const main = board.closest('main')
      board.style.setProperty(
        '--crm-board-bottom',
        `${main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0}px`,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    const header = board?.closest('.crm-hub')?.querySelector('header')
    if (header) observer.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [viewMode, mobile, linkedLeadId])
  const exportRich = useRef<(() => void) | null>(null)
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
  // Patch mis en attente le temps que l'utilisateur donne un motif de perte.
  const [lostTarget, setLostTarget] = useState<{
    lead: Lead
    apply: (patch: Record<string, unknown>) => Promise<unknown>
  } | null>(null)
  const [showForm, setShowForm] = useState<boolean>(false)

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
      const data = await apiFetch<WorklistResponse>('/api/admin/crm/worklist')
      setWorklist(data)
      if (data.counts) onWorklistCounts?.(data.counts)
    } catch (err: unknown) {
      setError((err as Error).message || translate('crm.error.loadWorklist'))
    } finally {
      setWorklistLoading(false)
    }
  }, [onWorklistCounts])

  const load = async () => {
    if (!columns.length) setLoading(true)
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
      if (worklistRes.counts) onWorklistCounts?.(worklistRes.counts)
    } catch (err: unknown) {
      setError((err as Error).message || t('crm.error.load'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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
      await patchLead(leadId, { lastContactAt: new Date().toISOString(), nextActionAt: payload.nextActionAt })
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

  const navigate = useNavigate()
  const location = useLocation()
  const backParams = new URLSearchParams(location.search)
  // `from` dit quel écran de la file a ouvert la fiche ; sans lui, retour au pipeline.
  const queueTab = CRM_QUEUE_ORIGINS[backParams.get('from') ?? '']
  const returnTo = queueTab ? CRM_PATHS[queueTab] : CRM_PATHS.pipeline
  backParams.delete('from')
  const callRequested = backParams.get('appel') === '1'
  backParams.delete('appel')
  const closeDetail = () => navigate(`${returnTo}?${backParams}${location.hash}`)
  const openDetail = (lead: Lead, options: { call?: boolean } = {}) => {
    const params = new URLSearchParams(searchParams)
    params.delete('appel')
    params.set('scroll', String(Math.round(window.scrollY)))
    params.set('tableScroll', String(Math.round(boardRef.current?.querySelector('.rich-table-wrap')?.scrollTop || 0)))
    params.set('boardX', String(Math.round(boardRef.current?.querySelector('.crm-board')?.scrollLeft || 0)))
    params.set('tableX', String(Math.round(boardRef.current?.querySelector('.rich-table-wrap')?.scrollLeft || 0)))
    boardRef.current?.querySelectorAll<HTMLElement>('.crm-column').forEach((column) => {
      params.set(`columnScroll_${column.dataset.status}`, String(Math.round(column.scrollTop)))
    })
    if (queue || requestedMode === 'file') {
      const current = resolveCrmTab(location.pathname)
      params.set('from', (current && crmQueueOrigin(current.id)) || 'queue')
    }
    setSearchParams(new URLSearchParams(params), { replace: true })
    setExpandedLead(lead)
    // `appel=1` ne vaut que pour la fiche : il n'entre pas dans l'adresse de la liste.
    const target = new URLSearchParams(params)
    if (options.call) target.set('appel', '1')
    navigate(`/admin/crm/leads/${lead._id}?${target}${location.hash}`)
  }
  useEffect(() => {
    if (!linkedLeadId) {
      setExpandedLead(null)
      return
    }
    let active = true
    setExpandedLead(null)
    apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${linkedLeadId}`)
      .then(({ lead }) => {
        if (active) setExpandedLead(lead)
      })
      .catch((err) => {
        if (active) setError((err as Error).message || t('crm.error.load'))
      })
    window.scrollTo?.(0, 0)
    return () => {
      active = false
    }
  }, [linkedLeadId])
  useEffect(() => {
    if (linkedLeadId || loading) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo?.(0, Number(searchParams.get('scroll')) || 0)
    })
    return () => cancelAnimationFrame(frame)
  }, [linkedLeadId, loading, viewMode])
  useEffect(() => {
    if (requestedMode === 'table') setParam('mode', 'liste')
  }, [requestedMode, setParam])

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
      const result = await apiFetch<{ lead: Lead }>('/api/admin/crm/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setForm({ ...EMPTY_FORM })
      setShowForm(false)
      putLead(result.lead)
      void loadWorklist()
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

  const findLead = (leadId: string) =>
    allLeads.find((item) => item._id === leadId) ?? (expandedLead?._id === leadId ? expandedLead : null)

  const putLead = (lead: Lead) => {
    setColumns((current) => {
      const next = current.map((column) => ({
        ...column,
        leads: (column.leads || []).filter((item) => item._id !== lead._id),
      }))
      if (lead.archivedAt) return next
      const column = next.find((item) => item.status === lead.status)
      if (column) column.leads = [...column.leads, lead]
      else next.push({ status: lead.status, leads: [lead] })
      return next
    })
    setExpandedLead((current) => (current?._id === lead._id ? lead : current))
  }

  const patchLead = async (leadId: string, patch: Record<string, unknown>) => {
    const previous = findLead(leadId)
    if (previous)
      putLead({
        ...previous,
        ...patch,
        ...('consent' in patch ? { consent: { ...previous.consent, ...(patch.consent as Lead['consent']) } } : {}),
        ...('automationPaused' in patch
          ? { automationPausedAt: patch.automationPaused ? new Date().toISOString() : null }
          : {}),
      } as Lead)
    try {
      const { lead } = await apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      if (lead) putLead(lead)
      return lead
    } catch (error) {
      if (previous) putLead(previous)
      throw error
    }
  }

  const handleUpdateLead = async (leadId: string, patch: Record<string, unknown>) => {
    const lead = findLead(leadId)
    if (needsLostReason(patch) && lead) {
      setLostTarget({ lead, apply: (extra) => handleUpdateLead(leadId, { ...patch, ...extra }) })
      return
    }
    setError('')
    try {
      await patchLead(leadId, patch)
      void loadWorklist()
    } catch (err: unknown) {
      setError((err as Error).message || t('crm.error.update'))
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    setError('')
    const previous = findLead(leadId)
    setColumns((current) =>
      current.map((column) => ({ ...column, leads: column.leads.filter((lead) => lead._id !== leadId) })),
    )
    try {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'DELETE' })
      if (linkedLeadId === leadId) closeDetail()
      setExpandedLead((lead) => (lead?._id === leadId ? null : lead))
      void loadWorklist()
    } catch (err: unknown) {
      if (previous) putLead(previous)
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
      const res = await apiFetch<{ client?: { _id: string; name: string }; lead?: Lead }>(
        `/api/admin/crm/leads/${lead._id}/convert-to-client`,
        {
          method: 'POST',
        },
      )
      if (res.client) {
        setError('')
        putLead(res.lead ?? { ...lead, clientAccountId: res.client._id })
        void loadWorklist()
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

  const keepLead = (lead: Lead) => (!filterProject || lead.project === filterProject) && matchesEntity(lead)
  const shownGroup = (key: WorklistGroupKey) => !worklistGroups || worklistGroups.includes(key)
  const projectGroups = worklist
    ? {
        overdue: shownGroup('overdue') ? worklist.groups.overdue.filter(keepLead) : [],
        today: shownGroup('today') ? worklist.groups.today.filter(keepLead) : [],
        upcoming: shownGroup('upcoming') ? worklist.groups.upcoming.filter(keepLead) : [],
        drifting: shownGroup('drifting') ? worklist.groups.drifting.filter(keepLead) : [],
      }
    : null

  const lostReasons = worklist?.lostReasons ?? []
  const entityFilterControl = (
    <label className="crm-entity-filter">
      {t('crm.col.entity')}
      <select value={filterEntity} onChange={(event) => setFilterEntity(event.target.value)}>
        <option value="">{t('crm.filters.allEntities')}</option>
        {CRM_ENTITIES.filter((entity) => !user?.crmEntities?.length || user.crmEntities.includes(entity.key)).map(
          (entity) => (
            <option key={entity.key} value={entity.key}>
              {t(entity.labelKey)}
            </option>
          ),
        )}
      </select>
    </label>
  )

  return (
    <CrmThresholdsContext.Provider value={worklist?.thresholds ?? DEFAULT_WORKLIST_THRESHOLDS}>
      <div
        ref={boardRef}
        className={`portal-container crm-page-container pilotage-page pipeline-page ${!linkedLeadId && viewMode !== 'file' ? 'crm-table-page' : ''}`}
      >
        {error &&
          createPortal(
            <div className="crm-action-toast" role="alert">
              {error}
              <button type="button" onClick={() => setError('')} aria-label={t('common.close')}>
                ×
              </button>
            </div>,
            document.body,
          )}

        {!linkedLeadId && (
          <>
            <PageHeader
              eyebrow={t('adminOps.pilotage.zone.commercial')}
              title={t(queue ? 'shell.hub.crm.queue' : 'shell.hub.crm.pipeline')}
              subtitle={t('crm.page.subtitleLeads')}
              actions={
                <div className="admin-actions portal-actions-reveal" style={{ gap: 8 }}>
                  {/* View toggle */}
                  {!queue && (
                    <div className="crm-view-toggle">
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
                  )}
                  {!queue && (
                    <button
                      className="portal-button secondary portal-action-link"
                      type="button"
                      title={t('crm.page.exportCsv')}
                      onClick={() => exportRich.current?.()}
                      disabled={viewMode !== 'liste'}
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
                  )}
                  {canManageCrm && (
                    <button className="portal-button" onClick={() => setShowForm((v) => !v)}>
                      {showForm ? t('crm.page.hideForm') : t('crm.page.newLead')}
                    </button>
                  )}
                </div>
              }
            />

            {showForm && canManageCrm && (
              <Dialog
                titleId="crm-create-title"
                className="crm-auto-dlg crm-create-dialog"
                onClose={() => setShowForm(false)}
              >
                <LeadFormPanel
                  form={form}
                  crmEntities={user?.crmEntities}
                  admins={admins}
                  isSuperAdmin={user?.role === 'SUPER_ADMIN'}
                  canManageCrm={canManageCrm}
                  onFormChange={setForm}
                  onSubmit={handleCreateLead}
                  onClose={() => setShowForm(false)}
                />
              </Dialog>
            )}

            {/* Main content area */}
            <div
              className="portal-card crm-board-content"
              style={{
                marginTop: 12,
                padding: viewMode !== 'file' ? 0 : undefined,
                overflow: 'visible',
              }}
            >
              {viewMode === 'file' && entityFilterControl}
              {viewMode === 'file' && (
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
                  loading={!worklist && (loading || worklistLoading)}
                  busyLeadId={busyLeadId}
                  onPatch={handleWorklistPatch}
                  onLogContact={handleLogContact}
                  onAddNote={handleAddNote}
                  onOpenDetail={openDetail}
                  onCall={canManageCrm ? (lead) => openDetail(lead, { call: true }) : undefined}
                />
              ) : loading && allLeads.length === 0 ? (
                <div className="admin-loading" style={{ padding: 32 }}>
                  {t('crm.page.loadingPipeline')}
                </div>
              ) : (
                <RichLeadTable
                  leads={entityLeads}
                  exportRef={exportRich}
                  updatedLead={expandedLead}
                  admins={admins}
                  adminsById={adminsById}
                  canManageCrm={canManageCrm}
                  currentUserId={user?._id}
                  onOpenLead={openDetail}
                  onUpdateLead={handleUpdateLead}
                  onReload={load}
                  onError={setError}
                  entityFilter={entityFilterControl}
                  project={filterProject}
                  onProjectChange={setFilterProject}
                  renderBoard={
                    viewMode === 'kanban'
                      ? (leads) => (
                          <div className="crm-board">
                            {columns.map((column) => (
                              <PipelineColumnComponent
                                key={column.status}
                                column={{ ...column, leads: leads.filter((lead) => lead.status === column.status) }}
                                admins={admins}
                                adminsById={adminsById}
                                canManageCrm={canManageCrm}
                                converting={converting}
                                onUpdateLead={handleUpdateLead}
                                onConvertToClient={handleConvertToClient}
                                onDrop={handleDrop}
                                onDragStart={handleDragStart}
                                onOpenDetail={openDetail}
                              />
                            ))}
                          </div>
                        )
                      : undefined
                  }
                />
              )}
            </div>
          </>
        )}

        {linkedLeadId &&
          (expandedLead ? (
            <LeadDetailPage
              key={expandedLead._id}
              lead={expandedLead}
              admins={admins}
              canManageCrm={canManageCrm}
              converting={converting}
              onClose={closeDetail}
              onLeadChange={setExpandedLead}
              onUpdateLead={handleUpdateLead}
              onConvertToClient={handleConvertToClient}
              onDeleteLead={handleDeleteLead}
              focusCall={callRequested}
              mergeCandidates={allLeads}
              onMerged={async () => {
                closeDetail()
                await load()
              }}
            />
          ) : (
            <div role="status">
              {error || t('crm.page.loadingPipeline')}
              <button className="portal-button secondary" onClick={closeDetail}>
                {t('crm.detail.back')}
              </button>
            </div>
          ))}

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

        {createPortal(
          <ConfirmModal
            isOpen={convertTarget !== null}
            title={t('crm.row.convertToClient')}
            message={convertTarget ? t('crm.convert.message', { company: convertTarget.company }) : ''}
            confirmLabel={t('crm.convert.confirm')}
            cancelLabel={t('common.cancel')}
            variant="info"
            onConfirm={confirmConvertToClient}
            onCancel={() => setConvertTarget(null)}
          />,
          document.body,
        )}
      </div>
    </CrmThresholdsContext.Provider>
  )
}

// ── Lot 1 de la refonte : la file de travail (`queue`, sous-onglets d'« Aujourd'hui ») est l'écran `crm-today`.
// Composant distinct plutôt qu'un retour anticipé : passer d'« Aujourd'hui » au pipeline remonte l'écran
// au lieu de réutiliser ses hooks. Le mode `?mode=file` du pipeline reste celui de CrmBoard.
import CrmToday from '../crm-today'

const CrmBoardEntry = (props: React.ComponentProps<typeof CrmBoard>) =>
  props.queue ? (
    <CrmToday worklistGroups={props.worklistGroups} onWorklistCounts={props.onWorklistCounts} />
  ) : (
    <CrmBoard {...props} />
  )

export default CrmBoardEntry
