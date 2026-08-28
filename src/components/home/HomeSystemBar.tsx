import { Link } from 'react-router-dom'

/**
 * Bandeau système — bloc 01 de la home « Instrument ».
 * Plaque d'identification de l'appareil : les quatre entrées de la
 * navigation resserrée, et l'état vivant à droite.
 * La marque appartient à la Navbar globale ; la répéter ici ferait doublon.
 * Volontairement non collant : la Navbar est déjà `position: fixed`.
 */

const ENTRIES: { to: string; label: string }[] = [
  { to: '/services/sites', label: 'Sites web' },
  { to: '/realisations', label: 'Réalisations' },
  { to: '/methode', label: 'Méthode' },
  { to: '/contact', label: 'Contact' },
]

const HomeSystemBar = () => (
  <div className="mh-sysbar">
    <div className="mh-container mh-sysbar-in">
      <nav className="mh-sysnav" aria-label="Sections principales">
        {ENTRIES.map((entry) => (
          <Link key={entry.to} className="mh-sysnav-link" to={entry.to}>
            {entry.label}
          </Link>
        ))}
      </nav>

      <span className="mh-sysstate">
        <i className="mh-sysstate-dot" aria-hidden="true" />
        <span className="mh-mono">Paris — studio ouvert</span>
      </span>
    </div>
  </div>
)

export default HomeSystemBar
