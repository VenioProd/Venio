import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const GestionBoard = lazy(() => import('../GestionBoard'))
const InternalProjectList = lazy(() => import('../InternalProjectList'))
const SubsidiaryList = lazy(() => import('../SubsidiaryList'))
const TemplateList = lazy(() => import('../TemplateList'))

export default function ProjetsHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.projets}
      panels={{
        clients: <GestionBoard />,
        internes: <InternalProjectList />,
        plateformes: <SubsidiaryList />,
        modeles: <TemplateList />,
      }}
    />
  )
}
