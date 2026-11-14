import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Play, Plus } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { CRM_PATHS, crmQueueOrigin, type CrmTabId } from '../../../lib/crmNavigation'
import { CrmBanner, CrmPageHead } from '../../../components/admin/crm-ui'
import type { Lead, LeadFormData, WorklistGroupKey, WorklistResponse } from '../../../types/crm.types'
import LostReasonDialog from '../crm-board/LostReasonDialog'
import LeadFormPanel from '../crm-board/LeadFormPanel'
import Dialog from '../crm-board/automations/Dialog'
import {
  CRM_ENTITIES,
  CRM_PROJECTS,
  DEFAULT_WORKLIST_THRESHOLDS,
  EMPTY_FORM,
  leadEntity,
  parseEntityParam,
} from '../crm-board/constants'
import { DEFAULT_FOLLOW_UP, clockLabel } from '../crm-board/worklist/helpers'
import DayView from './DayView'
import ListView from './ListView'
import { useTodayData, type PendingAnalysis, type PendingHold } from './useTodayData'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import '../crm-board/crm.css'
import '../crm-board/automations/automations.css'
import './crm-today.css'

type TodayTab = Extract<CrmTabId, 'jour' | 'semaine' | 'filer'>

/** Sous-onglet servi, déduit des groupes de la file que la coque demande (voir `QUEUE_GROUPS` de `CrmHub`). */
function tabOf(groups?: readonly WorklistGroupKey[]): TodayTab {
  if (groups?.includes('upcoming')) return 'semaine'
  if (groups?.includes('drifting')) return 'filer'
  return 'jour'
}

/** Paramètres de la liste qui ne suivent pas l'utilisateur dans la fiche. */
const OWN_PARAMS = ['from', 'appel', 'analyse', 'scroll']

/**
 * Moment « Aujourd'hui » du CRM (lot 1 de la refonte) : l'accueil du jour et
 * ses deux voisins, « Cette semaine » et « À ne pas laisser filer ». Mêmes
 * données et mêmes actions que l'ancienne file de travail ; s'y ajoutent, pour
 * qui gère le CRM, les analyses d'appel à valider et les retenues
 * d'opposition à décider (`GET /api/admin/call-desk/pending`).
 */
