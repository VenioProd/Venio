# Services Sites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer la page `/services/sites` avec un tableau comparatif à 5 paliers et un toggle webmastering (hébergement + entretien mensuel inclus quand activé).

**Architecture:** Nouveau composant `SitesPricingTable` encapsulant toute la logique toggle + données, composé dans une nouvelle page `ServicesSites` qui suit le même pattern que les autres pages services (GradientMeshBackground, NeonDivider, SEO, StructuredData). Route ajoutée dans `App.tsx`, lien dans `Footer.tsx` et `StructuredData.tsx`.

**Tech Stack:** React 18, TypeScript, React Router v6, Vitest + Testing Library, CSS partagé `ServicesPage.css`

---

## Fichiers concernés

| Action | Fichier | Rôle |
|--------|---------|------|
| Créer | `src/components/SitesPricingTable.tsx` | Tableau 5 paliers + toggle webmastering |
| Créer | `src/components/SitesPricingTable.css` | Styles du tableau (pricing grid, toggle, cards) |
| Créer | `src/pages/ServicesSites.tsx` | Page complète `/services/sites` |
| Créer | `src/test/servicesSites.test.tsx` | Tests du composant et de la page |
| Modifier | `src/App.tsx` | Ajouter la route `/services/sites` |
| Modifier | `src/components/StructuredData.tsx` | Ajouter le cas `service-sites` |
| Modifier | `src/components/Footer.tsx` | Ajouter le lien "Sites web" dans Navigation |

---

## Task 1 : Tests du composant SitesPricingTable

**Files:**
- Create: `src/test/servicesSites.test.tsx`

