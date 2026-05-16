import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import {
  computeVat,
  listVatDeclarations,
  createVatDeclaration,
  deleteVatDeclaration,
} from '../../../services/accounting'
import type { CreateVatDeclarationPayload } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IVatDeclaration, IVatPreview, VatType } from '../../../types/accounting'

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

function formatRate(rate: unknown): string {
  const value = Number(rate)
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(2).replace(/\.00$/, '')} %`
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tous statuts' },
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'SUBMITTED', label: 'Soumise' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Tous types' },
  { value: 'CA3', label: 'CA3' },
  { value: 'CA12', label: 'CA12' },
]

interface VatFilters {
  status: string
  type: string
}

interface NewDeclarationForm {
  type: VatType
  periodStart: string
  periodEnd: string
  previousCredit: string
  notes: string
}

const VatDeclarations = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_VAT)

  const [declarations, setDeclarations] = useState<IVatDeclaration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<VatFilters>({ status: '', type: '' })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewDeclarationForm>({
    type: 'CA3',
    periodStart: '',
    periodEnd: '',
    previousCredit: '',
    notes: '',
  })
  const [preview, setPreview] = useState<IVatPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [creating, setCreating] = useState(false)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const list = await listVatDeclarations({
        status: filters.status || undefined,
        type: filters.type || undefined,
      })
      setDeclarations(list || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.type])

  function resetForm() {
    setForm({ type: 'CA3', periodStart: '', periodEnd: '', previousCredit: '', notes: '' })
    setPreview(null)
    setPreviewError('')
  }

  async function handlePreview() {
    setPreviewError('')
    setPreview(null)
    if (!form.periodStart || !form.periodEnd) {
      setPreviewError('Veuillez renseigner les dates de début et de fin.')
      return
    }
    setPreviewLoading(true)
    try {
      const r = await computeVat({ from: form.periodStart, to: form.periodEnd })
      setPreview(r)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleCreate() {
    if (!form.periodStart || !form.periodEnd) {
      setPreviewError('Veuillez renseigner les dates de début et de fin.')
      return
    }
    setCreating(true)
    setPreviewError('')
    try {
      const payload: CreateVatDeclarationPayload = {
        type: form.type,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
      }
      if (form.previousCredit !== '' && Number(form.previousCredit) > 0) {
        payload.previousCredit = Number(form.previousCredit)
      }
      if (form.notes && form.notes.trim()) {
        payload.notes = form.notes.trim()
      }
      const created = await createVatDeclaration(payload)
      navigate(`/admin/comptabilite/tva/${created._id}`)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette déclaration brouillon ?')) return
    try {
      await deleteVatDeclaration(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const filteredDeclarations = useMemo(() => declarations, [declarations])

  return (
    <AccountingLayout
      title="Déclarations de TVA"
      subtitle="Préparation, prévisualisation et suivi des déclarations CA3 / CA12"
      actions={
        canManage && (
          <button
            className="portal-button"
            onClick={() => {
              setShowForm((v) => !v)
              if (showForm) resetForm()
            }}
          >
            {showForm ? '✕ Annuler' : '✚ Nouvelle déclaration'}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <section className="accounting-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Nouvelle déclaration</h2>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Type</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as VatType })}
              >
                <option value="CA3">CA3 — Mensuelle / trimestrielle</option>
                <option value="CA12">CA12 — Annuelle (régime simplifié)</option>
              </select>
            </div>
            <div className="accounting-form-field">
              <label>Période début</label>
              <input
                type="date"
                className="portal-input"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Période fin</label>
              <input
                type="date"
                className="portal-input"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Crédit antérieur (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="portal-input"
                placeholder="0.00"
                value={form.previousCredit}
                onChange={(e) => setForm({ ...form, previousCredit: e.target.value })}
              />
            </div>
            <div className="accounting-form-field full">
              <label>Notes</label>
              <textarea
                className="portal-input"
                rows={3}
                placeholder="Observations, commentaires internes…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="portal-button secondary"
              onClick={handlePreview}
              disabled={previewLoading}
            >
              {previewLoading ? 'Calcul…' : '⟳ Prévisualiser'}
            </button>
            <button className="portal-button" onClick={handleCreate} disabled={creating}>
              {creating ? 'Création…' : '✚ Créer la déclaration'}
            </button>
          </div>

          {previewError && (
            <div className="accounting-message error" style={{ marginTop: 14 }}>
              {previewError}
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 20 }}>
              <div className="accounting-message info">
                Prévisualisation sur la période{' '}
                <strong>
                  {formatDate(preview.periodStart)} → {formatDate(preview.periodEnd)}
                </strong>{' '}
                — calcul basé sur les écritures validées/verrouillées non encore archivées.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 20,
                  marginTop: 16,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.95rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: '#4ade80',
                    }}
                  >
                    TVA collectée
                  </h3>
                  {(preview.collectedByRate || []).length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem' }}>
                      Aucune TVA collectée sur la période.
                    </p>
                  ) : (
                    <table className="accounting-table">
                      <thead>
                        <tr>
                          <th>Taux</th>
                          <th className="amount">Base HT</th>
                          <th className="amount">TVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.collectedByRate.map((r, i) => (
                          <tr key={`coll-${i}`}>
                            <td>{formatRate(r.rate)}</td>
                            <td className="amount">{formatEur(r.base)}</td>
                            <td className="amount">{formatEur(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.95rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: '#7dd3fc',
                    }}
                  >
                    TVA déductible
                  </h3>
                  {(preview.deductibleByRate || []).length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem' }}>
                      Aucune TVA déductible sur la période.
                    </p>
                  ) : (
                    <table className="accounting-table">
                      <thead>
                        <tr>
                          <th>Taux</th>
                          <th className="amount">Base HT</th>
                          <th className="amount">TVA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.deductibleByRate.map((r, i) => (
                          <tr key={`ded-${i}`}>
                            <td>{formatRate(r.rate)}</td>
                            <td className="amount">{formatEur(r.base)}</td>
                            <td className="amount">{formatEur(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {Array.isArray(preview.declarationLines) && preview.declarationLines.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.95rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'rgba(34,211,238,0.85)',
                    }}
                  >
                    Lignes CA3
                  </h3>
                  <table className="accounting-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Libellé</th>
                        <th className="amount">Base</th>
                        <th className="amount">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.declarationLines.map((l, i) => (
                        <tr key={`dl-${i}`}>
                          <td className="code">{l.code}</td>
                          <td>{l.label}</td>
                          <td className="amount">{formatEur(l.base)}</td>
                          <td className="amount">{formatEur(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="accounting-kpi-grid" style={{ marginTop: 20 }}>
                <div className="accounting-kpi">
                  <div className="label">Total collectée</div>
                  <div className="value" style={{ color: '#4ade80' }}>
                    {formatEur(preview.totalCollected)}
                  </div>
                </div>
                <div className="accounting-kpi">
                  <div className="label">Total déductible</div>
                  <div className="value" style={{ color: '#7dd3fc' }}>
                    {formatEur(preview.totalDeductible)}
                  </div>
                </div>
                <div className="accounting-kpi">
                  <div className="label">À payer</div>
                  <div
                    className="value"
                    style={{
                      color: Number(preview.totalDue) > 0 ? '#f87171' : '#4ade80',
                    }}
                  >
                    {formatEur(preview.totalDue)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : filteredDeclarations.length === 0 ? (
          <div className="accounting-empty">
            Aucune déclaration de TVA pour ces filtres.
            {canManage && (
              <div className="hint">
                Cliquez sur « Nouvelle déclaration » pour en créer une.
              </div>
            )}
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Période</th>
                <th>Type</th>
                <th className="amount">Total collectée</th>
                <th className="amount">Total déductible</th>
                <th className="amount">À payer</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeclarations.map((d) => {
                const due = Number(d.totalDue) || 0
                return (
                  <tr key={d._id}>
                    <td>
                      <Link to={`/admin/comptabilite/tva/${d._id}`} className="code">
                        {formatDate(d.periodStart)} → {formatDate(d.periodEnd)}
                      </Link>
                    </td>
                    <td className="code">{d.type}</td>
                    <td className="amount">{formatEur(d.totalCollected)}</td>
                    <td className="amount">{formatEur(d.totalDeductible)}</td>
                    <td
                      className="amount"
                      style={{
                        fontWeight: 600,
                        color: due > 0 ? '#f87171' : '#4ade80',
                      }}
                    >
                      {formatEur(due)}
                    </td>
                    <td>
                      <span
                        className={`accounting-badge ${
                          d.status === 'SUBMITTED' ? 'validated' : 'draft'
                        }`}
                      >
                        {d.status === 'SUBMITTED' ? 'Soumise' : 'Brouillon'}
                      </span>
                    </td>
                    <td>
                      <div className="accounting-row-actions">
                        <Link to={`/admin/comptabilite/tva/${d._id}`}>
                          <button type="button">Ouvrir</button>
                        </Link>
                        {canManage && d.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleDelete(d._id)}
                          >
                            Supprimer
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
      </section>
    </AccountingLayout>
  )
}

export default VatDeclarations
