import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import { trackPublicEvent } from '../lib/publicAnalytics'
import { apiFetch } from '../lib/api'
import '../styles/monolithe-pages.css'

interface ContactFormData {
  prenom: string
  nom: string
  email: string
  entreprise: string
  sujet: string
  message: string
  consent: boolean
  website: string
}

const Contact = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  const formStartedAt = useRef(Date.now())
  const [formData, setFormData] = useState<ContactFormData>({
    prenom: '',
    nom: '',
    email: '',
    entreprise: '',
    sujet: '',
    message: '',
    consent: false,
    website: '',
  })
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const formStarted = useRef(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!formStarted.current) {
      formStarted.current = true
      trackPublicEvent('contact_form_started')
    }
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormStatus(null)

    if (!formData.consent) {
      setFormStatus({ type: 'error', message: 'Veuillez accepter le traitement de votre demande.' })
      return
    }

    setIsSubmitting(true)
    trackPublicEvent('contact_form_submitted')

    try {
      await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.prenom,
          lastName: formData.nom,
          email: formData.email,
          company: formData.entreprise,
          subject: formData.sujet,
          message: formData.message,
          consent: formData.consent,
          website: formData.website,
          startedAt: formStartedAt.current,
        }),
      })

      setFormData({
        prenom: '',
        nom: '',
        email: '',
        entreprise: '',
        sujet: '',
        message: '',
        consent: false,
        website: '',
      })
      formStartedAt.current = Date.now()
      setFormStatus({
        type: 'success',
        message: 'Merci, votre message a bien été reçu. Nous vous répondrons sous 48 h ouvrées.',
      })
      trackPublicEvent('contact_form_succeeded')
    } catch {
      setFormStatus({
        type: 'error',
        message:
          "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou nous écrire directement à contact@venio.paris",
      })
      trackPublicEvent('contact_form_failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mp-page">
      <SEO
        title="Contact — parlons de votre projet web"
        description="On ne travaille pas avec tout le monde. Si vous cherchez du vite fait et pas cher, ce n'est pas ici. Si vous voulez construire quelque chose qui dure, parlons. Réponse sous 48h."
        keywords="contact Venio, devis site web Paris, prendre contact, projet web"
      />
      <StructuredData type="contact" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Contact</p>
          <h1 className="mp-title">Contact</h1>
          <p className="mp-lede">
            <b>On ne travaille pas avec tout le monde.</b> Et c'est tant mieux.
          </p>
        </div>
      </section>

      {/* §I — Qualification */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Avant de nous écrire</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">Venio ne travaille pas avec tout le monde.</p>
            <p>
              Si vous cherchez du vite fait et pas cher, ce n'est pas ici. Si vous cherchez quelqu'un pour valider vos
              idées sans réfléchir, ce n'est pas ici. Si vous voulez un modèle tout fait vite personnalisé, ce n'est pas
              ici.
            </p>
            <p>
              Si vous voulez construire quelque chose qui dure, qui a du sens et qui est pensé pour vous, alors oui.
            </p>
            <p>On répond sous 48h. Si votre projet a du sens, on vous le dit. Sinon aussi.</p>
          </div>
        </div>
      </section>

      {/* §II — Écrivez-nous */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">Écrivez-nous</span>
          </div>
          <div className="mp-contact-grid">
            <div className="mp-contact-aside mp-reveal">
              <h2>Email direct</h2>
              <a className="mp-mail" href="mailto:contact@venio.paris">
                contact@venio.paris
              </a>
            </div>

            <div className="mp-contact-form mp-reveal">
              <h2>Le formulaire</h2>
              <form className="mp-form" onSubmit={handleSubmit}>
                <div className="mp-form-row">
                  <input
                    type="text"
                    name="prenom"
                    aria-label="Prénom"
                    placeholder="Prénom"
                    value={formData.prenom}
                    onChange={handleChange}
                    required
                  />
                  <input
                    type="text"
                    name="nom"
                    aria-label="Nom"
                    placeholder="Nom"
                    value={formData.nom}
                    onChange={handleChange}
                    required
                  />
                </div>
                <input
                  type="email"
                  name="email"
                  aria-label="Email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <input
                  type="text"
                  name="entreprise"
                  aria-label="Entreprise"
                  placeholder="Entreprise (optionnel)"
                  value={formData.entreprise}
                  onChange={handleChange}
                />
                <select name="sujet" aria-label="Votre besoin" value={formData.sujet} onChange={handleChange} required>
                  <option value="">Votre besoin</option>
                  <option value="Site web">Un site web</option>
                  <option value="Développement sur mesure">Un outil sur mesure</option>
                  <option value="Conseil">Du conseil</option>
                  <option value="Communication & marque">Ma marque, ma communication</option>
                  <option value="Autre">Autre chose</option>
                </select>
                <textarea
                  placeholder="Votre message"
                  name="message"
                  aria-label="Votre message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={6}
                  required
                ></textarea>
                <div className="mp-form-honeypot" aria-hidden="true">
                  <label htmlFor="contact-website">Site web</label>
                  <input
                    id="contact-website"
                    type="text"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    autoComplete="off"
                    tabIndex={-1}
                  />
                </div>
                <label className="mp-consent">
                  <input type="checkbox" name="consent" checked={formData.consent} onChange={handleChange} required />
                  <span>
                    J’accepte que Venio utilise ces informations pour répondre à ma demande, conformément à la{' '}
                    <Link to="/confidentialite">politique de confidentialité</Link>.
                  </span>
                </label>
                {formStatus && (
                  <p
                    className="mp-form-status"
                    aria-live="polite"
                    style={{ color: formStatus.type === 'success' ? 'var(--primary)' : '#ef4444' }}
                  >
                    {formStatus.message}
                  </p>
                )}
                <button type="submit" className="mp-submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Envoi…' : 'Envoyer'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contact
