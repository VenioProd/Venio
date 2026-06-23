import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listEntries, listExternalSources, bulkValidateEntries } from '../../../services/accounting'
import type { IAccountingEntry, IExternalSource } from '../../../types/accounting'

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

const STATUS_FILTER_OPTIONS = [
  { value: 'DRAFT', label: 'À valider (DRAFT)' },
  { value: '', label: 'Tous statuts' },
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
      setError(err instanceof Error ? err.message : 'Erreur')
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
    if (!confirm(`Valider ${ids.length} écriture(s) ?`)) return
    setValidating(true)
    setError('')
    setSuccess('')
    try {
      const results = await bulkValidateEntries(ids)
      const ok = Array.isArray(results) ? results.filter((r) => r.ok || r.success).length : ids.length
      const ko = Array.isArray(results) ? results.length - ok : 0
      setSuccess(`${ok} écriture(s) validée(s)${ko > 0 ? `, ${ko} en erreur` : ''}.`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setValidating(false)
    }
  }

  async function handleValidateAll() {
    const ids = selectableEntries.map((e) => e._id)
    if (ids.length === 0) return
    if (!confirm(`Valider toutes les ${ids.length} écritures DRAFT affichées sur cette page ?`)) return
    await handleBulkValidate(ids)
  }

  return (
    <AccountingLayout
      title="File d'attente — écritures à valider"
      subtitle="Écritures issues des sources externes, en attente de revue manuelle"
      actions={
        <button
          className="portal-button"
          onClick={handleValidateAll}
          disabled={validating || selectableEntries.length === 0}
        >
          {validating ? 'Validation…' : `✓ Tout valider (${selectableEntries.length})`}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">Écritures à valider</div>
          <div className="value" style={{ color: draftCount > 0 ? '#fbbf24' : '#4ade80' }}>
            {draftCount}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Total en attente</div>
          <div className="value">{formatEur(totalAmount)}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Sources actives</div>
          <div className="value">{sources.filter((s) => s.status === 'ACTIVE').length}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Sélectionnées</div>
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
            <option value="">Toutes les sources externes</option>
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
                {o.label}
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
            Filtrer
          </button>

          <div className="accounting-toolbar-right">
            {selected.size > 0 && (
              <button
                className="portal-button"
                onClick={() => handleBulkValidate(Array.from(selected))}
                disabled={validating}
              >
                {validating ? 'Validation…' : `✓ Valider la sélection (${selected.size})`}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : entries.length === 0 ? (
          <div className="accounting-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✓</div>
            Tout est à jour !<div className="hint">Aucune écriture en attente de validation pour ces filtres.</div>
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
                <th>Numéro</th>
                <th>Date</th>
                <th>Source</th>
                <th>N° pièce</th>
                <th>Libellé</th>
                <th className="amount">Débit</th>
                <th className="amount">Crédit</th>
                <th>Auto-validée</th>
                <th>Statut</th>
                <th>Actions</th>
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
                        <span className="accounting-badge validated">Oui</span>
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
                          <button type="button">Ouvrir</button>
                        </Link>
                        {isDraft && (
                          <button type="button" onClick={() => handleBulkValidate([e._id])} disabled={validating}>
                            ✓ Valider
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
              ← Précédent
            </button>
            <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)' }}>
              Page {filters.page} / {Math.max(1, Math.ceil(total / filters.limit))}
            </span>
            <button
              className="portal-button secondary"
              disabled={filters.page >= Math.ceil(total / filters.limit)}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Suivant →
            </button>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default DraftQueue
