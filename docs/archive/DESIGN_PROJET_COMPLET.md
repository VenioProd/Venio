# Design Complet - Gestion de Projets

## Vue d'ensemble

Le système de gestion de projets a été considérablement enrichi avec un design visuel moderne et des fonctionnalités complètes de gestion.

## Nouvelles fonctionnalités

### 1. Informations de base
- **Client** : Sélection du compte client
- **Nom du projet** : Titre principal
- **Résumé** : Description en une phrase
- **Description détaillée** : Texte complet
- **Statut** : En cours / En attente / Terminé
- **Numéro de projet** : Code de référence (ex: PROJ-2026-001)

### 2. Planning & Dates
- **Date de début** : Lancement du projet
- **Fin prévue** : Date de livraison estimée
- **Livraison réelle** : Date effective de livraison
- **Deadlines & Jalons** : Liste de jalons avec libellé et date
- **Date de rappel** : Notification pour suivi

### 3. Gestion & Organisation
- **Priorité** : Basse 🟢 / Normale 🔵 / Haute 🟡 / Urgente 🔴
- **Responsable projet** : Nom du chef de projet
- **Notes internes** : Notes privées (admin uniquement)
- **Tags** : Tags libres pour catégorisation
- **Projet archivé** : Archivage sans suppression

### 4. Types & Modules
- **Types de prestation** : Design, dev, conseil, etc.
- **Types de livrables** : Maquettes, code, documentation, etc.

### 5. Budget & Facturation
- **Budget estimé** : Montant + devise (EUR/USD/CHF) + note
- **Facturation** : Montant facturé + statut (Non facturé/Partiel/Facturé) + référence devis

## Design visuel

### Structure en sections

Chaque page de projet utilise des **sections visuelles distinctes** :

```css
.project-form-section {
  background: linear-gradient(135deg, #1a1a1a 0%, #141414 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 28px;
  position: relative;
  overflow: hidden;
}
```

### Headers de section avec icônes

Chaque section a un header avec :
- **Icône** : Indicateur visuel (📋, 📅, ⚙️, 🎨, 💰)
- **Titre** : Nom de la section
- **Sous-titre** : Description courte

```
┌─────────────────────────────────────┐
│ 📋  Informations de base            │
│     Client, nom et description      │
├─────────────────────────────────────┤
│ [Champs du formulaire]              │
└─────────────────────────────────────┘
```

### Labels avec icônes

Tous les champs ont des labels stylisés :

```css
.project-form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

Exemples :
- 👤 CLIENT
- 📝 NOM DU PROJET
- 🚀 DATE DE DÉBUT
- 💰 BUDGET ESTIMÉ

### Tags améliorés

Les tags ont un design moderne avec gradient et hover :

```css
.admin-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}
```

### Deadline rows

Les lignes de deadline ont un design de carte :

```css
.deadline-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: all 0.2s ease;
}
```

### Badges de priorité

Chaque priorité a sa couleur :

- **Basse** : Gris `#94a3b8`
- **Normale** : Bleu `#60a5fa`
- **Haute** : Jaune `#fbbf24`
- **Urgente** : Rouge `#f87171`

### Submit section sticky

Le bouton de soumission est dans une section sticky en bas :

```css
.project-form-submit {
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent 0%, #0f0f0f 20%, #0f0f0f 100%);
  padding: 24px 0;
  margin-top: 32px;
  z-index: 10;
}
```

## Organisation des sections

### Page "Nouveau projet"

1. **📋 Informations de base**
   - Client, Nom, Résumé, Description, Statut, Numéro

2. **📅 Planning & Dates**
   - Dates (début, fin, livraison)
   - Deadlines & jalons
   - Date de rappel

3. **⚙️ Gestion & Organisation**
   - Priorité
   - Responsable
   - Notes internes
   - Tags
   - Archivage

4. **🎨 Types & Modules**
   - Types de prestation
   - Types de livrables

5. **💰 Budget & Facturation**
   - Budget estimé
   - Facturation

### Page "Détail projet" (onglet Détails)

Même structure que "Nouveau projet" avec les valeurs pré-remplies et éditables.

