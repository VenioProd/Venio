import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

/**
 * Page d'administration des tokens d'API agent (Personal Access Tokens) pour
 * piloter Venio depuis Kuro et autres outils externes.
 *
 * - Liste : nom, préfixe affiché (vno_pat_a1b2…), scopes, statut, lastUsedAt,
 *   rateLimitPerMin, dates d'expiration / création / révocation.
 * - Création : modal avec form (name, multi-select scopes, rateLimitPerMin,
 *   expiresAt, notes). À la création réussie, modal qui révèle le secret
 *   en clair UNE SEULE FOIS avec bouton "Copier".
 * - Édition : même modal pré-remplie (PATCH).
 * - Révocation : ConfirmModal puis POST /:id/revoke.
 *
 * Cf. docs/api-agent.md pour la spec complète.
 */

import {
  emptyForm,
  formatDate,
  type AgentAuthLogEvent,
  type AgentToken,
  type FormState,
  type ScopesCatalog,
} from './agent-tokens/types'
import SecretRevealModal from './agent-tokens/SecretRevealModal'
import AuthLogModal from './agent-tokens/AuthLogModal'

const AgentTokensList: React.FC = () => {
  const { showToast } = useToast()

  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [scopesCatalog, setScopesCatalog] = useState<ScopesCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ACTIVE')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Modal de révélation du secret après création
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [revealedTokenName, setRevealedTokenName] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const [revokeTarget, setRevokeTarget] = useState<AgentToken | null>(null)
  const [authLogToken, setAuthLogToken] = useState<AgentToken | null>(null)
  const [authLogEvents, setAuthLogEvents] = useState<AgentAuthLogEvent[]>([])
  const [authLogLoading, setAuthLogLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const filter = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
      const [list, cat] = await Promise.all([
        apiFetch<{ tokens: AgentToken[] }>(`/api/admin/agent-tokens${filter}`),
        scopesCatalog
          ? Promise.resolve({
              scopes: scopesCatalog.scopes,
              adminWildcard: scopesCatalog.adminWildcard,
            } as ScopesCatalog)
          : apiFetch<ScopesCatalog>('/api/admin/agent-tokens/scopes'),
      ])
      setTokens(list.tokens || [])
      if (!scopesCatalog) setScopesCatalog(cat)
    } catch (err) {
      showToast((err as Error).message || 'Erreur chargement tokens', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const groupedScopes = useMemo(() => {
    if (!scopesCatalog) return [] as Array<{ module: string; scopes: string[] }>
    const groups = new Map<string, string[]>()
    for (const s of scopesCatalog.scopes) {
      if (s === scopesCatalog.adminWildcard) {
        groups.set('admin', [s])
        continue
      }
      const parts = s.split(':')
      const module = parts[1] || 'autre'
      const list = groups.get(module) || []
      list.push(s)
      groups.set(module, list)
    }
    return Array.from(groups.entries())
      .map(([module, scopes]) => ({ module, scopes: scopes.sort() }))
      .sort((a, b) => a.module.localeCompare(b.module))
  }, [scopesCatalog])

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (t: AgentToken) => {
    setEditId(t._id)
    setForm({
      name: t.name,
      scopes: [...t.scopes],
      rateLimitPerMin: t.rateLimitPerMin,
      expiresAt: t.expiresAt ? t.expiresAt.slice(0, 10) : '',
      notes: t.notes || '',
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditId(null)
    setForm(emptyForm)
  }

  const toggleScope = (scope: string) => {
    setForm((prev) =>
      prev.scopes.includes(scope)
        ? { ...prev, scopes: prev.scopes.filter((s) => s !== scope) }
        : { ...prev, scopes: [...prev.scopes, scope] },
    )
  }

  const allScopesSelected = useMemo(() => {
    if (!scopesCatalog || scopesCatalog.scopes.length === 0) return false
    return scopesCatalog.scopes.every((s) => form.scopes.includes(s))
  }, [scopesCatalog, form.scopes])

  const toggleAllScopes = () => {
    if (!scopesCatalog) return
    setForm((prev) => (allScopesSelected ? { ...prev, scopes: [] } : { ...prev, scopes: [...scopesCatalog.scopes] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast('Le nom est requis', 'error')
      return
    }
    if (form.scopes.length === 0) {
      showToast('Au moins un scope est requis', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        scopes: form.scopes,
        rateLimitPerMin: form.rateLimitPerMin,
        notes: form.notes,
      }
      if (form.expiresAt) {
        // Le datepicker renvoie 'YYYY-MM-DD' → on stocke comme fin de journée UTC
        payload.expiresAt = new Date(`${form.expiresAt}T23:59:59.000Z`).toISOString()
      } else {
        payload.expiresAt = null
      }

      if (editId) {
        await apiFetch(`/api/admin/agent-tokens/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        showToast('Token mis à jour', 'success')
        closeForm()
        await load()
      } else {
        const data = await apiFetch<{
          token: AgentToken
          plainSecret: string
          warning: string
        }>('/api/admin/agent-tokens', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setRevealedSecret(data.plainSecret)
        setRevealedTokenName(data.token.name)
        setCopied(false)
        closeForm()
        await load()
      }
    } catch (err) {
      showToast((err as Error).message || 'Erreur enregistrement', 'error')
    } finally {
      setSaving(false)
    }
  }

  const copySecret = async () => {
    if (!revealedSecret) return
    try {
      await navigator.clipboard.writeText(revealedSecret)
      setCopied(true)
      showToast('Secret copié dans le presse-papiers', 'success')
    } catch {
      showToast('Impossible de copier — sélectionnez et copiez manuellement', 'error')
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      await apiFetch(`/api/admin/agent-tokens/${revokeTarget._id}/revoke`, {
        method: 'POST',
      })
      showToast('Token révoqué', 'success')
      setRevokeTarget(null)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Erreur révocation', 'error')
    }
  }

  const openAuthLog = async (token: AgentToken) => {
    setAuthLogToken(token)
    setAuthLogEvents([])
    setAuthLogLoading(true)
    try {
      const data = await apiFetch<{ events: AgentAuthLogEvent[] }>(
        `/api/admin/agent-tokens/${token._id}/auth-log?limit=50`,
      )
      setAuthLogEvents(data.events || [])
    } catch (err) {
      showToast((err as Error).message || 'Erreur chargement journal', 'error')
    } finally {
      setAuthLogLoading(false)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Agents API</span>
        </div>
        <div className="admin-header">
          <div>
            <h1>Agents API</h1>
            <p className="admin-subtitle">
              Personal Access Tokens (PAT) pour piloter Venio depuis Kuro et autres outils externes. Cf.{' '}
              <a href="/docs/api-agent.md" target="_blank" rel="noopener noreferrer">
                spec API
              </a>
              .
            </p>
          </div>
          <div className="admin-actions portal-actions-reveal">
            <button type="button" className="portal-button portal-action-link" onClick={openCreate}>
              <span className="portal-action-icon" aria-hidden>
                +
              </span>
              <span className="portal-action-label">Nouveau token</span>
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          {(['ACTIVE', 'REVOKED', 'ALL'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`portal-button secondary ${statusFilter === s ? 'is-active' : ''}`}
              style={{
                background: statusFilter === s ? 'var(--accent-bg, rgba(204, 255, 0, 0.15))' : '',
              }}
            >
              {s === 'ACTIVE' ? 'Actifs' : s === 'REVOKED' ? 'Révoqués' : 'Tous'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div className="portal-card">
            <p style={{ color: 'var(--text-secondary)' }}>Chargement…</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">🔑</div>
              <p className="admin-empty-state-text">
                {statusFilter === 'REVOKED'
                  ? 'Aucun token révoqué'
                  : "Aucun token actif. Créez-en un pour que Kuro puisse appeler l'API."}
              </p>
            </div>
          </div>
        ) : (
          <div className="admin-cards-grid">
            {tokens.map((t) => (
              <div key={t._id} className="admin-member-card">
                <div className="client-card-header">
                  <div
                    className="client-card-avatar"
                    style={{
                      background:
                        t.status === 'ACTIVE'
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.1))'
                          : 'linear-gradient(135deg, rgba(100, 116, 180, 0.25), rgba(100, 116, 180, 0.1))',
                    }}
                  >
                    🔑
                  </div>
                  <span
                    className="admin-card-role"
                    style={{
                      background: t.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 180, 0.12)',
                      borderColor: t.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(100, 116, 180, 0.35)',
                      color: t.status === 'ACTIVE' ? '#6ee7b7' : '#a5b4cf',
                    }}
                  >
                    {t.status}
                  </span>
                </div>
                <h3 className="client-card-name">{t.name}</h3>
                <p className="client-card-email" style={{ fontFamily: 'monospace' }}>
                  {t.prefix}…
                </p>

                <div className="client-card-tags" style={{ flexWrap: 'wrap' }}>
                  {t.scopes.slice(0, 6).map((s) => (
                    <span
                      key={s}
                      className="admin-card-role"
                      style={{
                        background: 'rgba(204, 255, 0, 0.12)',
                        borderColor: 'rgba(204, 255, 0, 0.35)',
                        color: 'var(--primary)',
                        fontSize: '0.75rem',
                      }}
                      title={s}
                    >
                      {s}
                    </span>
                  ))}
                  {t.scopes.length > 6 && (
                    <span className="admin-card-role" style={{ fontSize: '0.75rem' }}>
                      +{t.scopes.length - 6}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    <strong>Rate limit :</strong> {t.rateLimitPerMin}/min
                  </div>
                  <div>
                    <strong>Dernière utilisation :</strong> {formatDate(t.lastUsedAt)}
                  </div>
                  <div>
                    <strong>Requêtes :</strong> {t.totalRequests} ({t.totalMutations} mutations)
                  </div>
                  {t.expiresAt && (
                    <div>
                      <strong>Expire le :</strong> {formatDate(t.expiresAt)}
                    </div>
                  )}
                  <div>
                    <strong>Créé par :</strong> {t.createdBy?.name || t.createdBy?.email || '—'} ·{' '}
                    {formatDate(t.createdAt)}
                  </div>
                  {t.status === 'REVOKED' && (
                    <div style={{ color: '#f87171' }}>
                      <strong>Révoqué :</strong> {formatDate(t.revokedAt)}
                      {t.revokedBy && ` par ${t.revokedBy.name || t.revokedBy.email}`}
                    </div>
                  )}
                </div>

                {t.status === 'ACTIVE' && (
                  <div className="admin-card-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" className="admin-card-btn admin-card-btn--edit" onClick={() => openEdit(t)}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="admin-card-btn admin-card-btn--delete"
                      onClick={() => setRevokeTarget(t)}
                    >
                      Révoquer
                    </button>
                  </div>
                )}
                <div className="admin-card-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="admin-card-btn" onClick={() => openAuthLog(t)}>
                    Journal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal création / édition */}
      {formOpen && (
        <div className="confirm-modal-overlay" onClick={closeForm}>
          <div
            className="confirm-modal"
            style={{ maxWidth: 720, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">{editId ? 'Modifier le token' : 'Nouveau token agent'}</h2>
              <button type="button" className="confirm-modal__close" onClick={closeForm} aria-label="Fermer">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="confirm-modal__body" style={{ display: 'grid', gap: 16 }}>
                <label>
                  <div style={{ marginBottom: 4 }}>
                    Nom <span style={{ color: '#f87171' }}>*</span>
                  </div>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="ex. Kuro prod, intégration tierce…"
                    className="portal-input"
                    required
                    maxLength={120}
                  />
                </label>

                <div>
                  <div
                    style={{
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      Scopes <span style={{ color: '#f87171' }}>*</span>{' '}
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        ({form.scopes.length} sélectionné{form.scopes.length > 1 ? 's' : ''})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAllScopes}
                      disabled={!scopesCatalog}
                      style={{
                        background: 'rgba(204, 255, 0, 0.12)',
                        border: '1px solid rgba(204, 255, 0, 0.35)',
                        color: 'var(--primary)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      {allScopesSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div
                    style={{
                      maxHeight: 260,
                      overflowY: 'auto',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      borderRadius: 8,
                      padding: 12,
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    {groupedScopes.map((group) => (
                      <div key={group.module}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: 4,
                          }}
                        >
                          {group.module}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {group.scopes.map((s) => (
                            <label
                              key={s}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 10px',
                                background: form.scopes.includes(s)
                                  ? 'rgba(204, 255, 0, 0.2)'
                                  : 'rgba(255, 255, 255, 0.04)',
                                border: form.scopes.includes(s)
                                  ? '1px solid rgba(204, 255, 0, 0.5)'
                                  : '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontFamily: 'monospace',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={form.scopes.includes(s)}
                                onChange={() => toggleScope(s)}
                              />
                              {s}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>
                    <div style={{ marginBottom: 4 }}>Rate limit (req/min)</div>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={form.rateLimitPerMin}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          rateLimitPerMin: Number(e.target.value) || 120,
                        }))
                      }
                      className="portal-input"
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>Expiration (optionnel)</div>
                    <input
                      type="date"
                      value={form.expiresAt}
                      onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                      className="portal-input"
                    />
                  </label>
                </div>

                <label>
                  <div style={{ marginBottom: 4 }}>Notes (optionnel)</div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Contexte d'utilisation, qui a accès au secret, etc."
                    className="portal-input"
                    rows={3}
                    maxLength={1000}
                  />
                </label>
              </div>
              <div className="confirm-modal__footer">
                <button
                  type="button"
                  className="confirm-modal__btn confirm-modal__btn--cancel"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
                  disabled={saving}
                >
                  {saving ? 'Enregistrement…' : editId ? 'Mettre à jour' : 'Créer le token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de révélation du secret (création réussie) */}
      {revealedSecret && (
        <SecretRevealModal
          secret={revealedSecret}
          tokenName={revealedTokenName}
          copied={copied}
          onCopy={copySecret}
          onClose={() => setRevealedSecret(null)}
        />
      )}

      {/* Confirmation révocation */}
      <ConfirmModal
        isOpen={revokeTarget !== null}
        title="Révoquer le token"
        message={
          revokeTarget
            ? `Révoquer "${revokeTarget.name}" (${revokeTarget.prefix}…) ? Cette action est irréversible. Le token ne pourra plus appeler l'API.`
            : ''
        }
        confirmLabel="Révoquer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />

      {authLogToken && (
        <AuthLogModal
          token={authLogToken}
          events={authLogEvents}
          loading={authLogLoading}
          onClose={() => setAuthLogToken(null)}
        />
      )}
    </div>
  )
}

export default AgentTokensList
