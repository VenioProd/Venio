import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ChartLine, Phone, SquareKanban, Sun } from 'lucide-react'
import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import {
  CRM_HOME_PATH,
  CRM_MOMENTS,
  CRM_PLAN_PATH,
  crmTabsOf,
  resolveCrmMoment,
  resolveCrmTab,
  visibleCrmTabs,
  type CrmMomentId,
  type CrmTabId,
} from '../../../lib/crmNavigation'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { apiFetch } from '../../../lib/api'
import type { WorklistGroupKey, WorklistResponse } from '../../../types/crm.types'
import { CrmMomentNav, CrmPageHead, CrmSubtabs } from '../../../components/admin/crm-ui'
import { CrmTitleSlot } from '../../../components/admin/crm-ui/crmTitleSlot'
import '../../../components/admin/ui/AdminHub.css'
import '../crm-board/crm.css'
import { fetchRuns } from '../crm-board/automations/api'
import CrmCallProvider from '../crm-board/call-dock/CrmCallProvider'
import { TEAM_CALL_DESK_PREFIX } from '../crm-board/teamDeskApi'

const CrmBoard = lazy(() => import('../CrmBoard'))
const ClientAccountList = lazy(() => import('../ClientAccountList'))
const ExternalSales = lazy(() => import('../ExternalSales'))
const TeamCallDesk = lazy(() => import('../crm-board/TeamCallDesk'))
const ScriptReportsView = lazy(() => import('../../../components/callScriptReport/ScriptReportsView'))
const CrmAutomations = lazy(() => import('../crm-board/automations'))
const CrmSettings = lazy(() => import('../crm-settings'))
const PilotageSection = lazy(() => import('../analytics/crm'))
const ForecastSection = lazy(() => import('../analytics/crm/ForecastSection'))
const CrmPlan = lazy(() => import('../crm-plan/CrmPlan'))

const MOMENT_ICONS: Record<CrmMomentId, ReactNode> = {
  aujourdhui: <Sun size={16} />,
  prospecter: <Phone size={16} />,
  suivre: <SquareKanban size={16} />,
  piloter: <ChartLine size={16} />,
}

/** Groupes de la file de travail montrés par chaque sous-onglet d'« Aujourd'hui ». */
const QUEUE_GROUPS: Partial<Record<CrmTabId, WorklistGroupKey[]>> = {
  jour: ['overdue', 'today'],
  semaine: ['upcoming'],
  filer: ['drifting'],
}

/** Le softphone de l'équipe enveloppe toute la coque : un appel survit au changement d'écran du CRM. */
export default function CrmHub() {
  return (
    <CrmCallProvider>
      <CrmHubScreen />
    </CrmCallProvider>
  )
}

