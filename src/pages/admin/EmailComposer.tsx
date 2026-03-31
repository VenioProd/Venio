import { useEffect, useState, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
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

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Contributeur',
  RH: 'RH',
  VIEWER: 'Lecture seule',
}

export default function EmailComposer() {
  const { showToast } = useToast()

  // Recipients data
  const [admins, setAdmins] = useState<Recipient[]>([])
  const [clients, setClients] = useState<Recipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(true)

  // Selection
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [customEmail, setCustomEmail] = useState('')
  const [customEmails, setCustomEmails] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'admins' | 'clients'>('all')

  // Compose
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [showCta, setShowCta] = useState(false)

  // State
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SendResult[] | null>(null)
  const [preview, setPreview] = useState(false)

  const customInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch<{ admins: Recipient[]; clients: Recipient[] }>('/api/admin/email-composer/recipients')
      .then(d => {
        setAdmins(d.admins || [])
        setClients(d.clients || [])
      })
      .catch(() => {})
      .finally(() => setLoadingRecipients(false))
  }, [])

  const filteredRecipients: (Recipient & { group: 'admin' | 'client' })[] = [
    ...(filter !== 'clients' ? admins.map(a => ({ ...a, group: 'admin' as const })) : []),
    ...(filter !== 'admins' ? clients.map(c => ({ ...c, group: 'client' as const })) : []),
  ].filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.companyName || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalSelected = selectedEmails.size + customEmails.length

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  const selectGroup = (group: 'admins' | 'clients') => {
    const list = group === 'admins' ? admins : clients
    const emails = list.map(r => r.email)
    setSelectedEmails(prev => {
      const next = new Set(prev)
      const allSelected = emails.every(e => next.has(e))
      if (allSelected) emails.forEach(e => next.delete(e))
      else emails.forEach(e => next.add(e))
      return next
    })
  }

  const addCustomEmail = () => {
    const val = customEmail.trim().toLowerCase()
    if (!val) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(val)) {
      showToast('Adresse email invalide', 'error')
      return
    }
    if (!customEmails.includes(val) && !selectedEmails.has(val)) {
      setCustomEmails(prev => [...prev, val])
    }
    setCustomEmail('')
    customInputRef.current?.focus()
  }

  const removeCustomEmail = (email: string) => {
    setCustomEmails(prev => prev.filter(e => e !== email))
  }

  const handleSend = async () => {
    if (totalSelected === 0) { showToast('Aucun destinataire sélectionné', 'error'); return }
    if (!subject.trim()) { showToast('L\'objet est requis', 'error'); return }
    if (!body.trim()) { showToast('Le corps du message est requis', 'error'); return }

    const recipients = [...Array.from(selectedEmails), ...customEmails]
    setSending(true)
    setResults(null)
    try {
      const data = await apiFetch<{ sent: number; failed: number; total: number; results: SendResult[] }>('/api/admin/email-composer/send', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          recipients,
          ...(showCta && ctaUrl && ctaLabel ? { ctaUrl, ctaLabel } : {}),
        }),
      })
      setResults(data.results)
      if (data.failed === 0) {
        showToast(`Email envoyé à ${data.sent} destinataire${data.sent > 1 ? 's' : ''}`, 'success')
      } else {
        showToast(`${data.sent} envoyé${data.sent > 1 ? 's' : ''}, ${data.failed} échec${data.failed > 1 ? 's' : ''}`, 'warning')
      }
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur lors de l\'envoi', 'error')
    } finally {
      setSending(false)
    }
  }

  const previewLines = body.split('\n').filter(Boolean)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Composer un email</h1>
          <p className="admin-page-subtitle">Envoyez un message à plusieurs personnes en une seule fois</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Panel destinataires ── */}
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Destinataires</span>
            <span style={{
              background: totalSelected > 0 ? 'rgba(14,165,233,0.15)' : 'rgba(100,116,139,0.12)',
              color: totalSelected > 0 ? '#0ea5e9' : '#94a3b8',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
            }}>{totalSelected} sélectionné{totalSelected > 1 ? 's' : ''}</span>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="admin-input"
            style={{ marginBottom: 10, fontSize: 13 }}
          />

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['all', 'admins', 'clients'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: filter === f ? 'rgba(14,165,233,0.15)' : 'rgba(100,116,139,0.08)',
                color: filter === f ? '#0ea5e9' : '#94a3b8',
              }}>
                {f === 'all' ? 'Tous' : f === 'admins' ? 'Équipe' : 'Clients'}
              </button>
            ))}
          </div>

          {/* Quick select buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => selectGroup('admins')} style={{
              flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)',
              background: 'transparent', color: '#0ea5e9', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            }}>
              Toute l'équipe
            </button>
            <button onClick={() => selectGroup('clients')} style={{
              flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)',
              background: 'transparent', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            }}>
              Tous les clients
            </button>
          </div>

          {/* Recipients list */}
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            {loadingRecipients ? (
              <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>Chargement...</div>
            ) : filteredRecipients.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>Aucun résultat</div>
            ) : filteredRecipients.map(r => (
              <label key={r.email} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                background: selectedEmails.has(r.email) ? 'rgba(14,165,233,0.08)' : 'transparent',
                border: selectedEmails.has(r.email) ? '1px solid rgba(14,165,233,0.2)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={selectedEmails.has(r.email)}
                  onChange={() => toggleEmail(r.email)}
                  style={{ accentColor: '#0ea5e9', width: 14, height: 14, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                    {r.tags?.includes('STAGIAIRE') && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '1px 6px', borderRadius: 4 }}>Stagiaire</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.email}
                    {r.group === 'admin' && r.role && ` · ${ROLE_LABELS[r.role] || r.role}`}
                    {r.group === 'client' && r.companyName && ` · ${r.companyName}`}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Custom email input */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 500 }}>Ajouter une adresse</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={customInputRef}
                type="email"
                placeholder="email@exemple.com"
                value={customEmail}
                onChange={e => setCustomEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomEmail())}
                className="admin-input"
                style={{ flex: 1, fontSize: 12 }}
              />
              <button onClick={addCustomEmail} style={{
                padding: '0 12px', borderRadius: 6, border: 'none',
                background: 'rgba(14,165,233,0.15)', color: '#0ea5e9', cursor: 'pointer', fontSize: 18, fontWeight: 700,
              }}>+</button>
            </div>
            {customEmails.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {customEmails.map(e => (
                  <span key={e} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
                    background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)', fontSize: 11, color: '#7dd3fc',
                  }}>
                    {e}
                    <button onClick={() => removeCustomEmail(e)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1, fontSize: 14,
                    }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel rédaction ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Subject */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#94a3b8' }}>
              Objet *
            </label>
            <input
              type="text"
              placeholder="Objet de l'email"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="admin-input"
              style={{ fontSize: 15, fontWeight: 500 }}
            />
          </div>

          {/* Body */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Corps du message *</label>
              <button
                onClick={() => setPreview(p => !p)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(14,165,233,0.3)',
                  background: preview ? 'rgba(14,165,233,0.15)' : 'transparent',
                  color: '#0ea5e9', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}
              >
                {preview ? 'Éditer' : 'Prévisualiser'}
              </button>
            </div>

            {preview ? (
              <div style={{
                minHeight: 200, padding: '16px 20px', borderRadius: 8, background: 'rgba(15,23,42,0.5)',
                border: '1px solid rgba(255,255,255,0.08)', fontSize: 14, color: '#cbd5e1', lineHeight: 1.8,
              }}>
                {previewLines.length === 0
                  ? <span style={{ color: '#475569', fontStyle: 'italic' }}>Aucun contenu</span>
                  : previewLines.map((line, i) => <p key={i} style={{ margin: '0 0 10px 0' }}>{line}</p>)
                }
                {showCta && ctaUrl && ctaLabel && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{
                      display: 'inline-block', padding: '10px 20px', borderRadius: 8,
                      background: '#0ea5e9', color: '#fff', fontWeight: 600, fontSize: 13,
                    }}>{ctaLabel}</span>
                  </div>
                )}
              </div>
            ) : (
              <textarea
                placeholder="Écrivez votre message ici..."
                value={body}
                onChange={e => setBody(e.target.value)}
                className="admin-input"
                style={{ minHeight: 200, resize: 'vertical', fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit' }}
              />
            )}
          </div>

          {/* CTA optionnel */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
              <input
                type="checkbox"
                checked={showCta}
                onChange={e => setShowCta(e.target.checked)}
                style={{ accentColor: '#0ea5e9', width: 14, height: 14 }}
              />
              Ajouter un bouton d'action (optionnel)
            </label>
            {showCta && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Texte du bouton</label>
                  <input
                    type="text"
                    placeholder="Accéder au site"
                    value={ctaLabel}
                    onChange={e => setCtaLabel(e.target.value)}
                    className="admin-input"
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    className="admin-input"
                    style={{ fontSize: 13 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Send button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
            {totalSelected > 0 && (
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Envoi à <strong style={{ color: '#0ea5e9' }}>{totalSelected}</strong> destinataire{totalSelected > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleSend}
              disabled={sending || totalSelected === 0 || !subject.trim() || !body.trim()}
              style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff', fontWeight: 600, fontSize: 14,
                opacity: (sending || totalSelected === 0 || !subject.trim() || !body.trim()) ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {sending ? 'Envoi en cours...' : 'Envoyer'}
            </button>
          </div>

          {/* Results */}
          {results && (
            <div className="admin-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#e2e8f0' }}>
                Résultats de l'envoi
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {results.map(r => (
                  <div key={r.email} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 6,
                    background: r.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${r.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    fontSize: 13,
                  }}>
                    <span style={{ fontSize: 16 }}>{r.success ? '✓' : '✗'}</span>
                    <span style={{ flex: 1, color: r.success ? '#6ee7b7' : '#fca5a5' }}>{r.email}</span>
                    {r.error && <span style={{ color: '#f87171', fontSize: 12 }}>{r.error}</span>}
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
