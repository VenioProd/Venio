import { useCallback, useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import {
  listAccounts,
  listUnletteredLines,
  listLetteredLines,
  letterLines,
  unletterCode,
} from '@/services/accounting'
import type {
  IChartOfAccount,
  ILetteredData,
  IUnletteredData,
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

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR')
  } catch {
    return '—'
  }
}

const EMPTY_UNLETTERED: IUnletteredData = { account: null, lines: [] }
const EMPTY_LETTERED: ILetteredData = { account: null, groups: [] }

const Lettrage = () => {
  const [lettrableAccounts, setLettrableAccounts] = useState<IChartOfAccount[]>([])
  const [accountCode, setAccountCode] = useState('')

  const [unlettered, setUnlettered] = useState<IUnletteredData>(EMPTY_UNLETTERED)
  const [lettered, setLettered] = useState<ILetteredData>(EMPTY_LETTERED)

  const [accountsLoading, setAccountsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [success, setSuccess] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lettering, setLettering] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAccountsLoading(true)
      try {
        const all = await listAccounts({ active: true })
        const lettrables = (all || []).filter((a) => a.isLettrable === true)
        if (cancelled) return
        setLettrableAccounts(lettrables)

        const default411 = lettrables.find((a) => a.code === '411000')
        const first = lettrables[0]
        if (default411) setAccountCode(default411.code)
        else if (first) setAccountCode(first.code)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur')
      } finally {
        if (!cancelled) setAccountsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    if (!accountCode) return
    setLoading(true)
    setError('')
    setSelected(new Set())
    try {
      const [u, l] = await Promise.all([
        listUnletteredLines(accountCode),
        listLetteredLines(accountCode),
      ])
      setUnlettered(u || EMPTY_UNLETTERED)
      setLettered(l || EMPTY_LETTERED)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [accountCode])

  useEffect(() => {
    if (accountCode) reload()
  }, [accountCode, reload])

  function toggle(id: string) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
    setInfo('')
    setSuccess('')
  }

  const { totalDebit, totalCredit, diff, balanced } = useMemo(() => {
    let d = 0
    let c = 0
    for (const line of unlettered.lines || []) {
      if (selected.has(line._id)) {
        d += Number(line.debit) || 0
        c += Number(line.credit) || 0
      }
    }
    const delta = d - c
    return {
      totalDebit: d,
      totalCredit: c,
      diff: delta,
      balanced: Math.abs(delta) < 0.01,
    }
  }, [selected, unlettered])

  const suggestionIds = useMemo(() => {
    if (selected.size !== 1) return new Set<string>()
    const [onlyId] = Array.from(selected)
    const src = (unlettered.lines || []).find((l) => l._id === onlyId)
    if (!src) return new Set<string>()
    const target: 'credit' | 'debit' = (Number(src.debit) || 0) > 0 ? 'credit' : 'debit'
    const amount = (Number(src.debit) || 0) || (Number(src.credit) || 0)
    if (!amount) return new Set<string>()
    const ids = new Set<string>()
    for (const l of unlettered.lines || []) {
      if (l._id === onlyId) continue
      const v = Number(l[target]) || 0
      if (Math.abs(v - amount) < 0.01) ids.add(l._id)
    }
    return ids
  }, [selected, unlettered])

  async function handleLetter() {
    if (selected.size < 2) return
    setLettering(true)
    setError('')
    setSuccess('')
    setInfo('')
    try {
      const ids = Array.from(selected)
      const r = await letterLines(ids)
      if (r.partial) {
        setInfo(
          `Lettrage partiel créé sous le code ${r.code} (${r.lineCount} ligne(s)). Écart : ${formatEur(
            Math.abs(Number(r.totalDebit) - Number(r.totalCredit))
          )}.`
        )
      } else {
        setSuccess(
          `Lettrage ${r.code} créé : ${r.lineCount} ligne(s) lettrée(s) pour ${formatEur(
            Number(r.totalDebit)
          )}.`
        )
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLettering(false)
    }
  }

  async function handleUnletter(code: string) {
    if (!confirm(`Délettrer le code ${code} ? Les lignes redeviendront non lettrées.`)) return
    setError('')
    setSuccess('')
    setInfo('')
    try {
      const r = await unletterCode(accountCode, code)
      setSuccess(`Lettrage ${code} supprimé (${r.unlinked} ligne(s)).`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const account = unlettered.account || lettered.account
  const showSuggestions = suggestionIds.size > 0

  return (
    <AccountingLayout
      title="Lettrage"
      subtitle="Rapprochement manuel des écritures sur un compte lettrable"
    >
      {error && <div className="accounting-message error">{error}</div>}
      {info && <div className="accounting-message info">{info}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <div className="accounting-toolbar">
          <div className="accounting-form-field" style={{ flex: 1, minWidth: 280 }}>
            <label>Compte lettrable</label>
            {accountsLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                Chargement des comptes…
              </p>
            ) : lettrableAccounts.length === 0 ? (
              <p style={{ color: 'rgba(248,113,113,0.85)', margin: 0, fontSize: '0.88rem' }}>
                Aucun compte lettrable trouvé. Activez l'option « Lettrable » sur les
                comptes concernés dans le plan comptable.
              </p>
            ) : (
              <select
                className="portal-input"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
              >
                {lettrableAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {account && (
            <div
              style={{
                alignSelf: 'flex-end',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(14,165,233,0.08)',
                border: '1px solid rgba(14,165,233,0.25)',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <span className="code">{account.code}</span> — {account.label}
              {account.type && (
                <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.55)' }}>
                  ({account.type})
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {!accountCode ? null : loading ? (
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      ) : (
        <>
          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                À lettrer
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: '0.85rem',
                    color: 'rgba(255,255,255,0.55)',
                    fontWeight: 400,
                  }}
                >
                  ({(unlettered.lines || []).length} ligne(s))
                </span>
              </h2>
              <button
                className="portal-button"
                onClick={handleLetter}
                disabled={selected.size < 2 || lettering}
              >
                {lettering
                  ? 'Lettrage…'
                  : `✓ Lettrer la sélection${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            </div>

            {showSuggestions && (
              <div className="accounting-message info" style={{ marginBottom: 12 }}>
                Suggestion : {suggestionIds.size} ligne(s) avec un montant opposé identique
                sont mises en évidence ci-dessous.
              </div>
            )}

            {(unlettered.lines || []).length === 0 ? (
              <div className="accounting-empty">
                Aucune ligne à lettrer sur ce compte.
                <div className="hint">
                  Toutes les écritures de ce compte sont déjà lettrées ou il n'y a pas encore
                  d'écritures validées.
                </div>
              </div>
            ) : (
              <>
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>Date</th>
                      <th>Journal</th>
                      <th>N° écriture</th>
                      <th>Pièce</th>
                      <th>Libellé</th>
                      <th className="amount">Débit</th>
                      <th className="amount">Crédit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlettered.lines.map((line) => {
                      const isSelected = selected.has(line._id)
                      const isSuggested = suggestionIds.has(line._id)
                      return (
                        <tr
                          key={line._id}
                          style={
                            isSuggested
                              ? {
                                  background: 'rgba(251,191,36,0.08)',
                                  outline: '1px solid rgba(251,191,36,0.35)',
                                }
                              : undefined
                          }
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(line._id)}
                            />
                          </td>
                          <td>{formatDate(line.date)}</td>
                          <td className="code">{line.journalCode}</td>
                          <td className="code">{line.entryNumber}</td>
                          <td className="code">{line.pieceRef || '—'}</td>
                          <td>{line.label}</td>
                          <td className="amount">
                            {Number(line.debit) > 0 ? formatEur(line.debit) : '—'}
                          </td>
                          <td className="amount">
                            {Number(line.credit) > 0 ? formatEur(line.credit) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div
                  className={`accounting-totals ${
                    selected.size > 0 && balanced
                      ? 'balanced'
                      : selected.size > 0
                      ? 'unbalanced'
                      : ''
                  }`}
                  style={{ marginTop: 14 }}
                >
                  <div>
                    <div className="label">Débit sélectionné</div>
                    <div className="value">{formatEur(totalDebit)}</div>
                  </div>
                  <div>
                    <div className="label">Crédit sélectionné</div>
                    <div className="value">{formatEur(totalCredit)}</div>
                  </div>
                  <div>
                    <div className="label">Différence</div>
                    <div className="value">
                      {selected.size === 0 ? (
                        <span style={{ color: 'rgba(255,255,255,0.55)' }}>—</span>
                      ) : balanced ? (
                        <span
                          className="accounting-badge validated"
                          style={{ fontSize: '0.78rem' }}
                        >
                          Équilibré ✓
                        </span>
                      ) : (
                        <span
                          className="accounting-badge draft"
                          style={{ fontSize: '0.78rem' }}
                        >
                          Déséquilibre : {formatEur(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="accounting-card">
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.05rem' }}>
              Lettrées
              <span
                style={{
                  marginLeft: 10,
                  fontSize: '0.85rem',
                  color: 'rgba(255,255,255,0.55)',
                  fontWeight: 400,
                }}
              >
                ({(lettered.groups || []).length} groupe(s))
              </span>
            </h2>

            {(lettered.groups || []).length === 0 ? (
              <div className="accounting-empty">
                Aucun lettrage sur ce compte.
                <div className="hint">
                  Sélectionnez au moins 2 lignes ci-dessus puis cliquez sur « Lettrer la
                  sélection ».
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lettered.groups.map((g) => {
                  const groupBalanced =
                    Math.abs(Number(g.totalDebit) - Number(g.totalCredit)) < 0.01
                  return (
                    <div
                      key={g.code}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(14,165,233,0.18)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 10,
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span
                            className="code"
                            style={{
                              fontSize: '1.4rem',
                              fontWeight: 700,
                              color: '#7dd3fc',
                            }}
                          >
                            {g.code}
                          </span>
                          <span
                            style={{
                              color: 'rgba(255,255,255,0.65)',
                              fontSize: '0.88rem',
                            }}
                          >
                            {g.lineCount} ligne(s) · Débit {formatEur(g.totalDebit)} · Crédit{' '}
                            {formatEur(g.totalCredit)} · {formatDate(g.lettrageDate)}
                          </span>
                          {!groupBalanced && (
                            <span
                              className="accounting-badge draft"
                              style={{ fontSize: '0.72rem' }}
                            >
                              Partiel
                            </span>
                          )}
                        </div>
                        <div className="accounting-row-actions">
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleUnletter(g.code)}
                          >
                            Délettrer
                          </button>
                        </div>
                      </div>

                      <table className="accounting-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Journal</th>
                            <th>N° écriture</th>
                            <th>Libellé</th>
                            <th className="amount">Débit</th>
                            <th className="amount">Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(g.lines || []).map((line) => (
                            <tr key={line._id}>
                              <td>{formatDate(line.date)}</td>
                              <td className="code">{line.journalCode}</td>
                              <td className="code">{line.entryNumber}</td>
                              <td>{line.label}</td>
                              <td className="amount">
                                {Number(line.debit) > 0 ? formatEur(line.debit) : '—'}
                              </td>
                              <td className="amount">
                                {Number(line.credit) > 0 ? formatEur(line.credit) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </AccountingLayout>
  )
}

export default Lettrage
