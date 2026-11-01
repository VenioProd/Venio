import PageHeader from '../../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import UserAvatar from '../../../components/UserAvatar'
import { getAdminChangeRequestStats, listAdminChangeRequests } from '../../../services/changeRequests'
import type { AdminChangeRequest, ChangeRequestStats } from '../../../types/changeRequest.types'
import ChangeRequestFilters from './ChangeRequestFilters'
import { ADMIN_PRIORITY_CONFIG, ADMIN_STATUS_CONFIG, formatAdminDate } from './types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import '../Production.css'

const AdminChangeRequestList = () => {
  const { t } = useI18n()
  const [changeRequests, setChangeRequests] = useState<AdminChangeRequest[]>([])
  const [allRequests, setAllRequests] = useState<AdminChangeRequest[]>([])
  const [stats, setStats] = useState<ChangeRequestStats>({ aTraiter: 0, enCours: 0 })
  const [filters, setFilters] = useState({ status: 'all', client: 'all', project: 'all' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [filtered, everything, statsData] = await Promise.all([
        listAdminChangeRequests(filters),
        listAdminChangeRequests({}),
        getAdminChangeRequestStats().catch(() => ({ aTraiter: 0, enCours: 0 })),
      ])
      setChangeRequests(filtered.changeRequests || [])
      // Les options de filtre restent stables même quand un filtre est actif.
      setAllRequests(everything.changeRequests || [])
      setStats(statsData)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="portal-container production-page production-list production-change-requests">
      <div className="production-header">
        <PageHeader eyebrow={t('changeReq.list.eyebrow')} title={t('changeReq.list.title')} />
      </div>

      <div className="production-kpis">
        <div className="portal-card production-kpi">
          <div className="production-kpi__value">{stats.aTraiter}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('changeReq.list.statToQualify')}</div>
        </div>
        <div className="portal-card production-kpi">
          <div className="production-kpi__value">{stats.enCours}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('changeReq.list.statInHandling')}</div>
        </div>
      </div>

      <ChangeRequestFilters
        status={filters.status}
        client={filters.client}
        project={filters.project}
        changeRequests={allRequests}
        onChange={(next) => setFilters((previous) => ({ ...previous, ...next }))}
      />

      {loading && <div className="portal-spinner" />}

      {!loading && changeRequests.length === 0 && (
        <div className="admin-empty-state">
          <p>{t('changeReq.list.empty')}</p>
        </div>
      )}

      {!loading && changeRequests.length > 0 && (
        <div className="production-table-scroll">
          <table className="admin-table production-request-table">
            <thead>
              <tr>
                <th style={{ padding: '10px 12px' }}>{t('changeReq.list.colRequest')}</th>
                <th style={{ padding: '10px 12px' }}>{t('changeReq.list.colClient')}</th>
                <th style={{ padding: '10px 12px' }}>{t('changeReq.list.colPriority')}</th>
                <th style={{ padding: '10px 12px' }}>{t('changeReq.list.colStatus')}</th>
                <th style={{ padding: '10px 12px' }}>{t('changeReq.list.colReceived')}</th>
              </tr>
            </thead>
            <tbody>
              {changeRequests.map((request) => {
                const status = ADMIN_STATUS_CONFIG[request.status]
                const priority = ADMIN_PRIORITY_CONFIG[request.priority]
                return (
                  <tr key={request._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px' }}>
                      <Link to={`/admin/demandes-clients/${request._id}`} style={{ fontWeight: 700 }}>
                        {request.title}
                      </Link>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {request.project ? request.project.name : t('changeReq.list.noProject')}
                        {request.quoteProposal ? ` · ${t('changeReq.list.linkedQuote')}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <UserAvatar
                          name={request.client?.name || '?'}
                          avatarUrl={request.client?.avatarUrl}
                          size={24}
                        />
                        {request.client?.companyName || request.client?.name}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: priority?.color }}>
                      {priority ? t(priority.labelKey) : undefined}
                    </td>
                    <td>
                      <span className="production-status" style={{ color: status.color }}>
                        {t(status.labelKey)}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {formatAdminDate(request.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminChangeRequestList
