import PageHeader from '../../components/admin/ui/PageHeader'
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAdminClients } from '../../services/adminClients'
import { exportToCsv } from '../../lib/exportCsv'
import { SkeletonRow } from '../../components/Skeleton'
import type { Client } from '../../types/client.types'
import CustomSelect from '../../components/admin/CustomSelect'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const STATUS_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '', labelKey: 'adminAccess.clients.allStatuses' },
  { value: 'PROSPECT', labelKey: 'adminAccess.clients.statusProspect' },
  { value: 'ACTIF', labelKey: 'adminAccess.clients.statusActive' },
  { value: 'EN_PAUSE', labelKey: 'adminAccess.clients.statusPaused' },
  { value: 'CLOS', labelKey: 'adminAccess.clients.statusClosed' },
  { value: 'ARCHIVE', labelKey: 'adminAccess.clients.statusArchived' },
]

const HEALTH_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '', labelKey: 'adminAccess.clients.allHealth' },
  { value: 'BON', labelKey: 'adminAccess.clients.healthGood' },
  { value: 'ATTENTION', labelKey: 'adminAccess.clients.healthWarning' },
  { value: 'CRITIQUE', labelKey: 'adminAccess.clients.healthCritical' },
]

const SORT_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: 'updatedAt_desc', labelKey: 'adminAccess.clients.sortActivity' },
  { value: 'name_asc', labelKey: 'adminAccess.clients.sortName' },
  { value: 'status_asc', labelKey: 'adminAccess.clients.sortStatus' },
  { value: 'health_asc', labelKey: 'adminAccess.clients.sortHealth' },
]

const TABLE_COLUMN_KEYS: MessageKey[] = [
  'adminAccess.clients.colClient',
  'adminAccess.clients.colEmail',
  'adminAccess.clients.colStatus',
  'adminAccess.clients.colHealth',
  'adminAccess.clients.colService',
  'adminAccess.clients.colOwner',
]

const STATUS_COLORS: Record<string, string> = {
  ACTIF: 'var(--good)',
  PROSPECT: 'var(--primary)',
  EN_PAUSE: 'var(--warning)',
  CLOS: 'var(--text-muted)',
  ARCHIVE: 'var(--text-muted)',
}

const HEALTH_COLORS: Record<string, string> = {
  BON: 'var(--good)',
  ATTENTION: 'var(--warning)',
  CRITIQUE: 'var(--critical)',
}

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  PROSPECT: 'adminAccess.clients.statusProspect',
  ACTIF: 'adminAccess.clients.statusActive',
  EN_PAUSE: 'adminAccess.clients.statusPaused',
  CLOS: 'adminAccess.clients.statusClosed',
  ARCHIVE: 'adminAccess.clients.statusArchived',
}

const HEALTH_LABEL_KEYS: Record<string, MessageKey> = {
  BON: 'adminAccess.clients.healthGoodCaps',
  ATTENTION: 'adminAccess.clients.healthWarningCaps',
  CRITIQUE: 'adminAccess.clients.healthCriticalCaps',
}

interface ClientListFilters {
  q: string
  status: string
  health: string
  sort: string
  page: number
  limit: number
}

