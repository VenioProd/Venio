import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface GuideSection {
  id: string
  icon: string
  title: string
  content: React.ReactNode
}

const Section = ({
  section,
  isOpen,
  toggle,
}: {
  section: GuideSection
  isOpen: boolean
  toggle: () => void
}) => (
  <div
    style={{
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}
  >
    <button
      onClick={toggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '18px 20px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        fontSize: 16,
        fontWeight: 600,
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{section.icon}</span>
      <span style={{ flex: 1 }}>{section.title}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    {isOpen && (
      <div
        style={{
          padding: '0 20px 20px',
          color: 'var(--text-secondary)',
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {section.content}
      </div>
    )}
  </div>
)

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      background: 'rgba(var(--primary-rgb), 0.12)',
      color: 'var(--primary)',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      border: '1px solid rgba(var(--primary-rgb), 0.25)',
    }}
  >
    {children}
  </span>
)

const sections: GuideSection[] = [
  {
    id: 'dashboard',
    icon: '\u{1F4CA}',
    title: '1. Dashboard',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>Vue d'ensemble de l'activite : nombre de projets actifs, clients, taches en cours, chiffre d'affaires</li>
        <li>Graphiques de progression (projets, CA mensuel)</li>
        <li>Taches urgentes et en retard mises en avant</li>
        <li>Derniers leads CRM chauds avec temperature et budget</li>
        <li>Briefs de mission actifs (stagiaires/equipe)</li>
        <li>Alertes CRM : leads inactifs, relances a faire</li>
        <li>Acces rapide aux projets, clients et factures depuis les widgets</li>
      </ul>
    ),
  },
  {
    id: 'clients',
    icon: '\u{1F465}',
    title: '2. Gestion des clients',
    content: (
      <>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Comptes clients
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li><strong>Creer un client</strong> : nom, email, entreprise, telephone, adresse, notes internes</li>
          <li><strong>Modifier / Archiver</strong> : cliquer sur la fiche client pour editer ou archiver le compte</li>
          <li><strong>Fiche client complete</strong> : onglets Contacts, Notes, Facturation, Cloud (fichiers partages), Livrables</li>
          <li><strong>Se connecter en tant que</strong> : bouton <Kbd>Impersonation</Kbd> pour visualiser l'espace client exactement comme le client le voit</li>
          <li><strong>Reinitialisation mot de passe</strong> : genere un lien unique a envoyer au client</li>
          <li>Recherche et filtrage par statut (actif / archive), entreprise, date de creation</li>
        </ul>
        <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
          Acces : <Kbd>/admin/comptes-clients</Kbd>
        </p>
      </>
    ),
  },
  {
    id: 'crm',
    icon: '\u{1F4C8}',
    title: '3. CRM / Pipeline commercial',
    content: (
      <>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Pipeline de vente
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li>
            <strong>Etapes du pipeline</strong> :{' '}
            {['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'].map((s) => (
              <Kbd key={s}>{s}</Kbd>
            )).reduce((acc: React.ReactNode[], el, i) => [...acc, i > 0 ? ' \u2192 ' : '', el], [])}
          </li>
          <li><strong>Drag & drop</strong> : deplacer un lead d'une colonne a l'autre en Kanban</li>
          <li><strong>Conversion automatique</strong> : quand un lead passe en <Kbd>WON</Kbd>, un compte client est cree automatiquement</li>
          <li><strong>Scoring</strong> : score calcule selon budget, temperature, interactions et delai</li>
          <li><strong>Temperature</strong> : froid, tiede, chaud, brulant</li>
          <li><strong>Alertes</strong> : notification quand un lead est inactif depuis X jours</li>
          <li><strong>Assignation round-robin</strong> : repartition automatique des leads entre commerciaux</li>
        </ul>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Parametres CRM
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li>Personnaliser les colonnes du pipeline, les sources, les temperatures</li>
          <li>Configurer le seuil d'inactivite pour les alertes</li>
          <li>Activer/desactiver le round-robin</li>
          <li>Definir les permissions CRM par commercial</li>
        </ul>
        <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
          Acces : <Kbd>/admin/crm</Kbd> | Parametres : <Kbd>/admin/crm/parametres</Kbd>
        </p>
      </>
    ),
  },
  {
    id: 'projects',
    icon: '\u{1F4C1}',
    title: '4. Projets',
    content: (
      <>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li><strong>Creer un projet</strong> : titre, client associe, description, date de debut/fin, budget</li>
          <li><strong>Sections</strong> : organiser le contenu du projet en sections (ex: Maquettes, Dev, Recettage)</li>
          <li><strong>Items de contenu</strong> : ajouter des items dans chaque section (texte, lien, fichier)</li>
          <li><strong>Taches</strong> :
            <ul>
              <li>Creer des taches avec titre, description, priorite (P1/P2/P3), assignation, deadline</li>
              <li>Pieces jointes sur les taches (images, documents)</li>
              <li>Statuts : A faire, En cours, En revue, Termine</li>
              <li>Vue Kanban et vue tableau</li>
            </ul>
          </li>
          <li><strong>Suivi de progression</strong> : barre de progression automatique basee sur les taches terminees</li>
          <li><strong>PDF recapitulatif</strong> : generer un document PDF avec l'etat du projet, les taches et le suivi</li>
          <li>Le client voit son projet dans son espace (sections, livrables, taches)</li>
        </ul>
        <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
          Acces : <Kbd>/admin/projets</Kbd> | Creer : <Kbd>/admin/projets/nouveau</Kbd>
        </p>
      </>
    ),
  },
  {
    id: 'billing',
    icon: '\u{1F4B3}',
    title: '5. Facturation',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Devis</strong> : creer un devis avec lignes de prestation, quantite, prix unitaire</li>
        <li><strong>Factures</strong> : convertir un devis en facture ou creer directement</li>
        <li><strong>Numerotation automatique</strong> : format configurable (ex: FAC-2026-001)</li>
        <li><strong>Calcul TVA</strong> : TVA 20% par defaut, modifiable par ligne</li>
        <li><strong>Statuts</strong> : Brouillon, Envoye, Paye, En retard, Annule</li>
        <li><strong>Export PDF</strong> : telecharger le devis ou la facture en PDF</li>
        <li>Les factures sont visibles par le client dans son espace (onglet Facturation)</li>
      </ul>
    ),
  },
  {
    id: 'tickets',
    icon: '\u{1F3AB}',
    title: '6. Tickets internes',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Types</strong> : Question, Demande, Probleme technique</li>
        <li><strong>Priorites</strong> : Basse, Normale, Haute, Urgente</li>
        <li><strong>Workflow</strong> : Ouvert &rarr; En cours &rarr; Resolu &rarr; Archive</li>
        <li><strong>Reponses</strong> : fil de discussion avec pieces jointes</li>
        <li><strong>Archivage</strong> : archiver les tickets resolus pour garder l'historique</li>
        <li><strong>KPIs</strong> : temps moyen de resolution, tickets par statut, par priorite</li>
        <li>Bouton flottant (FAB) pour creer un ticket rapidement depuis n'importe quelle page</li>
      </ul>
    ),
  },
  {
    id: 'team',
    icon: '\u{1F469}\u200D\u{1F4BB}',
    title: "7. Gestion d'equipe",
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Tableau de gestion</strong> : liste des stagiaires / membres d'equipe avec statut, poste, periode</li>
        <li><strong>Briefs de mission</strong> :
          <ul>
            <li>Creer un brief avec intitule, contexte, objectifs, outils, deadline</li>
            <li>Priorite P1 / P2 / P3</li>
            <li>Suivi du statut : En attente, En cours, Termine</li>
          </ul>
        </li>
        <li><strong>Suivi des outils</strong> : quels outils sont attribues a chaque membre (Figma, Notion, etc.)</li>
        <li><strong>Fiches</strong> : informations de contact, convention, notes internes</li>
        <li>Vue Kanban, Gantt et tableau disponibles</li>
      </ul>
    ),
  },
  {
    id: 'qualiopi',
    icon: '\u2705',
    title: '8. Qualiopi',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Indicateurs qualite</strong> : suivi des 32 indicateurs Qualiopi</li>
        <li>Pour chaque indicateur : statut (conforme / non conforme / en cours), preuves, commentaires</li>
        <li><strong>Questionnaires de satisfaction</strong> :
          <ul>
            <li>Creer et envoyer des questionnaires aux clients/stagiaires</li>
            <li>Reponses collectees et consultables</li>
            <li>Statistiques de satisfaction</li>
          </ul>
        </li>
        <li>Tableau de bord qualite avec taux de conformite global</li>
      </ul>
    ),
  },
  {
    id: 'messaging',
    icon: '\u{1F4AC}',
    title: '9. Messagerie',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Messages par projet</strong> : chaque projet dispose d'un fil de discussion</li>
        <li>Communication directe entre admin et client</li>
        <li>Pieces jointes possibles dans les messages</li>
        <li>Notifications en temps reel (cloche dans la barre de navigation)</li>
        <li>Historique complet conserve dans le projet</li>
        <li>Le client repond depuis son espace client</li>
      </ul>
    ),
  },
  {
    id: 'admins',
    icon: '\u{1F6E1}\uFE0F',
    title: '10. Comptes admin',
    content: (
      <>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Roles disponibles
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li><Kbd>Super Admin</Kbd> : acces total, peut gerer les autres admins et les permissions</li>
          <li><Kbd>Contributeur</Kbd> : acces aux projets, clients, CRM (selon permissions)</li>
          <li><Kbd>RH</Kbd> : acces a la gestion d'equipe, Qualiopi, briefs</li>
          <li><Kbd>Lecture seule</Kbd> : consultation uniquement, aucune modification</li>
        </ul>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Fonctionnalites
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <li><strong>Permissions personnalisees</strong> : pour chaque admin, definir finement les droits (voir clients, editer projets, gerer CRM, etc.)</li>
          <li><strong>Impersonation</strong> : se connecter en tant qu'un autre admin pour diagnostiquer un probleme</li>
          <li><strong>2FA</strong> : authentification a deux facteurs activable par compte</li>
          <li><strong>Journal d'audit</strong> : toutes les actions sont tracees (connexion, modification, suppression)</li>
        </ul>
        <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
          Acces : <Kbd>/admin/comptes-admin</Kbd>
        </p>
      </>
    ),
  },
  {
    id: 'settings',
    icon: '\u2699\uFE0F',
    title: '11. Parametres',
    content: (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li><strong>Profil</strong> : modifier nom, telephone, entreprise, site web</li>
        <li><strong>Mot de passe</strong> : changer le mot de passe (ancien + nouveau + confirmation)</li>
        <li><strong>Theme</strong> : basculer entre mode sombre et mode clair</li>
        <li><strong>Notifications</strong> : configurer les notifications email et in-app (nouveaux messages, taches assignees, leads, tickets)</li>
        <li><strong>Sauvegardes</strong> : exporter les donnees (clients, projets, factures) en format JSON ou CSV</li>
        <li>Les parametres sont propres a chaque compte admin</li>
      </ul>
    ),
  },
]

