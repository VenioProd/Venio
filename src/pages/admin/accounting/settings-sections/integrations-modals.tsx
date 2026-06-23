import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { IExternalSource } from '../../../../types/accounting'

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]+$/

interface GeneratedCredentials {
  apiKey: string
  webhookSecret: string
  sourceSlug: string
  sourceName: string
  warning?: string
  context: 'created' | 'rotated'
}

// ---- Modals d'intégrations externes ----

interface CreateIntegrationModalProps {
  existingSlugs: string[]
  onCancel: () => void
  onSubmit: (payload: {
    slug: string
    name: string
    description?: string
    autoValidateAll: boolean
  }) => Promise<string | null>
}

export function CreateIntegrationModal({ existingSlugs, onCancel, onSubmit }: CreateIntegrationModalProps) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [autoValidateAll, setAutoValidateAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const existingSet = useMemo(() => new Set(existingSlugs), [existingSlugs])

  const slugValid = SLUG_REGEX.test(slug)
  const slugTaken = existingSet.has(slug)
  const slugProblem = slug.length > 0 && !slugValid
  const canSubmit = slugValid && !slugTaken && name.trim().length > 0 && !submitting

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setFormError('')
    setSubmitting(true)
    const err = await onSubmit({
      slug,
      name: name.trim(),
      description: description.trim() || undefined,
      autoValidateAll,
    })
    if (err) {
      setFormError(err)
      setSubmitting(false)
    }
    // Si succès, le parent ferme la modal — pas besoin de reset.
  }

  return (
    <ModalShell title="Nouvelle intégration externe" onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            Slug <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            className="portal-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="stripe, shopify, ecom-bcg…"
            autoFocus
            required
          />
          <div
            style={{
              marginTop: 4,
              fontSize: '0.78rem',
              color: slugProblem || slugTaken ? '#fca5a5' : 'rgba(255,255,255,0.5)',
            }}
          >
            {slugTaken
              ? '⚠️ Ce slug est déjà utilisé par une autre intégration.'
              : slugProblem
                ? '⚠️ Minuscules, chiffres et tirets uniquement (≥ 2 caractères, doit commencer par lettre ou chiffre).'
                : 'Identifiant unique en minuscules. Ex : stripe, shopify, ecom-bcg.'}
          </div>
        </div>

        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            Nom affiché <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            className="portal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stripe, Shopify Store EU…"
            required
          />
        </div>

        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>Description (optionnel)</label>
          <textarea
            className="portal-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pousse les charges Stripe (frais, remboursements)…"
          />
        </div>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '10px 12px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.30)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          <input
            type="checkbox"
            checked={autoValidateAll}
            onChange={(e) => setAutoValidateAll(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ color: '#fde68a' }}>Auto-validation</strong>
            <div
              style={{
                marginTop: 2,
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              Si coché, les écritures sont créées directement en <code>VALIDATED</code>. À n'activer que pour les
              sources de confiance maximale.
            </div>
          </span>
        </label>

        {formError && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'rgba(220,38,38,0.15)',
              border: '1px solid rgba(220,38,38,0.40)',
              borderRadius: 8,
              color: '#fecaca',
              fontSize: '0.85rem',
            }}
          >
            {formError}
          </div>
        )}

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" className="portal-button secondary" onClick={onCancel} disabled={submitting}>
            Annuler
          </button>
          <button type="submit" className="portal-button" disabled={!canSubmit}>
            {submitting ? '⏳ Création…' : "Créer l'intégration"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ---- Modal de révocation ----

interface RevokeIntegrationModalProps {
  source: IExternalSource
  onCancel: () => void
  onConfirm: (source: IExternalSource) => Promise<string | null>
}

export function RevokeIntegrationModal({ source, onCancel, onConfirm }: RevokeIntegrationModalProps) {
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const canSubmit = confirmation === source.slug && !submitting

  async function handleConfirm() {
    if (!canSubmit) return
    setFormError('')
    setSubmitting(true)
    const err = await onConfirm(source)
    if (err) {
      setFormError(err)
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Révoquer cette intégration ?" onClose={onCancel}>
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(220,38,38,0.10)',
          border: '1px solid rgba(220,38,38,0.40)',
          borderRadius: 10,
          color: '#fecaca',
          fontSize: '0.88rem',
          lineHeight: 1.55,
        }}
      >
        ⚠️ Cette action est <strong>irréversible</strong>. L'intégration{' '}
        <code
          style={{
            background: 'rgba(15,15,20,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {source.slug}
        </code>{' '}
        sera supprimée et sa clé API immédiatement invalidée. Les écritures déjà reçues sont conservées.
      </div>

      <div className="accounting-form-field" style={{ marginTop: 18 }}>
        <label>
          Pour confirmer, tapez le slug{' '}
          <code
            style={{
              background: 'rgba(15,15,20,0.6)',
              padding: '1px 6px',
              borderRadius: 4,
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            }}
          >
            {source.slug}
          </code>{' '}
          ci-dessous :
        </label>
        <input
          className="portal-input"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={source.slug}
          autoFocus
        />
      </div>

      {formError && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.40)',
            borderRadius: 8,
            color: '#fecaca',
            fontSize: '0.85rem',
          }}
        >
          {formError}
        </div>
      )}

      <div
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button type="button" className="portal-button secondary" onClick={onCancel} disabled={submitting}>
          Annuler
        </button>
        <button
          type="button"
          className="portal-button"
          onClick={handleConfirm}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.35)',
            border: '1px solid rgba(220,38,38,0.55)',
            color: '#fff',
          }}
        >
          {submitting ? '⏳ Révocation…' : 'Révoquer définitivement'}
        </button>
      </div>
    </ModalShell>
  )
}

