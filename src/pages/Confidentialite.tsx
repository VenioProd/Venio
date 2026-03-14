import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import SEO from '../components/SEO'
import './Legal.css'

const Confidentialite = () => {
  return (
    <>
      <SEO
        title="Politique de Confidentialite"
        description="Politique de confidentialite de Venio. Traitement des donnees personnelles conforme au RGPD."
        noindex={true}
      />
      <GradientMeshBackground />
      <div className="legal-page">
        <section className="legal-hero">
          <h1>POLITIQUE DE CONFIDENTIALITE</h1>
        </section>

        <section className="legal-content">
          <div className="legal-section">
            <h2>Responsable du traitement</h2>
            <p>
              <strong>Venio</strong><br />
              Representant legal : Raphael BENTVELZEN<br />
              Siege social : 60 Rue Francois 1er, 75008 Paris, France<br />
              Email : contact@venio.paris<br />
              SIREN : 939549473
            </p>
          </div>

          <div className="legal-section">
            <h2>Donnees collectees</h2>
            <h3>1. Donnees collectees via le formulaire de contact</h3>
            <p>
              Lorsque vous utilisez le formulaire de contact du site venio.paris, nous collectons les informations suivantes :
            </p>
            <ul>
              <li>Prenom et nom</li>
              <li>Adresse email</li>
              <li>Nom de l'entreprise (facultatif)</li>
              <li>Sujet et contenu du message</li>
            </ul>
            <p>
              <strong>Finalite :</strong> repondre a votre demande de contact ou de devis.<br />
              <strong>Base legale :</strong> interet legitime (article 6.1.f du RGPD).<br />
              <strong>Duree de conservation :</strong> 3 ans a compter du dernier contact.
            </p>

            <h3>2. Donnees collectees via l'espace client</h3>
            <p>
              Si vous etes client de Venio, un espace client securise vous est attribue. Les donnees suivantes sont traitees :
            </p>
            <ul>
              <li>Nom, prenom, email professionnel</li>
              <li>Nom de l'entreprise, telephone, adresse</li>
              <li>Donnees liees aux projets (messages, fichiers, factures)</li>
            </ul>
            <p>
              <strong>Finalite :</strong> execution du contrat de prestation de services.<br />
              <strong>Base legale :</strong> execution contractuelle (article 6.1.b du RGPD).<br />
              <strong>Duree de conservation :</strong> duree de la relation commerciale + 5 ans (obligations legales).
            </p>
          </div>

          <div className="legal-section">
            <h2>Cookies</h2>
            <p>
              Le site venio.paris utilise uniquement des <strong>cookies techniques strictement necessaires</strong> au fonctionnement du site :
            </p>
            <ul>
              <li>Token d'authentification pour l'espace client et l'espace administrateur</li>
              <li>Preference de theme (clair/sombre)</li>
              <li>Consentement cookies</li>
            </ul>
            <p>
              <strong>Aucun cookie de tracking, d'analyse ou de publicite n'est utilise.</strong> Aucune donnee n'est transmise a des tiers a des fins publicitaires.
            </p>
          </div>

          <div className="legal-section">
            <h2>Partage des donnees</h2>
            <p>
              Vos donnees personnelles ne sont jamais vendues ni cedees a des tiers. Elles peuvent etre communiquees uniquement :
            </p>
            <ul>
              <li>A l'hebergeur du site (OVH / Ionos) pour l'hebergement technique</li>
              <li>Au service d'envoi d'emails (EmailJS) pour le traitement du formulaire de contact</li>
              <li>Aux autorites competentes en cas d'obligation legale</li>
            </ul>
          </div>

          <div className="legal-section">
            <h2>Securite des donnees</h2>
            <p>
              Venio met en oeuvre les mesures techniques et organisationnelles appropriees pour proteger vos donnees personnelles
              contre tout acces non autorise, modification, divulgation ou destruction. Les mots de passe sont stockes sous forme
              hashee (bcrypt) et les communications sont chiffrees via HTTPS.
            </p>
          </div>

          <div className="legal-section">
            <h2>Vos droits</h2>
            <p>
              Conformement au Reglement General sur la Protection des Donnees (RGPD) et a la loi Informatique et Libertes,
              vous disposez des droits suivants :
            </p>
            <ul>
              <li><strong>Droit d'acces :</strong> obtenir la confirmation que vos donnees sont traitees et en recevoir une copie</li>
              <li><strong>Droit de rectification :</strong> faire corriger vos donnees inexactes ou incompletes</li>
              <li><strong>Droit a l'effacement :</strong> demander la suppression de vos donnees</li>
              <li><strong>Droit a la limitation :</strong> demander la limitation du traitement de vos donnees</li>
              <li><strong>Droit a la portabilite :</strong> recevoir vos donnees dans un format structure et lisible</li>
              <li><strong>Droit d'opposition :</strong> vous opposer au traitement de vos donnees</li>
            </ul>
            <p>
              Pour exercer vos droits, contactez-nous a : <strong>contact@venio.paris</strong>
            </p>
            <p>
              Vous pouvez egalement introduire une reclamation aupres de la <strong>CNIL</strong> (Commission Nationale de
              l'Informatique et des Libertes) : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>
            </p>
          </div>

          <div className="legal-section">
            <h2>Modification de cette politique</h2>
            <p>
              Venio se reserve le droit de modifier la presente politique de confidentialite a tout moment.
              La version en vigueur est celle accessible sur le site venio.paris. Derniere mise a jour : mars 2026.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default Confidentialite
