import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listExternalSources, createExternalSource, updateExternalSource } from '../../../services/accounting'
import type { ExternalSourceStatus, IExternalSource, IExternalSourceCreateResult } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { formatDateTime as formatLocaleDateTime, formatNumber } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

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

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  ACTIVE: 'accVat.integ.statusActive',
  PAUSED: 'accVat.integ.statusPaused',
  DISABLED: 'accVat.integ.statusDisabled',
}

function statusBadgeClass(status: ExternalSourceStatus): string {
  if (status === 'ACTIVE') return 'validated'
  if (status === 'PAUSED') return 'draft'
  return 'locked'
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]+$/

interface SourceForm {
  slug: string
  name: string
  description: string
  autoValidateAll: boolean
  rateLimitPerMin: number | string
  defaultJournalCode: string
  defaultCustomerAccount: string
  defaultRevenueAccount: string
  defaultExpenseAccount: string
  defaultBankAccount: string
}

const INITIAL_FORM: SourceForm = {
  slug: '',
  name: '',
  description: '',
  autoValidateAll: false,
  rateLimitPerMin: 60,
  defaultJournalCode: 'VE',
  defaultCustomerAccount: '411000',
  defaultRevenueAccount: '706000',
  defaultExpenseAccount: '604000',
  defaultBankAccount: '512000',
}

