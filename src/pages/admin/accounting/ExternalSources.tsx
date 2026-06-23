import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listExternalSources, createExternalSource, updateExternalSource } from '../../../services/accounting'
import type { ExternalSourceStatus, IExternalSource, IExternalSourceCreateResult } from '../../../types/accounting'

function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR')
  } catch {
    return '—'
  }
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  PAUSED: 'En pause',
  DISABLED: 'Désactivée',
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
      setError(err instanceof Error ? err.message : 'Erreur')
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
      setFormError(
        'Le slug doit être en minuscules, commencer par une lettre ou un chiffre et ne contenir que des lettres, chiffres et tirets.',
      )
      return
    }
    if (!form.name || !form.name.trim()) {
      setFormError('Le nom est obligatoire.')
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
      setSuccess(`Source « ${result.source.name} » créée avec succès.`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur')
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
    const verb = nextStatus === 'PAUSED' ? 'Mettre en pause' : 'Réactiver'
    if (!confirm(`${verb} la source « ${source.name} » ?`)) return
    setError('')
    try {
      await updateExternalSource(source._id, { status: nextStatus })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <AccountingLayout
      title="Sources externes"
      subtitle="Sites tiers (Arrow, etc.) qui poussent leurs écritures via API"
      actions={
        <button
          className="portal-button"
          onClick={() => {
            setShowForm((v) => !v)
            if (showForm) resetForm()
          }}
        >
          {showForm ? '✕ Annuler' : '✚ Nouvelle source'}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && !credentials && <div className="accounting-message success">{success}</div>}

      {showForm && (
        <section className="accounting-card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Créer une source externe</h2>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Slug *</label>
              <input
                className="portal-input"
                placeholder="arrow"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              />
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: 2,
                }}
              >
                Identifiant unique en minuscules (a-z, 0-9, tirets). Utilisé dans l'URL des endpoints API.
              </span>
            </div>
            <div className="accounting-form-field">
              <label>Nom *</label>
              <input
                className="portal-input"
                placeholder="Arrow Productions"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="accounting-form-field full">
              <label>Description</label>
              <textarea
                className="portal-input"
                rows={2}
                placeholder="Description interne de la source…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="accounting-form-field full">
              <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={form.autoValidateAll}
                  onChange={(e) => setForm({ ...form, autoValidateAll: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Auto-valider toutes les écritures de cette source
              </label>
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'rgba(251,191,36,0.85)',
                  marginTop: 2,
                }}
              >
                ⚠ Si activé, toutes les écritures arrivent validées (à n'activer que pour les sources de confiance
                maximale).
              </span>
            </div>
            <div className="accounting-form-field">
              <label>Rate limit (req/min)</label>
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
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--primary)',
            }}
          >
            Mappings par défaut
          </h3>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Journal par défaut</label>
              <input
                className="portal-input"
                value={form.defaultJournalCode}
                onChange={(e) => setForm({ ...form, defaultJournalCode: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Compte client</label>
              <input
                className="portal-input"
                value={form.defaultCustomerAccount}
                onChange={(e) => setForm({ ...form, defaultCustomerAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Compte produit</label>
              <input
                className="portal-input"
                value={form.defaultRevenueAccount}
                onChange={(e) => setForm({ ...form, defaultRevenueAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Compte charge</label>
              <input
                className="portal-input"
                value={form.defaultExpenseAccount}
                onChange={(e) => setForm({ ...form, defaultExpenseAccount: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Compte banque</label>
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
              {creating ? 'Création…' : '✚ Créer'}
            </button>
            <button
              className="portal-button secondary"
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
            >
              Annuler
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
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Clé API et secret générés</h2>

            <div
              className="accounting-message"
              style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.4)',
                color: '#fde68a',
              }}
            >
              ⚠ Cette clé et ce secret ne seront PLUS jamais affichés. Stockez-les immédiatement de manière sécurisée
              (gestionnaire de mots de passe, coffre-fort).
              {credentials.warning && (
                <div style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.85 }}>{credentials.warning}</div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 6,
                }}
              >
                Clé API (X-Api-Key)
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(14, 165, 233, 0.35)',
                  borderRadius: 10,
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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
                {copyState.key ? '✓ Copié' : '📋 Copier la clé'}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 6,
                }}
              >
                Secret de signature webhook (X-Venio-Signature)
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(14, 165, 233, 0.35)',
                  borderRadius: 10,
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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
                {copyState.secret ? '✓ Copié' : '📋 Copier le secret'}
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
                J'ai bien noté → Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="accounting-card">
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : sources.length === 0 ? (
          <div className="accounting-empty">
            Aucune source externe configurée.
            <div className="hint">
              Cliquez sur « Nouvelle source » pour permettre à un site tiers d'envoyer ses écritures comptables.
            </div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>Préfixe clé</th>
                <th>Dernière activité</th>
                <th className="amount">Reçus</th>
                <th className="amount">Rejetés</th>
                <th className="amount">Doublons</th>
                <th>Actions</th>
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
                      style={{ color: 'rgba(255,255,255,0.92)', textDecoration: 'none' }}
                    >
                      {s.name}
                    </Link>
                    {s.autoValidateAll && (
                      <span className="accounting-badge source-external" style={{ marginLeft: 8, fontSize: '0.66rem' }}>
                        Auto-validation
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
                      title={s.status === 'ACTIVE' ? 'Cliquer pour mettre en pause' : 'Cliquer pour réactiver'}
                    >
                      <span className={`accounting-badge ${statusBadgeClass(s.status)}`}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </button>
                  </td>
                  <td className="code">{s.apiKeyPrefix ? `${s.apiKeyPrefix}…` : '—'}</td>
                  <td style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
                    {formatDateTime(s.lastSeenAt)}
                    {s.lastError && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#fca5a5',
                          marginTop: 2,
                        }}
                      >
                        Dernière erreur : {formatDateTime(s.lastErrorAt)}
                      </div>
                    )}
                  </td>
                  <td className="amount">{Number(s.totalIngested || 0).toLocaleString('fr-FR')}</td>
                  <td className="amount" style={{ color: s.totalRejected ? '#fca5a5' : undefined }}>
                    {Number(s.totalRejected || 0).toLocaleString('fr-FR')}
                  </td>
                  <td className="amount" style={{ color: s.totalDuplicates ? '#fbbf24' : undefined }}>
                    {Number(s.totalDuplicates || 0).toLocaleString('fr-FR')}
                  </td>
                  <td>
                    <div className="accounting-row-actions">
                      <Link to={`/admin/comptabilite/sources-externes/${s._id}`}>
                        <button type="button">Détail</button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AccountingLayout>
  )
}

export default ExternalSources