const AdminGuide = () => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const toggle = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const allOpen = sections.every((s) => openSections[s.id])

  const toggleAll = () => {
    if (allOpen) {
      setOpenSections({})
    } else {
      const all: Record<string, boolean> = {}
      sections.forEach((s) => (all[s.id] = true))
      setOpenSections(all)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Guide d'utilisation</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-primary)' }}>
              Guide d'utilisation — Admin
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
              Toutes les fonctionnalites de l'espace administrateur Venio expliquees section par section.
            </p>
          </div>
          <button
            onClick={toggleAll}
            style={{
              padding: '8px 16px',
              background: 'rgba(var(--primary-rgb), 0.1)',
              border: '1px solid rgba(var(--primary-rgb), 0.3)',
              borderRadius: 8,
              color: 'var(--primary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {allOpen ? 'Tout replier' : 'Tout deplier'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map((section) => (
            <Section
              key={section.id}
              section={section}
              isOpen={!!openSections[section.id]}
              toggle={() => toggle(section.id)}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 32,
            padding: '16px 20px',
            background: 'rgba(var(--primary-rgb), 0.06)',
            border: '1px solid rgba(var(--primary-rgb), 0.2)',
            borderRadius: 10,
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--text-secondary)' }}>Besoin d'aide ?</strong>{' '}
          Utilisez le bouton de ticket flottant en bas a droite pour signaler un probleme ou poser une question
          a l'equipe technique.
        </div>
      </div>
    </div>
  )
}

export default AdminGuide
