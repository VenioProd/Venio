import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const AdminChangeRequests = lazy(() => import('../change-requests'))
const TicketList = lazy(() => import('../TicketList'))

export default function DemandesHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.demandes}
      panels={{
        clients: <AdminChangeRequests />,
        equipe: <TicketList />,
      }}
    />
  )
}
