import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listEntries, listExternalSources, bulkValidateEntries } from '../../../services/accounting'
import type { IAccountingEntry, IExternalSource } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'
import { formatDate as formatDateIntl, formatMoney } from '../../../i18n/format'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatDateIntl(d) || '—'
}

const STATUS_FILTER_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: 'DRAFT', labelKey: 'accAccounts.queue.filterDraft' },
  { value: '', labelKey: 'accAccounts.queue.filterAll' },
]

interface DraftFilters {
  status: string
  source: string
  sourceSlug: string
  from: string
  to: string
  page: number
  limit: number
}

const DraftQueue = () => {
  const { t } = useI18n()
  const [entries, setEntries] = useState<IAccountingEntry[]>([])
  const [total, setTotal] = useState(0)
  const [sources, setSources] = useState<IExternalSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [validating, setValidating] = useState(false)

  const [filters, setFilters] = useState<DraftFilters>({
    status: 'DRAFT',
    source: 'EXTERNAL',
    sourceSlug: '',
    from: '',
    to: '',
    page: 1,
    limit: 100,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [data, sList] = await Promise.all([
        listEntries({
          status: filters.status || undefined,
          source: filters.source || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page,
          limit: filters.limit,
        }),
        sources.length === 0 ? listExternalSources() : Promise.resolve(sources),
      ])
      let list = data.entries || []
      if (filters.sourceSlug) {
        list = list.filter((e) => e.sourceSlug === filters.sourceSlug)
      }
      setEntries(list)
      setTotal(data.total || 0)
      setSources(sList)
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.source, filters.sourceSlug, filters.from, filters.to, filters.page, filters.limit])

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.source, filters.sourceSlug, filters.page])

  const { totalAmount, draftCount } = useMemo(() => {
    let sum = 0
    let count = 0
    for (const e of entries) {
      if (e.status === 'DRAFT') {
        sum += Number(e.totalDebit) || 0
        count += 1
      }
    }
    return { totalAmount: sum, draftCount: count }
  }, [entries])

  const selectableEntries = useMemo(() => entries.filter((e) => e.status === 'DRAFT'), [entries])
  const allSelected = selectableEntries.length > 0 && selectableEntries.every((e) => selected.has(e._id))

  function toggle(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableEntries.map((e) => e._id)))
    }
  }

  async function handleBulkValidate(ids: string[]) {
    if (!ids || ids.length === 0) return
    if (!confirm(t('accAccounts.queue.confirmBulk', { count: ids.length }))) return
    setValidating(true)
    setError('')
    setSuccess('')
    try {
      const results = await bulkValidateEntries(ids)
      const ok = Array.isArray(results) ? results.filter((r) => r.ok || r.success).length : ids.length
      const ko = Array.isArray(results) ? results.length - ok : 0
      setSuccess(ko > 0 ? t('accAccounts.queue.resultWithErrors', { ok, ko }) : t('accAccounts.queue.resultOk', { ok }))
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setValidating(false)
    }
  }

  async function handleValidateAll() {
    const ids = selectableEntries.map((e) => e._id)
    if (ids.length === 0) return
    if (!confirm(t('accAccounts.queue.confirmAll', { count: ids.length }))) return
    await handleBulkValidate(ids)
  }

  return (
    <AccountingLayout
      title={t('accAccounts.queue.title')}
      subtitle={t('accAccounts.queue.subtitle')}
      actions={
        <button
          className="portal-button"
          onClick={handleValidateAll}
          disabled={validating || selectableEntries.length === 0}
        >
          {validating
            ? t('accAccounts.queue.validating')
            : t('accAccounts.queue.validateAll', { count: selectableEntries.length })}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.queue.kpiToValidate')}</div>
          <div className="value" style={{ color: draftCount > 0 ? '#fbbf24' : '#4ade80' }}>
            {draftCount}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.queue.kpiPendingTotal')}</div>
          <div className="value">{formatEur(totalAmount)}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.queue.kpiActiveSources')}</div>
          <div className="value">{sources.filter((s) => s.status === 'ACTIVE').length}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.queue.kpiSelected')}</div>
          <div className="value" style={{ color: selected.size > 0 ? 'var(--primary)' : undefined }}>
            {selected.size}
          </div>
        </div>
      </div>

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.sourceSlug}
            onChange={(e) => setFilters({ ...filters, sourceSlug: e.target.value, page: 1 })}
          >
            <option value="">{t('accAccounts.queue.allSources')}</option>
            {sources.map((s) => (
              <option key={s._id} value={s.slug}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
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
          <button className="portal-button secondary" onClick={() => reload()}>
            {t('accAccounts.common.filter')}
          </button>

          <div className="accounting-toolbar-right">
            {selected.size > 0 && (
              <button
                className="portal-button"
                onClick={() => handleBulkValidate(Array.from(selected))}
                disabled={validating}
              >
                {validating
                  ? t('accAccounts.queue.validating')
                  : t('accAccounts.queue.validateSelection', { count: selected.size })}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
        ) : entries.length === 0 ? (
          <div className="accounting-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✓</div>
            {t('accAccounts.queue.upToDate')}
            <div className="hint">{t('accAccounts.queue.upToDateHint')}</div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableEntries.length === 0}
                  />
                </th>
                <th>{t('accAccounts.col.number')}</th>
                <th>{t('accAccounts.col.date')}</th>
                <th>{t('accAccounts.queue.colSource')}</th>
                <th>{t('accAccounts.queue.colPieceRef')}</th>
                <th>{t('accAccounts.col.label')}</th>
                <th className="amount">{t('accAccounts.col.debit')}</th>
                <th className="amount">{t('accAccounts.col.credit')}</th>
                <th>{t('accAccounts.queue.colAutoValidated')}</th>
                <th>{t('accAccounts.col.status')}</th>
                <th>{t('accAccounts.queue.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isDraft = e.status === 'DRAFT'
                return (
                  <tr key={e._id}>
                    <td>
                      {isDraft && (
                        <input type="checkbox" checked={selected.has(e._id)} onChange={() => toggle(e._id)} />
                      )}
                    </td>
                    <td>
                      <Link to={`/admin/comptabilite/ecritures/${e._id}`} className="code">
                        {e.entryNumber}
                      </Link>
                    </td>
                    <td>{formatDate(e.date)}</td>
                    <td>
                      {e.sourceSlug ? (
                        <span className="accounting-badge source-external">{e.sourceSlug}</span>
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                      )}
                    </td>
                    <td className="code">{e.pieceRef || '—'}</td>
                    <td>{e.label}</td>
                    <td className="amount">{formatEur(e.totalDebit)}</td>
                    <td className="amount">{formatEur(e.totalCredit)}</td>
                    <td>
                      {e.autoValidated ? (
                        <span className="accounting-badge validated">{t('common.yes')}</span>
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`accounting-badge ${e.status.toLowerCase()}`}>{e.status}</span>
                    </td>
                    <td>
                      <div className="accounting-row-actions">
                        <Link to={`/admin/comptabilite/ecritures/${e._id}`}>
                          <button type="button">{t('accAccounts.queue.open')}</button>
                        </Link>
                        {isDraft && (
                          <button type="button" onClick={() => handleBulkValidate([e._id])} disabled={validating}>
                            {t('accAccounts.queue.validateOne')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {total > filters.limit && (
          <div className="accounting-pagination">
            <button
              className="portal-button secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              {t('accAccounts.common.previous')}
            </button>
            <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)' }}>
              {t('accAccounts.common.page', {
                page: filters.page,
                total: Math.max(1, Math.ceil(total / filters.limit)),
              })}
            </span>
            <button
              className="portal-button secondary"
              disabled={filters.page >= Math.ceil(total / filters.limit)}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              {t('accAccounts.common.next')}
            </button>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default DraftQueue
