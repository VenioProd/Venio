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
import { useI18n } from '../../../context/I18nContext'
import { formatDate as formatLocaleDate, formatMoney } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatLocaleDate(d) || '—'
}

function formatRate(rate: unknown): string {
  const value = Number(rate)
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(2).replace(/\.00$/, '')} %`
}

const STATUS_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '', labelKey: 'accVat.list.statusAll' },
  { value: 'DRAFT', labelKey: 'accVat.list.statusDraft' },
  { value: 'SUBMITTED', labelKey: 'accVat.list.statusSubmitted' },
]

const TYPE_OPTIONS: { value: string; label?: string; labelKey?: MessageKey }[] = [
  { value: '', labelKey: 'accVat.list.typeAll' },
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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
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
      setPreviewError(t('accVat.list.datesRequired'))
      return
    }
    setPreviewLoading(true)
    try {
      const r = await computeVat({ from: form.periodStart, to: form.periodEnd })
      setPreview(r)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleCreate() {
    if (!form.periodStart || !form.periodEnd) {
      setPreviewError(t('accVat.list.datesRequired'))
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
      setPreviewError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('accVat.list.confirmDelete'))) return
    try {
      await deleteVatDeclaration(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  const filteredDeclarations = useMemo(() => declarations, [declarations])

  return (
    <AccountingLayout
      title={t('accVat.list.title')}
      subtitle={t('accVat.list.subtitle')}
      actions={
        canManage && (
          <button
            className="portal-button"
            onClick={() => {
              setShowForm((v) => !v)
              if (showForm) resetForm()
            }}
          >
            {showForm ? t('accVat.list.cancel') : t('accVat.list.new')}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <section className="accounting-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accVat.list.newHeading')}</h2>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accVat.list.typeLabel')}</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as VatType })}
              >
                <option value="CA3">{t('accVat.list.typeCa3')}</option>
                <option value="CA12">{t('accVat.list.typeCa12')}</option>
              </select>
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.list.periodStart')}</label>
              <input
                type="date"
                className="portal-input"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.list.periodEnd')}</label>
              <input
                type="date"
                className="portal-input"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.list.previousCredit')}</label>
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
              <label>{t('accVat.list.notes')}</label>
              <textarea
                className="portal-input"
                rows={3}
                placeholder={t('accVat.list.notesPlaceholder')}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="portal-button secondary" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? t('accVat.list.computing') : t('accVat.list.preview')}
            </button>
            <button className="portal-button" onClick={handleCreate} disabled={creating}>
              {creating ? t('accVat.list.creating') : t('accVat.list.create')}
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
                {t('accVat.list.previewIntro')}{' '}
                <strong>
                  {formatDate(preview.periodStart)} → {formatDate(preview.periodEnd)}
                </strong>{' '}
                {t('accVat.list.previewOutro')}
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
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'var(--good)',
                    }}
                  >
                    {t('accVat.list.collected')}
                  </h3>
                  {(preview.collectedByRate || []).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t('accVat.list.collectedNone')}</p>
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
                          {preview.collectedByRate.map((r, i) => (
                            <tr key={`coll-${i}`}>
                              <td>{formatRate(r.rate)}</td>
                              <td className="amount">{formatEur(r.base)}</td>
                              <td className="amount">{formatEur(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.95rem',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'var(--primary)',
                    }}
                  >
                    {t('accVat.list.deductible')}
                  </h3>
                  {(preview.deductibleByRate || []).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{t('accVat.list.deductibleNone')}</p>
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
                          {preview.deductibleByRate.map((r, i) => (
                            <tr key={`ded-${i}`}>
                              <td>{formatRate(r.rate)}</td>
                              <td className="amount">{formatEur(r.base)}</td>
                              <td className="amount">{formatEur(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {Array.isArray(preview.declarationLines) && preview.declarationLines.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '0.95rem',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: 'color-mix(in srgb, var(--primary) 85%, transparent)',
                    }}
                  >
                    {t('accVat.list.ca3Lines')}
                  </h3>
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
                </div>
              )}

              <div className="accounting-kpi-grid" style={{ marginTop: 20 }}>
                <div className="accounting-kpi">
                  <div className="label">{t('accVat.list.totalCollected')}</div>
                  <div className="value" style={{ color: 'var(--good)' }}>
                    {formatEur(preview.totalCollected)}
                  </div>
                </div>
                <div className="accounting-kpi">
                  <div className="label">{t('accVat.list.totalDeductible')}</div>
                  <div className="value" style={{ color: 'var(--primary)' }}>
                    {formatEur(preview.totalDeductible)}
                  </div>
                </div>
                <div className="accounting-kpi">
                  <div className="label">{t('accVat.list.toPay')}</div>
                  <div
                    className="value"
                    style={{
                      color: Number(preview.totalDue) > 0 ? 'var(--critical)' : 'var(--good)',
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
                {t(o.labelKey)}
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
                {o.labelKey ? t(o.labelKey) : o.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accVat.common.loading')}</p>
        ) : filteredDeclarations.length === 0 ? (
          <div className="accounting-empty">
            {t('accVat.list.empty')}
            {canManage && <div className="hint">{t('accVat.list.emptyHint')}</div>}
          </div>
        ) : (
          <div className="accounting-table-scroll">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>{t('accVat.list.colPeriod')}</th>
                  <th>{t('accVat.list.typeLabel')}</th>
                  <th className="amount">{t('accVat.list.totalCollected')}</th>
                  <th className="amount">{t('accVat.list.totalDeductible')}</th>
                  <th className="amount">{t('accVat.list.toPay')}</th>
                  <th>{t('accVat.list.colStatus')}</th>
                  <th>{t('accVat.list.colActions')}</th>
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
                          color: due > 0 ? 'var(--critical)' : 'var(--good)',
                        }}
                      >
                        {formatEur(due)}
                      </td>
                      <td>
                        <span className={`accounting-badge ${d.status === 'SUBMITTED' ? 'validated' : 'draft'}`}>
                          {d.status === 'SUBMITTED' ? t('accVat.list.statusSubmitted') : t('accVat.list.statusDraft')}
                        </span>
                      </td>
                      <td>
                        <div className="accounting-row-actions">
                          <Link to={`/admin/comptabilite/tva/${d._id}`}>
                            <button type="button">{t('accVat.list.open')}</button>
                          </Link>
                          {canManage && d.status === 'DRAFT' && (
                            <button type="button" className="danger" onClick={() => handleDelete(d._id)}>
                              {t('accVat.list.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default VatDeclarations
