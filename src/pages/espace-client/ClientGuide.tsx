import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  FileSignature,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessageSquarePlus,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import './ClientPortal.css'

interface GuideSection {
  id: string
  title: string
  icon: LucideIcon
  intro: string
  content: ReactNode
}

const listStyle = {
  margin: 0,
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
}

const subListStyle = {
  margin: '6px 0 0',
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
}

const SECTIONS: GuideSection[] = [
  {
    id: 'tableau-de-bord',
    title: 'Votre tableau de bord',
    icon: LayoutDashboard,
    intro: 'Ce qui vous attend, en un coup d’œil.',
    content: (
      <ul style={listStyle}>
        <li>
          En haut de la page d’accueil, le bloc <strong>« À faire »</strong> rassemble tout ce qui attend une action de
          votre part : devis à signer, étape à valider, demande livrée à confirmer, facture à régler.
        </li>
        <li>Si ce bloc est vide, vous n’avez rien à faire : la balle est dans notre camp.</li>
        <li>
          En dessous, chaque projet apparaît sous forme de carte avec son statut, sa progression et l’étape en cours.
        </li>
      </ul>
    ),
  },
  {
    id: 'projets',
    title: 'Vos projets',
    icon: FolderKanban,
    intro: 'Le détail d’un projet, organisé en onglets.',
    content: (
      <ul style={listStyle}>
        <li>
          <strong>Contenu</strong> — les livrables et documents publiés par l’équipe, regroupés par section.
        </li>
        <li>
          <strong>Actualités</strong> — le fil des nouvelles publiées au fur et à mesure de l’avancement.
        </li>
        <li>
          <strong>Étapes</strong> — la progression détaillée du projet et vos validations (voir la section suivante).
        </li>
        <li>
          <strong>Documents</strong> — les fichiers propres à ce projet.
        </li>
        <li>
          <strong>Messages</strong> — la conversation avec l’équipe sur ce projet.
        </li>
        <li>
          <strong>Collaborateurs</strong> — les personnes de votre côté qui ont accès au projet.
        </li>
      </ul>
    ),
  },
  {
    id: 'etapes',
    title: 'Les étapes et vos validations',
    icon: ListChecks,
    intro: 'Suivre la fabrication, et donner votre feu vert au bon moment.',
    content: (
      <ul style={listStyle}>
        <li>
          Chaque projet est découpé en étapes successives — par exemple cadrage, maquettes, développement, recette, mise
          en ligne. Vous voyez à tout moment où en est la fabrication.
        </li>
        <li>
          Une étape peut être :
          <ul style={subListStyle}>
            <li>
              <strong>À venir</strong> — pas encore commencée ;
            </li>
            <li>
              <strong>En cours</strong> — l’équipe y travaille ;
            </li>
            <li>
              <strong>En attente de votre validation</strong> — c’est à vous de jouer ;
            </li>
            <li>
              <strong>Terminée</strong> — validée, la suite est lancée.
            </li>
          </ul>
        </li>
        <li>
          Quand une étape attend votre validation, elle affiche les livrables concernés. Après les avoir consultés, deux
          choix s’offrent à vous :
          <ul style={subListStyle}>
            <li>
              <strong>Valider cette étape</strong> — vous donnez votre accord et l’équipe enchaîne sur la suite ;
            </li>
            <li>
              <strong>Demander des retouches</strong> — vous expliquez ce qui doit changer, l’étape repart chez nous.
            </li>
          </ul>
        </li>
        <li>
          Votre validation est <strong>enregistrée avec votre nom, la date et l’heure</strong>. Elle sert de référence
          commune : chacun sait ce qui a été approuvé, et quand.
        </li>
        <li>
          Tant que vous n’avez pas validé, <strong>l’étape suivante ne démarre pas</strong>. Rien n’avance sans votre
          accord, et vous ne découvrez jamais un travail engagé sur une base que vous n’aviez pas approuvée.
        </li>
      </ul>
    ),
  },
  {
    id: 'demandes',
    title: 'Vos demandes',
    icon: MessageSquarePlus,
    intro: 'Demander un changement ou une évolution, et suivre son traitement.',
    content: (
      <ul style={listStyle}>
        <li>
          Depuis <strong>Demandes</strong>, décrivez ce que vous souhaitez modifier ou ajouter. Vous pouvez préciser la
          page concernée, joindre des fichiers ou des captures, et indiquer l’urgence.
        </li>
        <li>Une demande peut être rattachée à un projet en cours, ou exister seule — utile pour un site déjà livré.</li>
        <li>
          Chaque demande suit un parcours visible sur sa fiche :
          <ul style={subListStyle}>
            <li>
              <strong>Soumise</strong> — nous l’avons reçue et nous l’étudions ;
            </li>
            <li>
              <strong>Qualifiée</strong> — nous vous disons si elle est comprise dans votre accompagnement, si elle
              nécessite un devis, ou pourquoi nous ne pouvons pas la retenir ;
            </li>
            <li>
              <strong>Planifiée</strong>, puis <strong>en cours</strong> — le travail est programmé, puis engagé ;
            </li>
            <li>
              <strong>Livrée</strong> — à vous de vérifier et de confirmer ;
            </li>
            <li>
              <strong>Validée</strong> — la demande est close.
            </li>
          </ul>
        </li>
        <li>
          Si la demande nécessite un devis, celui-ci est <strong>rattaché à la demande</strong> : dès que vous le
          signez, le travail est automatiquement programmé, sans autre démarche de votre part.
        </li>
        <li>Un fil de discussion accompagne chaque demande : posez vos questions, nous répondons au même endroit.</li>
      </ul>
    ),
  },
  {
    id: 'devis',
    title: 'Devis, signature et factures',
    icon: FileSignature,
    intro: 'Lire une proposition, la signer en ligne, retrouver vos factures.',
    content: (
      <ul style={listStyle}>
        <li>
          Une proposition vous est présentée poste par poste, avec les éléments obligatoires et les options que vous
          pouvez retenir ou écarter. Le montant se met à jour selon vos choix.
        </li>
        <li>
          La <strong>signature se fait en ligne</strong>, dans votre espace. Elle est horodatée et conservée avec le
          document signé.
        </li>
        <li>Une fois signé, le devis devient consultable et téléchargeable à tout moment, comme vos factures.</li>
      </ul>
    ),
  },
  {
    id: 'documents',
    title: 'Mes documents',
    icon: FileText,
    intro: 'Tous vos documents au même endroit, tous projets confondus.',
    content: (
      <ul style={listStyle}>
        <li>
          <strong>Mes documents</strong> rassemble vos contrats, devis signés, factures et livrables téléchargeables,
          sans avoir à ouvrir chaque projet.
        </li>
        <li>Filtrez par type ou par projet, ou cherchez un document par son nom.</li>
        <li>Chaque document se télécharge en un clic, pour vos archives ou votre comptabilité.</li>
      </ul>
    ),
  },
  {
    id: 'fichiers',
    title: 'Vos fichiers',
    icon: UploadCloud,
    intro: 'Nous transmettre vos contenus, sans passer par l’e-mail.',
    content: (
      <ul style={listStyle}>
        <li>
          <strong>Vos fichiers</strong> est l’espace où vous déposez ce dont nous avons besoin : logos, photos, textes,
          documents de référence.
        </li>
        <li>Vous pouvez rattacher un fichier à un projet précis, ou le déposer sans rattachement.</li>
        <li>
          L’équipe est prévenue automatiquement à chaque dépôt : plus de pièce jointe perdue dans une conversation.
        </li>
      </ul>
    ),
  },
  {
    id: 'messages',
    title: 'Messages et collaborateurs',
    icon: MessageSquare,
    intro: 'Échanger avec l’équipe, et associer vos collègues.',
    content: (
      <ul style={listStyle}>
        <li>
          La messagerie est <strong>rattachée à chaque projet</strong>, ce qui garde le contexte : on sait toujours de
          quoi on parle.
        </li>
        <li>Vous pouvez joindre des fichiers à vos messages, et les réponses arrivent en temps réel.</li>
        <li>
          Depuis l’onglet <strong>Collaborateurs</strong>, invitez vos collègues sur un projet et choisissez s’ils
          peuvent seulement consulter ou aussi intervenir.
        </li>
      </ul>
    ),
  },
  {
    id: 'compte',
    title: 'Votre compte et votre sécurité',
    icon: ShieldCheck,
    intro: 'Vos informations, votre mot de passe, votre connexion.',
    content: (
      <ul style={listStyle}>
        <li>
          Depuis <strong>Profil</strong>, modifiez votre nom, votre téléphone, votre entreprise et votre site web.
        </li>
        <li>Vous pouvez changer votre mot de passe à tout moment depuis cette même page.</li>
        <li>
          Votre adresse e-mail sert d’identifiant de connexion et n’est pas modifiable directement : écrivez-nous si
          elle doit changer.
        </li>
        <li>
          Mot de passe oublié ? Utilisez le lien prévu sur la page de connexion : vous recevrez un e-mail pour en
          définir un nouveau.
        </li>
      </ul>
    ),
  },
]

