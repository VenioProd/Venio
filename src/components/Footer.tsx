import React from 'react'
import { Link } from 'react-router-dom'
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
          <Link to="/services">Services</Link>
          <Link to="/realisations">Réalisations</Link>
          <Link to="/a-propos">À propos</Link>
          <Link to="/contact">Contact</Link>
        </div>
        
        <div className="footer-col">
          <h4>Pôles externes</h4>
          <a href="https://creatio.paris" target="_blank" rel="noopener noreferrer">Creatio</a>
          <a href="https://decisio.paris" target="_blank" rel="noopener noreferrer">Decisio</a>
          <a href="https://formatio.paris" target="_blank" rel="noopener noreferrer">Formatio</a>
        </div>
        
        <div className="footer-col">
          <h4>Social</h4>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href="mailto:contact@venio.pro">Email</a>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>© 2025 Venio — Lucidité, efficacité, refus du mensonge</p>
        <div className="footer-legal">
          <Link to="/legal">Mentions légales</Link>
          <span> | </span>
          <Link to="/cgu">CGU</Link>
          <span> | </span>
          <Link to="/legal">CGV</Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer

