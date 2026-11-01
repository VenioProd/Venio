import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listEntries, listJournals, bulkValidateEntries } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IAccountingEntry, IJournal } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate, formatMoney } from '../../../i18n/format'

const STATUSES = ['', 'DRAFT', 'VALIDATED', 'LOCKED']
const SOURCES = ['', 'MANUAL', 'BILLING', 'PAYMENT', 'EXTERNAL']

interface EntryFilters {
  journal: string
  status: string
  source: string
  from: string
  to: string
  search: string
  page: number
  limit: number
}

const Entries = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)

  const [entries, setEntries] = useState<IAccountingEntry[]>([])
  const [total, setTotal] = useState(0)
  const [journals, setJournals] = useState<IJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<EntryFilters>({
    journal: '',
    status: '',
    source: '',
    from: '',
    to: '',
    search: '',
    page: 1,
    limit: 50,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function reload() {
    setLoading(true)
    try {
      const [data, j] = await Promise.all([listEntries(filters), listJournals()])
      setEntries(data.entries || [])
      setTotal(data.total || 0)
      setJournals(j)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.journal, filters.status, filters.source, filters.page])

  function toggle(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  async function handleBulkValidate() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(t('accAccounts.entries.confirmValidateSelected', { count: ids.length }))) return
    try {
      await bulkValidateEntries(ids)
      setSelected(new Set())
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.limit))

  return (
    <AccountingLayout
      title={t('accAccounts.entries.title')}
      subtitle={t('accAccounts.entries.subtitle', { count: total })}
      actions={
        canManage && (
          <Link to="/admin/comptabilite/ecritures/nouvelle" className="portal-button">
            {t('accAccounts.entries.newEntry')}
          </Link>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.journal}
            onChange={(e) => setFilters({ ...filters, journal: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.entries.allJournals')}</option>
            {journals.map((j) => (
              <option key={j._id} value={j.code}>
                {j.code} — {j.label}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.entries.allStatuses')}</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.source}
            onChange={(e) => setFilters({ ...filters, source: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.entries.allSources')}</option>
            {SOURCES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
          <input
            className="portal-input"
            placeholder={t('accAccounts.entries.searchPlaceholder')}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && reload()}
          />
          <button className="portal-button secondary" onClick={() => reload()}>
            {t('accAccounts.common.filter')}
          </button>

          <div className="accounting-toolbar-right">
            {canManage && selected.size > 0 && (
              <button className="portal-button" onClick={handleBulkValidate}>
                {t('accAccounts.entries.validateSelected', { count: selected.size })}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accAccounts.common.loading')}</p>
        ) : entries.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.entries.empty')}
            <div className="hint">
              <Link to="/admin/comptabilite/ecritures/nouvelle" style={{ color: 'var(--primary)' }}>
                {t('accAccounts.entries.createEntry')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="accounting-table-scroll">
              <table className="accounting-table">
                <thead>
                  <tr>
                    {canManage && <th style={{ width: 30 }}></th>}
                    <th>{t('accAccounts.col.number')}</th>
                    <th>{t('accAccounts.col.date')}</th>
                    <th>{t('accAccounts.col.journal')}</th>
                    <th>{t('accAccounts.col.label')}</th>
                    <th>{t('accAccounts.col.piece')}</th>
                    <th className="amount">{t('accAccounts.col.debit')}</th>
                    <th className="amount">{t('accAccounts.col.credit')}</th>
                    <th>{t('accAccounts.col.source')}</th>
                    <th>{t('accAccounts.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e._id}>
                      {canManage && (
                        <td>
                          {e.status === 'DRAFT' && (
                            <input type="checkbox" checked={selected.has(e._id)} onChange={() => toggle(e._id)} />
                          )}
                        </td>
                      )}
                      <td>
                        <Link to={`/admin/comptabilite/ecritures/${e._id}`} className="code">
                          {e.entryNumber}
                        </Link>
                      </td>
                      <td>{formatDate(e.date)}</td>
                      <td className="code">{e.journalCode}</td>
                      <td>{e.label}</td>
                      <td className="code">{e.pieceRef || '—'}</td>
                      <td className="amount">{formatMoney(Number(e.totalDebit))}</td>
                      <td className="amount">{formatMoney(Number(e.totalCredit))}</td>
                      <td>
                        <span className={`accounting-badge ${e.source === 'EXTERNAL' ? 'source-external' : 'locked'}`}>
                          {e.source}
                        </span>
                      </td>
                      <td>
                        <span className={`accounting-badge ${e.status.toLowerCase()}`}>{e.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="accounting-pagination">
                <button
                  className="portal-button secondary"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  {t('accAccounts.common.previous')}
                </button>
                <span style={{ alignSelf: 'center', color: 'var(--text-secondary)' }}>
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
    </AccountingLayout>
  )
}

export default Entries
