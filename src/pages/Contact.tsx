import React, { useState } from 'react'
import emailjs from '@emailjs/browser'
import MathCaptcha from '../components/MathCaptcha'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

interface ContactFormData {
  prenom: string
  nom: string
  email: string
  entreprise: string
  sujet: string
  message: string
}

const Contact = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  const [captchaVerified, setCaptchaVerified] = useState<boolean>(false)
  const [formData, setFormData] = useState<ContactFormData>({
    prenom: '',
    nom: '',
    email: '',
    entreprise: '',
    sujet: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormStatus(null)

    if (!captchaVerified) {
      setFormStatus({ type: 'error', message: 'Veuillez compléter la vérification mathématique.' })
      return
    }

    setIsSubmitting(true)

    try {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

      if (!serviceId || !templateId || !publicKey) {
        setFormStatus({
          type: 'error',
          message:
            "Le formulaire de contact n'est pas encore configuré. Contactez-nous directement à contact@venio.paris",
        })
        setIsSubmitting(false)
        return
      }

      emailjs.init(publicKey)

      const templateParams = {
        from_name: `${formData.prenom} ${formData.nom}`,
        from_email: formData.email,
        to_email: 'contact@venio.paris',
        subject: `Contact Venio - ${formData.sujet || 'Sans sujet'}`,
        entreprise: formData.entreprise || 'Non renseignée',
        message: formData.message,
        sujet: formData.sujet || 'Non renseigné',
      }

      await emailjs.send(serviceId, templateId, templateParams)

      setFormData({ prenom: '', nom: '', email: '', entreprise: '', sujet: '', message: '' })
      setCaptchaVerified(false)
      setFormStatus({
        type: 'success',
        message: 'Votre message a été envoyé. On vous répond sous 48h.',
      })
    } catch {
      setFormStatus({
        type: 'error',
        message:
          "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou nous écrire directement à contact@venio.paris",
      })
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
                    placeholder="Prénom"
                    value={formData.prenom}
                    onChange={handleChange}
                    required
                  />
                  <input
                    type="text"
                    name="nom"
                    placeholder="Nom"
                    value={formData.nom}
                    onChange={handleChange}
                    required
                  />
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <input
                  type="text"
                  name="entreprise"
                  placeholder="Entreprise (optionnel)"
                  value={formData.entreprise}
                  onChange={handleChange}
                />
                <select name="sujet" value={formData.sujet} onChange={handleChange} required>
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
                  value={formData.message}
                  onChange={handleChange}
                  rows={6}
                  required
                ></textarea>
                <MathCaptcha onVerify={setCaptchaVerified} />
                {formStatus && (
                  <p
                    className="mp-form-status"
                    style={{ color: formStatus.type === 'success' ? 'var(--primary)' : '#ef4444' }}
                  >
                    {formStatus.message}
                  </p>
                )}
                <button type="submit" className="mp-submit" disabled={!captchaVerified || isSubmitting}>
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
