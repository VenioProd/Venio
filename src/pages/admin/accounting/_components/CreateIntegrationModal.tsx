import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import ModalShell from './ModalShell'
import { SLUG_REGEX } from './types'

interface Props {
  existingSlugs: string[]
  onCancel: () => void
  onSubmit: (payload: {
    slug: string
    name: string
    description?: string
    autoValidateAll: boolean
  }) => Promise<string | null>
}

export default function CreateIntegrationModal({ existingSlugs, onCancel, onSubmit }: Props) {
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
            onChange={e => setSlug(e.target.value.toLowerCase())}
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
            onChange={e => setName(e.target.value)}
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
            onChange={e => setDescription(e.target.value)}
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
            onChange={e => setAutoValidateAll(e.target.checked)}
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
              Si coché, les écritures sont créées directement en <code>VALIDATED</code>. À
              n'activer que pour les sources de confiance maximale.
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
          <button
            type="button"
            className="portal-button secondary"
            onClick={onCancel}
            disabled={submitting}
          >
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