const ExternalSources = () => {
  const { t } = useI18n()
  const [sources, setSources] = useState<IExternalSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SourceForm>(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)

  const [credentials, setCredentials] = useState<IExternalSourceCreateResult | null>(null)
  const [copyState, setCopyState] = useState<{ key: boolean; secret: boolean }>({
    key: false,
    secret: false,
  })

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const list = await listExternalSources()
      setSources(list || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  function resetForm() {
    setForm(INITIAL_FORM)
    setFormError('')
  }

  async function handleCreate() {
    setFormError('')
    if (!form.slug || !SLUG_REGEX.test(form.slug)) {
      setFormError(t('accVat.src.slugInvalid'))
      return
    }
    if (!form.name || !form.name.trim()) {
      setFormError(t('accVat.src.nameRequired'))
      return
    }
    setCreating(true)
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description ? form.description.trim() : undefined,
        autoValidateAll: !!form.autoValidateAll,
        rateLimitPerMin: Number(form.rateLimitPerMin) || 60,
        defaultJournalCode: form.defaultJournalCode || undefined,
        defaultCustomerAccount: form.defaultCustomerAccount || undefined,
        defaultRevenueAccount: form.defaultRevenueAccount || undefined,
        defaultExpenseAccount: form.defaultExpenseAccount || undefined,
        defaultBankAccount: form.defaultBankAccount || undefined,
      }
      const result = await createExternalSource(payload)
      setCredentials(result)
      setShowForm(false)
      resetForm()
      await reload()
      setSuccess(t('accVat.src.created', { name: result.source.name }))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setCreating(false)
    }
  }

  async function copyToClipboard(text: string, key: 'key' | 'secret') {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState((s) => ({ ...s, [key]: true }))
      setTimeout(() => setCopyState((s) => ({ ...s, [key]: false })), 1500)
    } catch {
      // ignore
    }
  }

  async function togglePause(source: IExternalSource) {
    const nextStatus: ExternalSourceStatus = source.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    const confirmKey = nextStatus === 'PAUSED' ? 'accVat.src.confirmPause' : 'accVat.src.confirmResume'
    if (!confirm(t(confirmKey, { name: source.name }))) return
    setError('')
    try {
      await updateExternalSource(source._id, { status: nextStatus })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  return (
    <AccountingLayout
      title={t('accVat.src.title')}
      subtitle={t('accVat.src.subtitle')}
      actions={
        <button
          className="portal-button"
          onClick={() => {
            setShowForm((v) => !v)
            if (showForm) resetForm()
          }}
        >
          {showForm ? t('accVat.src.cancel') : t('accVat.src.new')}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && !credentials && <div className="accounting-message success">{success}</div>}

      {showForm && (
        <section className="accounting-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accVat.src.createHeading')}</h2>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accVat.src.slugField')}</label>
              <input
                className="portal-input"
                placeholder="arrow"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              />
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                {t('accVat.src.slugHelp')}
              </span>
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.nameField')}</label>
              <input
                className="portal-input"
                placeholder="Arrow Productions"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="accounting-form-field full">
              <label>{t('accVat.src.description')}</label>
              <textarea
                className="portal-input"
                rows={2}
                placeholder={t('accVat.src.descriptionPlaceholder')}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="accounting-form-field full">
              <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={form.autoValidateAll}
                  onChange={(e) => setForm({ ...form, autoValidateAll: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                {t('accVat.src.autoValidateLabel')}
              </label>
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'color-mix(in srgb, var(--warning) 85%, transparent)',
                  marginTop: 2,
                }}
              >
                ⚠ {t('accVat.src.autoValidateWarning')}
              </span>
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.rateLimit')}</label>
              <input
                type="number"
                min="1"
                className="portal-input"
                value={form.rateLimitPerMin}
                onChange={(e) => setForm({ ...form, rateLimitPerMin: e.target.value })}
              />
            </div>
          </div>

          <h3
            style={{
              margin: '24px 0 12px 0',
              fontSize: '0.85rem',
              textTransform: 'none',
              letterSpacing: 'normal',
              color: 'var(--primary)',
            }}
          >
            {t('accVat.src.mappings')}
          </h3>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accVat.src.defaultJournal')}</label>
              <input
                className="portal-input"
                value={form.defaultJournalCode}
                onChange={(e) => setForm({ ...form, defaultJournalCode: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.customerAccount')}</label>
              <input
                className="portal-input"
                value={form.defaultCustomerAccount}
                onChange={(e) => setForm({ ...form, defaultCustomerAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.revenueAccount')}</label>
              <input
                className="portal-input"
                value={form.defaultRevenueAccount}
                onChange={(e) => setForm({ ...form, defaultRevenueAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.expenseAccount')}</label>
              <input
                className="portal-input"
                value={form.defaultExpenseAccount}
                onChange={(e) => setForm({ ...form, defaultExpenseAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.src.bankAccount')}</label>
              <input
                className="portal-input"
                value={form.defaultBankAccount}
                onChange={(e) => setForm({ ...form, defaultBankAccount: e.target.value })}
              />
            </div>
          </div>

          {formError && (
            <div className="accounting-message error" style={{ marginTop: 14 }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="portal-button" onClick={handleCreate} disabled={creating}>
              {creating ? t('accVat.src.creating') : t('accVat.src.create')}
            </button>
            <button
              className="portal-button secondary"
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </section>
      )}

      {credentials && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(6px)',
          }}
          onClick={() => null}
        >
          <div
            className="accounting-card"
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('accVat.src.credsHeading')}</h2>

            <div
              className="accounting-message"
              style={{
                background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                color: 'var(--warning)',
              }}
            >
              ⚠ {t('accVat.src.credsWarning')}
              {credentials.warning && (
                <div style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.85 }}>{credentials.warning}</div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                {t('accVat.src.apiKeyHeading')}
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
                  borderRadius: 'var(--r-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.92rem',
                  color: 'var(--primary)',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {credentials.apiKey}
              </div>
              <button
                type="button"
                className="portal-button secondary"
                style={{ marginTop: 8 }}
                onClick={() => copyToClipboard(credentials.apiKey, 'key')}
              >
                {copyState.key ? t('accVat.modal.copied') : t('accVat.src.copyKey')}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                {t('accVat.src.secretHeading')}
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
                  borderRadius: 'var(--r-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.92rem',
                  color: 'var(--primary)',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {credentials.webhookSecret}
              </div>
              <button
                type="button"
                className="portal-button secondary"
                style={{ marginTop: 8 }}
                onClick={() => copyToClipboard(credentials.webhookSecret, 'secret')}
              >
                {copyState.secret ? t('accVat.modal.copied') : t('accVat.src.copySecret')}
              </button>
            </div>

            <div
              style={{
                marginTop: 24,
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button type="button" className="portal-button" onClick={() => setCredentials(null)}>
                {t('accVat.src.noted')}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="accounting-card">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accVat.common.loading')}</p>
        ) : sources.length === 0 ? (
          <div className="accounting-empty">
            {t('accVat.src.empty')}
            <div className="hint">{t('accVat.src.emptyHint')}</div>
          </div>
        ) : (
          <div className="accounting-table-scroll">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>{t('accVat.src.colSlug')}</th>
                  <th>{t('accVat.src.colName')}</th>
                  <th>{t('accVat.src.colStatus')}</th>
                  <th>{t('accVat.src.colKeyPrefix')}</th>
                  <th>{t('accVat.src.colLastActivity')}</th>
                  <th className="amount">{t('accVat.src.colReceived')}</th>
                  <th className="amount">{t('accVat.src.colRejected')}</th>
                  <th className="amount">{t('accVat.src.colDuplicates')}</th>
                  <th>{t('accVat.src.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <Link to={`/admin/comptabilite/sources-externes/${s._id}`} className="code">
                        {s.slug}
                      </Link>
                    </td>
                    <td>
                      <Link
                        to={`/admin/comptabilite/sources-externes/${s._id}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                      >
                        {s.name}
                      </Link>
                      {s.autoValidateAll && (
                        <span
                          className="accounting-badge source-external"
                          style={{ marginLeft: 8, fontSize: '0.66rem' }}
                        >
                          {t('accVat.src.autoValidation')}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => togglePause(s)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                        title={
                          s.status === 'ACTIVE' ? t('accVat.src.togglePauseTitle') : t('accVat.src.toggleResumeTitle')
                        }
                      >
                        <span className={`accounting-badge ${statusBadgeClass(s.status)}`}>
                          {STATUS_LABEL_KEYS[s.status] ? t(STATUS_LABEL_KEYS[s.status]) : s.status}
                        </span>
                      </button>
                    </td>
                    <td className="code">{s.apiKeyPrefix ? `${s.apiKeyPrefix}…` : '—'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {formatDateTime(s.lastSeenAt)}
                      {s.lastError && (
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: 'var(--critical)',
                            marginTop: 2,
                          }}
                        >
                          {t('accVat.src.lastError', { date: formatDateTime(s.lastErrorAt) })}
                        </div>
                      )}
                    </td>
                    <td className="amount">{formatNumber(Number(s.totalIngested || 0))}</td>
                    <td className="amount" style={{ color: s.totalRejected ? 'var(--critical)' : undefined }}>
                      {formatNumber(Number(s.totalRejected || 0))}
                    </td>
                    <td className="amount" style={{ color: s.totalDuplicates ? 'var(--warning)' : undefined }}>
                      {formatNumber(Number(s.totalDuplicates || 0))}
                    </td>
                    <td>
                      <div className="accounting-row-actions">
                        <Link to={`/admin/comptabilite/sources-externes/${s._id}`}>
                          <button type="button">{t('accVat.src.detail')}</button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default ExternalSources