export default function CrmToday({
  worklistGroups,
  onWorklistCounts,
}: {
  worklistGroups?: readonly WorklistGroupKey[]
  onWorklistCounts?: (counts: WorklistResponse['counts'], analyses?: number) => void
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabOf(worklistGroups)
  const canManageCrm = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const data = useTodayData({ canManageCrm, onWorklistCounts })
  const [lostTarget, setLostTarget] = useState<{ lead: Lead; patch: Record<string, unknown> } | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<LeadFormData>({ ...EMPTY_FORM })
  const [holdAnnouncement, setHoldAnnouncement] = useState('')

  // L'heure du surtitre et la ligne « maintenant » avancent avec la journée.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Filtres Entité et Projet, portés par l'URL comme dans l'ancienne file.
  const requestedProject = searchParams.get('project') || ''
  const filterProject = CRM_PROJECTS.some((project) => project.key === requestedProject) ? requestedProject : ''
  const filterEntity = parseEntityParam(searchParams.get('entity'))
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
  const keep = useCallback(
    (lead: Lead) =>
      (!filterProject || lead.project === filterProject) && (!filterEntity || leadEntity(lead) === filterEntity),
    [filterProject, filterEntity],
  )
  const groups = useMemo(() => {
    const source = data.worklist?.groups
    if (!source) return null
    return {
      overdue: source.overdue.filter(keep),
      today: source.today.filter(keep),
      upcoming: source.upcoming.filter(keep),
      drifting: source.drifting.filter(keep),
    }
  }, [data.worklist, keep])
  const filtered = Boolean(filterProject || filterEntity)

  // Retour de la fiche : la liste reprend sa position.
  useEffect(() => {
    if (data.loading) return
    const frame = requestAnimationFrame(() => window.scrollTo?.(0, Number(searchParams.get('scroll')) || 0))
    return () => cancelAnimationFrame(frame)
  }, [data.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Adresse de la fiche, ouverte depuis cet onglet : `from` y ramène, les filtres suivent. */
  const leadHref = useCallback(
    (leadId: string, extra: Record<string, string> = {}) => {
      const params = new URLSearchParams(location.search)
      for (const key of OWN_PARAMS) params.delete(key)
      params.set('from', crmQueueOrigin(tab) ?? 'queue')
      for (const [key, value] of Object.entries(extra)) params.set(key, value)
      return `${CRM_PATHS.lead(leadId)}?${params}`
    },
    [location.search, tab],
  )
  const openDetail = (lead: Lead, options: { call?: boolean } = {}) => {
    const scroll = String(Math.round(window.scrollY))
    // La liste garde sa position dans l'historique, la fiche la rapporte au retour.
    setParam('scroll', scroll)
    navigate(leadHref(lead._id, { scroll, ...(options.call ? { appel: '1' } : {}) }))
  }
  // Fiche ouverte sur l'appel analysé (`analyse=<id de l'appel>`, lu par la fiche du lead).
  const analysisHref = (analysis: PendingAnalysis) => leadHref(analysis.leadId, { analyse: analysis.callId })

  const handlePatch = async (leadId: string, patch: Record<string, unknown>) => {
    const lead = data.findLead(leadId)
    if (lead && data.needsLostReason(patch)) {
      setLostTarget({ lead, patch })
      return false
    }
    return data.patch(leadId, patch)
  }

  const onHoldDecided = (hold: PendingHold) => {
    setHoldAnnouncement(t('crmToday.holds.decided', { company: hold.company }))
    void data.loadPending()
    void data.loadWorklist()
  }

  const firstName = user?.name?.trim().split(/\s+/)[0]
  const dateText = formatDate(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const kicker = t('crmToday.kicker', {
    date: dateText.charAt(0).toLocaleUpperCase() + dateText.slice(1),
    time: clockLabel(now),
  })
  const startSession = canManageCrm ? (
    <Link className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big" to={CRM_PATHS.poste}>
      <Play aria-hidden="true" />
      {t('crmToday.startSession')}
    </Link>
  ) : undefined
  const newLead = canManageCrm ? (
    <button type="button" className="crm-ui-btn crm-ui-btn--big" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      {t('crmToday.newLead')}
    </button>
  ) : undefined
  const clearFilters = (
    <button
      type="button"
      className="crm-ui-btn"
      onClick={() =>
        setSearchParams(
          (params) => {
            params.delete('project')
            params.delete('entity')
            return params
          },
          { replace: true },
        )
      }
    >
      {t('crmToday.empty.clearFilters')}
    </button>
  )

  const todayTotal = groups ? groups.overdue.length + groups.today.length + (data.pending?.analysesTotal ?? 0) : 0
  const head =
    tab === 'jour' ? (
      <CrmPageHead
        kicker={kicker}
        title={firstName ? t('crmToday.greeting', { name: firstName }) : t('crmToday.greetingAnon')}
        lede={groups ? t('crmToday.lede', { count: todayTotal }) : undefined}
        actions={
          startSession || newLead ? (
            <>
              {newLead}
              {startSession}
            </>
          ) : undefined
        }
      />
    ) : (
      <CrmPageHead
        title={t(tab === 'semaine' ? 'shell.crm.tab.semaine' : 'shell.crm.tab.filer')}
        lede={
          groups
            ? t(tab === 'semaine' ? 'crmToday.week.lede' : 'crmToday.keep.lede', {
                count: (tab === 'semaine' ? groups.upcoming : groups.drifting).length,
              })
            : undefined
        }
        actions={newLead}
      />
    )

  const filters = (
    <div className="crm-today-filters" role="group" aria-label={t('crmToday.filters')}>
      <label>
        {t('crm.col.entity')}
        <select value={filterEntity} onChange={(event) => setParam('entity', event.target.value)}>
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
      <label>
        {t('crm.col.project')}
        <select value={filterProject} onChange={(event) => setParam('project', event.target.value)}>
          <option value="">{t('crm.filters.allProjects')}</option>
          {CRM_PROJECTS.map((project) => (
            <option key={project.key} value={project.key}>
              {t(project.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  const rowProps = {
    thresholds: data.worklist?.thresholds ?? DEFAULT_WORKLIST_THRESHOLDS,
    followUp: data.worklist?.followUp ?? DEFAULT_FOLLOW_UP,
    // L'attributaire n'est nommé que s'il n'est pas l'utilisateur : « sa » journée n'a pas à le répéter.
    adminsById: Object.fromEntries(
      data.admins.filter((admin) => admin._id !== user?._id).map((admin) => [admin._id, admin]),
    ),
    canManageCrm,
    busyLeadId: data.busyLeadId,
    onPatch: handlePatch,
    onLogContact: data.logContact,
    onAddNote: data.addNote,
    onOpenDetail: (lead: Lead) => openDetail(lead),
    onCall: canManageCrm ? (lead: Lead) => openDetail(lead, { call: true }) : undefined,
    detailHref: (lead: Lead) => leadHref(lead._id),
  }

  let body: React.ReactNode
  if (!groups) {
    body = data.loading ? <p role="status">{t('crmToday.loading')}</p> : null
  } else if (tab === 'jour') {
    body = (
      <DayView
        {...rowProps}
        groups={groups}
        pending={data.pending}
        pendingError={
          data.pendingError ? (
            <CrmBanner
              tone="amber"
              title={t('crmToday.pendingError')}
              actions={
                <button type="button" className="crm-ui-btn crm-ui-btn--sm" onClick={() => void data.loadPending()}>
                  {t('crmToday.retry')}
                </button>
              }
            />
          ) : null
        }
        now={now}
        currentUserId={user?._id}
        analysisHref={analysisHref}
        leadHref={(leadId) => leadHref(leadId)}
        onHoldDecided={onHoldDecided}
        extraAnnouncement={holdAnnouncement}
        emptyAction={startSession}
        filtered={filtered}
        clearFilters={clearFilters}
      />
    )
  } else {
    body = (
      <ListView
        {...rowProps}
        group={tab === 'semaine' ? 'upcoming' : 'drifting'}
        leads={tab === 'semaine' ? groups.upcoming : groups.drifting}
        filtered={filtered}
        clearFilters={clearFilters}
      />
    )
  }

  return (
    <div className="crm-today">
      {data.error &&
        createPortal(
          <div className="crm-action-toast" role="alert">
            {data.error}
            <button type="button" onClick={() => data.setError('')} aria-label={t('common.close')}>
              ×
            </button>
          </div>,
          document.body,
        )}
      {head}
      {filters}
      {body}

      {lostTarget && (
        <LostReasonDialog
          company={lostTarget.lead.company}
          reasons={data.lostReasons}
          saving={data.busyLeadId === lostTarget.lead._id}
          onCancel={() => setLostTarget(null)}
          onConfirm={async (payload) => {
            const target = lostTarget
            setLostTarget(null)
            await data.patch(target.lead._id, { ...target.patch, ...payload })
          }}
        />
      )}

      {creating && canManageCrm && (
        <Dialog
          titleId="crm-create-title"
          className="crm-auto-dlg crm-create-dialog"
          onClose={() => setCreating(false)}
        >
          <LeadFormPanel
            form={form}
            crmEntities={user?.crmEntities}
            admins={data.admins}
            isSuperAdmin={user?.role === 'SUPER_ADMIN'}
            canManageCrm={canManageCrm}
            onFormChange={setForm}
            onSubmit={async (event) => {
              event.preventDefault()
              if (await data.createLead(form)) {
                setForm({ ...EMPTY_FORM })
                setCreating(false)
              }
            }}
            onClose={() => setCreating(false)}
          />
        </Dialog>
      )}
    </div>
  )
}