### Page "Détail projet" (onglet Contenu)

- Création de sections
- Ajout d'éléments (10 types)
- Contrôle de visibilité
- Upload de fichiers

## Filtre d'archivage

### Liste des projets d'un client

Onglets **Actifs** / **Archivés** pour filtrer :
- Par défaut : projets actifs uniquement
- Clic sur "Archivés" : affiche les projets archivés
- Badge "Archivé" sur les projets de la liste archivée

### Dashboard admin

Le compteur "Projets actifs" affiche uniquement les projets non archivés.

## Avantages du nouveau design

### Hiérarchie visuelle claire
- Sections distinctes avec headers
- Icônes pour identification rapide
- Groupement logique des champs

### Meilleure UX
- Labels clairs avec icônes
- Tags visuels et supprimables
- Deadlines en cartes
- Submit button sticky

### Responsive
- Grilles adaptatives
- Sections empilées sur mobile
- Champs qui s'ajustent

### Cohérence
- Même design sur toutes les pages
- Réutilisation des composants
- Palette de couleurs uniforme

## Palette de couleurs

### Sections
- Background : Gradient `#1a1a1a → #141414`
- Bordure : `rgba(255, 255, 255, 0.12)`
- Barre latérale : Gradient blanc vertical

### Icônes de section
- Background : `rgba(255, 255, 255, 0.08)`
- Taille : 40x40px
- Border-radius : 10px

### Tags
- Background : Gradient `rgba(255, 255, 255, 0.12) → 0.08`
- Bordure : `rgba(255, 255, 255, 0.2)`
- Hover : Transform + border plus claire

### Deadline rows
- Background : `rgba(255, 255, 255, 0.03)`
- Bordure : `rgba(255, 255, 255, 0.08)`
- Hover : Background + bordure plus clairs

## Utilisation

### Créer un projet

1. Aller dans Admin > Comptes clients
2. Sélectionner un client
3. Cliquer sur "+ Ajouter un projet"
4. Remplir les sections :
   - Informations de base (obligatoires : client, nom)
   - Planning (optionnel mais recommandé)
   - Gestion (priorité, responsable, tags)
   - Types & Modules (prestations, livrables)
   - Budget & Facturation
5. Cliquer sur "✨ Créer le projet"

### Éditer un projet

1. Ouvrir le détail d'un projet
2. Aller dans l'onglet "Détails"
3. Modifier les champs souhaités
4. Cliquer sur "Enregistrer les modifications"

### Archiver un projet

1. Dans le détail projet, onglet "Détails"
2. Cocher "📦 Projet archivé"
3. Enregistrer
4. Le projet disparaît de la liste "Actifs"
5. Accessible via l'onglet "Archivés"

## Fichiers modifiés

### Backend
- `backend/src/models/Project.js` - Modèle étendu
- `backend/src/routes/admin/projects.js` - Routes avec filtre archived
- `backend/src/routes/admin/users.js` - Route projets avec filtre

### Frontend
- `src/pages/admin/ProjectForm.jsx` - Design complet restructuré
- `src/pages/admin/ProjectDetail.jsx` - Onglet Détails avec tous les champs
- `src/pages/admin/ClientAccountDetail.jsx` - Filtre Actifs/Archivés
- `src/pages/admin/AdminDashboard.jsx` - Compteur projets actifs
- `src/pages/admin/AdminPortal.css` - Nouveaux styles visuels

## Statistiques

- **15 nouveaux champs** dans le modèle Project
- **5 sections visuelles** dans le formulaire
- **10+ icônes** pour les labels
- **3 niveaux de priorité** avec badges colorés
- **Filtre archivage** sur toutes les listes

## Prochaines étapes possibles

1. **Visualisation** : Graphiques de planning (Gantt)
2. **Notifications** : Alertes pour deadlines et rappels
3. **Templates** : Modèles de projets pré-configurés
4. **Export** : PDF ou Excel des détails projet
5. **Historique** : Log des modifications
6. **Statistiques** : Durée moyenne, taux de respect des deadlines

---

**Date** : 2 février 2026  
**Version** : 3.0.0  
**Statut** : ✅ Complété et fonctionnel
