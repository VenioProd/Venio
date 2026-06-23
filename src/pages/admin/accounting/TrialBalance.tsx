import { useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import { getTrialBalance, listFiscalYears, downloadReportCsv } from '../../../services/accounting'
import type { AccountType, IFiscalYear, ITrialBalanceData, ITrialBalanceRow } from '../../../types/accounting'

const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return EUR_FORMATTER.format(value)
}

function balanceColor(type: AccountType | undefined, balance: unknown): string {
  const b = Number(balance) || 0
  if (b === 0) return 'rgba(255,255,255,0.85)'
  const debitNormal = type === 'ACTIF' || type === 'CHARGE'
  const creditNormal = type === 'PASSIF' || type === 'PRODUIT' || type === 'CAPITAUX'
  if (debitNormal) return b > 0 ? '#4ade80' : '#f87171'
  if (creditNormal) return b < 0 ? '#4ade80' : '#f87171'
  return 'rgba(255,255,255,0.85)'
}

interface TrialBalanceFilters {
  from: string
  to: string
  fiscalYear: string
  accountClass: string
  includeZero: boolean
}

type SeparatorRow = { __separator: true; classNum: number; key: string }
type DisplayRow = ITrialBalanceRow | SeparatorRow

function isSeparator(r: DisplayRow): r is SeparatorRow {
  return (r as SeparatorRow).__separator === true
}

const TrialBalance = () => {
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<ITrialBalanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<TrialBalanceFilters>({
    from: '',
    to: '',
    fiscalYear: '',
    accountClass: '',
    includeZero: false,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const f = await listFiscalYears()
        if (!cancelled) setFiscalYears(f || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur')
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
      const result = await getTrialBalance({
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        accountClass: filters.accountClass || undefined,
        includeZero: filters.includeZero,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
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
      await downloadReportCsv('balance', {
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        accountClass: filters.accountClass || undefined,
        includeZero: filters.includeZero,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const rows = data?.rows || []
  const totals = data?.totals
  const balanced = useMemo(() => {
    if (!totals) return false
    return Math.abs(Number(totals.debit) - Number(totals.credit)) < 0.01
  }, [totals])

  const rowsWithSeparators: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    let lastClass: number | null = null
    for (const r of rows) {
      if (r.accountClass !== lastClass) {
        out.push({ __separator: true, classNum: r.accountClass, key: `sep-${r.accountClass}` })
        lastClass = r.accountClass
      }
      out.push(r)
    }
    return out
  }, [rows])

  return (
    <AccountingLayout
      title="Balance comptable"
      subtitle="Totaux débit / crédit et solde par compte"
      actions={
        <button className="portal-button secondary" onClick={handleExport}>
          ⬇ Export CSV
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <input
            type="date"
            className="portal-input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            title="Date de début"
          />
          <input
            type="date"
            className="portal-input"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            title="Date de fin"
          />
          <select
            className="portal-input"
            value={filters.fiscalYear}
            onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value })}
          >
            <option value="">Tous exercices</option>
            {fiscalYears.map((fy) => (
              <option key={fy._id} value={fy._id}>
                {fy.code || fy.label}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.accountClass}
            onChange={(e) => setFilters({ ...filters, accountClass: e.target.value })}
          >
            <option value="">Toutes classes</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <option key={c} value={c}>
                Classe {c}
              </option>
            ))}
          </select>
          <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={filters.includeZero}
              onChange={(e) => setFilters({ ...filters, includeZero: e.target.checked })}
            />{' '}
            Inclure soldes nuls
          </label>
          <button className="portal-button" onClick={runQuery}>
            Filtrer
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : !data || rows.length === 0 ? (
          <div className="accounting-empty">
            Aucune ligne pour ces filtres.
            <div className="hint">Activez « Inclure soldes nuls » pour afficher tous les comptes.</div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Classe</th>
                <th className="amount">Débit</th>
                <th className="amount">Crédit</th>
                <th className="amount">Solde</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithSeparators.map((r) =>
                isSeparator(r) ? (
                  <tr
                    key={r.key}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <td
                      colSpan={6}
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'rgba(14, 165, 233, 0.85)',
                        fontWeight: 600,
                      }}
                    >
                      Classe {r.classNum}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.accountCode}>
                    <td className="code">{r.accountCode}</td>
                    <td>{r.accountLabel}</td>
                    <td>{r.accountClass}</td>
                    <td className="amount">{formatEur(r.debit)}</td>
                    <td className="amount">{formatEur(r.credit)}</td>
                    <td
                      className="amount"
                      style={{
                        color: balanceColor(r.type, r.balance),
                        fontWeight: 600,
                      }}
                    >
                      {formatEur(r.balance)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            {totals && (
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: '14px' }}>
                    Totaux
                  </td>
                  <td className="amount" style={{ fontWeight: 700 }}>
                    {formatEur(totals.debit)}
                  </td>
                  <td className="amount" style={{ fontWeight: 700 }}>
                    {formatEur(totals.credit)}
                  </td>
                  <td className="amount" style={{ fontWeight: 700 }}>
                    {balanced ? (
                      <span style={{ color: '#4ade80' }}>Équilibré ✓</span>
                    ) : (
                      <span style={{ color: '#f87171' }}>
                        Écart : {formatEur(Number(totals.debit) - Number(totals.credit))}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>
    </AccountingLayout>
  )
}

export default TrialBalance
