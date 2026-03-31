import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
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

  const [admins, setAdmins] = useState<Recipient[]>([])
  const [clients, setClients] = useState<Recipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(true)

  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set())
  const [customEmail, setCustomEmail] = useState('')
  const [customEmails, setCustomEmails] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'admins' | 'clients'>('all')

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
      .then(d => { setAdmins(d.admins || []); setClients(d.clients || []) })
      .catch(() => {})
      .finally(() => setLoadingRecipients(false))
  }, [])

  const filteredList: (Recipient & { group: 'admin' | 'client' })[] = [
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
    if (emails.length === 0) return
    setSelectedEmails(prev => {
      const next = new Set(prev)
      const allIn = emails.length > 0 && emails.every(e => next.has(e))
      if (allIn) emails.forEach(e => next.delete(e))
      else emails.forEach(e => next.add(e))
      return next
    })
  }

  const addCustomEmail = () => {
    const val = customEmail.trim().toLowerCase()
    if (!val) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { showToast('Adresse email invalide', 'error'); return }
    if (!customEmails.includes(val) && !selectedEmails.has(val)) setCustomEmails(prev => [...prev, val])
    setCustomEmail('')
    customInputRef.current?.focus()
  }

  const handleSend = async () => {
    if (totalSelected === 0) { showToast('Aucun destinataire sélectionné', 'error'); return }
    if (!subject.trim()) { showToast("L'objet est requis", 'error'); return }
    if (!body.trim()) { showToast('Le corps du message est requis', 'error'); return }

    const recipients = [...Array.from(selectedEmails), ...customEmails]
    setSending(true)
    setResults(null)
    try {
      const data = await apiFetch<{ sent: number; failed: number; results: SendResult[] }>('/api/admin/email-composer/send', {
        method: 'POST',
        body: JSON.stringify({ subject, body, recipients, ...(showCta && ctaUrl && ctaLabel ? { ctaUrl, ctaLabel } : {}) }),
      })
      setResults(data.results)
      if (data.failed === 0) showToast(`Email envoyé à ${data.sent} destinataire${data.sent > 1 ? 's' : ''}`, 'success')
      else showToast(`${data.sent} envoyé${data.sent > 1 ? 's' : ''}, ${data.failed} échec${data.failed > 1 ? 's' : ''}`, 'warning')
    } catch (err: unknown) {
      showToast((err as Error).message || "Erreur lors de l'envoi", 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="portal-container">

      {/* ── Header ── */}
      <div className="ticket-hero" style={{ marginBottom: 24 }}>
        <div className="ticket-hero-content">
          <Link to="/admin" className="ticket-back-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour
          </Link>
          <h1 className="ticket-hero-title" style={{ marginTop: 8 }}>Composer un email</h1>
          <p className="ticket-hero-subtitle">Envoyez un message à plusieurs personnes en une seule fois</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalSelected > 0 && (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              <strong style={{ color: '#0ea5e9' }}>{totalSelected}</strong> destinataire{totalSelected > 1 ? 's' : ''}
            </span>
          )}
          <button
            className="ticket-new-btn"
            onClick={handleSend}
            disabled={sending || totalSelected === 0 || !subject.trim() || !body.trim()}
            style={{ opacity: (sending || totalSelected === 0 || !subject.trim() || !body.trim()) ? 0.4 : 1 }}
          >
            {sending ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Envoi...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Envoyer
              </>
            )}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Panneau destinataires ── */}
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header du panel */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>Destinataires</span>
            <span style={{
              background: totalSelected > 0 ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.06)',
              color: totalSelected > 0 ? '#38bdf8' : '#475569',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
              border: totalSelected > 0 ? '1px solid rgba(14,165,233,0.3)' : '1px solid rgba(255,255,255,0.1)',
            }}>
              {totalSelected} sélectionné{totalSelected > 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ padding: '14px 16px' }}>
            {/* Search */}
            <div className="ticket-form-field" style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Rechercher un nom, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['all', 'admins', 'clients'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: filter === f ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.04)',
                  color: filter === f ? '#38bdf8' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                }}>
                  {f === 'all' ? 'Tous' : f === 'admins' ? 'Équipe' : 'Clients'}
                </button>
              ))}
            </div>

            {/* Quick select */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => selectGroup('admins')} style={{
                width: '100%', padding: '7px 0', borderRadius: 8,
                border: '1px solid rgba(14,165,233,0.25)', background: 'rgba(14,165,233,0.06)',
                color: '#38bdf8', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              }}>
                {admins.length > 0 && admins.every(a => selectedEmails.has(a.email))
                  ? 'Désélectionner toute l\'équipe'
                  : `Sélectionner toute l'équipe (${admins.length})`}
              </button>
            </div>

            {/* List */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
              {loadingRecipients ? (
                <div style={{ color: '#475569', fontSize: 13, padding: '12px 4px' }}>Chargement...</div>
              ) : filteredList.length === 0 ? (
                <div style={{ color: '#475569', fontSize: 13, padding: '12px 4px' }}>Aucun résultat</div>
              ) : filteredList.map(r => (
                <label key={r.email} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: selectedEmails.has(r.email) ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.02)',
                  border: selectedEmails.has(r.email) ? '1px solid rgba(14,165,233,0.25)' : '1px solid rgba(255,255,255,0.04)',
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(r.email)}
                    onChange={() => toggleEmail(r.email)}
                    style={{ accentColor: '#0ea5e9', width: 14, height: 14, flexShrink: 0 }}
                  />
                  {/* Avatar */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: r.group === 'admin' ? 'rgba(14,165,233,0.15)' : 'rgba(139,92,246,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: r.group === 'admin' ? '#38bdf8' : '#a78bfa',
                  }}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      {r.tags?.includes('STAGIAIRE') && (
                        <span style={{ flexShrink: 0, fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>Stage</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.group === 'admin' && r.role ? ROLE_LABELS[r.role] || r.role : r.companyName || r.email}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Custom email */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Adresse externe
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="ticket-form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    ref={customInputRef}
                    type="email"
                    placeholder="email@exemple.com"
                    value={customEmail}
                    onChange={e => setCustomEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomEmail())}
                  />
                </div>
                <button onClick={addCustomEmail} style={{
                  padding: '10px 14px', borderRadius: 8, border: 'none',
                  background: 'rgba(14,165,233,0.15)', color: '#38bdf8',
                  cursor: 'pointer', fontSize: 18, fontWeight: 700, flexShrink: 0,
                }}>+</button>
              </div>
              {customEmails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {customEmails.map(e => (
                    <span key={e} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 20,
                      background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)',
                      fontSize: 11, color: '#7dd3fc',
                    }}>
                      {e}
                      <button onClick={() => setCustomEmails(p => p.filter(x => x !== e))} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)',
                        padding: 0, lineHeight: 1, fontSize: 14, display: 'flex',
                      }}>×</button>
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
              <label>Objet *</label>
              <input
                type="text"
                placeholder="Objet de l'email..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ fontSize: 15, fontWeight: 500 }}
              />
            </div>
          </div>

          {/* Corps */}
          <div className="portal-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                Corps du message *
              </label>
              <button
                onClick={() => setPreview(p => !p)}
                className="ticket-back-btn"
                style={{ marginBottom: 0, fontSize: 12, padding: '4px 12px' }}
              >
                {preview ? (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Éditer</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> Prévisualiser</>
                )}
              </button>
            </div>

            {preview ? (
              <div style={{
                minHeight: 200, padding: '18px 20px', borderRadius: 10,
                background: '#07080f', border: '1px solid rgba(14,165,233,0.15)',
                fontSize: 14, color: '#cbd5e1', lineHeight: 1.8,
              }}>
                {body.trim() ? (
                  body.split('\n').map((line, i) =>
                    line.trim()
                      ? <p key={i} style={{ margin: '0 0 10px 0' }}>{line}</p>
                      : <br key={i} />
                  )
                ) : (
                  <span style={{ color: '#334155', fontStyle: 'italic' }}>Aucun contenu</span>
                )}
                {showCta && ctaUrl && ctaLabel && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{
                      display: 'inline-block', padding: '10px 22px', borderRadius: 8,
                      background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
                      color: '#fff', fontWeight: 600, fontSize: 13,
                    }}>{ctaLabel}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                <textarea
                  placeholder="Écrivez votre message ici..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
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
                onChange={e => setShowCta(e.target.checked)}
                style={{ accentColor: '#0ea5e9', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                Ajouter un bouton d'action dans l'email (optionnel)
              </span>
            </label>
            {showCta && (
              <div className="ticket-form-row" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                  <label>Texte du bouton</label>
                  <input type="text" placeholder="Accéder au site" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} />
                </div>
                <div className="ticket-form-field" style={{ marginBottom: 0 }}>
                  <label>URL de destination</label>
                  <input type="url" placeholder="https://..." value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Résultats */}
          {results && (
            <div className="portal-card" style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                Résultats de l'envoi
                <span style={{ marginLeft: 'auto', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                  {results.filter(r => r.success).length} ✓
                </span>
                {results.filter(r => !r.success).length > 0 && (
                  <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>
                    {results.filter(r => !r.success).length} ✗
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                {results.map(r => (
                  <div key={r.email} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8,
                    background: r.success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${r.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    <span style={{ fontSize: 13, color: r.success ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                      {r.success ? '✓' : '✗'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: r.success ? '#86efac' : '#fca5a5' }}>{r.email}</span>
                    {r.error && <span style={{ color: '#f87171', fontSize: 11 }}>{r.error}</span>}
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
