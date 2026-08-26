import type React from 'react'
import { eventTypeLabel, type EndpointFormState } from './types'

interface Props {
  form: EndpointFormState
  eventTypes: string[]
  saving: boolean
  isEdit: boolean
  error: string
  onChange: (next: EndpointFormState) => void
  onSubmit: (event: React.FormEvent) => void
  onClose: () => void
}

/**
 * Éditeur d'endpoint. Le sélecteur de types est multiple et volontairement
 * vide par défaut : aucun type coché = abonnement à tous les événements.
 */
export default function EndpointEditorModal({
  form,
  eventTypes,
  saving,
  isEdit,
  error,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const toggleType = (type: string) => {
    onChange({
      ...form,
      eventTypes: form.eventTypes.includes(type)
        ? form.eventTypes.filter((value) => value !== type)
        : [...form.eventTypes, type],
    })
  }

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal"
        style={{ maxWidth: 720, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">{isEdit ? 'Modifier l’endpoint' : 'Nouvel endpoint'}</h2>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="confirm-modal__body" style={{ display: 'grid', gap: 16 }}>
            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}

            <label>
              <div style={{ marginBottom: 4 }}>Nom</div>
              <input
                type="text"
                className="portal-input"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="ex. Kuro prod"
                required
                maxLength={120}
              />
            </label>

            <label>
              <div style={{ marginBottom: 4 }}>URL de destination</div>
              <input
                type="text"
                className="portal-input"
                value={form.url}
                onChange={(e) => onChange({ ...form, url: e.target.value })}
                placeholder="https://kuro.example.com/hooks/venio"
                required
              />
              <small style={{ color: 'var(--text-muted)' }}>
                HTTPS obligatoire (http toléré uniquement en local, hors production).
              </small>
            </label>

            <div>
              <div style={{ marginBottom: 8 }}>
                Types d’événement{' '}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {form.eventTypes.length === 0
                    ? '(aucun sélectionné = tous les types)'
                    : `(${form.eventTypes.length} sélectionné${form.eventTypes.length > 1 ? 's' : ''})`}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 6,
                  maxHeight: 260,
                  overflowY: 'auto',
                  padding: 8,
                  border: '1px solid var(--border-color)',
                }}
              >
                {eventTypes.map((type) => (
                  <label key={type} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={form.eventTypes.includes(type)} onChange={() => toggleType(type)} />
                    <span>{eventTypeLabel(type)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="confirm-modal__footer">
            <button type="button" className="confirm-modal__btn" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="confirm-modal__btn confirm-modal__btn--confirm" disabled={saving}>
              {isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
