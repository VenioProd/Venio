import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listAuditLog } from '../../../services/accounting'
import type { IAuditEntry } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'
import { formatDateTime as formatDateTimeIntl } from '../../../i18n/format'

function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return formatDateTimeIntl(d, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(d)
  }
}

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  ENTRY_CREATE: 'accAccounts.audit.action.ENTRY_CREATE',
  ENTRY_UPDATE: 'accAccounts.audit.action.ENTRY_UPDATE',
  ENTRY_VALIDATE: 'accAccounts.audit.action.ENTRY_VALIDATE',
  ENTRY_LOCK: 'accAccounts.audit.action.ENTRY_LOCK',
  ENTRY_DELETE: 'accAccounts.audit.action.ENTRY_DELETE',
  ENTRY_RESTORE: 'accAccounts.audit.action.ENTRY_RESTORE',
  FISCAL_YEAR_CLOSE: 'accAccounts.audit.action.FISCAL_YEAR_CLOSE',
  FISCAL_YEAR_REOPEN: 'accAccounts.audit.action.FISCAL_YEAR_REOPEN',
  EXTERNAL_SOURCE_CREATE: 'accAccounts.audit.action.EXTERNAL_SOURCE_CREATE',
  EXTERNAL_SOURCE_UPDATE: 'accAccounts.audit.action.EXTERNAL_SOURCE_UPDATE',
  EXTERNAL_SOURCE_DELETE: 'accAccounts.audit.action.EXTERNAL_SOURCE_DELETE',
  EXTERNAL_SOURCE_ROTATE: 'accAccounts.audit.action.EXTERNAL_SOURCE_ROTATE',
  VAT_DECLARATION_CREATE: 'accAccounts.audit.action.VAT_DECLARATION_CREATE',
  VAT_DECLARATION_SUBMIT: 'accAccounts.audit.action.VAT_DECLARATION_SUBMIT',
  VAT_DECLARATION_DELETE: 'accAccounts.audit.action.VAT_DECLARATION_DELETE',
  FEC_EXPORT: 'accAccounts.audit.action.FEC_EXPORT',
  LETTRAGE_APPLY: 'accAccounts.audit.action.LETTRAGE_APPLY',
  LETTRAGE_REMOVE: 'accAccounts.audit.action.LETTRAGE_REMOVE',
  CHART_OF_ACCOUNTS_SEED: 'accAccounts.audit.action.CHART_OF_ACCOUNTS_SEED',
  CHART_OF_ACCOUNTS_DEACTIVATE: 'accAccounts.audit.action.CHART_OF_ACCOUNTS_DEACTIVATE',
  BILLING_TO_ENTRY: 'accAccounts.audit.action.BILLING_TO_ENTRY',
  PAYMENT_TO_ENTRY: 'accAccounts.audit.action.PAYMENT_TO_ENTRY',
}

const ACTOR_LABEL_KEYS: Record<string, MessageKey> = {
  USER: 'accAccounts.audit.actor.USER',
  SYSTEM: 'accAccounts.audit.actor.SYSTEM',
  EXTERNAL: 'accAccounts.audit.actor.EXTERNAL',
}

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('REMOVE')) return 'draft'
  if (action.includes('LOCK')) return 'locked'
  if (action.includes('CREATE')) return 'validated'
  return 'source-external'
}

function entityLink(entry: IAuditEntry): string | null {
  if (!entry.entityId) return null
  if (entry.entityType === 'AccountingEntry') return `/admin/comptabilite/ecritures/${entry.entityId}`
  if (entry.entityType === 'ExternalSource') return `/admin/comptabilite/sources-externes/${entry.entityId}`
  if (entry.entityType === 'VatDeclaration') return `/admin/comptabilite/tva/${entry.entityId}`
  return null
}

interface AuditFilters {
  action: string
  entityType: string
  from: string
  to: string
  page: number
  limit: number
}

