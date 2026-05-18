import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import './ClientPortal.css'

interface GuideSection {
  id: string
  title: string
  icon: string
  content: React.ReactNode
}

const ClientGuide: React.FC = () => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const sections: GuideSection[] = [
    {
      id: 'accueil',
      title: 'Accueil / Vue d\'ensemble',
      icon: '🏠',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>La page d'accueil affiche un <strong>tableau de bord</strong> avec un apercu global de vos projets.</li>
          <li>Vous y trouverez le <strong>nombre de projets actifs</strong>, termines et en attente.</li>
          <li>La <strong>progression globale</strong> de chaque projet est visible directement sur les cartes projets (barre de progression).</li>
          <li>Les <strong>dernieres mises a jour</strong> et activites recentes sont affichees pour chaque projet.</li>
          <li>Cliquez sur une carte projet pour acceder a son detail complet.</li>
        </ul>
      )
    },
    {
      id: 'projets',
      title: 'Vos projets',
      icon: '📁',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Chaque projet est organise en <strong>sections</strong> (ex : Design, Developpement, Contenu) contenant des <strong>items</strong> (taches, livrables, etapes).</li>
          <li>Consultez le <strong>detail de chaque item</strong> : description, type, notes de l'equipe, fichiers joints.</li>
          <li>Suivez la <strong>progression en temps reel</strong> via l'onglet Avancement :
            <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Barre de progression globale</li>
              <li>Repartition par statut (a faire, en cours, termine)</li>
              <li>Dates cles et deadlines</li>
            </ul>
          </li>
          <li>L'onglet <strong>Mises a jour</strong> liste l'historique des changements et nouvelles publications.</li>
          <li>Telechargez les <strong>livrables deposes par l'equipe</strong> directement depuis la fiche projet.</li>
          <li>Les statuts possibles d'un projet : <strong>Actif</strong>, <strong>Termine</strong>, <strong>En attente</strong>, <strong>Annule</strong>.</li>
        </ul>
      )
    },
    {
      id: 'messagerie',
      title: 'Messagerie',
      icon: '💬',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Envoyez et recevez des <strong>messages par projet</strong> avec l'equipe Venio.</li>
          <li>Chaque conversation est <strong>liee a un projet specifique</strong> pour garder le contexte.</li>
          <li>Vous pouvez joindre des <strong>pieces jointes</strong> (images, documents, fichiers) a vos messages.</li>
          <li>Les messages sont affiches en <strong>temps reel</strong> — pas besoin de rafraichir la page.</li>
          <li>Utilisez la messagerie pour poser vos questions, faire des retours ou valider des etapes.</li>
        </ul>
      )
    },
    {
      id: 'cloud',
      title: 'Cloud / Documents',
      icon: '☁️',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Accedez a tous vos <strong>documents partages</strong> depuis l'onglet Documents de chaque projet.</li>
          <li>Types de documents disponibles :
            <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li><strong>Contrats</strong> — documents contractuels signes</li>
              <li><strong>Devis</strong> — propositions commerciales</li>
              <li><strong>Factures</strong> — documents de facturation</li>
              <li><strong>Livrables</strong> — fichiers produits par l'equipe (maquettes, exports, code...)</li>
              <li><strong>Briefs</strong> — cahiers des charges, specifications</li>
            </ul>
          </li>
          <li>Telechargez vos fichiers en un clic via le bouton <strong>Telecharger</strong>.</li>
          <li>Les documents sont classes par type pour une navigation rapide.</li>
        </ul>
      )
    },
    {
      id: 'facturation',
      title: 'Facturation',
      icon: '🧾',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Consultez l'ensemble de vos <strong>devis et factures</strong> depuis votre espace client.</li>
          <li>Chaque document affiche : numero, date, montant et statut.</li>
          <li>Telechargez vos documents au <strong>format PDF</strong> pour vos archives.</li>
          <li>Les documents de facturation sont egalement accessibles depuis l'onglet Documents de chaque projet.</li>
        </ul>
      )
    },
    {
      id: 'profil',
      title: 'Profil',
      icon: '👤',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>Accedez a votre profil via le bouton <strong>Mon profil</strong> en haut de page.</li>
          <li>Informations modifiables :
            <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li><strong>Nom et prenom</strong></li>
              <li><strong>Telephone</strong></li>
              <li><strong>Entreprise</strong></li>
              <li><strong>Site web</strong></li>
            </ul>
          </li>
          <li>Vous pouvez <strong>changer votre mot de passe</strong> depuis la section dediee de votre profil.</li>
          <li>Votre adresse e-mail est affichee mais ne peut pas etre modifiee directement. Contactez l'equipe Venio si besoin.</li>
        </ul>
      )
    },
    {
      id: 'securite',
      title: 'Connexion & Securite',
      icon: '🔒',
      content: (
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li><strong>Connexion</strong> : rendez-vous sur la page de connexion de l'espace client et entrez votre e-mail et mot de passe.</li>
          <li><strong>Mot de passe oublie</strong> : cliquez sur le lien "Mot de passe oublie" sur la page de connexion. Un e-mail de reinitialisation vous sera envoye.</li>
          <li><strong>Reinitialisation</strong> : suivez le lien recu par e-mail pour definir un nouveau mot de passe.</li>
          <li><strong>Deconnexion</strong> : utilisez le bouton "Deconnexion" en haut a droite de votre espace.</li>
          <li>Pour toute question de securite, contactez l'equipe Venio.</li>
        </ul>
      )
    }
  ]

  return (
    <div className="portal-container" style={{ paddingTop: 120 }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <Link
          to="/espace-client"
          className="client-project-back"
          style={{ marginBottom: 24, display: 'inline-flex' }}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Retour au tableau de bord
        </Link>

        <h1 style={{
          fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          margin: '24px 0 12px 0',
          lineHeight: 1.2
        }}>
          Guide de l'espace client
        </h1>
        <p style={{
          fontSize: '1.05rem',
          color: 'var(--text-secondary)',
          margin: 0,
          lineHeight: 1.6,
          maxWidth: 700
        }}>
          Retrouvez ici toutes les fonctionnalites de votre espace client Venio. Cliquez sur une section pour en savoir plus.
        </p>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
        {sections.map(section => {
          const isOpen = !!openSections[section.id]
          return (
            <div
              key={section.id}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isOpen ? 'rgba(var(--primary-rgb), 0.35)' : 'var(--border-color)'}`,
                borderRadius: 14,
                overflow: 'hidden',
                transition: 'border-color 0.2s ease'
              }}
            >
              {/* Section header (toggle) */}
              <button
                onClick={() => toggle(section.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '20px 24px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{section.icon}</span>
                <span style={{
                  flex: 1,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em'
                }}>
                  {section.title}
                </span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease',
                    flexShrink: 0
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Section content */}
              {isOpen && (
                <div style={{
                  padding: '0 24px 24px 24px',
                  fontSize: '0.95rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7
                }}>
                  <div style={{
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: 20
                  }}>
                    {section.content}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '32px 24px',
        background: 'rgba(var(--primary-rgb), 0.06)',
        border: '1px solid rgba(var(--primary-rgb), 0.15)',
        borderRadius: 16,
        marginBottom: 48
      }}>
        <p style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0'
        }}>
          Besoin d'aide supplementaire ?
        </p>
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-muted)',
          margin: 0
        }}>
          Contactez l'equipe Venio directement via la messagerie de votre projet ou par e-mail.
        </p>
      </div>
    </div>
  )
}

export default ClientGuide
