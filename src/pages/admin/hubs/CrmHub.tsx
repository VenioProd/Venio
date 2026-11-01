import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const CrmBoard = lazy(() => import('../CrmBoard'))
const ClientAccountList = lazy(() => import('../ClientAccountList'))
const ExternalSales = lazy(() => import('../ExternalSales'))
const CrmAutomations = lazy(() => import('../crm-board/automations'))

export default function CrmHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.crm}
      panels={{
        pipeline: <CrmBoard />,
        comptes: <ClientAccountList />,
        partenaires: <ExternalSales />,
        automatisations: <CrmAutomations />,
      }}
    />
  )
}
