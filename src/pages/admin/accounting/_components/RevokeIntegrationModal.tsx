import { useState } from 'react'
import type { IExternalSource } from '@/types/accounting'
import ModalShell from './ModalShell'

interface Props {
  source: IExternalSource
  onCancel: () => void
  onConfirm: (source: IExternalSource) => Promise<string | null>
}

export default function RevokeIntegrationModal({ source, onCancel, onConfirm }: Props) {
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
        sera supprimée et sa clé API immédiatement invalidée. Les écritures déjà reçues sont
        conservées.
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
          onChange={e => setConfirmation(e.target.value)}
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
        <button
          type="button"
          className="portal-button secondary"
          onClick={onCancel}
          disabled={submitting}
        >
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