function CrmHubScreen() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const [counts, setCounts] = useState<WorklistResponse['counts']>()
  const [pending, setPending] = useState<number>()
  // Analyses d'appel à valider : « Aujourd'hui » les compte dans ce qui est à traiter.
  const [analyses, setAnalyses] = useState<number>()
  // Nombre de `CrmPageHead` posés par l'écran courant (voir crmTitleSlot).
  const [screenTitles, setScreenTitles] = useState(0)
  const titleSlot = useMemo(
    () => ({
      register: () => {
        setScreenTitles((count) => count + 1)
        return () => setScreenTitles((count) => count - 1)
      },
    }),
    [],
  )
  const canView = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  // Référence stable : CrmBoard la met dans les dépendances de son chargement. L'écran « Aujourd'hui »
  // y joint le nombre d'analyses à valider.
  const onWorklistCounts = useCallback((next: WorklistResponse['counts'], nextAnalyses?: number) => {
    setCounts(next)
    if (nextAnalyses !== undefined) setAnalyses(nextAnalyses)
  }, [])
  useEffect(() => {
    if (!canManage) return
    let active = true
    apiFetch<{ analysesTotal?: number }>(`${TEAM_CALL_DESK_PREFIX}/pending`)
      .then((data) => {
        if (active && typeof data.analysesTotal === 'number') setAnalyses(data.analysesTotal)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [canManage])
  useEffect(() => {
    if (!canView) return
    let active = true
    apiFetch<WorklistResponse>('/api/admin/crm/worklist')
      .then((data) => {
        if (active && data.counts) setCounts(data.counts)
      })
      .catch(() => {})
    fetchRuns({ status: 'PENDING', pageSize: 1 })
      .then((data) => {
        if (active) setPending(data.total)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [canView])

  if (loading) return null
  const visible = visibleCrmTabs(user)
  if (visible.length === 0) return <Navigate to="/admin/mon-espace" replace />

  const path = location.pathname.replace(/\/$/, '')
  const suffix = `${location.search}${location.hash}`
  const isPlan = path === CRM_PLAN_PATH
  const isLead = path.startsWith('/admin/crm/leads/')
  const tab = isPlan ? null : resolveCrmTab(path, location.search)
  if (!isPlan) {
    const moment = tab?.moment ?? resolveCrmMoment(path)
    // Racine d'un moment, ou onglet interdit : premier onglet permis du moment, sinon du CRM.
    if (!tab || (!isLead && !visible.includes(tab))) {
      const target = (moment && crmTabsOf(moment as CrmMomentId, visible)[0]) || visible[0]
      return <Navigate to={`${target.to}${suffix}`} replace />
    }
  }

  const todayCount = counts ? counts.overdue + counts.today + (canManage ? (analyses ?? 0) : 0) : undefined
  const tabCount = (id: CrmTabId): number | undefined => {
    if (!counts && id !== 'automatisations') return undefined
    switch (id) {
      case 'jour':
        return todayCount
      case 'semaine':
        return counts?.upcoming
      case 'filer':
        return counts?.drifting
      case 'automatisations':
        return pending
      default:
        return undefined
    }
  }
  const currentMoment = tab?.moment as CrmMomentId | undefined
  const moments = CRM_MOMENTS.flatMap((moment) => {
    const first = crmTabsOf(moment.id, visible)[0]
    if (!first) return []
    return [
      {
        id: moment.id,
        label: t(moment.labelKey),
        to: first.to,
        icon: MOMENT_ICONS[moment.id],
        hint:
          moment.id === 'aujourdhui' && todayCount !== undefined
            ? t('shell.crm.hint.toDo', { count: todayCount })
            : undefined,
        current: moment.id === currentMoment,
      },
    ]
  })

  const panel = (id: CrmTabId): ReactNode => {
    switch (id) {
      case 'jour':
      case 'semaine':
      case 'filer':
        return <CrmBoard queue worklistGroups={QUEUE_GROUPS[id]} onWorklistCounts={onWorklistCounts} />
      case 'poste':
        return <TeamCallDesk />
      case 'scripts':
        return <ScriptReportsView base="/api/admin/crm/script-reports" team />
      case 'pipeline':
        return <CrmBoard onWorklistCounts={onWorklistCounts} />
      case 'comptes':
        return <ClientAccountList />
      case 'partenaires':
        return <ExternalSales />
      case 'previsions':
        return (
          <>
            <ForecastSection head />
            <PilotageSection crmEntities={user?.crmEntities} head={false} />
          </>
        )
      case 'automatisations':
        return <CrmAutomations onPendingCount={setPending} />
      case 'reglages':
        return <CrmSettings />
    }
  }

  const loadingFallback = <p role="status">{t('shell.hub.loading')}</p>
  return (
    <div className="admin-hub crm-hub crm-ui-shell">
      <CrmMomentNav label={t('shell.crm.momentsAria')} moments={moments} />
      {tab && currentMoment ? (
        <CrmSubtabs
          label={t('shell.crm.subtabsAria', {
            moment: t(CRM_MOMENTS.find((moment) => moment.id === currentMoment)!.labelKey),
          })}
          tabs={crmTabsOf(currentMoment, visible).map((entry) => ({
            id: entry.id,
            label: t(entry.labelKey),
            to: entry.to,
            count: tabCount(entry.id),
            current: entry.id === tab.id,
          }))}
          extra={{ label: t('shell.crm.plan'), to: CRM_PLAN_PATH }}
        />
      ) : (
        <CrmSubtabs
          label={t('shell.crm.plan')}
          tabs={[{ id: 'back', label: t('shell.crm.backToCrm'), to: CRM_HOME_PATH }]}
        />
      )}
      <section className="admin-hub-panel" data-hub-tab={tab?.id ?? 'plan'}>
        {/* Les écrans montés tels quels ont leur titre masqué dans un panneau de hub
            (AdminPortal.css, `.admin-hub-panel .pilotage-page`…) : la coque le porte,
            jusqu'à ce que l'écran pose son propre CrmPageHead. */}
        {tab && !isLead && screenTitles === 0 && <CrmPageHead shell title={t(tab.labelKey)} />}
        <CrmTitleSlot.Provider value={titleSlot}>
          <Suspense fallback={loadingFallback}>
            {/* La fiche d'un lead reste montée par le pipeline, quel que soit l'onglet mis en avant. */}
            {tab ? panel(isLead ? 'pipeline' : tab.id) : <CrmPlan visibleTabs={visible} />}
          </Suspense>
        </CrmTitleSlot.Provider>
      </section>
    </div>
  )
}
