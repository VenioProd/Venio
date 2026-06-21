# Design — Page /services/sites

**Date :** 2026-06-21  
**Statut :** Approuvé

---

## Objectif

Nouvelle page dédiée `/services/sites` présentant l'offre de création de sites web de Venio sous forme d'escalier tarifaire à 5 paliers, avec une option webmastering (hébergement + entretien) fortement mise en avant.

---

## Architecture

### Route
- Nouvelle route publique `/services/sites` dans `App.tsx`
- Nouveau composant page `src/pages/ServicesSites.tsx`
- CSS partagé `src/pages/ServicesPage.css` (existant, à étendre si besoin)

### Composants
- `src/components/SitesPricingTable.tsx` — le tableau des 5 paliers + toggle webmastering
- La page `ServicesSites.tsx` compose les sections avec les composants déjà présents : `GradientMeshBackground`, `NeonDivider`, `SEO`, `StructuredData`

---

## Structure de la page

1. **Hero** — titre "SITES WEB" + accroche courte (ton Venio : direct, sans flatterie)
2. **NeonDivider**
3. **Section intro** — pourquoi code propriétaire vs templates (cohérent avec `/services/developpement`)
4. **SitesPricingTable** — les 5 paliers avec toggle webmastering
5. **NeonDivider**
6. **CTA final** — vers `/contact`

---

## SitesPricingTable

### 5 paliers

| # | Nom | Usage |
|---|-----|-------|
| 01 | Vitrine | Présence web, jusqu'à 5 pages |
| 02 | Essentiel | Site complet avec contenu dynamique + blog |
| 03 | Business ⭐ | Site pro + espace client simple + paiement |
| 04 | E-commerce | Boutique scalable, catalogue illimité |
| 05 | Plateforme | Fonctionnalités métier 100% sur mesure — sur devis |

Le palier 03 "Business" est mis en avant (badge "Le plus choisi", bordure cyan, CTA coloré).

### Toggle webmastering

Deux états : **Sans webmastering** (défaut) / **Avec webmastering** (recommandé — badge visible).

**Sans webmastering :** affiche uniquement le prix de construction (one-time).

**Avec webmastering :** affiche en plus :
- Prix mensuel d'entretien
- Bloc webmastering listé par palier (contenu différent selon le palier)
- Hébergement du site **inclus** dans le mensuel (à indiquer clairement)

### Contenu webmastering par palier

| Palier | Inclus dans le mensuel |
|--------|----------------------|
| Vitrine | Hébergement · MAJ contenu · Sauvegardes |
| Essentiel | Hébergement · MAJ contenu · Blog · Sauvegardes · Support |
| Business | Hébergement · MAJ illimitées · Monitoring · Support prioritaire |
| E-commerce | Hébergement · Catalogue · Stocks · Sécurité paiements · Support |
| Plateforme | Hébergement · SLA · Monitoring 24/7 · Évolutions incluses |

### Tarifs
- Les montants réels sont à renseigner (marqués `X €` dans la maquette)
- Palier 05 : toujours "Sur devis" (construction et mensuel)
- Tous les prix HT

---

## SEO / Données structurées
- `<SEO>` avec title "Sites Web Sur Mesure", description axée code propriétaire, mots-clés site web Paris
- `<StructuredData type="service-sites">` à créer (suivre le pattern existant)

---

## Navigation
- Ajouter un lien "Sites web" dans le menu services de `Navbar.tsx`
- Ajouter dans le footer si une section services y est listée

---

## Hors scope
- Configurateur interactif de features (questionnaire dynamique)
- Intégration paiement en ligne depuis cette page
- Contenu i18n multilingue (à faire séparément si besoin)
