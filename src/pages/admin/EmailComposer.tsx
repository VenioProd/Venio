import { Link } from 'react-router-dom'
import PageHeader from '../../components/admin/ui/PageHeader'
import { useEffect, useState, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface Recipient {
  _id: string
  name: string
  email: string
  role?: string
  companyName?: string
  tags?: string[]
}

interface SendResult {
  email: string
  success: boolean
  error?: string
}

const ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  SUPER_ADMIN: 'adminOps.email.roleSuper',
  ADMIN: 'adminOps.email.roleContributor',
  RH: 'adminOps.email.roleHr',
  VIEWER: 'adminOps.email.roleViewer',
}

/** Met en valeur le nombre dans un texte déjà traduit (« 3 destinataires »). */
function EmphasizedCount({ text, count }: { text: string; count: number }) {
  const at = text.indexOf(String(count))
  if (at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <strong style={{ color: 'var(--primary)' }}>{count}</strong>
      {text.slice(at + String(count).length)}
    </>
  )
}

export default function EmailComposer() {
  const { t } = useI18n()
  const { showToast } = useToast()

  const [admins, setAdmins] = useState<Recipient[]>([])
  const [fromEmail, setFromEmail] = useState<string>('')
  const [loadingRecipients, setLoadingRecipients] = useState(true)

  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [customEmail, setCustomEmail] = useState('')
  const [customEmails, setCustomEmails] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [showCta, setShowCta] = useState(false)
  const [preview, setPreview] = useState(false)

  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SendResult[] | null>(null)

  const customInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch<{ admins: Recipient[]; clients: Recipient[] }>('/api/admin/email-composer/recipients')
      .then((d) => {
        setAdmins(d.admins || [])
        setFromEmail((d as { fromEmail?: string }).fromEmail || '')
      })
      .catch(() => {})
      .finally(() => setLoadingRecipients(false))
  }, [])

  const filteredList = admins.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()),
  )

  const totalSelected = selectedEmails.size + customEmails.length

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  const selectAllAdmins = () => {
    const emails = admins.map((r) => r.email)
    if (emails.length === 0) return
    setSelectedEmails((prev) => {
      const next = new Set(prev)
      const allIn = emails.every((e) => next.has(e))
      if (allIn) emails.forEach((e) => next.delete(e))
      else emails.forEach((e) => next.add(e))
      return next
    })
  }

  const addCustomEmail = () => {
    const val = customEmail.trim().toLowerCase()
    if (!val) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      showToast(t('adminOps.email.invalidAddress'), 'error')
      return
    }
    if (!customEmails.includes(val) && !selectedEmails.has(val)) setCustomEmails((prev) => [...prev, val])
    setCustomEmail('')
    customInputRef.current?.focus()
  }

  const handleSend = async () => {
    if (totalSelected === 0) {
      showToast(t('adminOps.email.noRecipient'), 'error')
      return
    }
    if (!subject.trim()) {
      showToast(t('adminOps.email.subjectRequired'), 'error')
      return
    }
    if (!body.trim()) {
      showToast(t('adminOps.email.bodyRequired'), 'error')
      return
    }

    const recipients = [...Array.from(selectedEmails), ...customEmails]
    setSending(true)
    setResults(null)
    try {
      const data = await apiFetch<{
        sent: number
        failed: number
        results: SendResult[]
        blocked?: { email: string }[]
      }>('/api/admin/email-composer/send', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          recipients,
          ...(showCta && ctaUrl && ctaLabel ? { ctaUrl, ctaLabel } : {}),
        }),
      })
      const blocked = data.blocked ?? []
      setResults([
        ...(data.results ?? []),
        ...blocked.map(
          (b) => ({ email: b.email, success: false, error: t('adminOps.email.blockedDnc') }) as SendResult,
        ),
      ])
      if (blocked.length > 0)
        showToast(t('adminOps.email.blockedSummary', { count: blocked.length, sent: data.sent }), 'warning')
      else if (data.failed === 0) showToast(t('adminOps.email.sentOk', { count: data.sent }), 'success')
      else showToast(t('adminOps.email.sentPartial', { sent: data.sent, failed: data.failed }), 'warning')
    } catch (err: unknown) {
      showToast((err as Error).message || t('adminOps.email.sendError'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="portal-container pilotage-page email-composer-page">
      {/* ── Header ── */}
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.inbox')}
        title={t('adminOps.email.title')}
        subtitle={t('adminOps.email.subtitle')}
        actions={
          <>
            <Link className="portal-button secondary pilotage-back-link" to="/admin">
              {t('common.back')}
            </Link>
            {fromEmail && <span className="email-sender-chip">{t('adminOps.email.from', { email: fromEmail })}</span>}
            <div className="email-send-actions">
              {totalSelected > 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <EmphasizedCount
                    text={t('adminOps.email.recipientCount', { count: totalSelected })}
                    count={totalSelected}
                  />
                </span>
              )}
              <button
                className="portal-button"
                onClick={handleSend}
                disabled={sending || totalSelected === 0 || !subject.trim() || !body.trim()}
                style={{ opacity: sending || totalSelected === 0 || !subject.trim() || !body.trim() ? 0.4 : 1 }}
              >
                {sending ? (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ animation: 'spin 1s linear infinite' }}
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    {t('adminOps.email.sending')}
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    {t('adminOps.email.send')}
                  </>
                )}
              </button>
            </div>
          </>
        }
      />

      <div className="email-composer-grid">
        {/* ── Panneau destinataires ── */}
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header du panel */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-body)' }}>
              {t('adminOps.email.recipientsTitle')}
            </span>
            <span
              style={{
                background: totalSelected > 0 ? 'rgba(var(--primary-rgb), 0.15)' : 'var(--border-color)',
                color: totalSelected > 0 ? 'var(--primary-light)' : 'var(--ink-ghost)',
                borderRadius: 'var(--r-pill)',
                padding: '2px 10px',
                fontSize: 12,
                fontWeight: 700,
                border: totalSelected > 0 ? '1px solid rgba(var(--primary-rgb), 0.3)' : '1px solid var(--line-strong)',
              }}
            >
              {t('adminOps.email.selectedCount', { count: totalSelected })}
            </span>
          </div>

          <div style={{ padding: '14px 16px' }}>
            {/* Recherche */}
            <div className="ticket-form-field" style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder={t('adminOps.email.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Bouton tout sélectionner */}
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={selectAllAdmins}
                style={{
                  width: '100%',
                  padding: '7px 0',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid rgba(var(--primary-rgb), 0.25)',
                  background: 'rgba(var(--primary-rgb), 0.06)',
                  color: 'var(--primary-light)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                {admins.length > 0 && admins.every((a) => selectedEmails.has(a.email))
                  ? t('adminOps.email.deselectAll')
                  : t('adminOps.email.selectTeam', { count: admins.length })}
              </button>
            </div>

            {/* Chips cliquables — membres */}
            {loadingRecipients ? (
              <div style={{ color: 'var(--ink-ghost)', fontSize: 13, padding: '8px 0' }}>{t('common.loading')}</div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  maxHeight: 320,
                  overflowY: 'auto',
                  marginBottom: 14,
                }}
              >
                {filteredList.length === 0 ? (
                  <div style={{ color: 'var(--ink-ghost)', fontSize: 13, padding: '8px 0' }}>
                    {t('adminOps.email.noResults')}
                  </div>
                ) : (
                  filteredList.map((r) => {
                    const selected = selectedEmails.has(r.email)
                    return (
                      <button
                        key={r.email}
                        type="button"
                        onClick={() => toggleEmail(r.email)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 'var(--r-md)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          background: selected ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-card)',
                          border: selected
                            ? '1px solid rgba(var(--primary-rgb), 0.35)'
                            : '1px solid var(--border-color)',
                          transition: 'all 0.15s',
                          width: '100%',
                        }}
                      >
                        {/* Avatar */}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: selected ? 'rgba(var(--primary-rgb), 0.25)' : 'var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 700,
                            color: selected ? 'var(--primary-light)' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {r.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: selected ? 'var(--ink-body)' : 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {r.name}
                            {r.tags?.includes('STAGIAIRE') && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                                  color: 'var(--primary)',
                                  padding: '1px 5px',
                                  borderRadius: 'var(--r-sm)',
                                  fontWeight: 600,
                                }}
                              >
                                {t('adminOps.email.internTag')}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{r.email}</div>
                        </div>
                        {/* Indicateur sélection */}
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: selected ? 'var(--primary)' : 'var(--border-color)',
                            border: selected ? 'none' : '1px solid var(--line-strong)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          {selected && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--text-primary)"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}

            {/* Adresse externe */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  fontWeight: 600,
                  textTransform: 'none',
                  letterSpacing: 'normal',
                }}
              >
                {t('adminOps.email.externalAddress')}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="ticket-form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    ref={customInputRef}
                    type="email"
                    placeholder={t('adminOps.email.externalPlaceholder')}
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomEmail())}
                  />
                </div>
                <button
                  onClick={addCustomEmail}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r-md)',
                    border: 'none',
                    background: 'rgba(var(--primary-rgb), 0.15)',
                    color: 'var(--primary-light)',
                    cursor: 'pointer',
                    fontSize: 18,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              </div>
              {customEmails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {customEmails.map((e) => (
                    <span
                      key={e}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 'var(--r-pill)',
                        background: 'rgba(var(--primary-rgb), 0.1)',
                        border: '1px solid rgba(var(--primary-rgb), 0.25)',
                        fontSize: 11,
                        color: 'var(--primary-light)',
                      }}
                    >
                      {e}
                      <button
                        onClick={() => setCustomEmails((p) => p.filter((x) => x !== e))}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: 0,
                          lineHeight: 1,
                          fontSize: 14,
                          display: 'flex',
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Panneau rédaction ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Objet */}
          <div className="portal-card" style={{ padding: '20px 24px' }}>
            <div className="ticket-form-field" style={{ marginBottom: 0 }}>
              <label>{t('adminOps.email.subjectLabel')}</label>
              <input
                type="text"
                placeholder={t('adminOps.email.subjectPlaceholder')}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ fontSize: 15, fontWeight: 500 }}
              />
            </div>
          </div>

          {/* Corps */}
          <div className="portal-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 12,
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                {t('adminOps.email.bodyLabel')}
              </label>
              <button
                onClick={() => setPreview((p) => !p)}
                className="ticket-back-btn"
                style={{ marginBottom: 0, fontSize: 12, padding: '4px 12px' }}
              >
                {preview ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>{' '}
                    {t('adminOps.email.edit')}
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>{' '}
                    {t('adminOps.email.preview')}
                  </>
                )}
              </button>
            </div>

            {preview ? (
              <div
                style={{
                  minHeight: 200,
                  padding: '18px 20px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid rgba(var(--primary-rgb), 0.15)',
                  fontSize: 14,
                  color: 'var(--ink-soft)',
                  lineHeight: 1.8,
                }}
              >
                {body.trim() ? (
                  body.split('\n').map((line, i) =>
                    line.trim() ? (
                      <p key={i} style={{ margin: '0 0 10px 0' }}>
                        {line}
                      </p>
                    ) : (
                      <br key={i} />
                    ),
                  )
                ) : (
                  <span style={{ color: 'var(--ink-whisper)', fontStyle: 'italic' }}>
                    {t('adminOps.email.noContent')}
                  </span>
                )}
                {showCta && ctaUrl && ctaLabel && (
                  <div style={{ marginTop: 16 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '10px 22px',
                        borderRadius: 'var(--r-md)',
                        background: 'linear-gradient(135deg, var(--primary), var(--primary))',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {ctaLabel}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                <textarea
                  placeholder={t('adminOps.email.bodyPlaceholder')}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  style={{ minHeight: 200, fontSize: 14, lineHeight: 1.7 }}
                />
              </div>
            )}
          </div>

          {/* Bouton CTA optionnel */}
          <div className="portal-card" style={{ padding: '16px 24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCta}
                onChange={(e) => setShowCta(e.target.checked)}
                style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {t('adminOps.email.ctaToggle')}
              </span>
            </label>
            {showCta && (
              <div className="ticket-form-row" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                  <label>{t('adminOps.email.ctaLabelLabel')}</label>
                  <input
                    type="text"
                    placeholder={t('adminOps.email.ctaLabelPlaceholder')}
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                  />
                </div>
                <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                  <label>{t('adminOps.email.ctaUrlLabel')}</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Résultats */}
          {results && (
            <div className="portal-card" style={{ padding: '20px 24px' }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 12,
                  color: 'var(--ink-body)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                {t('adminOps.email.resultsTitle')}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--good)', fontWeight: 600 }}>
                  {results.filter((r) => r.success).length} ✓
                </span>
                {results.filter((r) => !r.success).length > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--critical)', fontWeight: 600 }}>
                    {results.filter((r) => !r.success).length} ✗
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                {results.map((r) => (
                  <div
                    key={r.email}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 12px',
                      borderRadius: 'var(--r-md)',
                      background: r.success
                        ? 'color-mix(in srgb, var(--good) 6%, transparent)'
                        : 'color-mix(in srgb, var(--critical) 6%, transparent)',
                      border: `1px solid ${r.success ? 'color-mix(in srgb, var(--good) 20%, transparent)' : 'color-mix(in srgb, var(--critical) 20%, transparent)'}`,
                    }}
                  >
                    <span
                      style={{ fontSize: 13, color: r.success ? 'var(--good)' : 'var(--critical)', fontWeight: 700 }}
                    >
                      {r.success ? '✓' : '✗'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: r.success ? 'var(--good)' : 'var(--critical)' }}>
                      {r.email}
                    </span>
                    {r.error && <span style={{ color: 'var(--critical)', fontSize: 11 }}>{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