- [ ] **Step 1 : Écrire les tests**

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SitesPricingTable from '../components/SitesPricingTable'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('SitesPricingTable', () => {
  it('affiche les 5 noms de paliers', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getByText('Vitrine')).toBeInTheDocument()
    expect(screen.getByText('Essentiel')).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('E-commerce')).toBeInTheDocument()
    expect(screen.getByText('Plateforme')).toBeInTheDocument()
  })

  it('n\'affiche pas le prix mensuel par défaut (sans webmastering)', () => {
    wrap(<SitesPricingTable />)
    expect(screen.queryByText(/mois HT/)).not.toBeInTheDocument()
  })

  it('affiche les prix mensuels après activation du webmastering', () => {
    wrap(<SitesPricingTable />)
    fireEvent.click(screen.getByRole('button', { name: /webmastering/i }))
    expect(screen.getAllByText(/mois HT/).length).toBeGreaterThan(0)
  })

  it('affiche "Hébergement inclus" dans le bloc webmastering après activation', () => {
    wrap(<SitesPricingTable />)
    fireEvent.click(screen.getByRole('button', { name: /webmastering/i }))
    expect(screen.getAllByText(/Hébergement/i).length).toBeGreaterThan(0)
  })

  it('le palier Business porte le badge "Le plus choisi"', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getByText('Le plus choisi')).toBeInTheDocument()
  })

  it('le palier Plateforme affiche "Sur devis" pour la construction', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getAllByText('Sur devis').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
npm run test -- --reporter=verbose src/test/servicesSites.test.tsx
```

Attendu : FAIL — `SitesPricingTable` n'existe pas encore.

- [ ] **Step 3 : Commit du fichier test**

```bash
git add src/test/servicesSites.test.tsx
git commit -m "test(sites): tests composant SitesPricingTable"
```

---

## Task 2 : Composant SitesPricingTable

**Files:**
- Create: `src/components/SitesPricingTable.tsx`
- Create: `src/components/SitesPricingTable.css`

- [ ] **Step 1 : Créer les données des paliers**

Créer `src/components/SitesPricingTable.tsx` :

```tsx
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import './SitesPricingTable.css'

interface Tier {
  id: string
  num: string
  name: string
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
    tagline: 'Présence web soignée, jusqu'à 5 pages',
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
        <span className={`pricing-toggle-label ${!wmActive ? 'active' : ''}`}>
          Sans webmastering
        </span>
        <button
          className={`pricing-toggle ${wmActive ? 'on' : ''}`}
          aria-label="Activer le webmastering"
          aria-pressed={wmActive}
          onClick={() => setWmActive(!wmActive)}
        >
          <span className="pricing-toggle-knob" />
        </button>
        <span className={`pricing-toggle-label ${wmActive ? 'active' : ''}`}>
          Avec webmastering
        </span>
        <span className="pricing-toggle-badge">Recommandé</span>
      </div>

      {/* Note webmastering */}
      {wmActive && (
        <p className="pricing-wm-note">
          Le webmastering inclut l'hébergement, les mises à jour, les sauvegardes et le support — votre site reste vivant sans que vous ayez à y toucher.
        </p>
      )}

      {/* Grille des paliers */}
      <div className="pricing-grid">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`pricing-card${tier.featured ? ' pricing-card--featured' : ''}`}
          >
            {tier.featured && (
              <span className="pricing-card__badge">Le plus choisi</span>
            )}

            <div className="pricing-card__tier">Palier {tier.num}</div>
            <div className="pricing-card__name">{tier.name}</div>
            <div className="pricing-card__tagline">{tier.tagline}</div>

            <div className="pricing-card__price-block">
              <div className="pricing-card__price-label">Construction</div>
              <div className="pricing-card__price-main">
                {tier.constructionPrice}
              </div>

              {wmActive && (
                <div className="pricing-card__price-monthly">
                  <div className="pricing-card__price-label">Entretien mensuel</div>
                  <div className="pricing-card__price-monthly-val">
                    {tier.monthlyPrice}
                    {tier.monthlyPrice !== 'Sur devis' && (
                      <span> /mois HT</span>
                    )}
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
```

- [ ] **Step 2 : Créer le CSS**

Créer `src/components/SitesPricingTable.css` :

```css
/* ── Toggle ─────────────────────────────────────────── */
.pricing-toggle-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.pricing-toggle-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  transition: color 0.2s;
}

.pricing-toggle-label.active {
  color: rgba(255, 255, 255, 0.85);
}

.pricing-toggle {
  position: relative;
  width: 52px;
  height: 28px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
  flex-shrink: 0;
}

.pricing-toggle.on {
  background: rgba(var(--primary-rgb), 0.15);
  border-color: rgba(var(--primary-rgb), 0.4);
}

.pricing-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transition: transform 0.25s, background 0.25s;
  pointer-events: none;
}

.pricing-toggle.on .pricing-toggle-knob {
  transform: translateX(24px);
  background: rgb(var(--primary-rgb));
}

.pricing-toggle-badge {
  background: rgba(var(--primary-rgb), 0.1);
  border: 1px solid rgba(var(--primary-rgb), 0.3);
  color: rgb(var(--primary-rgb));
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 600;
}

/* ── Note webmastering ───────────────────────────────── */
.pricing-wm-note {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 32px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}

/* ── Grille ──────────────────────────────────────────── */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  width: 100%;
}

@media (max-width: 1100px) {
  .pricing-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 700px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Cards ───────────────────────────────────────────── */
.pricing-card {
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 28px 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.pricing-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
}

.pricing-card--featured {
  border-color: rgba(var(--primary-rgb), 0.35);
  background: rgba(var(--primary-rgb), 0.04);
  box-shadow: 0 0 40px rgba(var(--primary-rgb), 0.06);
}

.pricing-card__badge {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  background: rgb(var(--primary-rgb));
  color: #000;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 12px;
  border-radius: 20px;
  white-space: nowrap;
}

.pricing-card__tier {
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.25);
  margin-bottom: 6px;
}

.pricing-card__name {
  font-size: 18px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 4px;
}

.pricing-card__tagline {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
  margin-bottom: 20px;
}

/* ── Prix ────────────────────────────────────────────── */
.pricing-card__price-block {
  margin-bottom: 16px;
}

.pricing-card__price-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 4px;
}

.pricing-card__price-main {
  font-size: 20px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1;
  margin-bottom: 12px;
}

