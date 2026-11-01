import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const QualiopiBoard = lazy(() => import('../QualiopiBoard'))
const EducationWorkspace = lazy(() => import('../education'))

export default function FormationHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.formation}
      panels={{
        qualiopi: <QualiopiBoard />,
        pedagogie: <EducationWorkspace />,
      }}
    />
  )
}
