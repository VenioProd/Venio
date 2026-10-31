import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
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
import { SENSITIVE_ACTIONS, sensitiveActionHeaders } from '../../lib/sensitiveActions'

const AgentTokensList: React.FC = () => {
  const { showToast } = useToast()
  const { t: tr } = useI18n()

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
      showToast((err as Error).message || tr('adminTech.agentTokens.loadError'), 'error')
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
      // i18n-ignore: identifiant de groupe (clé de regroupement), traduit à l'affichage
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
      showToast(tr('adminTech.agentTokens.nameRequired'), 'error')
      return
    }
    if (form.scopes.length === 0) {
      showToast(tr('adminTech.agentTokens.scopeRequired'), 'error')
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
          headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.AGENT_TOKEN_UPDATE),
        })
        showToast(tr('adminTech.agentTokens.updated'), 'success')
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
          headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.AGENT_TOKEN_CREATE),
        })
        setRevealedSecret(data.plainSecret)
        setRevealedTokenName(data.token.name)
        setCopied(false)
        closeForm()
        await load()
      }
    } catch (err) {
      showToast((err as Error).message || tr('adminTech.agentTokens.saveError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const copySecret = async () => {
    if (!revealedSecret) return
    try {
      await navigator.clipboard.writeText(revealedSecret)
      setCopied(true)
      showToast(tr('adminTech.agentTokens.secretCopied'), 'success')
    } catch {
      showToast(tr('adminTech.agentTokens.copyFailed'), 'error')
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    try {
      await apiFetch(`/api/admin/agent-tokens/${revokeTarget._id}/revoke`, {
        method: 'POST',
        headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.AGENT_TOKEN_REVOKE),
      })
      showToast(tr('adminTech.agentTokens.revoked'), 'success')
      setRevokeTarget(null)
      await load()
    } catch (err) {
      showToast((err as Error).message || tr('adminTech.agentTokens.revokeError'), 'error')
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
      showToast((err as Error).message || tr('adminTech.agentTokens.logLoadError'), 'error')
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
          <span style={{ color: 'var(--text-primary)' }}>{tr('adminTech.agentTokens.title')}</span>
        </div>
        <div className="admin-header">
          <div>
            <h1>{tr('adminTech.agentTokens.title')}</h1>
            <p className="admin-subtitle">
              {tr('adminTech.agentTokens.subtitleLead')}{' '}
              <a href="/docs/api-agent.md" target="_blank" rel="noopener noreferrer">
                {tr('adminTech.agentTokens.specLink')}
              </a>
              .
            </p>
          </div>
          <div className="admin-actions portal-actions-reveal">
            <button type="button" className="portal-button portal-action-link" onClick={openCreate}>
              <span className="portal-action-icon" aria-hidden>
                +
              </span>
              <span className="portal-action-label">{tr('adminTech.agentTokens.newToken')}</span>
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
                background: statusFilter === s ? 'var(--accent-bg, rgba(14, 165, 233, 0.15))' : '',
              }}
            >
              {s === 'ACTIVE'
                ? tr('adminTech.agentTokens.filterActive')
                : s === 'REVOKED'
                  ? tr('adminTech.agentTokens.filterRevoked')
                  : tr('adminTech.agentTokens.filterAll')}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div className="portal-card">
            <p style={{ color: 'var(--text-secondary)' }}>{tr('adminTech.agentTokens.loading')}</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">🔑</div>
              <p className="admin-empty-state-text">
                {statusFilter === 'REVOKED'
                  ? tr('adminTech.agentTokens.emptyRevoked')
                  : tr('adminTech.agentTokens.emptyActive')}
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
                        background: 'rgba(14, 165, 233, 0.12)',
                        borderColor: 'rgba(14, 165, 233, 0.35)',
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
                    <strong>{tr('adminTech.agentTokens.rateLimit')}</strong> {t.rateLimitPerMin}/min
                  </div>
                  <div>
                    <strong>{tr('adminTech.agentTokens.lastUsed')}</strong> {formatDate(t.lastUsedAt)}
                  </div>
                  <div>
                    <strong>{tr('adminTech.agentTokens.requests')}</strong>{' '}
                    {tr('adminTech.agentTokens.requestsValue', {
                      requests: t.totalRequests,
                      mutations: t.totalMutations,
                    })}
                  </div>
                  {t.expiresAt && (
                    <div>
                      <strong>{tr('adminTech.agentTokens.expiresOn')}</strong> {formatDate(t.expiresAt)}
                    </div>
                  )}
                  <div>
                    <strong>{tr('adminTech.agentTokens.createdBy')}</strong>{' '}
                    {t.createdBy?.name || t.createdBy?.email || '—'} · {formatDate(t.createdAt)}
                  </div>
                  {t.status === 'REVOKED' && (
                    <div style={{ color: '#f87171' }}>
                      <strong>{tr('adminTech.agentTokens.revokedLabel')}</strong> {formatDate(t.revokedAt)}
                      {t.revokedBy &&
                        ` ${tr('adminTech.agentTokens.revokedBy', { name: t.revokedBy.name || t.revokedBy.email || '' })}`}
                    </div>
                  )}
                </div>

                {t.status === 'ACTIVE' && (
                  <div className="admin-card-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" className="admin-card-btn admin-card-btn--edit" onClick={() => openEdit(t)}>
                      {tr('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="admin-card-btn admin-card-btn--delete"
                      onClick={() => setRevokeTarget(t)}
                    >
                      {tr('adminTech.agentTokens.revoke')}
                    </button>
                  </div>
                )}
                <div className="admin-card-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="admin-card-btn" onClick={() => openAuthLog(t)}>
                    {tr('adminTech.agentTokens.log')}
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
              <h2 className="confirm-modal__title">
                {editId ? tr('adminTech.agentTokens.editTitle') : tr('adminTech.agentTokens.createTitle')}
              </h2>
              <button
                type="button"
                className="confirm-modal__close"
                onClick={closeForm}
                aria-label={tr('common.close')}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="confirm-modal__body" style={{ display: 'grid', gap: 16 }}>
                <label>
                  <div style={{ marginBottom: 4 }}>
                    {tr('adminTech.agentTokens.nameLabel')} <span style={{ color: '#f87171' }}>*</span>
                  </div>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={tr('adminTech.agentTokens.namePlaceholder')}
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
                      {tr('adminTech.agentTokens.scopesLabel')} <span style={{ color: '#f87171' }}>*</span>{' '}
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {tr('adminTech.agentTokens.selectedCount', { count: form.scopes.length })}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAllScopes}
                      disabled={!scopesCatalog}
                      style={{
                        background: 'rgba(14, 165, 233, 0.12)',
                        border: '1px solid rgba(14, 165, 233, 0.35)',
                        color: 'var(--primary)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      {allScopesSelected
                        ? tr('adminTech.agentTokens.deselectAll')
                        : tr('adminTech.agentTokens.selectAll')}
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
                          {group.module === 'autre' ? tr('adminTech.agentTokens.groupOther') : group.module}
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
                                  ? 'rgba(14, 165, 233, 0.2)'
                                  : 'rgba(255, 255, 255, 0.04)',
                                border: form.scopes.includes(s)
                                  ? '1px solid rgba(14, 165, 233, 0.5)'
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
                    <div style={{ marginBottom: 4 }}>{tr('adminTech.agentTokens.rateLimitLabel')}</div>
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
                    <div style={{ marginBottom: 4 }}>{tr('adminTech.agentTokens.expirationLabel')}</div>
                    <input
                      type="date"
                      value={form.expiresAt}
                      onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                      className="portal-input"
                    />
                  </label>
                </div>

                <label>
                  <div style={{ marginBottom: 4 }}>{tr('adminTech.agentTokens.notesLabel')}</div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={tr('adminTech.agentTokens.notesPlaceholder')}
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
                  {tr('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
                  disabled={saving}
                >
                  {saving
                    ? tr('adminTech.agentTokens.saving')
                    : editId
                      ? tr('adminTech.agentTokens.update')
                      : tr('adminTech.agentTokens.create')}
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
        title={tr('adminTech.agentTokens.revokeTitle')}
        message={
          revokeTarget
            ? tr('adminTech.agentTokens.revokeMessage', { name: revokeTarget.name, prefix: revokeTarget.prefix })
            : ''
        }
        confirmLabel={tr('adminTech.agentTokens.revoke')}
        cancelLabel={tr('common.cancel')}
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
