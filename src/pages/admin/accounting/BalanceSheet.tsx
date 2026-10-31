import { Fragment, useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import { getBalanceSheet, listFiscalYears, downloadReportCsv } from '../../../services/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'
import { formatDate as formatDateIntl, formatMoney } from '../../../i18n/format'
import type { IBalanceSheetData, IBalanceSheetLine, IFiscalYear } from '../../../types/accounting'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatDateIntl(d) || '—'
}

const CLASS_LABEL_KEYS: Record<number, MessageKey> = {
  1: 'accAccounts.balanceSheet.class1',
  2: 'accAccounts.balanceSheet.class2',
  3: 'accAccounts.balanceSheet.class3',
  4: 'accAccounts.balanceSheet.class4',
  5: 'accAccounts.balanceSheet.class5',
}

interface BSGroup {
  cls: number
  lines: IBalanceSheetLine[]
  subtotal: number
}

function groupByClass(items: IBalanceSheetLine[] | undefined): BSGroup[] {
  const map = new Map<number, IBalanceSheetLine[]>()
  for (const it of items || []) {
    const k = it.accountClass
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(it)
  }
  const groups: BSGroup[] = Array.from(map.entries()).map(([cls, lines]) => ({
    cls,
    lines,
    subtotal: lines.reduce((s, l) => s + Number(l.amount || 0), 0),
  }))
  groups.sort((a, b) => a.cls - b.cls)
  return groups
}

interface BSFilters {
  fiscalYear: string
  asOf: string
}

