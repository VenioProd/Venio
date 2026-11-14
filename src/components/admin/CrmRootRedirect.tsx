import { Navigate, useLocation } from 'react-router-dom'
import { crmRootTarget } from '../../lib/crmNavigation'

/** `/admin/crm` → écran qui remplace l'ancien pipeline (ou la file avec `?mode=file`). */
export default function CrmRootRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={crmRootTarget(search, hash)} replace />
}
