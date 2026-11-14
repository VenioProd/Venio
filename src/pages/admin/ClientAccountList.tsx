import React, { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Plus, Search, Users } from 'lucide-react'
import { listAdminClients } from '../../services/adminClients'
import { exportToCsv } from '../../lib/exportCsv'
import { SkeletonRow } from '../../components/Skeleton'
import type { Client } from '../../types/client.types'
import CustomSelect from '../../components/admin/CustomSelect'
import { CrmChip, CrmEmpty, CrmPageHead, type CrmTone } from '../../components/admin/crm-ui'
import { OwnerCell } from './crm-board/rich/chips'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './crm-board/suivre.css'

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

const STATUS_TONES: Record<string, CrmTone> = {
  ACTIF: 'green',
  PROSPECT: 'blue',
  EN_PAUSE: 'amber',
  CLOS: 'grey',
  ARCHIVE: 'grey',
}

const HEALTH_TONES: Record<string, CrmTone> = {
  BON: 'green',
  ATTENTION: 'amber',
  CRITIQUE: 'red',
}

const TONE_COLORS: Record<CrmTone, string> = {
  green: 'var(--good)',
  blue: 'var(--primary-light)',
  amber: 'var(--warning)',
  orange: 'var(--serious)',
  red: 'var(--critical)',
  grey: 'var(--text-muted)',
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

const HEALTH_DISPLAY_KEYS: Record<string, MessageKey> = {
  BON: 'adminAccess.clients.healthGood',
  ATTENTION: 'adminAccess.clients.healthWarning',
  CRITIQUE: 'adminAccess.clients.healthCritical',
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
  const navigate = useNavigate()
  const statusLabel = (status: string | undefined) =>
    status && STATUS_LABEL_KEYS[status] ? t(STATUS_LABEL_KEYS[status]) : undefined
  const healthLabel = (health: string | undefined) =>
    health && HEALTH_LABEL_KEYS[health] ? t(HEALTH_LABEL_KEYS[health]) : health
  const healthDisplay = (health: string | undefined) =>
    health && HEALTH_DISPLAY_KEYS[health] ? t(HEALTH_DISPLAY_KEYS[health]) : undefined
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
  const [viewMode, setViewMode] = useState<'cards' | 'liste'>('liste')

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

  const exportClients = () => {
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
  }

  const ownerCell = (client: Client) =>
    client.ownerAdminId?.name ? (
      <OwnerCell name={client.ownerAdminId.name} />
    ) : (
      <span className="crm-suivre-dim">{t('adminAccess.clients.unassigned')}</span>
    )

  const statusChip = (client: Client) => (
    <CrmChip tone={STATUS_TONES[client.status] ?? 'grey'}>
      {statusLabel(client.status) || client.status || t('adminAccess.clients.statusActive')}
    </CrmChip>
  )

  return (
    <div className="crm-suivre-stack client-accounts-page">
      <CrmPageHead
        title={t('adminAccess.clients.breadcrumb')}
        lede={t('crmSuivre.accounts.lede')}
        actions={
          <>
            <button
              type="button"
              className="crm-ui-btn"
              title={t('adminAccess.clients.exportCsv')}
              onClick={exportClients}
            >
              <Download aria-hidden="true" />
              {t('adminAccess.clients.exportCsv')}
            </button>
            <Link
              className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big"
              to="/admin/comptes-clients/nouveau"
              title={t('adminAccess.clients.newAccount')}
            >
              <Plus aria-hidden="true" />
              {t('adminAccess.clients.newAccount')}
            </Link>
          </>
        }
      />

      <div className="crm-suivre-toolbar" role="group" aria-label={t('crmSuivre.accounts.filtersAria')}>
        <label className="crm-suivre-search">
          <Search aria-hidden="true" />
          <span className="crm-ui-sr-only">{t('adminAccess.clients.searchPlaceholder')}</span>
          <input
            type="search"
            placeholder={t('adminAccess.clients.searchPlaceholder')}
            value={filters.q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFilter('q', e.target.value)}
          />
        </label>
        <CustomSelect value={filters.status} onChange={(v) => updateFilter('status', v)} options={statusOptions} />
        <CustomSelect value={filters.health} onChange={(v) => updateFilter('health', v)} options={healthOptions} />
        <CustomSelect value={filters.sort} onChange={(v) => updateFilter('sort', v)} options={sortOptions} />
        <span className="rich-grow" />
        <div className="crm-suivre-seg" role="group" aria-label={t('crmSuivre.accounts.viewAria')}>
          {(['liste', 'cards'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setViewMode(v)} aria-pressed={viewMode === v}>
              {v === 'cards' ? t('adminAccess.clients.viewCards') : t('adminAccess.clients.viewList')}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <section className="crm-ui-card crm-ui-card--flush">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <CrmEmpty icon={<Users size={28} />} title={t('adminAccess.clients.empty')} />
        ) : (
          <>
            {viewMode === 'cards' ? (
              <div className="crm-suivre-accounts">
                {clients.map((client) => (
                  <Link
                    key={client._id}
                    to={`/admin/comptes-clients/${client._id}`}
                    className="crm-suivre-account"
                    style={{ '--crm-ui-tone': TONE_COLORS[STATUS_TONES[client.status] ?? 'grey'] } as CSSProperties}
                  >
                    <h3>{client.companyName || client.name}</h3>
                    {client.companyName && client.companyName !== client.name && <p>{client.name}</p>}
                    <p>{client.email}</p>
                    <div className="crm-suivre-account__tags">
                      {statusChip(client)}
                      {client.healthStatus && (
                        <CrmChip tone={HEALTH_TONES[client.healthStatus] ?? 'grey'} dot>
                          {healthDisplay(client.healthStatus) || client.healthStatus}
                        </CrmChip>
                      )}
                      {client.serviceType && <CrmChip>{client.serviceType}</CrmChip>}
                    </div>
                    <p>{ownerCell(client)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="crm-suivre-tablewrap client-accounts-table">
                <table className="crm-suivre-table">
                  <thead>
                    <tr>
                      {TABLE_COLUMN_KEYS.map((h) => (
                        <th key={h}>{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr
                        key={client._id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/admin/comptes-clients/${client._id}`)}
                      >
                        <td>
                          <Link
                            className="crm-suivre-name"
                            to={`/admin/comptes-clients/${client._id}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {client.companyName || client.name}
                          </Link>
                          {client.companyName && client.companyName !== client.name && (
                            <div className="crm-suivre-sub">{client.name}</div>
                          )}
                        </td>
                        <td className="crm-suivre-dim">{client.email}</td>
                        <td>{statusChip(client)}</td>
                        <td>
                          {client.healthStatus ? (
                            <CrmChip tone={HEALTH_TONES[client.healthStatus] ?? 'grey'} dot>
                              {healthDisplay(client.healthStatus) || client.healthStatus}
                            </CrmChip>
                          ) : (
                            <span className="crm-suivre-dim">—</span>
                          )}
                        </td>
                        <td>{client.serviceType || <span className="crm-suivre-dim">—</span>}</td>
                        <td>{ownerCell(client)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="crm-suivre-pager">
              <p>{t('adminAccess.clients.accountCount', { count: meta.total || 0 })}</p>
              <div>
                <button
                  type="button"
                  className="crm-ui-btn"
                  disabled={(meta.page || 1) <= 1}
                  onClick={() => updateFilter('page', (meta.page || 1) - 1)}
                >
                  {t('adminAccess.clients.previous')}
                </button>
                <button
                  type="button"
                  className="crm-ui-btn"
                  disabled={(meta.page || 1) >= (meta.totalPages || 1)}
                  onClick={() => updateFilter('page', (meta.page || 1) + 1)}
                >
                  {t('adminAccess.clients.next')}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="crm-suivre-note">{t('crmSuivre.accounts.note')}</p>
    </div>
  )
}

export default ClientAccountList
