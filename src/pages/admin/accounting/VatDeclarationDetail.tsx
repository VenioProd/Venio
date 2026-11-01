import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { getVatDeclaration, submitVatDeclaration } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IVatDeclaration, IVatRateBreakdown } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import {
  formatDate as formatLocaleDate,
  formatDateTime as formatLocaleDateTime,
  formatMoney,
} from '../../../i18n/format'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatLocaleDate(d) || '—'
}

function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  return (
    formatLocaleDateTime(d, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) || '—'
  )
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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
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
      setSubmitError(err instanceof Error ? err.message : t('accVat.common.error'))
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
    ? t('accVat.detail.title', {
        type: declaration.type,
        start: formatDate(declaration.periodStart),
        end: formatDate(declaration.periodEnd),
      })
    : t('accVat.detail.titleFallback')

  return (
    <AccountingLayout
      title={title}
      subtitle={
        declaration
          ? t('accVat.detail.subtitle', {
              regime: declaration.regime || '—',
              periodicity: declaration.periodicity || '—',
            })
          : undefined
      }
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="portal-button secondary" onClick={() => navigate('/admin/comptabilite/tva')}>
            {t('accVat.detail.backToList')}
          </button>
          {declaration && canManage && isDraft && (
            <button className="portal-button" onClick={() => setShowSubmitModal(true)}>
              {t('accVat.detail.submit')}
            </button>
          )}
          {declaration && isSubmitted && (
            <button className="portal-button" disabled>
              {t('accVat.detail.submittedOn', { date: formatDate(declaration.submittedAt) })}
            </button>
          )}
        </div>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>{t('accVat.common.loading')}</p>
      ) : !declaration ? (
        <div className="accounting-empty">
          {t('accVat.detail.notFound')}
          <div className="hint">
            <Link to="/admin/comptabilite/tva" style={{ color: 'var(--primary)' }}>
              {t('accVat.detail.backLink')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{t('accVat.detail.info')}</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {t('accVat.list.typeLabel')}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{declaration.type}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {t('accVat.list.colPeriod')}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatDate(declaration.periodStart)} → {formatDate(declaration.periodEnd)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {t('accVat.detail.regime')}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{declaration.regime || '—'}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {t('accVat.detail.periodicity')}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{declaration.periodicity || '—'}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {t('accVat.list.colStatus')}
                </div>
                <div>
                  <span className={`accounting-badge ${isSubmitted ? 'validated' : 'draft'}`}>
                    {isSubmitted ? t('accVat.list.statusSubmitted') : t('accVat.list.statusDraft')}
                  </span>
                </div>
              </div>
              {isSubmitted && declaration.submittedRef && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'var(--text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    {t('accVat.detail.reference')}
                  </div>
                  <div className="code">{declaration.submittedRef}</div>
                </div>
              )}
              {isSubmitted && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'var(--text-secondary)',
                      marginBottom: 4,
                    }}
                  >
                    {t('accVat.detail.submittedOnLabel')}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
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
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--primary) 7%, transparent) 0%, color-mix(in srgb, var(--primary) 3%, transparent) 100%)',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{t('accVat.detail.summary')}</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div className="accounting-kpi">
                <div className="label">{t('accVat.list.totalCollected')}</div>
                <div className="value" style={{ color: 'var(--good)' }}>
                  {formatEur(totalCollected)}
                </div>
              </div>
              <div className="accounting-kpi">
                <div className="label">{t('accVat.list.totalDeductible')}</div>
                <div className="value" style={{ color: 'var(--primary)' }}>
                  {formatEur(totalDeductible)}
                </div>
              </div>
              {previousCredit > 0 && (
                <div className="accounting-kpi">
                  <div className="label">{t('accVat.detail.previousCredit')}</div>
                  <div className="value" style={{ color: 'var(--warning)' }}>
                    {formatEur(previousCredit)}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '24px',
                borderRadius: 'var(--r-lg)',
                background:
                  totalDue > 0
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--critical) 12%, transparent) 0%, color-mix(in srgb, var(--critical) 6%, transparent) 100%)'
                    : 'linear-gradient(135deg, color-mix(in srgb, var(--good) 12%, transparent) 0%, color-mix(in srgb, var(--good) 6%, transparent) 100%)',
                border: `1px solid ${totalDue > 0 ? 'color-mix(in srgb, var(--critical) 40%, transparent)' : 'color-mix(in srgb, var(--good) 40%, transparent)'}`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                {t('accVat.list.toPay')}
              </div>
              <div
                style={{
                  fontSize: '2.4rem',
                  fontWeight: 800,
                  color: totalDue > 0 ? 'var(--critical)' : 'var(--good)',
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
                    color: 'var(--warning)',
                  }}
                >
                  {t('accVat.detail.creditCarried')} <strong>{formatEur(currentCredit)}</strong>
                </div>
              )}
            </div>
          </section>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--good)' }}>
              {t('accVat.detail.collectedByRate')}
            </h2>
            {(declaration.collectedByRate || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('accVat.list.collectedNone')}</p>
            ) : (
              <div className="accounting-table-scroll">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>{t('accVat.list.colRate')}</th>
                      <th className="amount">{t('accVat.list.colBaseHt')}</th>
                      <th className="amount">{t('accVat.list.colVat')}</th>
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
                    <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}>
                      <td style={{ fontWeight: 700, padding: '14px' }}>{t('accVat.detail.totals')}</td>
                      <td className="amount" style={{ fontWeight: 700 }}>
                        {formatEur(sumBase(declaration.collectedByRate))}
                      </td>
                      <td className="amount" style={{ fontWeight: 700, color: 'var(--good)' }}>
                        {formatEur(sumAmount(declaration.collectedByRate))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--primary)' }}>
              {t('accVat.detail.deductibleByRate')}
            </h2>
            {(declaration.deductibleByRate || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('accVat.list.deductibleNone')}</p>
            ) : (
              <div className="accounting-table-scroll">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>{t('accVat.list.colRate')}</th>
                      <th className="amount">{t('accVat.list.colBaseHt')}</th>
                      <th className="amount">{t('accVat.list.colVat')}</th>
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
                    <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}>
                      <td style={{ fontWeight: 700, padding: '14px' }}>{t('accVat.detail.totals')}</td>
                      <td className="amount" style={{ fontWeight: 700 }}>
                        {formatEur(sumBase(declaration.deductibleByRate))}
                      </td>
                      <td className="amount" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {formatEur(sumAmount(declaration.deductibleByRate))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {Array.isArray(declaration.declarationLines) && declaration.declarationLines.length > 0 && (
            <section className="accounting-card" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{t('accVat.list.ca3Lines')}</h2>
              <div className="accounting-table-scroll">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>{t('accVat.list.colCode')}</th>
                      <th>{t('accVat.list.colLabel')}</th>
                      <th className="amount">{t('accVat.list.colBase')}</th>
                      <th className="amount">{t('accVat.list.colAmount')}</th>
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
              </div>
            </section>
          )}

          {declaration.notes && declaration.notes.trim() && (
            <section className="accounting-card">
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{t('accVat.list.notes')}</h2>
              <p
                style={{
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-primary)',
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
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accVat.detail.modalTitle')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('accVat.detail.modalText')}</p>
            <div className="accounting-form-field">
              <label>{t('accVat.detail.refLabel')}</label>
              <input
                type="text"
                className="portal-input"
                placeholder={t('accVat.detail.refPlaceholder')}
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
                {t('common.cancel')}
              </button>
              <button className="portal-button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? t('accVat.detail.submitting') : t('accVat.detail.confirmSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountingLayout>
  )
}

export default VatDeclarationDetail
