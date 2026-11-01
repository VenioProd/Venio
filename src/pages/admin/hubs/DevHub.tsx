import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const DevWorkspace = lazy(() => import('../dev-workspace'))
const DevIdeas = lazy(() => import('../dev-workspace/IdeasBox'))
const BetaWorkspace = lazy(() => import('../beta'))

export default function DevHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.dev}
      panels={{
        workspace: <DevWorkspace />,
        idees: <DevIdeas />,
        recette: <BetaWorkspace />,
      }}
    />
  )
}