const ClientAccountList = () => {
  const { t } = useI18n()
  const statusLabel = (status: string | undefined) =>
    status && STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : undefined
  const healthLabel = (health: string | undefined) =>
    health && HEALTH_LABEL_KEYS[health] ? t(HEALTH_LABEL_KEYS[health]) : health
  const statusOptions = useMemo(() => STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])
  const healthOptions = useMemo(() => HEALTH_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])
  const sortOptions = useMemo(() => SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })), [t])
  const [clients, setClients] = useState<Client[]>([])
  const [meta, setMeta] = useState<{ page: number; totalPages: number; total: number }>({
    page: 1,
    totalPages: 1,
    total: 0,
  })
  const [filters, setFilters] = useState<ClientListFilters>({
    q: '',
    status: '',
    health: '',
    sort: 'updatedAt_desc',
    page: 1,
    limit: 12,
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [viewMode, setViewMode] = useState<'cards' | 'liste'>('cards')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await listAdminClients(filters as unknown as Record<string, unknown>)
        setClients(((data as Record<string, unknown>).clients as Client[]) || [])
        setMeta(
          ((data as Record<string, unknown>).meta as { page: number; totalPages: number; total: number }) || {
            page: 1,
            totalPages: 1,
            total: 0,
          },
        )
      } catch (err: unknown) {
        setError((err as Error).message || t('adminAccess.clients.loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters, t])

  const updateFilter = (key: string, value: string | number) => {
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? (value as number) : 1 }))
  }

  return (
    <div className="portal-container pilotage-page client-accounts-page">
      <div className="portal-card">
        <PageHeader
          eyebrow={t('adminOps.pilotage.zone.commercial')}
          title={t('adminAccess.clients.breadcrumb')}
          actions={
            <div className="admin-actions portal-actions-reveal">
              <button
                className="portal-button secondary portal-action-link"
                type="button"
                title={t('adminAccess.clients.exportCsv')}
                onClick={() => {
                  const headers = [
                    t('adminAccess.clients.csvName'),
                    t('adminAccess.clients.csvCompany'),
                    t('adminAccess.clients.csvEmail'),
                    t('adminAccess.clients.csvService'),
                    t('adminAccess.clients.csvStatus'),
                    t('adminAccess.clients.csvHealth'),
                    t('adminAccess.clients.csvOwner'),
                  ]
                  const rows = clients.map((c) => [
                    c.name || '',
                    c.companyName || '',
                    c.email || '',
                    c.serviceType || '',
                    statusLabel(c.status) || c.status || '',
                    healthLabel(c.healthStatus) || '',
                    c.ownerAdminId?.name || t('adminAccess.clients.unassignedCsv'),
                  ])
                  exportToCsv('clients.csv', headers, rows)
                }}
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <span className="portal-action-label">{t('adminAccess.clients.exportCsv')}</span>
              </button>
              <Link
                className="portal-button portal-action-link"
                to="/admin/comptes-clients/nouveau"
                title={t('adminAccess.clients.newAccount')}
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </span>
                <span className="portal-action-label">{t('adminAccess.clients.newAccount')}</span>
              </Link>
            </div>
          }
        />

        <div className="portal-grid">
          <input
            className="portal-input"
            placeholder={t('adminAccess.clients.searchPlaceholder')}
            value={filters.q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFilter('q', e.target.value)}
          />
          <CustomSelect
            className="portal-input"
            value={filters.status}
            onChange={(v) => updateFilter('status', v)}
            options={statusOptions}
          />
          <CustomSelect
            className="portal-input"
            value={filters.health}
            onChange={(v) => updateFilter('health', v)}
            options={healthOptions}
          />
          <CustomSelect
            className="portal-input"
            value={filters.sort}
            onChange={(v) => updateFilter('sort', v)}
            options={sortOptions}
          />
        </div>
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div className="portal-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">👥</div>
              <p className="admin-empty-state-text">{t('adminAccess.clients.empty')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Toggle vue */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, gap: 6 }}>
              {(['cards', 'liste'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--r-md)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: viewMode === v ? 'var(--primary)' : 'var(--border-color)',
                    color: viewMode === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  {v === 'cards' ? t('adminAccess.clients.viewCards') : t('adminAccess.clients.viewList')}
                </button>
              ))}
            </div>

            {viewMode === 'cards' ? (
              <div className="client-cards-grid">
                {clients.map((client) => {
                  const statusColor = STATUS_COLORS[client.status] || 'var(--text-muted)'
                  return (
                    <Link
                      key={client._id}
                      to={`/admin/comptes-clients/${client._id}`}
                      className="client-card"
                      style={{ borderLeftColor: statusColor, borderLeftWidth: 3, borderLeftStyle: 'solid' }}
                    >
                      <div className="client-card-header">
                        <div
                          className="client-card-avatar"
                          style={{
                            background: `linear-gradient(135deg, color-mix(in srgb, ${statusColor} 16%, transparent), color-mix(in srgb, ${statusColor} 8%, transparent))`,
                            borderColor: `color-mix(in srgb, ${statusColor} 25%, transparent)`,
                            color: statusColor,
                          }}
                        >
                          {(client.companyName || client.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span
                          className="client-card-health"
                          style={{ background: HEALTH_COLORS[client.healthStatus || ''] || 'var(--text-muted)' }}
                          title={t('adminAccess.clients.healthTitle', {
                            health: healthLabel(client.healthStatus) || t('adminAccess.clients.na'),
                          })}
                        />
                      </div>
                      <h3 className="client-card-name">{client.companyName || client.name}</h3>
                      {client.companyName && client.companyName !== client.name && (
                        <p className="client-card-contact">{client.name}</p>
                      )}
                      <p className="client-card-email">{client.email}</p>
                      <div className="client-card-tags">
                        <span
                          className={`client-card-status client-card-status--${(client.status || 'ACTIF').toLowerCase()}`}
                        >
                          {statusLabel(client.status) || client.status || t('adminAccess.clients.statusActive')}
                        </span>
                        {client.serviceType && <span className="client-card-service">{client.serviceType}</span>}
                      </div>
                      <div className="client-card-footer">
                        <span className="client-card-owner">
                          {client.ownerAdminId?.name || t('adminAccess.clients.unassigned')}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              /* ── VUE LISTE ── */
              <div className="portal-card client-accounts-table">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {TABLE_COLUMN_KEYS.map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                            fontSize: 11,
                            textTransform: 'none',
                            letterSpacing: 'normal',
                          }}
                        >
                          {t(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => {
                      const statusColor = STATUS_COLORS[client.status] || 'var(--text-muted)'
                      const healthColor = HEALTH_COLORS[client.healthStatus || ''] || 'var(--text-muted)'
                      return (
                        <tr
                          key={client._id}
                          style={{ borderBottom: '1px solid var(--bg-card)', cursor: 'pointer' }}
                          onClick={() => (window.location.href = `/admin/comptes-clients/${client._id}`)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Client */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 'var(--r-md)',
                                  background: `color-mix(in srgb, ${statusColor} 13%, transparent)`,
                                  border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: statusColor,
                                  flexShrink: 0,
                                }}
                              >
                                {(client.companyName || client.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                  {client.companyName || client.name}
                                </div>
                                {client.companyName && client.companyName !== client.name && (
                                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{client.name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          {/* Email */}
                          <td
                            style={{
                              padding: '12px 16px',
                              color: 'var(--text-muted)',
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {client.email}
                          </td>
                          {/* Statut */}
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: 'var(--r-sm)',
                                fontSize: 11,
                                fontWeight: 600,
                                background: `color-mix(in srgb, ${statusColor} 9%, transparent)`,
                                color: statusColor,
                                border: `1px solid color-mix(in srgb, ${statusColor} 21%, transparent)`,
                              }}
                            >
                              {statusLabel(client.status) || client.status || '—'}
                            </span>
                          </td>
                          {/* Santé */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: healthColor,
                                  boxShadow: 'none',
                                  flexShrink: 0,
                                  display: 'inline-block',
                                }}
                              />
                              <span style={{ color: healthColor, fontSize: 12, fontWeight: 500 }}>
                                {healthLabel(client.healthStatus) || '—'}
                              </span>
                            </div>
                          </td>
                          {/* Service */}
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                            {client.serviceType || '—'}
                          </td>
                          {/* Responsable */}
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                            {client.ownerAdminId?.name || t('adminAccess.clients.unassigned')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <p style={{ margin: 0, opacity: 0.7 }}>
                {t('adminAccess.clients.accountCount', { count: meta.total || 0 })}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={(meta.page || 1) <= 1}
                  onClick={() => updateFilter('page', (meta.page || 1) - 1)}
                >
                  {t('adminAccess.clients.previous')}
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={(meta.page || 1) >= (meta.totalPages || 1)}
                  onClick={() => updateFilter('page', (meta.page || 1) + 1)}
                >
                  {t('adminAccess.clients.next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ClientAccountList
