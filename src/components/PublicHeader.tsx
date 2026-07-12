import { lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import { isAdminRole } from '../lib/permissions'
import Navbar from './Navbar'

const AuthenticatedPublicHeader = lazy(() => import('./AuthenticatedPublicHeader'))

/**
 * Public-only chrome. Keeping it in its own lazy chunk prevents the landing
 * page entry from eagerly loading notification polling and socket.io. The
 * realtime notification boundary is only needed for signed-in administrators.
 */
const PublicHeader = () => {
  const { user } = useAuth()

  if (user && isAdminRole(user.role)) {
    return (
      <Suspense fallback={null}>
        <AuthenticatedPublicHeader />
      </Suspense>
    )
  }

  return <Navbar />
}

export default PublicHeader
