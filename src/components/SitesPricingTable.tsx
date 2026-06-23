import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import VenioIcon, { type VenioIconName } from './VenioIcon'
import './SitesPricingTable.css'

interface Tier {
  id: string
  num: string
  name: string
  icon: VenioIconName
  tagline: string
  constructionPrice: string
  monthlyPrice: string
  featured: boolean
  features: { label: string; included: boolean }[]
  webmasteringIncludes: string[]
  ctaLabel: string
  ctaTo: string
}

const TIERS: Tier[] = [
  {
    id: 'vitrine',
    num: '01',
    name: 'Vitrine',
    icon: 'vitrine',
    tagline: "Présence web soignée, jusqu'à 5 pages",
    constructionPrice: 'Sur devis',
    monthlyPrice: 'Sur devis',
    featured: false,
    features: [
      { label: 'Design sur mesure', included: true },
      { label: 'Responsive mobile', included: true },
      { label: 'SEO de base', included: true },
      { label: 'Formulaire de contact', included: true },
      { label: 'Blog / actualités', included: false },
      { label: 'Espace client', included: false },
      { label: 'Paiement en ligne', included: false },
    ],
    webmasteringIncludes: ['Hébergement inclus', 'MAJ contenu', 'Sauvegardes', 'Support'],
    ctaLabel: 'Démarrer',
    ctaTo: '/contact',
  },
  {
    id: 'essentiel',
    num: '02',
    name: 'Essentiel',
    icon: 'essentiel',
    tagline: 'Site complet avec contenu dynamique',
    constructionPrice: 'Sur devis',
    monthlyPrice: 'Sur devis',
    featured: false,
    features: [
      { label: 'Design sur mesure', included: true },
      { label: 'Responsive mobile', included: true },
      { label: 'SEO avancé', included: true },
      { label: 'Blog / actualités', included: true },
      { label: 'Formulaire de contact', included: true },
      { label: 'Espace client', included: false },
      { label: 'Paiement en ligne', included: false },
    ],
    webmasteringIncludes: ['Hébergement inclus', 'MAJ contenu', 'Blog', 'Sauvegardes', 'Support'],
    ctaLabel: 'Démarrer',
    ctaTo: '/contact',
  },
  {
    id: 'business',
    num: '03',
    name: 'Business',
    icon: 'business',
    tagline: 'Site pro avec fonctionnalités métier',
    constructionPrice: 'Sur devis',
    monthlyPrice: 'Sur devis',
    featured: true,
    features: [
      { label: 'Design sur mesure premium', included: true },
      { label: 'Responsive mobile', included: true },
      { label: 'SEO avancé + Analytics', included: true },
      { label: 'Blog / actualités', included: true },
      { label: 'Espace client simple', included: true },
      { label: 'Paiement en ligne', included: true },
      { label: 'Fonctionnalités sur mesure', included: false },
    ],
    webmasteringIncludes: ['Hébergement inclus', 'MAJ illimitées', 'Monitoring', 'Support prioritaire'],
    ctaLabel: 'Démarrer',
    ctaTo: '/contact',
  },
  {
    id: 'ecommerce',
    num: '04',
    name: 'E-commerce',
    icon: 'ecommerce',
    tagline: 'Boutique en ligne scalable',
    constructionPrice: 'Sur devis',
    monthlyPrice: 'Sur devis',
    featured: false,
    features: [
      { label: 'Catalogue produits illimité', included: true },
      { label: 'Paiement multi-moyens', included: true },
      { label: 'Gestion des stocks', included: true },
      { label: 'SEO e-commerce', included: true },
      { label: 'Analytics avancés', included: true },
      { label: 'Espace client complet', included: true },
      { label: 'Fonctionnalités sur mesure', included: false },
    ],
    webmasteringIncludes: ['Hébergement inclus', 'Catalogue & stocks', 'Sécurité paiements', 'Support'],
    ctaLabel: 'Démarrer',
    ctaTo: '/contact',
  },
  {
    id: 'plateforme',
    num: '05',
    name: 'Plateforme',
    icon: 'plateforme',
    tagline: 'Fonctionnalités métier 100% sur mesure',
    constructionPrice: 'Sur devis',
    monthlyPrice: 'Sur devis',
    featured: false,
    features: [
      { label: 'Architecture sur mesure', included: true },
      { label: 'Intégrations API tierces', included: true },
      { label: 'Multi-utilisateurs / rôles', included: true },
      { label: 'Tableaux de bord métier', included: true },
      { label: 'Automatisations', included: true },
      { label: 'SaaS-ready', included: true },
      { label: 'Tout ce dont vous avez besoin', included: true },
    ],
    webmasteringIncludes: ['Hébergement inclus', 'SLA dédié', 'Monitoring 24/7', 'Évolutions incluses'],
    ctaLabel: 'Nous contacter',
    ctaTo: '/contact',
  },
]

const SitesPricingTable: React.FC = () => {
  const [wmActive, setWmActive] = useState(false)

  return (
    <div className="pricing-table">
      {/* Toggle webmastering */}
      <div className="pricing-toggle-wrap">
        <span className={`pricing-toggle-label ${!wmActive ? 'active' : ''}`}>Sans webmastering</span>
        <button
          className={`pricing-toggle ${wmActive ? 'on' : ''}`}
          aria-label="Activer le webmastering"
          aria-pressed={wmActive}
          onClick={() => setWmActive(!wmActive)}
        >
          <span className="pricing-toggle-knob" />
        </button>
        <span className={`pricing-toggle-label ${wmActive ? 'active' : ''}`}>Avec webmastering</span>
        <span className="pricing-toggle-badge">Recommandé</span>
      </div>

      {/* Note webmastering */}
      {wmActive && (
        <p className="pricing-wm-note">
          Le webmastering inclut l&apos;hébergement, les mises à jour, les sauvegardes et le support — votre site reste
          vivant sans que vous ayez à y toucher.
        </p>
      )}

      {/* Grille des paliers */}
      <div className="pricing-grid">
        {TIERS.map((tier) => (
          <div key={tier.id} className={`pricing-card${tier.featured ? ' pricing-card--featured' : ''}`}>
            {tier.featured && <span className="pricing-card__badge">Le plus choisi</span>}

            <VenioIcon name={tier.icon} size={28} className="pricing-card__icon" />
            <div className="pricing-card__tier">Palier {tier.num}</div>
            <div className="pricing-card__name">{tier.name}</div>
            <div className="pricing-card__tagline">{tier.tagline}</div>

            <div className="pricing-card__price-block">
              <div className="pricing-card__price-label">Construction</div>
              <div className="pricing-card__price-main">{tier.constructionPrice}</div>

              {wmActive && (
                <div className="pricing-card__price-monthly">
                  <div className="pricing-card__price-label">Entretien mensuel</div>
                  <div className="pricing-card__price-monthly-val">
                    {tier.monthlyPrice}
                    <span> /mois HT</span>
                  </div>
                </div>
              )}
            </div>

            {wmActive && (
              <div className="pricing-card__wm-block">
                <div className="pricing-card__wm-label">Inclus chaque mois</div>
                <ul className="pricing-card__wm-list">
                  {tier.webmasteringIncludes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="pricing-card__features">
              {tier.features.map((f) => (
                <li key={f.label} className={f.included ? '' : 'excluded'}>
                  <span className="feature-icon">{f.included ? '✓' : '–'}</span>
                  {f.label}
                </li>
              ))}
            </ul>

            <Link to={tier.ctaTo} className="pricing-card__cta">
              {tier.ctaLabel}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SitesPricingTable
