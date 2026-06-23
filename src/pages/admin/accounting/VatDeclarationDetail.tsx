import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { getVatDeclaration, submitVatDeclaration } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IVatDeclaration, IVatRateBreakdown } from '../../../types/accounting'

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

function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR')
  } catch {
    return '—'
  }
}

function formatRate(rate: unknown): string {
  const value = Number(rate)
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(2).replace(/\.00$/, '')} %`
}

function sumAmount(rows: IVatRateBreakdown[] | undefined): number {
  return (rows || []).reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
}

function sumBase(rows: IVatRateBreakdown[] | undefined): number {
  return (rows || []).reduce((acc, r) => acc + (Number(r.base) || 0), 0)
}

const VatDeclarationDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_VAT)

  const [declaration, setDeclaration] = useState<IVatDeclaration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submittedRef, setSubmittedRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const d = await getVatDeclaration(id)
      setDeclaration(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleSubmit() {
    if (!id) return
    setSubmitError('')
    setSubmitting(true)
    try {
      const payload: { submittedRef?: string } = {}
      if (submittedRef.trim()) payload.submittedRef = submittedRef.trim()
      const updated = await submitVatDeclaration(id, payload)
      setDeclaration(updated)
      setShowSubmitModal(false)
      setSubmittedRef('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const isDraft = declaration?.status === 'DRAFT'
  const isSubmitted = declaration?.status === 'SUBMITTED'

  const totalCollected = Number(declaration?.totalCollected) || 0
  const totalDeductible = Number(declaration?.totalDeductible) || 0
  const previousCredit = Number(declaration?.previousCredit) || 0
  const totalDue = Number(declaration?.totalDue) || 0
  const currentCredit = Number(declaration?.currentCredit) || 0

  const title = declaration
    ? `Déclaration ${declaration.type} — ${formatDate(declaration.periodStart)} → ${formatDate(declaration.periodEnd)}`
    : 'Déclaration de TVA'

  return (
    <AccountingLayout
      title={title}
      subtitle={
        declaration
          ? `Régime : ${declaration.regime || '—'} · Périodicité : ${declaration.periodicity || '—'}`
          : undefined
      }
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="portal-button secondary" onClick={() => navigate('/admin/comptabilite/tva')}>
            ← Liste
          </button>
          {declaration && canManage && isDraft && (
            <button className="portal-button" onClick={() => setShowSubmitModal(true)}>
              ✓ Soumettre
            </button>
          )}
          {declaration && isSubmitted && (
            <button className="portal-button" disabled>
              Soumise le {formatDate(declaration.submittedAt)}
            </button>
          )}
        </div>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      ) : !declaration ? (
        <div className="accounting-empty">
          Déclaration introuvable.
          <div className="hint">
            <Link to="/admin/comptabilite/tva" style={{ color: 'var(--primary)' }}>
              Retour à la liste →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Informations</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(255,255,255,0.55)',
                    marginBottom: 4,
                  }}
                >
                  Type
                </div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>{declaration.type}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(255,255,255,0.55)',
                    marginBottom: 4,
                  }}
                >
                  Période
                </div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                  {formatDate(declaration.periodStart)} → {formatDate(declaration.periodEnd)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(255,255,255,0.55)',
                    marginBottom: 4,
                  }}
                >
                  Régime
                </div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>{declaration.regime || '—'}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(255,255,255,0.55)',
                    marginBottom: 4,
                  }}
                >
                  Périodicité
                </div>
                <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>{declaration.periodicity || '—'}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(255,255,255,0.55)',
                    marginBottom: 4,
                  }}
                >
                  Statut
                </div>
                <div>
                  <span className={`accounting-badge ${isSubmitted ? 'validated' : 'draft'}`}>
                    {isSubmitted ? 'Soumise' : 'Brouillon'}
                  </span>
                </div>
              </div>
              {isSubmitted && declaration.submittedRef && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'rgba(255,255,255,0.55)',
                      marginBottom: 4,
                    }}
                  >
                    Référence
                  </div>
                  <div className="code">{declaration.submittedRef}</div>
                </div>
              )}
              {isSubmitted && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'rgba(255,255,255,0.55)',
                      marginBottom: 4,
                    }}
                  >
                    Soumise le
                  </div>
                  <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                    {formatDateTime(declaration.submittedAt)}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section
            className="accounting-card"
            style={{
              marginBottom: 16,
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.07) 0%, rgba(59,130,246,0.03) 100%)',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Récapitulatif</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div className="accounting-kpi">
                <div className="label">Total collectée</div>
                <div className="value" style={{ color: '#4ade80' }}>
                  {formatEur(totalCollected)}
                </div>
              </div>
              <div className="accounting-kpi">
                <div className="label">Total déductible</div>
                <div className="value" style={{ color: 'var(--primary)' }}>
                  {formatEur(totalDeductible)}
                </div>
              </div>
              {previousCredit > 0 && (
                <div className="accounting-kpi">
                  <div className="label">Crédit antérieur</div>
                  <div className="value" style={{ color: '#fbbf24' }}>
                    {formatEur(previousCredit)}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '24px',
                borderRadius: 16,
                background:
                  totalDue > 0
                    ? 'linear-gradient(135deg, rgba(248,113,113,0.12) 0%, rgba(239,68,68,0.06) 100%)'
                    : 'linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(34,197,94,0.06) 100%)',
                border: `1px solid ${totalDue > 0 ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)'}`,
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
                À payer
              </div>
              <div
                style={{
                  fontSize: '2.4rem',
                  fontWeight: 800,
                  color: totalDue > 0 ? '#f87171' : '#4ade80',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatEur(totalDue)}
              </div>
              {currentCredit > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: '0.9rem',
                    color: '#fbbf24',
                  }}
                >
                  Crédit à reporter : <strong>{formatEur(currentCredit)}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem', color: '#4ade80' }}>TVA collectée par taux</h2>
            {(declaration.collectedByRate || []).length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>
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
                  {declaration.collectedByRate.map((r, i) => (
                    <tr key={`coll-${i}`}>
                      <td>{formatRate(r.rate)}</td>
                      <td className="amount">{formatEur(r.base)}</td>
                      <td className="amount">{formatEur(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                    <td style={{ fontWeight: 700, padding: '14px' }}>Totaux</td>
                    <td className="amount" style={{ fontWeight: 700 }}>
                      {formatEur(sumBase(declaration.collectedByRate))}
                    </td>
                    <td className="amount" style={{ fontWeight: 700, color: '#4ade80' }}>
                      {formatEur(sumAmount(declaration.collectedByRate))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--primary)' }}>TVA déductible par taux</h2>
            {(declaration.deductibleByRate || []).length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>
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
                  {declaration.deductibleByRate.map((r, i) => (
                    <tr key={`ded-${i}`}>
                      <td>{formatRate(r.rate)}</td>
                      <td className="amount">{formatEur(r.base)}</td>
                      <td className="amount">{formatEur(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                    <td style={{ fontWeight: 700, padding: '14px' }}>Totaux</td>
                    <td className="amount" style={{ fontWeight: 700 }}>
                      {formatEur(sumBase(declaration.deductibleByRate))}
                    </td>
                    <td className="amount" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {formatEur(sumAmount(declaration.deductibleByRate))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          {Array.isArray(declaration.declarationLines) && declaration.declarationLines.length > 0 && (
            <section className="accounting-card" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Lignes CA3</h2>
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
                  {declaration.declarationLines.map((l, i) => (
                    <tr key={`dl-${i}`}>
                      <td className="code">{l.code}</td>
                      <td>{l.label}</td>
                      <td className="amount">{formatEur(l.base)}</td>
                      <td className="amount">{formatEur(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {declaration.notes && declaration.notes.trim() && (
            <section className="accounting-card">
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Notes</h2>
              <p
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'rgba(255,255,255,0.85)',
                  margin: 0,
                }}
              >
                {declaration.notes}
              </p>
            </section>
          )}
        </>
      )}

      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => !submitting && setShowSubmitModal(false)}
        >
          <div
            className="accounting-card"
            style={{ maxWidth: 480, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Soumettre la déclaration</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              Une fois soumise, la déclaration ne pourra plus être modifiée ni supprimée. Vous pouvez optionnellement
              renseigner la référence retournée par impots.gouv.fr.
            </p>
            <div className="accounting-form-field">
              <label>Référence de soumission (optionnel)</label>
              <input
                type="text"
                className="portal-input"
                placeholder="Ex : FR2026-XXXXX"
                value={submittedRef}
                onChange={(e) => setSubmittedRef(e.target.value)}
                disabled={submitting}
              />
            </div>

            {submitError && (
              <div className="accounting-message error" style={{ marginTop: 12 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                className="portal-button secondary"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Annuler
              </button>
              <button className="portal-button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Soumission…' : '✓ Confirmer la soumission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountingLayout>
  )
}

export default VatDeclarationDetail
