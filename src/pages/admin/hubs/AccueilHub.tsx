import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import { useI18n } from '../../../context/I18nContext'
import DecisionsDigest from '../../../components/admin/DecisionsDigest'

const MonEspace = lazy(() => import('../mon-espace'))

export default function AccueilHub() {
  const { t } = useI18n()
  return (
    <div className="admin-hub admin-hub--accueil">
      <DecisionsDigest />
      <Suspense fallback={<p role="status">{t('shell.hub.loading')}</p>}>
        <MonEspace />
      </Suspense>
    </div>
  )
}
