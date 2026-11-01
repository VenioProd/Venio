import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const DevWorkspace = lazy(() => import('../dev-workspace'))
const BetaWorkspace = lazy(() => import('../beta'))

export default function DevHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.dev}
      panels={{
        workspace: <DevWorkspace />,
        recette: <BetaWorkspace />,
      }}
    />
  )
}
