import React, { useState } from 'react'
import emailjs from '@emailjs/browser'
import GradientMeshBackground from '../components/GradientMeshBackground'
import MathCaptcha from '../components/MathCaptcha'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './Contact.css'

interface ContactFormData {
  prenom: string
  nom: string
  email: string
  entreprise: string
  sujet: string
  message: string
}

const Contact = () => {
  const [captchaVerified, setCaptchaVerified] = useState<boolean>(false)
  const [formData, setFormData] = useState<ContactFormData>({
    prenom: '',
    nom: '',
    email: '',
    entreprise: '',
    sujet: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
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
        setFormStatus({ type: 'error', message: 'Le formulaire de contact n\'est pas encore configuré. Contactez-nous directement à contact@venio.pro' })
        setIsSubmitting(false)
        return
      }

      emailjs.init(publicKey)

      const templateParams = {
        from_name: `${formData.prenom} ${formData.nom}`,
        from_email: formData.email,
        to_email: 'contact@venio.pro',
        subject: `Contact Venio - ${formData.sujet || 'Sans sujet'}`,
        entreprise: formData.entreprise || 'Non renseignée',
        message: formData.message,
        sujet: formData.sujet || 'Non renseigné'
      }

      await emailjs.send(serviceId, templateId, templateParams)

      setFormData({ prenom: '', nom: '', email: '', entreprise: '', sujet: '', message: '' })
      setCaptchaVerified(false)
      setFormStatus({ type: 'success', message: 'Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.' })
    } catch {
      setFormStatus({ type: 'error', message: 'Une erreur est survenue lors de l\'envoi. Veuillez réessayer ou nous contacter directement à contact@venio.pro' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <SEO 
        title="Contact"
        description="Venio ne travaille pas avec tout le monde. Si vous cherchez du rapide et du pas cher, ce n'est pas ici. Si vous voulez construire quelque chose qui dure, parlons. Réponse sous 48h."
        keywords="contact Venio, formulaire contact, devis, consultation gratuite"
      />
      <StructuredData type="contact" />
      <GradientMeshBackground />
      <div className="contact-page">
        <section className="contact-hero">
          <h1>CONTACT</h1>
          <p className="contact-subtitle">Avant de nous contacter</p>
        </section>

        <section className="contact-content">
          <div className="contact-qualification">
            <p>
              Venio ne travaille pas avec tout le monde.
            </p>
            <p>
              Si vous cherchez du rapide et du pas cher, ce n&apos;est pas ici.
              Si vous cherchez quelqu&apos;un pour valider vos idées sans réfléchir, ce n&apos;est pas ici.
              Si vous voulez un template WordPress personnalisé, ce n&apos;est pas ici.
            </p>
            <p>
              Si vous voulez construire quelque chose qui dure, qui a du sens, qui est pensé pour vous, alors oui.
            </p>
            <p>
              Nous répondons sous 48h. Si votre projet a du sens, on vous le dira. Sinon aussi.
            </p>
          </div>

          <div className="contact-grid">
            <div className="contact-info">
              <h2>Email direct</h2>
              <div className="info-item">
                <a href="mailto:contact@venio.pro">contact@venio.pro</a>
              </div>
            </div>

            <div className="contact-form-wrapper">
              <h2>Formulaire</h2>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="form-row">
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
                  placeholder="Entreprise" 
                  value={formData.entreprise}
                  onChange={handleChange}
                />
                <select 
                  className="form-select" 
                  name="sujet"
                  value={formData.sujet}
                  onChange={handleChange}
                  required
                >
                  <option value="">Sujet</option>
                  <option value="Communication & Branding">Communication & Branding</option>
                  <option value="Développement">Développement</option>
                  <option value="Conseil Stratégique">Conseil Stratégique</option>
                  <option value="Autre">Autre</option>
                </select>
                <textarea
                  placeholder="Message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={6}
                  required
                ></textarea>
                <MathCaptcha onVerify={setCaptchaVerified} />
                {formStatus && (
                  <p style={{ color: formStatus.type === 'success' ? '#22c55e' : '#ef4444', fontSize: '14px', margin: '8px 0' }}>
                    {formStatus.message}
                  </p>
                )}
                <button
                  type="submit"
                  className="form-submit"
                  disabled={!captchaVerified || isSubmitting}
                >
                  {isSubmitting ? 'Envoi...' : 'Envoyer'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

export default Contact

