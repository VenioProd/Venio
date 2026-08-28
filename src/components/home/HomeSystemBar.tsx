import { Link } from 'react-router-dom'

/**
 * Bandeau système — bloc 01 de la home « Instrument ».
 * Plaque d'identification de l'appareil : la marque, les quatre entrées
 * de la navigation resserrée, et l'état vivant à droite.
 * Volontairement non collant : la Navbar globale est déjà `position: fixed`.
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
      <span className="mh-mark">
        Venio<span className="mh-mark-dot">.</span>
      </span>

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
