import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import ConfirmModal from '../../../components/ConfirmModal'
import type { MessageKey } from '../../../i18n'

type Kind = 'email' | 'phone'

interface SuppressionRow {
  id: string
  /** Renseigné pour une adresse. */
  email?: string
  /** Renseigné pour un numéro (E.164). */
  phone?: string
  reason: 'UNSUBSCRIBE' | 'MANUAL' | 'OPPOSITION' | 'ANONYMIZED'
  createdAt: string
  createdBy: { id: string; name: string } | null
}

interface SuppressionPage {
  entries: SuppressionRow[]
  total: number
  page: number
  pages: number
}

const PAGE_SIZE = 25
const MANUAL_REASONS = ['MANUAL', 'OPPOSITION'] as const
const valueOf = (row: SuppressionRow) => row.phone ?? row.email ?? ''
const reasonKey = (reason: string) => `crmSuppression.reason.${reason}` as MessageKey

interface Props {
  canManage: boolean
}

/**
 * Liste « ne pas contacter » (chantier 4B) : consultation par tous, ajout et
 * retrait réservés aux administrateurs du CRM (le serveur fait foi).
 */
const SuppressionSection: React.FC<Props> = ({ canManage }) => {
  const { t } = useI18n()
  const [data, setData] = useState<SuppressionPage | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [kind, setKind] = useState<Kind>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState<(typeof MANUAL_REASONS)[number]>('MANUAL')
  const [busy, setBusy] = useState(false)
  const [toRemove, setToRemove] = useState<SuppressionRow | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), kind })
      if (query) params.set('q', query)
      const res = await apiFetch<SuppressionPage>(`/api/admin/crm/suppression?${params.toString()}`)
      if (!res || !Array.isArray(res.entries)) throw new Error('invalid response')
      setData(res)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [page, query, kind])

  useEffect(() => {
    void load()
  }, [load])

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setQuery(searchInput.trim())
  }

  const switchKind = (next: Kind) => {
    if (next === kind) return
    setKind(next)
    setData(null)
    setPage(1)
    setQuery('')
    setSearchInput('')
    setFeedback(null)
  }

  const clearSearch = () => {
    setSearchInput('')
    setQuery('')
    setPage(1)
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage || busy) return
    setBusy(true)
    const isPhone = kind === 'phone'
    try {
      const res = await apiFetch<{ entry?: { phone?: string } }>('/api/admin/crm/suppression', {
        method: 'POST',
        body: JSON.stringify(isPhone ? { phone: phone.trim(), reason } : { email: email.trim(), reason }),
      })
      if (isPhone) setPhone('')
      else setEmail('')
      setFeedback({
        type: 'success',
        text: isPhone
          ? t('crmSuppression.phone.add.done', { phone: res.entry?.phone ?? '' })
          : t('crmSuppression.add.done'),
      })
      await load()
    } catch (err) {
      const status = (err as { status?: number }).status
      const prefix = isPhone ? 'crmSuppression.phone.add' : 'crmSuppression.add'
      const text =
        status === 400
          ? t(`${prefix}.invalid` as MessageKey)
          : status === 409
            ? t(`${prefix}.duplicate` as MessageKey)
            : t(`${prefix}.error` as MessageKey)
      setFeedback({ type: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    const target = toRemove
    setToRemove(null)
    if (!target || !canManage) return
    try {
      // Le serveur exige cette confirmation explicite : le retrait rend la personne de nouveau joignable.
      await apiFetch(`/api/admin/crm/suppression/${target.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: true }),
      })
      setFeedback({
        type: 'success',
        text: t(target.phone ? 'crmSuppression.phone.remove.done' : 'crmSuppression.remove.done'),
      })
      await load()
    } catch {
      setFeedback({
        type: 'error',
        text: t(target.phone ? 'crmSuppression.phone.remove.error' : 'crmSuppression.remove.error'),
      })
    }
  }

  const cell: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 13, whiteSpace: 'nowrap' }

  return (
    <section className="crm-settings-section crm-settings-suppression" aria-labelledby="crm-settings-suppression">
      <div className="crm-settings-section-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
        </svg>
        <h2 id="crm-settings-suppression">{t('crmSuppression.title')}</h2>
      </div>

      <div className="crm-settings-item-info">
        <p>{t('crmSuppression.intro')}</p>
        <p role="note">{t('crmSuppression.removeNotice')}</p>
        {!canManage && <p role="note">{t('crmSuppression.readOnly')}</p>}
      </div>

      <div className="crm-suppression-kinds" role="group" aria-label={t('crmSuppression.kind.label')}>
        {(['email', 'phone'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={kind === value ? 'portal-button' : 'portal-button secondary'}
            aria-pressed={kind === value}
            onClick={() => switchKind(value)}
          >
            {t(`crmSuppression.kind.${value}` as MessageKey)}
          </button>
        ))}
      </div>

      {feedback && (
        <div className={`crm-settings-message crm-settings-message-${feedback.type}`} role="status">
          {feedback.text}
        </div>
      )}

      <form onSubmit={submitSearch} style={{ display: 'flex', gap: 8, margin: '12px 0' }} role="search">
        <input
          type="search"
          className="crm-settings-text-input"
          aria-label={t(kind === 'phone' ? 'crmSuppression.phone.search' : 'crmSuppression.search')}
          placeholder={t(
            kind === 'phone' ? 'crmSuppression.phone.searchPlaceholder' : 'crmSuppression.searchPlaceholder',
          )}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" className="portal-button secondary">
          {t('crmSuppression.searchButton')}
        </button>
        {query && (
          <button type="button" className="portal-button secondary" onClick={clearSearch}>
            {t('crmSuppression.clear')}
          </button>
        )}
      </form>

      {loadError && (
        <div className="crm-settings-message crm-settings-message-error">{t('crmSuppression.loadError')}</div>
      )}

      {data && (
        <>
          <p style={{ fontSize: 12 }}>
            {t(kind === 'phone' ? 'crmSuppression.phone.total' : 'crmSuppression.total', { count: data.total })}
          </p>
          {data.entries.length === 0 ? (
            <p>
              {kind === 'phone'
                ? t(query ? 'crmSuppression.phone.emptySearch' : 'crmSuppression.phone.empty')
                : t(query ? 'crmSuppression.emptySearch' : 'crmSuppression.empty')}
            </p>
          ) : (
            <div className="crm-suppression-scroll">
              <table className="crm-suppression-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={cell}>
                      {t(kind === 'phone' ? 'crmSuppression.col.phone' : 'crmSuppression.col.email')}
                    </th>
                    <th style={cell}>{t('crmSuppression.col.reason')}</th>
                    <th style={cell}>{t('crmSuppression.col.date')}</th>
                    <th style={cell}>{t('crmSuppression.col.by')}</th>
                    {canManage && <th style={cell}>{t('crmSuppression.col.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((row) => (
                    <tr key={row.id}>
                      <td style={cell}>{valueOf(row)}</td>
                      <td style={cell}>{t(reasonKey(row.reason))}</td>
                      <td style={cell}>
                        {formatDate(row.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={cell}>{row.createdBy?.name ?? t('crmSuppression.by.person')}</td>
                      {canManage && (
                        <td style={cell}>
                          <button
                            type="button"
                            className="portal-button secondary"
                            aria-label={t('crmSuppression.remove.label', { email: valueOf(row) })}
                            onClick={() => setToRemove(row)}
                          >
                            {t('crmSuppression.remove.button')}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="portal-button secondary"
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                {t('crmSuppression.prev')}
              </button>
              <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {t('crmSuppression.page', { page: data.page, pages: data.pages })}
              </span>
              <button
                type="button"
                className="portal-button secondary"
                disabled={data.page >= data.pages}
                onClick={() => setPage(data.page + 1)}
              >
                {t('crmSuppression.next')}
              </button>
            </div>
          )}
        </>
      )}

      {canManage && (
        <form onSubmit={add} style={{ marginTop: 16 }}>
          <h3>{t(kind === 'phone' ? 'crmSuppression.phone.add.title' : 'crmSuppression.add.title')}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {kind === 'phone' ? (
              <input
                type="tel"
                className="crm-settings-text-input"
                aria-label={t('crmSuppression.phone.add.input')}
                placeholder="06 12 34 56 78"
                autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            ) : (
              <input
                type="email"
                className="crm-settings-text-input"
                aria-label={t('crmSuppression.add.email')}
                placeholder="nom@domaine.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            <select
              className="crm-settings-select"
              aria-label={t('crmSuppression.add.reason')}
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof MANUAL_REASONS)[number])}
            >
              {MANUAL_REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(reasonKey(value))}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="portal-button"
              disabled={busy || !(kind === 'phone' ? phone.trim() : email.trim())}
            >
              {t('crmSuppression.add.button')}
            </button>
          </div>
          {kind === 'phone' && <p className="crm-ai-hint">{t('crmSuppression.phone.add.hint')}</p>}
        </form>
      )}

      <ConfirmModal
        isOpen={toRemove !== null}
        title={t(toRemove?.phone ? 'crmSuppression.phone.remove.confirmTitle' : 'crmSuppression.remove.confirmTitle')}
        message={
          toRemove?.phone
            ? t('crmSuppression.phone.remove.confirmMessage', { phone: toRemove.phone })
            : t('crmSuppression.remove.confirmMessage', { email: toRemove?.email ?? '' })
        }
        confirmLabel={t(toRemove?.phone ? 'crmSuppression.phone.remove.confirm' : 'crmSuppression.remove.confirm')}
        variant="danger"
        onConfirm={() => void confirmRemove()}
        onCancel={() => setToRemove(null)}
      />
    </section>
  )
}

export default SuppressionSection
