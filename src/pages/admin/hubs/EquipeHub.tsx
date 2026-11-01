import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const InternList = lazy(() => import('../InternList'))
const AdminList = lazy(() => import('../AdminList'))
const ToolAccessList = lazy(() => import('../ToolAccessList'))

export default function EquipeHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.equipe}
      panels={{
        membres: <InternList />,
        comptes: <AdminList />,
        'acces-outils': <ToolAccessList />,
      }}
    />
  )
}
