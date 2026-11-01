import { Suspense } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'

const Accueil = lazy(() => import('../accueil'))

export default function AccueilHub() {
  const { t } = useI18n()
  return (
    <div className="admin-hub admin-hub--accueil">
      <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
        <Accueil />
      </Suspense>
    </div>
  )
}
