import React from 'react'
import { Link } from 'react-router-dom'
import { serviceOffers } from '../content/serviceOffers'
import './Footer.css'

const Footer = () => {
  return (
    <footer>
      <div className="footer-content">
        <div className="footer-brand">
          <h3>VENIO</h3>
        </div>

        <div className="footer-col">
          <h4>Navigation</h4>
          <Link to="/methode">Méthode</Link>
          <Link to="/realisations">Réalisations</Link>
          <Link to="/a-propos">À propos</Link>
          <Link to="/contact">Contact</Link>
        </div>

        <div className="footer-col">
          <h4>Nos offres</h4>
          {serviceOffers.map((offer) => (
            <Link key={offer.to} to={offer.to}>
              {offer.label}
            </Link>
          ))}
        </div>

        <div className="footer-col">
          <h4>Pôles externes</h4>
          <a href="https://creatio.paris" target="_blank" rel="noopener noreferrer">
            Creatio
          </a>
          <a href="https://decisio.paris" target="_blank" rel="noopener noreferrer">
            Decisio
          </a>
          <a href="https://formatio.paris" target="_blank" rel="noopener noreferrer">
            Formatio
          </a>
        </div>

        <div className="footer-col">
          <h4>Social</h4>
          <a href="https://instagram.com/venio.paris" target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          <a href="mailto:contact@venio.paris">Email</a>
        </div>
      </div>

      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Venio — Lucidité, efficacité, refus du mensonge</p>
        <div className="footer-legal">
          <Link to="/legal">Mentions légales</Link>
          <span> | </span>
          <Link to="/cgu">CGU</Link>
          <span> | </span>
          <Link to="/cgv">CGV</Link>
          <span> | </span>
          <Link to="/confidentialite">Confidentialité</Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer
