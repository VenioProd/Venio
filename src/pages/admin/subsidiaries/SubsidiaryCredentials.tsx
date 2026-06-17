import { useState } from 'react'
import { Plus, X, Eye, EyeOff, Copy, Pencil, Trash2, KeyRound, ExternalLink, Loader2 } from 'lucide-react'
import { apiFetch, ApiError } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import type { SubsidiaryCredential, SubsidiaryCredentialCategory } from '../../../types/subsidiary.types'
import { CREDENTIAL_CATEGORY_LABELS } from '../../../types/subsidiary.types'

interface FormState {
  category: SubsidiaryCredentialCategory
  label: string
  username: string
  secret: string
  url: string
  notes: string
}

const emptyForm: FormState = { category: 'admin', label: '', username: '', secret: '', url: '', notes: '' }

interface Props {
  subsidiaryId: string
  credentials: SubsidiaryCredential[]
  accent: string
  onChange: (creds: SubsidiaryCredential[]) => void
}

export default function SubsidiaryCredentials({ subsidiaryId, credentials, accent, onChange }: Props) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  function openAdd() {
    setEditingId(null)
    setForm({ ...emptyForm })
  }
  function openEdit(c: SubsidiaryCredential) {
    setEditingId(c._id)
    setForm({ category: c.category, label: c.label, username: c.username, secret: '', url: c.url, notes: c.notes })
  }

  async function copy(text: string, msg = 'Copié') {
    try {
      await navigator.clipboard.writeText(text)
      showToast(msg, 'success')
    } catch {
      showToast('Copie impossible', 'error')
    }
  }

  async function save() {
    if (!form) return
    if (!form.label.trim()) {
      showToast('Le libellé est requis', 'error')
      return
    }
    setSaving(true)
    try {
      const body = JSON.stringify(form)
      const res = editingId
        ? await apiFetch<{ credentials: SubsidiaryCredential[] }>(
            `/api/admin/subsidiaries/${subsidiaryId}/credentials/${editingId}`,
            { method: 'PATCH', body },
          )
        : await apiFetch<{ credentials: SubsidiaryCredential[] }>(
            `/api/admin/subsidiaries/${subsidiaryId}/credentials`,
            { method: 'POST', body },
          )
      onChange(res.credentials)
      setForm(null)
      setEditingId(null)
      showToast(editingId ? 'Identifiant mis à jour' : 'Identifiant ajouté', 'success')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de l’enregistrement', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: SubsidiaryCredential) {
    if (!confirm(`Supprimer l’identifiant « ${c.label} » ?`)) return
    setBusyId(c._id)
    try {
      const res = await apiFetch<{ credentials: SubsidiaryCredential[] }>(
        `/api/admin/subsidiaries/${subsidiaryId}/credentials/${c._id}`,
        { method: 'DELETE' },
      )
      onChange(res.credentials)
    } catch {
      showToast('Suppression impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleReveal(c: SubsidiaryCredential) {
    if (revealed[c._id] !== undefined) {
      setRevealed((r) => {
        const n = { ...r }
        delete n[c._id]
        return n
      })
      return
    }
    setBusyId(c._id)
    try {
      const res = await apiFetch<{ secret: string }>(
        `/api/admin/subsidiaries/${subsidiaryId}/credentials/${c._id}/reveal`,
      )
      setRevealed((r) => ({ ...r, [c._id]: res.secret }))
    } catch {
      showToast('Impossible de révéler le secret', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {credentials.length === 0 && !form && (
        <p className="sub-dossier-empty" style={{ marginBottom: 12 }}>
          Aucun identifiant. Ajoute les accès admin, comptes de service et clés API.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {credentials.map((c) => {
          const isRevealed = revealed[c._id] !== undefined
          return (
            <div key={c._id} className="sub-cred" style={{ ['--sub-accent' as string]: accent }}>
              <div className="sub-cred__head">
                <span className="sub-cred__chip" style={{ ['--sub-accent' as string]: accent }}>
                  <KeyRound size={15} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sub-cred__label">
                    {c.label}
                    <span className="sub-cred__cat">{CREDENTIAL_CATEGORY_LABELS[c.category]}</span>
                  </div>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="sub-cred__url">
                      <ExternalLink size={12} /> {c.url}
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="sub-icon-btn" onClick={() => openEdit(c)} title="Modifier">
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="sub-icon-btn" onClick={() => remove(c)} title="Supprimer">
                    {busyId === c._id && !isRevealed ? (
                      <Loader2 size={13} className="sub-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              </div>

              <div className="sub-cred__fields">
                {c.username && (
                  <div className="sub-cred__field">
                    <span className="sub-cred__field-label">Identifiant</span>
                    <code className="sub-cred__value">{c.username}</code>
                    <button type="button" className="sub-icon-btn" onClick={() => copy(c.username)} title="Copier">
                      <Copy size={13} />
                    </button>
                  </div>
                )}
                <div className="sub-cred__field">
                  <span className="sub-cred__field-label">Secret</span>
                  <code className="sub-cred__value">
                    {!c.hasSecret ? '—' : isRevealed ? revealed[c._id] || '(vide)' : '••••••••••'}
                  </code>
                  {c.hasSecret && (
                    <>
                      <button
                        type="button"
                        className="sub-icon-btn"
                        onClick={() => toggleReveal(c)}
                        title={isRevealed ? 'Masquer' : 'Révéler'}
                      >
                        {busyId === c._id ? (
                          <Loader2 size={13} className="sub-spin" />
                        ) : isRevealed ? (
                          <EyeOff size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                      </button>
                      {isRevealed && (
                        <button
                          type="button"
                          className="sub-icon-btn"
                          onClick={() => copy(revealed[c._id] || '', 'Secret copié')}
                          title="Copier"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
                {c.notes && <div className="sub-cred__notes">{c.notes}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {form ? (
        <div className="sub-cred sub-cred--form" style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
            <select
              className="portal-input"
              value={form.category}
              onChange={(e) => set('category', e.target.value as SubsidiaryCredentialCategory)}
            >
              {Object.entries(CREDENTIAL_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              className="portal-input"
              placeholder="Libellé (ex : Admin Vercel)"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
            />
            <input
              className="portal-input"
              placeholder="Identifiant / email"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
            />
            <input
              className="portal-input"
              type="text"
              placeholder={editingId ? 'Secret (laisser vide = inchangé)' : 'Secret / mot de passe / clé'}
              value={form.secret}
              onChange={(e) => set('secret', e.target.value)}
            />
            <input
              className="portal-input"
              style={{ gridColumn: '1 / -1' }}
              placeholder="URL de connexion (optionnel)"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
            />
            <input
              className="portal-input"
              style={{ gridColumn: '1 / -1' }}
              placeholder="Notes (optionnel)"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="portal-button" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button
              type="button"
              className="portal-button secondary"
              onClick={() => {
                setForm(null)
                setEditingId(null)
              }}
              disabled={saving}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="sub-doc-add"
          style={{ marginTop: 12, ['--sub-accent' as string]: accent }}
          onClick={openAdd}
        >
          <Plus size={14} /> Ajouter un identifiant
        </button>
      )}
    </div>
  )
}