.pricing-card__price-monthly {
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pricing-card__price-monthly-val {
  font-size: 16px;
  font-weight: 600;
  color: rgb(var(--primary-rgb));
}

.pricing-card__price-monthly-val span {
  font-size: 11px;
  font-weight: 400;
  color: rgba(var(--primary-rgb), 0.6);
}

/* ── Bloc webmastering ───────────────────────────────── */
.pricing-card__wm-block {
  background: rgba(var(--primary-rgb), 0.06);
  border: 1px solid rgba(var(--primary-rgb), 0.15);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.pricing-card__wm-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--primary-rgb), 0.7);
  margin-bottom: 6px;
}

.pricing-card__wm-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.pricing-card__wm-list li {
  font-size: 10px;
  color: rgba(var(--primary-rgb), 0.8);
  padding: 2px 0;
  line-height: 1.4;
}

/* ── Features ────────────────────────────────────────── */
.pricing-card__features {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  margin-bottom: 20px;
}

.pricing-card__features li {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.4;
}

.pricing-card__features li:last-child {
  border-bottom: none;
}

.pricing-card__features li.excluded {
  color: rgba(255, 255, 255, 0.2);
}

.feature-icon {
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 1px;
  color: rgb(var(--primary-rgb));
}

.pricing-card__features li.excluded .feature-icon {
  color: rgba(255, 255, 255, 0.15);
}

/* ── CTA ─────────────────────────────────────────────── */
.pricing-card__cta {
  display: block;
  text-align: center;
  padding: 11px 16px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s;
  margin-top: auto;
}

.pricing-card__cta:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.85);
}

.pricing-card--featured .pricing-card__cta {
  background: rgb(var(--primary-rgb));
  border-color: rgb(var(--primary-rgb));
  color: #000;
}

.pricing-card--featured .pricing-card__cta:hover {
  opacity: 0.9;
}
```

- [ ] **Step 3 : Lancer les tests**

```bash
npm run test -- --reporter=verbose src/test/servicesSites.test.tsx
```

Attendu : tous les tests PASS.

- [ ] **Step 4 : Vérifier le typecheck**

```bash
npm run typecheck
```

Attendu : 0 erreurs.

- [ ] **Step 5 : Commit**

```bash
git add src/components/SitesPricingTable.tsx src/components/SitesPricingTable.css
git commit -m "feat(sites): composant SitesPricingTable avec toggle webmastering"
```

---

## Task 3 : Page ServicesSites

**Files:**
- Create: `src/pages/ServicesSites.tsx`

- [ ] **Step 1 : Créer la page**

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import SitesPricingTable from '../components/SitesPricingTable'
import './ServicesPage.css'

const ServicesSites: React.FC = () => {
  return (
    <>
      <SEO
        title="Sites Web Sur Mesure"
        description="Pas de templates. Pas de WordPress. Des sites web construits de zéro, qui tiennent dans le temps — avec ou sans webmastering."
        keywords="site web sur mesure, création site web Paris, site web code propriétaire, webmastering, hébergement site web"
      />
      <StructuredData type="service-sites" />
      <GradientMeshBackground />

      <div className="services-page">
        <section className="services-hero">
          <h1>SITES WEB</h1>
          <p className="services-subtitle">
            Pas de templates.<br />
            Pas de WordPress qui casse dans six mois.
          </p>
        </section>

        <NeonDivider />

        <section className="services-content">
          <div className="services-section">
            <h2>Le problème avec les solutions du marché</h2>
            <p className="section-intro">
              Un template acheté en ligne, c'est conçu pour tout le monde. Donc pour personne.
              Les plugins s'empilent, les mises à jour cassent quelque chose, personne ne comprend
              le code. Et quand vous voulez évoluer, vous devez tout refaire.
            </p>
            <p className="section-intro">
              Venio écrit chaque site de zéro. Architecture pensée pour vos besoins réels,
              code documenté, site qui peut grandir avec vous.
            </p>
          </div>

          <div className="services-section">
            <h2>Choisissez votre point de départ</h2>
            <p className="section-intro">
              Cinq paliers selon l'ambition du projet. Chaque palier peut être complété
              par le webmastering — hébergement, entretien et support inclus, pour que
              votre site reste vivant sans que vous ayez à y toucher.
            </p>

            <SitesPricingTable />
          </div>
        </section>

        <NeonDivider />

        <section className="services-cta-section">
          <h2>Un projet en tête ?</h2>
          <p className="section-intro">
            Parlons-en. Pas de devis automatique, pas de formulaire en 47 étapes.
            Un échange direct pour comprendre ce dont vous avez besoin.
          </p>
          <Link to="/contact" className="services-cta-btn">
            Prendre contact
          </Link>
        </section>
      </div>
    </>
  )
}

export default ServicesSites
```