const BalanceSheet = () => {
  const { t } = useI18n()
  const classLabel = (cls: number) =>
    CLASS_LABEL_KEYS[cls] ? t(CLASS_LABEL_KEYS[cls]) : t('accAccounts.balanceSheet.classN', { n: cls })
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<IBalanceSheetData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const [filters, setFilters] = useState<BSFilters>({
    fiscalYear: '',
    asOf: today,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const f = await listFiscalYears()
        if (!cancelled) setFiscalYears(f || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : translate('common.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function runQuery() {
    setLoading(true)
    setError('')
    try {
      const result = await getBalanceSheet({
        fiscalYear: filters.fiscalYear || undefined,
        asOf: filters.asOf || undefined,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExport() {
    try {
      await downloadReportCsv('balance-sheet', {
        fiscalYear: filters.fiscalYear || undefined,
        asOf: filters.asOf || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  const actifGroups = useMemo(() => groupByClass(data?.actif), [data])
  const passifGroups = useMemo(() => groupByClass(data?.passif), [data])
  const totalActif = Number(data?.totalActif || 0)
  const totalPassif = Number(data?.totalPassif || 0)
  const imbalance = Number(data?.imbalance || 0)
  const resultExercise = Number(data?.resultExercise || 0)
  const balanced = Math.abs(imbalance) < 0.01

  return (
    <AccountingLayout
      title={t('accAccounts.balanceSheet.title')}
      subtitle={t('accAccounts.balanceSheet.subtitle')}
      actions={
        <button className="portal-button secondary" onClick={handleExport}>
          {t('accAccounts.common.exportCsv')}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.fiscalYear}
            onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value })}
          >
            <option value="">{t('accAccounts.balanceSheet.chooseFiscalYear')}</option>
            {fiscalYears.map((fy) => (
              <option key={fy._id} value={fy._id}>
                {fy.code || fy.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="portal-input"
            value={filters.asOf}
            onChange={(e) => setFilters({ ...filters, asOf: e.target.value })}
            title={t('accAccounts.common.asOf')}
          />
          <button className="portal-button" onClick={runQuery}>
            {t('accAccounts.common.filter')}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
        ) : !data ? (
          <div className="accounting-empty">{t('accAccounts.balanceSheet.prompt')}</div>
        ) : (
          <>
            <div style={{ marginBottom: 16, color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem' }}>
              {t('accAccounts.common.asOf')} <strong>{formatDate(data.asOf)}</strong>
              {data.fiscalYear && (
                <>
                  {' · '}
                  {t('accAccounts.common.fiscalYear')} <strong>{data.fiscalYear.code || data.fiscalYear.label}</strong>
                </>
              )}
            </div>

            {Array.isArray(data.notes) && data.notes.length > 0 && (
              <div className="accounting-message info" style={{ marginBottom: 16 }}>
                <strong>{t('accAccounts.balanceSheet.notes')}</strong>
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {data.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              {/* ACTIF */}
              <div>
                <h2
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(14, 165, 233, 0.9)',
                  }}
                >
                  {t('accAccounts.balanceSheet.assets')}
                </h2>
                {actifGroups.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>
                    {t('accAccounts.balanceSheet.noAssets')}
                  </p>
                ) : (
                  <table className="accounting-table">
                    <tbody>
                      {actifGroups.map((g) => (
                        <Fragment key={`actif-${g.cls}`}>
                          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <td
                              colSpan={2}
                              style={{
                                padding: '8px 14px',
                                fontSize: '0.78rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: 'rgba(14, 165, 233, 0.85)',
                                fontWeight: 600,
                              }}
                            >
                              {classLabel(g.cls)}
                            </td>
                            <td
                              className="amount"
                              style={{
                                padding: '8px 14px',
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.9)',
                              }}
                            >
                              {formatEur(g.subtotal)}
                            </td>
                          </tr>
                          {g.lines.map((l) => (
                            <tr key={`actif-l-${l.code}`}>
                              <td className="code" style={{ paddingLeft: 24 }}>
                                {l.code}
                              </td>
                              <td>{l.label}</td>
                              <td className="amount">{formatEur(l.amount)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, padding: '14px' }}>
                          {t('accAccounts.balanceSheet.totalAssets')}
                        </td>
                        <td className="amount" style={{ fontWeight: 700, color: '#4ade80' }}>
                          {formatEur(totalActif)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* PASSIF */}
              <div>
                <h2
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(14, 165, 233, 0.9)',
                  }}
                >
                  {t('accAccounts.balanceSheet.liabilities')}
                </h2>
                {passifGroups.length === 0 && resultExercise === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>
                    {t('accAccounts.balanceSheet.noLiabilities')}
                  </p>
                ) : (
                  <table className="accounting-table">
                    <tbody>
                      {passifGroups.map((g) => (
                        <Fragment key={`passif-${g.cls}`}>
                          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <td
                              colSpan={2}
                              style={{
                                padding: '8px 14px',
                                fontSize: '0.78rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: 'rgba(14, 165, 233, 0.85)',
                                fontWeight: 600,
                              }}
                            >
                              {classLabel(g.cls)}
                            </td>
                            <td
                              className="amount"
                              style={{
                                padding: '8px 14px',
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.9)',
                              }}
                            >
                              {formatEur(g.subtotal)}
                            </td>
                          </tr>
                          {g.lines.map((l) => (
                            <tr key={`passif-l-${l.code}`}>
                              <td className="code" style={{ paddingLeft: 24 }}>
                                {l.code}
                              </td>
                              <td>{l.label}</td>
                              <td className="amount">{formatEur(l.amount)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      <tr
                        style={{
                          background: 'rgba(14, 165, 233, 0.06)',
                          borderTop: '1px solid rgba(14, 165, 233, 0.2)',
                        }}
                      >
                        <td
                          colSpan={2}
                          style={{
                            padding: '10px 14px',
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.9)',
                          }}
                        >
                          {t('accAccounts.balanceSheet.fiscalResult')} (
                          <span
                            style={{
                              color: resultExercise >= 0 ? '#4ade80' : '#f87171',
                              fontWeight: 700,
                            }}
                          >
                            {resultExercise >= 0
                              ? t('accAccounts.balanceSheet.profit')
                              : t('accAccounts.balanceSheet.loss')}
                          </span>
                          )
                        </td>
                        <td
                          className="amount"
                          style={{
                            fontWeight: 700,
                            color: resultExercise >= 0 ? '#4ade80' : '#f87171',
                          }}
                        >
                          {formatEur(resultExercise)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, padding: '14px' }}>
                          {t('accAccounts.balanceSheet.totalLiabilities')}
                        </td>
                        <td className="amount" style={{ fontWeight: 700, color: '#4ade80' }}>
                          {formatEur(totalPassif)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              {balanced ? (
                <span className="accounting-badge validated" style={{ fontSize: '0.85rem' }}>
                  {t('accAccounts.balanceSheet.balanced')}
                </span>
              ) : (
                <span
                  className="accounting-badge"
                  style={{
                    color: '#fca5a5',
                    background: 'rgba(248,113,113,0.1)',
                    borderColor: 'rgba(248,113,113,0.4)',
                    fontSize: '0.85rem',
                  }}
                >
                  {t('accAccounts.balanceSheet.imbalance', { amount: formatEur(imbalance) })}
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </AccountingLayout>
  )
}

export default BalanceSheet
