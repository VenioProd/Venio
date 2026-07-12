import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { SENSITIVE_ACTIONS, sensitiveActionHeaders } from '../../lib/sensitiveActions'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../hooks/useConfirm'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface ToolAccess {
  _id: string
  name: string
  url: string
  login: string
  password?: string
  category: string
  notes: string
  visibleTo: string[]
  addedByName: string
  createdAt: string
}

const CATEGORIES = ['IA', 'DESIGN', 'DEV', 'MARKETING', 'COMMUNICATION', 'GESTION', 'AUTRE']

const ALL_ROLES = ['ADMIN', 'MANAGER', 'RH', 'VIEWER', 'CLIENT']
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  RH: 'RH',
  VIEWER: 'Viewer',
  CLIENT: 'Client',
}

const CATEGORY_LABELS: Record<string, string> = {
  IA: 'Intelligence artificielle',
  DESIGN: 'Design',
  DEV: 'Developpement',
  MARKETING: 'Marketing',
  COMMUNICATION: 'Communication',
  GESTION: 'Gestion',
  AUTRE: 'Autre',
}

const CATEGORY_COLORS: Record<string, string> = {
  IA: '#0ea5e9',
  DESIGN: '#ffffff',
  DEV: '#0284c7',
  MARKETING: '#f59e0b',
  COMMUNICATION: '#22c55e',
  GESTION: '#9b9b9b',
  AUTRE: '#64748b',
}

const emptyForm = {
  name: '',
  url: '',
  login: '',
  password: '',
  category: 'AUTRE',
  notes: '',
  visibleTo: [] as string[],
}