- [ ] **Step 2 : Ajouter la classe CSS manquante dans ServicesPage.css**

Ouvrir `src/pages/ServicesPage.css` et ajouter à la fin :

```css
/* ── CTA final section (ServicesSites) ──────────────── */
.services-cta-section {
  text-align: center;
  padding: 80px 20px 120px;
  max-width: 700px;
  margin: 0 auto;
}

.services-cta-btn {
  display: inline-block;
  margin-top: 32px;
  padding: 14px 36px;
  border: 1px solid rgba(var(--primary-rgb), 0.5);
  color: rgb(var(--primary-rgb));
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  text-decoration: none;
  border-radius: 4px;
  transition: all 0.2s;
}

.services-cta-btn:hover {
  background: rgba(var(--primary-rgb), 0.1);
  border-color: rgb(var(--primary-rgb));
}
```

- [ ] **Step 3 : Vérifier typecheck**

```bash
npm run typecheck
```

Attendu : 0 erreurs.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/ServicesSites.tsx src/pages/ServicesPage.css
git commit -m "feat(sites): page ServicesSites /services/sites"
```

---

## Task 4 : Route dans App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1 : Ajouter l'import et la route**

Dans `src/App.tsx`, ajouter l'import en haut avec les autres pages :

```tsx
import ServicesSites from './pages/ServicesSites'
```

Puis dans le bloc `<Routes>`, après la route `/services/conseil` :

```tsx
<Route path="/services/sites" element={<ServicesSites />} />
```

- [ ] **Step 2 : Vérifier typecheck**

```bash
npm run typecheck
```

Attendu : 0 erreurs.

- [ ] **Step 3 : Commit**

```bash
git add src/App.tsx
git commit -m "feat(sites): route /services/sites"
```

---

## Task 5 : StructuredData — cas service-sites

**Files:**
- Modify: `src/components/StructuredData.tsx`

- [ ] **Step 1 : Ajouter le case**

Dans `src/components/StructuredData.tsx`, après le `case 'service-conseil':` (ligne ~86), ajouter avant `default:` :

```tsx
case 'service-sites':
  return [
    baseOrganization,
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "serviceType": "Création de Sites Web",
      "provider": baseOrganization,
      "areaServed": "FR",
      "description": "Sites web sur mesure sans templates — vitrine, e-commerce, plateforme métier. Avec ou sans webmastering (hébergement + entretien mensuel inclus)."
    }
  ]
```

- [ ] **Step 2 : Vérifier typecheck**

```bash
npm run typecheck
```

Attendu : 0 erreurs.

- [ ] **Step 3 : Commit**

```bash
git add src/components/StructuredData.tsx
git commit -m "feat(sites): données structurées service-sites"
```

---

## Task 6 : Footer — lien Sites web

**Files:**
- Modify: `src/components/Footer.tsx`

- [ ] **Step 1 : Ajouter le lien**

Dans `src/components/Footer.tsx`, dans la `<div className="footer-col">` Navigation, ajouter le lien `/services/sites` après le lien Services existant :

```tsx
<div className="footer-col">
  <h4>Navigation</h4>
  <Link to="/services/communication">Services</Link>
  <Link to="/services/sites">Sites web</Link>
  <Link to="/realisations">Réalisations</Link>
  <Link to="/a-propos">À propos</Link>
  <Link to="/contact">Contact</Link>
</div>
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/Footer.tsx
git commit -m "feat(sites): lien /services/sites dans le footer"
```

---

## Task 7 : Vérification finale

- [ ] **Step 1 : Lancer tous les tests frontend**

```bash
npm run test
```

Attendu : tous les tests passent, dont les 6 tests de `servicesSites.test.tsx`.

- [ ] **Step 2 : Typecheck complet**

```bash
npm run typecheck
```

Attendu : 0 erreurs.

- [ ] **Step 3 : Lint**

```bash
npm run lint
```

Attendu : 0 erreurs.