// ---- Modal Credentials ----

interface CredentialsModalProps {
  credentials: GeneratedCredentials
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
  onClose: () => void
}

export function CredentialsModal({ credentials, copiedField, onCopy, onClose }: CredentialsModalProps) {
  const ingestUrl = `https://venio.paris/api/external/${credentials.sourceSlug}/entries`
  const envBlock = [
    `VENIO_API_KEY=${credentials.apiKey}`,
    `VENIO_HMAC_SECRET=${credentials.webhookSecret}`,
    `VENIO_INGEST_URL=${ingestUrl}`,
    'VENIO_API_VERSION=2026-01',
  ].join('\n')

  const title =
    credentials.context === 'rotated'
      ? `🔄 Nouvelles clés pour ${credentials.sourceName}`
      : `🎉 Intégration ${credentials.sourceName} créée`

  return (
    <ModalShell title={title} onClose={onClose} closeOnBackdrop={false} wide>
      <div
        style={{
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.65)',
          marginTop: -4,
          marginBottom: 14,
        }}
      >
        Slug&nbsp;:{' '}
        <code
          style={{
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            background: 'rgba(15,15,20,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {credentials.sourceSlug}
        </code>
      </div>

      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.40)',
          borderRadius: 10,
          color: '#fde68a',
          fontSize: '0.88rem',
          lineHeight: 1.5,
        }}
      >
        ⚠️ Ces valeurs ne s'afficheront <strong>PLUS JAMAIS</strong>.
        <br />
        Stocke-les immédiatement dans un gestionnaire de secrets sécurisé.
        {credentials.warning && (
          <div style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.85 }}>{credentials.warning}</div>
        )}
      </div>

      <SecretField
        label="VENIO_API_KEY"
        value={credentials.apiKey}
        color="#0ea5e9"
        borderColor="rgba(14,165,233,0.35)"
        fieldKey="apiKey"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_HMAC_SECRET"
        value={credentials.webhookSecret}
        color="#9b9b9b"
        borderColor="rgba(155,155,155,0.35)"
        fieldKey="webhookSecret"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_INGEST_URL"
        value={ingestUrl}
        color="#86efac"
        borderColor="rgba(134,239,172,0.35)"
        fieldKey="ingestUrl"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Variables à coller dans le .env du service</span>
          <button
            type="button"
            className="portal-button secondary"
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={() => onCopy(envBlock, 'envBlock')}
          >
            {copiedField === 'envBlock' ? '✓ Copié' : '📋 Tout copier'}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            background: 'rgba(15,15,20,0.85)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.88)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {envBlock}
        </pre>
      </div>

      <div
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button type="button" className="portal-button" onClick={onClose}>
          ✅ J'ai bien noté les credentials → Fermer
        </button>
      </div>
    </ModalShell>
  )
}

interface SecretFieldProps {
  label: string
  value: string
  color: string
  borderColor: string
  fieldKey: string
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
}

export function SecretField({ label, value, color, borderColor, fieldKey, copiedField, onCopy }: SecretFieldProps) {
  return (
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
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 280px',
            padding: '12px 14px',
            background: 'rgba(15,15,20,0.85)',
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.86rem',
            color,
            wordBreak: 'break-all',
            userSelect: 'all',
            minWidth: 0,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          className="portal-button secondary"
          onClick={() => onCopy(value, fieldKey)}
          style={{ whiteSpace: 'nowrap' }}
        >
          {copiedField === fieldKey ? '✓ Copié' : '📋 Copier'}
        </button>
      </div>
    </div>
  )
}

// ---- Modal shell générique ----

interface ModalShellProps {
  title: string
  onClose: () => void
  closeOnBackdrop?: boolean
  wide?: boolean
  children: React.ReactNode
}

export function ModalShell({ title, onClose, closeOnBackdrop = true, wide = false, children }: ModalShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (closeOnBackdrop) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        className="accounting-card"
        style={{
          maxWidth: wide ? 600 : 520,
          width: '100%',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
