import React, { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { trackPublicEvent } from '../../lib/publicAnalytics'
import PublicModal from './PublicModal'
import './ConversionForm.css'

const CTA = 'callback_modal'
const SUBJECT = 'Demande de rappel'

interface CallbackFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  consent: boolean
  website: string
}

const EMPTY_FORM: CallbackFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  consent: false,
  website: '',
}

interface CallbackModalProps {
  onClose: () => void
}

const CallbackModal = ({ onClose }: CallbackModalProps) => {
  const fieldId = useId()
  // Le serveur rejette toute soumission de moins de 1,5 s : l'horloge démarre
  // au montage de la modale, pas au premier caractère saisi.
  const startedAt = useRef(Date.now())
  const formStarted = useRef(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<CallbackFormData>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!formStarted.current) {
      formStarted.current = true
      trackPublicEvent('contact_form_started', CTA)
    }
    const { name, value, type } = event.target
    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? event.target.checked : value,
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormStatus(null)

    if (!formData.consent) {
      setFormStatus({ type: 'error', message: 'Veuillez accepter le traitement de votre demande.' })
      return
    }

    setIsSubmitting(true)
    trackPublicEvent('contact_form_submitted', CTA)

    try {
      await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          subject: SUBJECT,
          message: 'Demande de rappel.',
          consent: formData.consent,
          website: formData.website,
          startedAt: startedAt.current,
        }),
      })

      setFormData(EMPTY_FORM)
      startedAt.current = Date.now()
      setFormStatus({
        type: 'success',
        message: 'Merci, votre demande a bien été reçue. Nous vous rappelons sous 48 h ouvrées.',
      })
      trackPublicEvent('contact_form_succeeded', CTA)
    } catch {
      setFormStatus({
        type: 'error',
        message:
          "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou nous écrire directement à contact@venio.paris",
      })
      trackPublicEvent('contact_form_failed', CTA)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PublicModal title="Être rappelé" eyebrow="Venio · Rappel" onClose={onClose} initialFocusRef={firstFieldRef}>
      <form className="mc-form" onSubmit={handleSubmit}>
        <p className="mc-form__intro">
          Laissez-nous votre numéro : on vous rappelle sous 48 h ouvrées. L’email nous sert à confirmer la demande.
        </p>

        <div className="mc-form__row">
          <div className="mc-field">
            <label className="mc-label" htmlFor={`${fieldId}-first-name`}>
              Prénom
            </label>
            <input
              ref={firstFieldRef}
              className="mc-input"
              id={`${fieldId}-first-name`}
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mc-field">
            <label className="mc-label" htmlFor={`${fieldId}-last-name`}>
              Nom
            </label>
            <input
              className="mc-input"
              id={`${fieldId}-last-name`}
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="mc-field">
          <label className="mc-label" htmlFor={`${fieldId}-email`}>
            Email
          </label>
          <input
            className="mc-input"
            id={`${fieldId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mc-field">
          <label className="mc-label" htmlFor={`${fieldId}-phone`}>
            Téléphone
          </label>
          <input
            className="mc-input"
            id={`${fieldId}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            placeholder="06 12 34 56 78"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mc-honeypot" aria-hidden="true">
          <label htmlFor={`${fieldId}-website`}>Site web</label>
          <input
            id={`${fieldId}-website`}
            name="website"
            type="text"
            autoComplete="off"
            tabIndex={-1}
            value={formData.website}
            onChange={handleChange}
          />
        </div>

        <label className="mc-consent">
          <input type="checkbox" name="consent" checked={formData.consent} onChange={handleChange} />
          <span>
            J’accepte que Venio utilise ces informations pour répondre à ma demande, conformément à la{' '}
            <Link to="/confidentialite">politique de confidentialité</Link>.
          </span>
        </label>

        <div aria-live="polite">
          {formStatus && (
            <p className={`mc-status ${formStatus.type === 'success' ? 'mc-status--ok' : 'mc-status--ko'}`}>
              {formStatus.message}
            </p>
          )}
        </div>

        <div className="mc-form__actions">
          <button type="submit" className="mc-btn mc-btn--primary" disabled={isSubmitting}>
            {isSubmitting ? 'Envoi…' : 'Demander un rappel'}
          </button>
          <button type="button" className="mc-btn mc-btn--ghost" onClick={onClose}>
            Annuler
          </button>
        </div>
      </form>
    </PublicModal>
  )
}

export default CallbackModal
