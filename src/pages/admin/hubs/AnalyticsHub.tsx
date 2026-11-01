import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'
import { useAuth } from '../../../context/AuthContext'

const Analytics = lazy(() => import('../analytics'))
const MyReports = lazy(() => import('../MyReports'))
const AdminDashboard = lazy(() => import('../AdminDashboard'))
const SuperAdminDashboard = lazy(() => import('../SuperAdminDashboard'))

function BusinessDashboard() {
  const { user } = useAuth()
  return user?.role === 'SUPER_ADMIN' ? <SuperAdminDashboard /> : <AdminDashboard />
}

export default function AnalyticsHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.analytics}
      panels={{
        business: <BusinessDashboard />,
        projets: <Analytics />,
        rapports: <MyReports />,
      }}
    />
  )
}