const STARTER_STEPS = [
  {
    num: '01',
    title: 'Ouvrez votre projet',
    text: 'Depuis « Mes projets », cliquez sur la carte de votre projet, puis sur l’onglet Étapes pour voir où en est la fabrication.',
  },
  {
    num: '02',
    title: 'Répondez à ce qui vous attend',
    text: 'Le bloc « À faire » de l’accueil liste les validations, signatures et confirmations en attente. C’est votre point de départ à chaque visite.',
  },
  {
    num: '03',
    title: 'Demandez, déposez, échangez',
    text: 'Une évolution à demander ? Passez par « Demandes ». Des contenus à nous transmettre ? Par « Vos fichiers ». Une question ? Par la messagerie du projet.',
  },
]

const ClientGuide = () => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ etapes: true })

  const toggle = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="portal-container" style={{ paddingTop: 120 }}>
      <div style={{ marginBottom: 40 }}>
        <Link to="/espace-client" className="client-project-back" style={{ marginBottom: 24, display: 'inline-flex' }}>
          <ArrowLeft size={16} aria-hidden />
          Retour au tableau de bord
        </Link>

        <h1
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            margin: '24px 0 12px 0',
            lineHeight: 1.2,
          }}
        >
          Guide de votre espace client
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 700,
          }}
        >
          Votre espace vous permet de suivre l’avancement de vos projets, de valider ce qui doit l’être, de nous
          adresser vos demandes et de retrouver tous vos documents. Voici comment il fonctionne.
        </p>
      </div>

      <section
        style={{
          border: '1px solid rgba(var(--primary-rgb), 0.3)',
          background: 'rgba(var(--primary-rgb), 0.06)',
          padding: '24px 24px 8px',
          marginBottom: 32,
        }}
      >
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--primary-light)',
          }}
        >
          Pour bien démarrer
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 20,
            marginTop: 18,
          }}
        >
          {STARTER_STEPS.map((step) => (
            <div key={step.num} style={{ paddingBottom: 16 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  color: 'var(--primary)',
                  marginBottom: 6,
                }}
              >
                {step.num}
              </span>
              <strong
                style={{
                  display: 'block',
                  fontSize: '0.95rem',
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
                {step.title}
              </strong>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.text}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
        {SECTIONS.map((section) => {
          const isOpen = !!openSections[section.id]
          const Icon = section.icon
          return (
            <div
              key={section.id}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isOpen ? 'rgba(var(--primary-rgb), 0.35)' : 'var(--border-color)'}`,
                transition: 'border-color 0.2s ease',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen}
                aria-controls={`guide-${section.id}`}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '20px 24px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <Icon size={20} color="var(--primary)" style={{ flexShrink: 0 }} aria-hidden />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {section.title}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {section.intro}
                  </span>
                </span>
                <ChevronDown
                  size={20}
                  color="var(--text-muted)"
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease',
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div
                  id={`guide-${section.id}`}
                  style={{
                    padding: '0 24px 24px 24px',
                    fontSize: '0.95rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                  }}
                >
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>{section.content}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px',
          background: 'rgba(var(--primary-rgb), 0.06)',
          border: '1px solid rgba(var(--primary-rgb), 0.15)',
          marginBottom: 48,
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
          Une question qui n’est pas traitée ici ?
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
          Écrivez-nous depuis la messagerie de votre projet : c’est le plus rapide, et l’échange reste rattaché au bon
          dossier.
        </p>
      </div>
    </div>
  )
}

export default ClientGuide
