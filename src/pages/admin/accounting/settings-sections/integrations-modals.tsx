import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { IExternalSource } from '../../../../types/accounting'
import { useI18n } from '../../../../context/I18nContext'

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
  const { t } = useI18n()
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
    <ModalShell title={t('accVat.modal.createTitle')} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            Slug <span style={{ color: 'var(--critical)' }}>*</span>
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
              color: slugProblem || slugTaken ? 'var(--critical)' : 'var(--text-secondary)',
            }}
          >
            {slugTaken
              ? t('accVat.modal.slugTaken')
              : slugProblem
                ? t('accVat.modal.slugInvalid')
                : t('accVat.modal.slugHint')}
          </div>
        </div>

        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            {t('accVat.modal.displayName')} <span style={{ color: 'var(--critical)' }}>*</span>
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
          <label>{t('accVat.modal.description')}</label>
          <textarea
            className="portal-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('accVat.modal.descriptionPlaceholder')}
          />
        </div>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '10px 12px',
            background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
          }}
        >
          <input
            type="checkbox"
            checked={autoValidateAll}
            onChange={(e) => setAutoValidateAll(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ color: 'var(--warning)' }}>{t('accVat.modal.autoValidate')}</strong>
            <div
              style={{
                marginTop: 2,
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
              }}
            >
              {t('accVat.modal.autoValidateBefore')} <code>VALIDATED</code>
              {t('accVat.modal.autoValidateAfter')}
            </div>
          </span>
        </label>

        {formError && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'color-mix(in srgb, var(--critical) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--critical) 40%, transparent)',
              borderRadius: 'var(--r-md)',
              color: 'var(--text-secondary)',
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
            {t('common.cancel')}
          </button>
          <button type="submit" className="portal-button" disabled={!canSubmit}>
            {submitting ? t('accVat.modal.creating') : t('accVat.modal.createButton')}
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
  const { t } = useI18n()
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
    <ModalShell title={t('accVat.modal.revokeTitle')} onClose={onCancel}>
      <div
        style={{
          padding: '12px 14px',
          background: 'color-mix(in srgb, var(--critical) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--critical) 40%, transparent)',
          borderRadius: 'var(--r-md)',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
          lineHeight: 1.55,
        }}
      >
        ⚠️ {t('accVat.modal.revokeWarnA')} <strong>{t('accVat.modal.revokeWarnB')}</strong>
        {t('accVat.modal.revokeWarnC')}{' '}
        <code
          style={{
            background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
            padding: '1px 6px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          {source.slug}
        </code>{' '}
        {t('accVat.modal.revokeWarnD')}
      </div>

      <div className="accounting-form-field" style={{ marginTop: 18 }}>
        <label>
          {t('accVat.modal.confirmSlugA')}{' '}
          <code
            style={{
              background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
              padding: '1px 6px',
              borderRadius: 'var(--r-sm)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {source.slug}
          </code>{' '}
          {t('accVat.modal.confirmSlugB')}
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
            background: 'color-mix(in srgb, var(--critical) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--critical) 40%, transparent)',
            borderRadius: 'var(--r-md)',
            color: 'var(--text-secondary)',
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
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="portal-button"
          onClick={handleConfirm}
          disabled={!canSubmit}
          style={{
            background: canSubmit
              ? 'color-mix(in srgb, var(--critical) 85%, transparent)'
              : 'color-mix(in srgb, var(--critical) 35%, transparent)',
            border: '1px solid color-mix(in srgb, var(--critical) 55%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {submitting ? t('accVat.modal.revoking') : t('accVat.modal.revokeButton')}
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
  const { t } = useI18n()
  const ingestUrl = `https://venio.paris/api/external/${credentials.sourceSlug}/entries`
  const envBlock = [
    `VENIO_API_KEY=${credentials.apiKey}`,
    `VENIO_HMAC_SECRET=${credentials.webhookSecret}`,
    `VENIO_INGEST_URL=${ingestUrl}`,
    'VENIO_API_VERSION=2026-01',
  ].join('\n')

  const title =
    credentials.context === 'rotated'
      ? t('accVat.modal.newKeysTitle', { name: credentials.sourceName })
      : t('accVat.modal.createdTitle', { name: credentials.sourceName })

  return (
    <ModalShell title={title} onClose={onClose} closeOnBackdrop={false} wide>
      <div
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginTop: -4,
          marginBottom: 14,
        }}
      >
        {t('accVat.integ.slugLabel')}{' '}
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
            padding: '1px 6px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          {credentials.sourceSlug}
        </code>
      </div>

      <div
        style={{
          padding: '12px 14px',
          background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
          borderRadius: 'var(--r-md)',
          color: 'var(--warning)',
          fontSize: '0.88rem',
          lineHeight: 1.5,
        }}
      >
        ⚠️ {t('accVat.modal.neverShownA')} <strong>{t('accVat.modal.neverShownB')}</strong>
        {t('accVat.modal.neverShownC')}
        <br />
        {t('accVat.modal.storeThem')}
        {credentials.warning && (
          <div style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.85 }}>{credentials.warning}</div>
        )}
      </div>

      <SecretField
        label="VENIO_API_KEY"
        value={credentials.apiKey}
        color="var(--primary)"
        borderColor="color-mix(in srgb, var(--primary) 35%, transparent)"
        fieldKey="apiKey"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_HMAC_SECRET"
        value={credentials.webhookSecret}
        color="var(--text-secondary)"
        borderColor="color-mix(in srgb, var(--text-secondary) 35%, transparent)"
        fieldKey="webhookSecret"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_INGEST_URL"
        value={ingestUrl}
        color="var(--good)"
        borderColor="color-mix(in srgb, var(--good) 35%, transparent)"
        fieldKey="ingestUrl"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: '0.78rem',
            textTransform: 'none',
            letterSpacing: 'normal',
            color: 'var(--text-secondary)',
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{t('accVat.modal.envVars')}</span>
          <button
            type="button"
            className="portal-button secondary"
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={() => onCopy(envBlock, 'envBlock')}
          >
            {copiedField === 'envBlock' ? t('accVat.modal.copied') : t('accVat.modal.copyAll')}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
            border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
            borderRadius: 'var(--r-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
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
          ✅ {t('accVat.modal.noted')}
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
  const { t } = useI18n()
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: '0.78rem',
          textTransform: 'none',
          letterSpacing: 'normal',
          color: 'var(--text-secondary)',
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
            background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
            border: `1px solid ${borderColor}`,
            borderRadius: 'var(--r-md)',
            fontFamily: 'var(--font-mono)',
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
          {copiedField === fieldKey ? t('accVat.modal.copied') : t('accVat.modal.copy')}
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
