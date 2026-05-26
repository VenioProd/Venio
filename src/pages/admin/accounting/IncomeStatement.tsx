import { Fragment, useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import {
  getIncomeStatement,
  listFiscalYears,
  downloadReportCsv,
} from '@/services/accounting'
import type {
  IFiscalYear,
  IIncomeGroup,
  IIncomeLine,
  IIncomeStatementData,
} from '@/types/accounting'

const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return EUR_FORMATTER.format(value)
}

function detailsByGroup(items: IIncomeLine[] | undefined): Map<string, IIncomeLine[]> {
  const map = new Map<string, IIncomeLine[]>()
  for (const it of items || []) {
    const code = String(it.code || '')
    const prefix = code.slice(0, 2)
    if (!map.has(prefix)) map.set(prefix, [])
    map.get(prefix)!.push(it)
  }
  return map
}

interface GroupSectionProps {
  title: string
  totalLabel: string
  groups?: IIncomeGroup[]
  total: number
  details: Map<string, IIncomeLine[]>
  color: string
}

const GroupSection = ({
  title,
  totalLabel,
  groups,
  total,
  details,
  color,
}: GroupSectionProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(g: string) {
    setExpanded((prev) => ({ ...prev, [g]: !prev[g] }))
  }

  return (
    <div>
      <h2
        style={{
          margin: '0 0 12px 0',
          fontSize: '1rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color,
        }}
      >
        {title}
      </h2>
      {!groups || groups.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>
          Aucune ligne sur la période.
        </p>
      ) : (
        <table className="accounting-table">
          <tbody>
            {groups.map((g) => {
              const isOpen = !!expanded[g.group]
              const lines = details.get(g.group) || []
              const hasLines = lines.length > 0
              return (
                <Fragment key={`grp-${g.group}`}>
                  <tr
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      cursor: hasLines ? 'pointer' : 'default',
                    }}
                    onClick={hasLines ? () => toggle(g.group) : undefined}
                  >
                    <td
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.78rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'rgba(34,211,238,0.85)',
                        fontWeight: 600,
                      }}
                    >
                      {hasLines && (
                        <span style={{ marginRight: 6, display: 'inline-block', width: 12 }}>
                          {isOpen ? '▾' : '▸'}
                        </span>
                      )}
                      {g.group} — {g.label}
                    </td>
                    <td
                      className="amount"
                      style={{
                        padding: '8px 14px',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      {formatEur(g.amount)}
                    </td>
                  </tr>
                  {isOpen &&
                    lines.map((l) => (
                      <tr key={`l-${l.code}`}>
                        <td style={{ paddingLeft: 32 }}>
                          <span className="code" style={{ marginRight: 8 }}>
                            {l.code}
                          </span>
                          {l.label}
                        </td>
                        <td className="amount">{formatEur(l.amount)}</td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(14,165,233,0.4)' }}>
              <td style={{ fontWeight: 700, padding: '14px' }}>{totalLabel}</td>
              <td className="amount" style={{ fontWeight: 700, color }}>
                {formatEur(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

interface IncomeFilters {
  fiscalYear: string
  from: string
  to: string
}

const IncomeStatement = () => {
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<IIncomeStatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<IncomeFilters>({
    fiscalYear: '',
    from: '',
    to: '',
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
      const result = await getIncomeStatement({
        fiscalYear: filters.fiscalYear || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
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
      await downloadReportCsv('income-statement', {
        fiscalYear: filters.fiscalYear || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const chargesDetails = useMemo(() => detailsByGroup(data?.charges), [data])
  const produitsDetails = useMemo(() => detailsByGroup(data?.produits), [data])
  const result = Number(data?.result || 0)
  const isProfit = result >= 0

  return (
    <AccountingLayout
      title="Compte de résultat"
      subtitle="Charges, produits et résultat net sur la période"
      actions={
        <button className="portal-button secondary" onClick={handleExport}>
          ⬇ Export CSV
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
            <option value="">Tous exercices</option>
            {fiscalYears.map((fy) => (
              <option key={fy._id} value={fy._id}>
                {fy.code || fy.label}
              </option>
            ))}
          </select>
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
          <button className="portal-button" onClick={runQuery}>
            Filtrer
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : !data ? (
          <div className="accounting-empty">
            Sélectionnez une période puis cliquez sur « Filtrer » pour afficher le compte de résultat.
          </div>
        ) : (
          <>
            <div className="accounting-message info" style={{ marginBottom: 16 }}>
              Période : <strong>{data.periodLabel || '—'}</strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              <GroupSection
                title="Charges"
                totalLabel="Total charges"
                groups={data.chargesByGroup}
                total={data.totalCharges}
                details={chargesDetails}
                color="#f87171"
              />
              <GroupSection
                title="Produits"
                totalLabel="Total produits"
                groups={data.produitsByGroup}
                total={data.totalProduits}
                details={produitsDetails}
                color="#4ade80"
              />
            </div>

            <div
              style={{
                marginTop: 24,
                padding: '24px',
                borderRadius: 16,
                background: isProfit
                  ? 'linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(34,197,94,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(248,113,113,0.12) 0%, rgba(239,68,68,0.06) 100%)',
                border: `1px solid ${
                  isProfit ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'
                }`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 8,
                }}
              >
                Résultat de l'exercice
              </div>
              <div
                style={{
                  fontSize: '2.2rem',
                  fontWeight: 800,
                  color: isProfit ? '#4ade80' : '#f87171',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {isProfit ? 'BÉNÉFICE NET : ' : 'PERTE NETTE : '}
                {isProfit ? '+' : ''}
                {formatEur(result)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: '0.9rem',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                Total produits {formatEur(data.totalProduits)} − Total charges{' '}
                {formatEur(data.totalCharges)}
              </div>
            </div>
          </>
        )}
      </section>
    </AccountingLayout>
  )
}

export default IncomeStatement
