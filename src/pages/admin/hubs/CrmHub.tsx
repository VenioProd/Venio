import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import { ADMIN_HUBS, canAccessHubModule, type AdminHubDefinition } from '../../../lib/adminHubs'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { apiFetch } from '../../../lib/api'
import type { WorklistResponse } from '../../../types/crm.types'
import PageHeader from '../../../components/admin/ui/PageHeader'
import HubTabs from '../../../components/admin/ui/HubTabs'
import '../crm-board/crm.css'
import { fetchRuns } from '../crm-board/automations/api'

const CrmBoard = lazy(() => import('../CrmBoard'))
const ClientAccountList = lazy(() => import('../ClientAccountList'))
const ExternalSales = lazy(() => import('../ExternalSales'))
const TeamCallDesk = lazy(() => import('../crm-board/TeamCallDesk'))
const ScriptReportsView = lazy(() => import('../../../components/callScriptReport/ScriptReportsView'))
const CrmAutomations = lazy(() => import('../crm-board/automations'))
const CrmSettings = lazy(() => import('../crm-settings'))
const PilotageSection = lazy(() => import('../analytics/crm'))
const ForecastSection = lazy(() => import('../analytics/crm/ForecastSection'))

export default function CrmHub() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const [overdue, setOverdue] = useState<number>()
  const [pending, setPending] = useState<number>()
  const canView = hasPermission(user, PERMISSIONS.VIEW_CRM)
  useEffect(() => {
    if (!canView) return
    let active = true
    apiFetch<WorklistResponse>('/api/admin/crm/worklist')
      .then((data) => {
        if (active && data.groups) setOverdue(data.groups.overdue.length)
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

  const query = new URLSearchParams(location.search)
  if (location.pathname === '/admin/crm' && query.get('mode') === 'file') {
    query.delete('mode')
    return <Navigate to={`/admin/crm/a-traiter${query.size ? `?${query}` : ''}${location.hash}`} replace />
  }
  if (location.pathname === '/admin/crm' && query.get('mode') === 'table') {
    query.set('mode', 'liste')
    return <Navigate to={`/admin/crm?${query}${location.hash}`} replace />
  }
  if (loading) return null
  const definition: AdminHubDefinition = ADMIN_HUBS.crm
  const panels: Record<string, ReactNode> = {
    queue: <CrmBoard queue onOverdueCount={setOverdue} />,
    appels: <TeamCallDesk />,
    scripts: <ScriptReportsView base="/api/admin/crm/script-reports" team />,
    pipeline: <CrmBoard onOverdueCount={setOverdue} />,
    pilotage: (
      <>
        <PilotageSection crmEntities={user?.crmEntities} />
        <ForecastSection />
      </>
    ),
    automatisations: <CrmAutomations onPendingCount={setPending} />,
    comptes: <ClientAccountList />,
    partenaires: <ExternalSales />,
    reglages: <CrmSettings />,
  }
  const leadDetail = location.pathname.startsWith('/admin/crm/leads/')
  return (
    <div className="admin-hub crm-hub">
      <HubTabs
        label={t('shell.hub.sectionsAria', { title: t(definition.titleKey) })}
        tabs={definition.tabs.map((tab) => ({
          id: tab.id,
          to: leadDetail && tab.id === 'pipeline' ? location.pathname : tab.to,
          label: t(tab.labelKey),
          count: tab.id === 'queue' ? overdue : tab.id === 'automatisations' ? pending : undefined,
          allowed: tab.permission
            ? hasPermission(user, tab.permission)
            : tab.modules.some((module) => canAccessHubModule(user, module)),
          content: <Suspense fallback={<p role="status">{t('shell.hub.loading')}</p>}>{panels[tab.id]}</Suspense>,
        }))}
      >
        {(tabs) => (
          <PageHeader
            eyebrow={t(definition.eyebrowKey)}
            title={t(definition.titleKey)}
            subtitle={t(definition.subtitleKey)}
            tabs={tabs}
          />
        )}
      </HubTabs>
    </div>
  )
}
