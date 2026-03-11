import React, { useState, useRef } from 'react'
import { getToken } from '../../lib/api'
import '../../pages/admin/AdminPortal.css'

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  QUESTION: { label: 'Question', color: '#0ea5e9' },
  DEMANDE: { label: 'Demande', color: '#8b5cf6' },
  PROBLEME: { label: 'Probleme', color: '#ef4444' },
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const TicketFab = () => {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ message: '', category: 'QUESTION' })
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx))

  const handleClose = () => {
    if (!submitting) {
      setShowForm(false)
      setFiles([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.message.trim()) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('message', form.message)
      fd.append('category', form.category)
      files.forEach((f) => fd.append('files', f))
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      if (res.ok) {
        setForm({ message: '', category: 'QUESTION' })
        setFiles([])
        setSuccess(true)
        setTimeout(() => { setSuccess(false); setShowForm(false) }, 1500)
      }
    } catch { /* silent */ } finally { setSubmitting(false) }
  }

  return (
    <>
      {/* Bouton "+" flottant */}
      <button
        className="ticket-fab"
        onClick={() => setShowForm(true)}
        title="Nouvelle demande"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Modal formulaire rapide */}
      {showForm && (
        <div className="ticket-quick-overlay" onClick={handleClose}>
          <div className="ticket-quick-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-quick-header">
              <h3>Nouvelle demande</h3>
              <button onClick={handleClose} className="ticket-quick-close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {success ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#22c55e' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: 12 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p style={{ fontSize: 16, fontWeight: 600 }}>Demande envoyee !</p>
                <p style={{ fontSize: 13, opacity: 0.6 }}>Un super admin vous repondra bientot</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="ticket-quick-form">
                <div className="ticket-form-field">
                  <label>Categorie</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>Votre message</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Decrivez votre question ou demande..."
                    rows={5}
                    required
                    autoFocus
                  />
                </div>

                {/* Fichiers joints */}
                {files.length > 0 && (
                  <div className="ticket-file-previews">
                    {files.map((f, i) => (
                      <div key={i} className="ticket-file-preview">
                        {f.type.startsWith('image/') ? (
                          <img src={URL.createObjectURL(f)} alt={f.name} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        )}
                        <span className="ticket-file-preview-name">{f.name}</span>
                        <span style={{ fontSize: 11, opacity: 0.4 }}>{formatFileSize(f.size)}</span>
                        <button type="button" className="ticket-file-remove" onClick={() => removeFile(i)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
                    />
                    <button type="button" className="ticket-attach-btn" onClick={() => fileInputRef.current?.click()}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      Joindre
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" className="ticket-cancel-btn" onClick={handleClose}>Annuler</button>
                    <button type="submit" className="ticket-submit-btn" disabled={submitting || !form.message.trim()}>
                      {submitting ? 'Envoi...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default TicketFab
