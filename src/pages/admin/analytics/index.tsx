import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ProjectSection from './ProjectSection'
import PublicSiteSection from './PublicSiteSection'
import PilotageSection from './crm'
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
      <div className="portal-container">
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          {t('adminTech.analytics.loading')}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="portal-container">
        <div className="admin-error">{t('adminTech.analytics.loadError')}</div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">{t('nav.admin')}</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{t('adminTech.analytics.breadcrumb')}</span>
        </div>
        <div className="admin-header">
          <h1>{t('adminTech.analytics.title')}</h1>
        </div>
      </div>

      <ProjectSection data={data} />

      {/* Le pilotage commercial lit des données CRM : il ne s'affiche que pour
          qui a le droit de les consulter. */}
      {canViewCrm && <PilotageSection />}

      <PublicSiteSection publicSiteData={publicSiteData} />
    </div>
  )
}
