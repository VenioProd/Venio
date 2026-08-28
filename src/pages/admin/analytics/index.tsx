import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
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
          Chargement des statistiques...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="portal-container">
        <div className="admin-error">Erreur chargement des statistiques</div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Statistiques</span>
        </div>
        <div className="admin-header">
          <h1>Statistiques & Reporting</h1>
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
