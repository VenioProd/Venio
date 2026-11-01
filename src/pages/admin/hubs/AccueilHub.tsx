import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import DecisionsDigest from '../../../components/admin/DecisionsDigest'

const MonEspace = lazy(() => import('../mon-espace'))

export default function AccueilHub() {
  return (
    <div className="admin-hub admin-hub--accueil">
      <DecisionsDigest />
      <Suspense fallback={<p role="status">Chargement…</p>}>
        <MonEspace />
      </Suspense>
    </div>
  )
}
