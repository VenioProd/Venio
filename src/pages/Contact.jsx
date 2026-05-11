import React, { useState } from 'react'
import emailjs from '@emailjs/browser'
import GradientMeshBackground from '../components/GradientMeshBackground'
import MathCaptcha from '../components/MathCaptcha'
import NeonDivider from '../components/NeonDivider'
import NeonCorners from '../components/NeonCorners'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './Contact.css'

const Contact = () => {
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    email: '',
    entreprise: '',
    sujet: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!captchaVerified) {
      alert('Veuillez compléter la vérification mathématique')
      return
    }

    setIsSubmitting(true)

    try {
      // Configuration EmailJS
      // IMPORTANT: Remplacez ces valeurs par vos clés EmailJS
      // 1. Créez un compte sur https://www.emailjs.com
      // 2. Créez un service email (Gmail, Outlook, etc.)
      // 3. Créez un template email
      // 4. Récupérez votre Public Key, Service ID et Template ID
      
      const serviceId = 'YOUR_SERVICE_ID' // À remplacer
      const templateId = 'YOUR_TEMPLATE_ID' // À remplacer
      const publicKey = 'YOUR_PUBLIC_KEY' // À remplacer

      // Initialiser EmailJS avec votre clé publique
      emailjs.init(publicKey)

      // Préparer les paramètres du template
      const templateParams = {
        from_name: `${formData.prenom} ${formData.nom}`,
        from_email: formData.email,
        to_email: 'contact@venio.paris',
        subject: `Contact Venio - ${formData.sujet || 'Sans sujet'}`,
        entreprise: formData.entreprise || 'Non renseignée',
        message: formData.message,
        sujet: formData.sujet || 'Non renseigné'
      }

      // Envoi de l'email
      await emailjs.send(serviceId, templateId, templateParams)

      // Réinitialiser le formulaire
      setFormData({
        prenom: '',
        nom: '',
        email: '',
        entreprise: '',
        sujet: '',
        message: ''
      })
      setCaptchaVerified(false)
      setIsSubmitting(false)
      
      alert('Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.')
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error)
      alert('Une erreur est survenue lors de l\'envoi. Veuillez réessayer ou nous contacter directement à contact@venio.paris')
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

        <NeonDivider />

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
                <a href="mailto:contact@venio.paris">contact@venio.paris</a>
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
                  rows="6" 
                  required
                ></textarea>
                <MathCaptcha onVerify={setCaptchaVerified} />
                <button
                  type="submit"
                  className="form-submit"
                  disabled={!captchaVerified || isSubmitting}
                >
                  <NeonCorners />
                  <span className="form-submit-label">
                    {isSubmitting ? 'Envoi...' : 'Envoyer'}
                  </span>
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

