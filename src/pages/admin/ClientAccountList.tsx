import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAdminClients } from '../../services/adminClients'
import { exportToCsv } from '../../lib/exportCsv'
import { SkeletonRow } from '../../components/Skeleton'
import type { Client } from '../../types/client.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const STATUS_OPTIONS = [
  { value: '', label: 'Tous statuts' },
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'ACTIF', label: 'Actif' },
  { value: 'EN_PAUSE', label: 'En pause' },
  { value: 'CLOS', label: 'Clos' },
  { value: 'ARCHIVE', label: 'Archivé' },
]

const HEALTH_OPTIONS = [
  { value: '', label: 'Toute santé' },
  { value: 'BON', label: 'Bon' },
  { value: 'ATTENTION', label: 'Attention' },
  { value: 'CRITIQUE', label: 'Critique' },
]

const SORT_OPTIONS = [
  { value: 'updatedAt_desc', label: 'Dernière activité' },
  { value: 'name_asc', label: 'Nom A-Z' },
  { value: 'status_asc', label: 'Statut' },
  { value: 'health_asc', label: 'Santé' },
]

const STATUS_COLORS: Record<string, string> = {
  ACTIF: '#22c55e',
  PROSPECT: 'var(--primary)',
  EN_PAUSE: '#f59e0b',
  CLOS: '#64748b',
  ARCHIVE: '#475569',
}

const HEALTH_COLORS: Record<string, string> = {
  BON: '#22c55e',
  ATTENTION: '#f59e0b',
  CRITIQUE: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  PROSPECT: 'Prospect',
  ACTIF: 'Actif',
  EN_PAUSE: 'En pause',
  CLOS: 'Clos',
  ARCHIVE: 'Archivé',
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
        setError((err as Error).message || 'Erreur chargement comptes')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filters])

  const updateFilter = (key: string, value: string | number) => {
    setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? (value as number) : 1 }))
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Comptes clients</span>
        </div>
        <div className="admin-header">
          <h1>Comptes clients</h1>
          <div className="admin-actions portal-actions-reveal">
            <button
              className="portal-button secondary portal-action-link"
              type="button"
              title="Exporter CSV"
              onClick={() => {
                const headers = ['Nom', 'Entreprise', 'Email', 'Service', 'Statut', 'Sante', 'Responsable']
                const rows = clients.map((c) => [
                  c.name || '',
                  c.companyName || '',
                  c.email || '',
                  c.serviceType || '',
                  STATUS_LABELS[c.status] || c.status || '',
                  c.healthStatus || '',
                  c.ownerAdminId?.name || 'Non assigne',
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
              <span className="portal-action-label">Exporter CSV</span>
            </button>
            <Link
              className="portal-button portal-action-link"
              to="/admin/comptes-clients/nouveau"
              title="Nouveau compte"
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
              <span className="portal-action-label">Nouveau compte</span>
            </Link>
          </div>
        </div>

        <div className="portal-grid">
          <input
            className="portal-input"
            placeholder="Recherche nom, société, email"
            value={filters.q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFilter('q', e.target.value)}
          />
          <CustomSelect
            className="portal-input"
            value={filters.status}
            onChange={(v) => updateFilter('status', v)}
            options={STATUS_OPTIONS}
          />
          <CustomSelect
            className="portal-input"
            value={filters.health}
            onChange={(v) => updateFilter('health', v)}
            options={HEALTH_OPTIONS}
          />
          <CustomSelect
            className="portal-input"
            value={filters.sort}
            onChange={(v) => updateFilter('sort', v)}
            options={SORT_OPTIONS}
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
              <p className="admin-empty-state-text">Aucun compte client</p>
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
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: viewMode === v ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: viewMode === v ? '#fff' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.2s',
                  }}
                >
                  {v === 'cards' ? 'Cartes' : 'Liste'}
                </button>
              ))}
            </div>

            {viewMode === 'cards' ? (
              <div className="client-cards-grid">
                {clients.map((client) => {
                  const statusColor = STATUS_COLORS[client.status] || '#64748b'
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
                            background: `linear-gradient(135deg, ${statusColor}28, ${statusColor}14)`,
                            borderColor: `${statusColor}40`,
                            color: statusColor,
                          }}
                        >
                          {(client.companyName || client.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span
                          className="client-card-health"
                          style={{ background: HEALTH_COLORS[client.healthStatus || ''] || '#64748b' }}
                          title={`Santé: ${client.healthStatus || 'N/A'}`}
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
                          {STATUS_LABELS[client.status] || client.status || 'Actif'}
                        </span>
                        {client.serviceType && <span className="client-card-service">{client.serviceType}</span>}
                      </div>
                      <div className="client-card-footer">
                        <span className="client-card-owner">{client.ownerAdminId?.name || 'Non assigné'}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              /* ── VUE LISTE ── */
              <div className="portal-card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Client', 'Email', 'Statut', 'Santé', 'Service', 'Responsable'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 16px',
                            textAlign: 'left',
                            color: 'rgba(255,255,255,0.4)',
                            fontWeight: 600,
                            fontSize: 11,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => {
                      const statusColor = STATUS_COLORS[client.status] || '#64748b'
                      const healthColor = HEALTH_COLORS[client.healthStatus || ''] || '#64748b'
                      return (
                        <tr
                          key={client._id}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                          onClick={() => (window.location.href = `/admin/comptes-clients/${client._id}`)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Client */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: `${statusColor}22`,
                                  border: `1px solid ${statusColor}40`,
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
                                <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                                  {client.companyName || client.name}
                                </div>
                                {client.companyName && client.companyName !== client.name && (
                                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{client.name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          {/* Email */}
                          <td
                            style={{
                              padding: '12px 16px',
                              color: 'rgba(255,255,255,0.45)',
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
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: `${statusColor}18`,
                                color: statusColor,
                                border: `1px solid ${statusColor}35`,
                              }}
                            >
                              {STATUS_LABELS[client.status] || client.status || '—'}
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
                                {client.healthStatus || '—'}
                              </span>
                            </div>
                          </td>
                          {/* Service */}
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)' }}>
                            {client.serviceType || '—'}
                          </td>
                          {/* Responsable */}
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>
                            {client.ownerAdminId?.name || 'Non assigné'}
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
              <p style={{ margin: 0, opacity: 0.7 }}>{meta.total || 0} compte(s)</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={(meta.page || 1) <= 1}
                  onClick={() => updateFilter('page', (meta.page || 1) - 1)}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={(meta.page || 1) >= (meta.totalPages || 1)}
                  onClick={() => updateFilter('page', (meta.page || 1) + 1)}
                >
                  Suivant
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