const AccountingAuditLog = () => {
  const { t } = useI18n()
  const actionLabel = (action: string) => (ACTION_LABEL_KEYS[action] ? t(ACTION_LABEL_KEYS[action]) : action)
  const [items, setItems] = useState<IAuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<AuditFilters>({
    action: '',
    entityType: '',
    from: '',
    to: '',
    page: 1,
    limit: 50,
  })

  const [selected, setSelected] = useState<IAuditEntry | null>(null)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const r = await listAuditLog(filters)
      setItems(r.items || r.logs || [])
      setTotal(r.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.action, filters.entityType, filters.page])

  const totalPages = Math.max(1, Math.ceil(total / filters.limit))

  return (
    <AccountingLayout title={t('accAccounts.audit.title')} subtitle={t('accAccounts.audit.subtitle')}>
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.audit.allActions')}</option>
            {Object.keys(ACTION_LABEL_KEYS).map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.audit.allEntityTypes')}</option>
            <option value="AccountingEntry">{t('accAccounts.audit.entityEntry')}</option>
            <option value="FiscalYear">{t('accAccounts.audit.entityFiscalYear')}</option>
            <option value="ExternalSource">{t('accAccounts.audit.entityExternalSource')}</option>
            <option value="VatDeclaration">{t('accAccounts.audit.entityVatDeclaration')}</option>
            <option value="ChartOfAccount">{t('accAccounts.audit.entityAccount')}</option>
            <option value="AccountingLine">{t('accAccounts.audit.entityReconciliation')}</option>
            <option value="BillingDocument">{t('accAccounts.audit.entityBilling')}</option>
          </select>
          <input
            type="date"
            className="portal-input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            type="date"
            className="portal-input"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
          <button className="portal-button secondary" onClick={() => reload()}>
            {t('accAccounts.common.filter')}
          </button>
          <div className="accounting-toolbar-right">
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
              {t('accAccounts.audit.eventCount', { count: total })}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
        ) : items.length === 0 ? (
          <div className="accounting-empty">{t('accAccounts.audit.empty')}</div>
        ) : (
          <>
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>{t('accAccounts.col.date')}</th>
                  <th>{t('accAccounts.audit.colAction')}</th>
                  <th>{t('accAccounts.audit.colEntity')}</th>
                  <th>{t('accAccounts.audit.colReference')}</th>
                  <th>{t('accAccounts.audit.colActor')}</th>
                  <th>{t('accAccounts.audit.colSummary')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e._id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.7)' }}>
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td>
                      <span className={`accounting-badge ${actionBadgeClass(e.action)}`}>{actionLabel(e.action)}</span>
                    </td>
                    <td style={{ color: 'rgba(14, 165, 233, 0.85)', fontSize: '0.85rem' }}>{e.entityType}</td>
                    <td>
                      {(() => {
                        const link = entityLink(e)
                        const label = e.entityRef || e.entityId || '—'
                        return link ? (
                          <Link to={link} className="code" style={{ color: 'var(--primary)' }}>
                            {label}
                          </Link>
                        ) : (
                          <span className="code">{label}</span>
                        )
                      })()}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                          {e.actor?.type
                            ? ACTOR_LABEL_KEYS[e.actor.type]
                              ? t(ACTOR_LABEL_KEYS[e.actor.type])
                              : e.actor.type
                            : '—'}
                        </span>
                        {e.actor?.userEmail && (
                          <div style={{ color: 'rgba(255,255,255,0.85)' }}>{e.actor.userEmail}</div>
                        )}
                        {e.actor?.externalSourceSlug && (
                          <div className="code" style={{ color: '#c084fc' }}>
                            {e.actor.externalSourceSlug}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{e.summary || '—'}</td>
                    <td>
                      <div className="accounting-row-actions">
                        <button onClick={() => setSelected(e)}>{t('accAccounts.audit.detail')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="accounting-pagination">
                <button
                  className="portal-button secondary"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  {t('accAccounts.common.previous')}
                </button>
                <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  {t('accAccounts.common.page', { page: filters.page, total: totalPages })}
                </span>
                <button
                  className="portal-button secondary"
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  {t('accAccounts.common.next')}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="accounting-card"
            style={{ maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{actionLabel(selected.action)}</h2>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
                {formatDateTime(selected.createdAt)} — {selected.entityType}
                {selected.entityRef && ` (${selected.entityRef})`}
              </span>
            </div>

            {selected.summary && <p style={{ color: 'rgba(255,255,255,0.85)' }}>{selected.summary}</p>}

            {selected.diff && selected.diff.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: 16 }}>{t('accAccounts.audit.changedFields')}</h3>
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>{t('accAccounts.audit.colField')}</th>
                      <th>{t('accAccounts.audit.colBefore')}</th>
                      <th>{t('accAccounts.audit.colAfter')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.diff.map((d, idx) => (
                      <tr key={idx}>
                        <td className="code">{d.field}</td>
                        <td style={{ color: '#fca5a5' }}>{JSON.stringify(d.before)}</td>
                        <td style={{ color: '#86efac' }}>{JSON.stringify(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {selected.metadata && (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: 16 }}>{t('accAccounts.audit.metadata')}</h3>
                <pre
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    overflow: 'auto',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </>
            )}

            <div className="accounting-toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="portal-button" onClick={() => setSelected(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountingLayout>
  )
}

export default AccountingAuditLog