const ToolAccessList = () => {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [tools, setTools] = useState<ToolAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const canWrite = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const load = async () => {
    try {
      const data = await apiFetch<ToolAccess[]>('/api/admin/tool-access')
      setTools(data)
    } catch {
      showToast('Erreur chargement des outils', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    let list = tools
    if (filterCategory) list = list.filter((t) => t.category === filterCategory)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) || t.login.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q),
      )
    }
    return list
  }, [tools, search, filterCategory])

  const grouped = useMemo(() => {
    const map = new Map<string, ToolAccess[]>()
    for (const tool of filtered) {
      const cat = tool.category || 'AUTRE'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(tool)
    }
    return map
  }, [filtered])

  const handleOpenForm = (tool?: ToolAccess) => {
    if (tool) {
      setEditId(tool._id)
      setForm({
        name: tool.name,
        url: tool.url,
        login: tool.login,
        password: '',
        category: tool.category,
        notes: tool.notes,
        visibleTo: tool.visibleTo || [],
      })
    } else {
      setEditId(null)
      setForm(emptyForm)
    }
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name || !form.login || (!editId && !form.password)) return
    setSaving(true)
    try {
      if (editId) {
        const { password, ...metadata } = form
        await apiFetch(`/api/admin/tool-access/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(password ? form : metadata),
          headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.TOOL_ACCESS_UPDATE),
        })
        showToast('Outil mis a jour', 'success')
      } else {
        await apiFetch('/api/admin/tool-access', {
          method: 'POST',
          body: JSON.stringify(form),
          headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.TOOL_ACCESS_CREATE),
        })
        showToast('Outil ajoute', 'success')
      }
      handleCloseForm()
      load()
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tool: ToolAccess) => {
    const ok = await confirm(`Supprimer l'acces "${tool.name}" ?`)
    if (!ok) return
    try {
      await apiFetch(`/api/admin/tool-access/${tool._id}`, {
        method: 'DELETE',
        headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.TOOL_ACCESS_DELETE),
      })
      showToast('Outil supprime', 'success')
      load()
    } catch {
      showToast('Erreur lors de la suppression', 'error')
    }
  }

  const handleReveal = async (tool: ToolAccess) => {
    if (user?.role !== 'SUPER_ADMIN') {
      showToast('La révélation est réservée au super admin', 'error')
      return
    }
    const totpCode = window.prompt('Saisissez votre code MFA à 6 chiffres pour révéler ce secret')
    if (!totpCode) return
    try {
      const data = await apiFetch<{ password: string }>(`/api/admin/tool-access/${tool._id}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ totpCode }),
        headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.TOOL_SECRET_REVEAL),
      })
      setRevealedPasswords((previous) => ({ ...previous, [tool._id]: data.password }))
      window.setTimeout(() => {
        setRevealedPasswords((previous) => {
          const next = { ...previous }
          delete next[tool._id]
          return next
        })
      }, 30_000)
      showToast('Secret révélé temporairement', 'success')
    } catch {
      showToast('Révélation refusée : vérifiez votre code MFA', 'error')
    }
  }

  const handleCopy = async (tool: ToolAccess) => {
    const password = revealedPasswords[tool._id]
    const text = `${tool.name}\nLogin : ${tool.login}${password ? `\nMot de passe : ${password}` : ''}${tool.url ? `\nURL : ${tool.url}` : ''}`
    await navigator.clipboard.writeText(text)
    setCopiedId(tool._id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Acces outils</span>
        </div>
        <div className="admin-header">
          <div>
            <h1 style={{ marginBottom: 4 }}>Acces outils</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
              Identifiants et liens de connexion partages pour l'equipe
            </p>
          </div>
          {canWrite && (
            <button className="portal-button" type="button" onClick={() => handleOpenForm()}>
              + Ajouter
            </button>
          )}
        </div>
      </div>

      <div className="portal-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            className="portal-input"
            placeholder="Rechercher un outil..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <CustomSelect
            className="portal-input"
            value={filterCategory}
            onChange={setFilterCategory}
            options={[
              { value: '', label: 'Toutes les categories' },
              ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c })),
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="admin-loading" style={{ marginTop: 24 }}>
          Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div className="portal-card" style={{ marginTop: 24, textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            {tools.length === 0 ? 'Aucun outil enregistre.' : 'Aucun resultat.'}
          </p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([category, categoryTools]) => (
          <div key={category} style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: CATEGORY_COLORS[category] || '#64748b',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                {CATEGORY_LABELS[category] || category}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({categoryTools.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {categoryTools.map((tool) => (
                <div key={tool._id} className="portal-card" style={{ padding: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>{tool.name}</h3>
                        {tool.visibleTo?.length > 0 && (
                          <span
                            title={`Visible par : ${tool.visibleTo.map((r) => ROLE_LABELS[r] || r).join(', ')}`}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 20,
                              background: 'rgba(14, 165, 233, 0.15)',
                              color: 'var(--primary)',
                              border: '1px solid rgba(14, 165, 233, 0.3)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tool.visibleTo.map((r) => ROLE_LABELS[r] || r).join(', ')}
                          </span>
                        )}
                      </div>
                      {tool.url && (
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: CATEGORY_COLORS[tool.category] || 'var(--primary)',
                            textDecoration: 'none',
                          }}
                        >
                          {tool.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleCopy(tool)}
                        title="Copier"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedId === tool._id ? '#22c55e' : 'var(--text-muted)',
                          fontSize: 16,
                        }}
                      >
                        {copiedId === tool._id ? '✓' : '⎘'}
                      </button>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenForm(tool)}
                            title="Modifier"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              fontSize: 14,
                            }}
                          >
                            ✏️
                          </button>
                          {user?.role === 'SUPER_ADMIN' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(tool)}
                              title="Supprimer"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#ef4444',
                                fontSize: 14,
                              }}
                            >
                              🗑
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Login</span>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {tool.login}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mot de passe</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {revealedPasswords[tool._id] || '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            revealedPasswords[tool._id]
                              ? setRevealedPasswords((previous) => {
                                  const next = { ...previous }
                                  delete next[tool._id]
                                  return next
                                })
                              : handleReveal(tool)
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: 15,
                            padding: 0,
                          }}
                        >
                          {revealedPasswords[tool._id] ? '🙈' : '👁'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {tool.notes && (
                    <p
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: 10,
                        margin: '10px 0 0',
                      }}
                    >
                      {tool.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={handleCloseForm}
        >
          <div
            style={{
              background: '#0a0f1a',
              borderRadius: 14,
              padding: 28,
              width: '100%',
              maxWidth: 480,
              border: '1px solid rgba(14, 165, 233, 0.2)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 17, color: 'var(--text-primary)' }}>
              {editId ? "Modifier l'outil" : 'Nouvel outil'}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Nom de l'outil *
                </label>
                <input
                  className="portal-input"
                  placeholder="Ex: Leonardo AI"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  URL
                </label>
                <input
                  className="portal-input"
                  placeholder="https://..."
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    Login / Email *
                  </label>
                  <input
                    className="portal-input"
                    placeholder="email@..."
                    value={form.login}
                    onChange={(event) => setForm({ ...form, login: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    Mot de passe {editId ? '(laisser vide pour ne pas le modifier)' : '*'}
                  </label>
                  <input
                    className="portal-input"
                    placeholder="Mot de passe"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required={!editId}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Categorie
                </label>
                <CustomSelect
                  className="portal-input"
                  value={form.category}
                  onChange={(v) => setForm({ ...form, category: v })}
                  options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Notes
                </label>
                <textarea
                  className="portal-input"
                  placeholder="Infos complementaires..."
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Visible par —{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>laisser vide = tous les admins</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_ROLES.map((role) => {
                    const checked = form.visibleTo.includes(role)
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            visibleTo: checked ? form.visibleTo.filter((r) => r !== role) : [...form.visibleTo, role],
                          })
                        }
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}`,
                          background: checked ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                          color: checked ? 'var(--primary)' : 'var(--text-muted)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="admin-button-group" style={{ marginTop: 4 }}>
                <button className="portal-button" type="submit" disabled={saving}>
                  {saving ? 'Enregistrement...' : editId ? 'Mettre a jour' : 'Ajouter'}
                </button>
                <button className="portal-button secondary" type="button" onClick={handleCloseForm}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  )
}

export default ToolAccessList
