import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ProjectSection from './ProjectSection'
import PublicSiteSection from './PublicSiteSection'
import { Link } from 'react-router-dom'
import type { AnalyticsData, PublicSiteAnalyticsData } from './types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import '../../../styles/analytics.css'

export default function Analytics() {
  const { user } = useAuth()
  const { t } = useI18n()
  const canViewCrm = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [publicSiteData, setPublicSiteData] = useState<PublicSiteAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [res, publicSite] = await Promise.all([
          apiFetch<AnalyticsData>('/api/admin/analytics'),
          apiFetch<PublicSiteAnalyticsData>('/api/admin/analytics/public-site'),
        ])
        setData(res)
        setPublicSiteData(publicSite)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="portal-container pilotage-page analytics-page">
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          {t('adminTech.analytics.loading')}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="portal-container pilotage-page analytics-page">
        <div className="admin-error">{t('adminTech.analytics.loadError')}</div>
      </div>
    )
  }

  return (
    <div className="portal-container pilotage-page analytics-page">
      <PageHeader eyebrow={t('adminOps.pilotage.zone.overview')} title={t('adminTech.analytics.title')} />

      <ProjectSection data={data} />

      {/* Le pilotage commercial lit des données CRM : il ne s'affiche que pour
          qui a le droit de les consulter. */}
      {canViewCrm && (
        <p>
          <Link to="/admin/crm/pilotage">{t('crmRich.analytics.moved')}</Link>
        </p>
      )}

      <PublicSiteSection publicSiteData={publicSiteData} />
    </div>
  )
}
