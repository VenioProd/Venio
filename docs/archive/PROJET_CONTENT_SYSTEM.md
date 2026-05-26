# Système de Contenu de Projet Enrichi

## 📋 Vue d'ensemble

Le système de gestion de projet a été considérablement enrichi avec un système de sections et d'éléments permettant une organisation structurée et flexible du contenu des projets.

## 🎯 Fonctionnalités principales

### 1. **Sections de projet**
Les sections permettent d'organiser le contenu du projet en parties logiques :
- Titre et description
- Ordre personnalisable
- **Contrôle de visibilité** : l'admin peut masquer/afficher chaque section au client
- Gestion complète (création, modification, suppression)

### 2. **Éléments de projet (Items)**
Chaque élément peut être de différents types avec des propriétés spécifiques :

#### Types d'éléments disponibles :
- 📦 **Livrable** : Produits/résultats du projet
- 💰 **Devis** : Estimations financières
- 🧾 **Facture** : Documents de facturation
- 📝 **Contrat** : Documents contractuels
- 📋 **Cahier des charges** : Spécifications
- 🎨 **Maquette** : Designs et prototypes
- 📚 **Documentation** : Guides et manuels
- 🔗 **Lien** : Liens externes
- 📌 **Note** : Notes et informations
- 📄 **Autre** : Type personnalisé

#### Propriétés des éléments :
- **Titre et description**
- **Fichier attaché** (optionnel)
- **Section parente** (optionnel)
- **Ordre** dans la section
- **Visibilité** : contrôle si le client peut voir l'élément
- **Téléchargeable** : contrôle si le client peut télécharger le fichier
- **Statut** : EN_ATTENTE, EN_COURS, TERMINE, VALIDE
- **Tracking** : dates de visualisation et téléchargement

## 🔐 Contrôle Admin

L'administrateur a un contrôle total sur :

### Visibilité
- ✅ Masquer/afficher des sections entières
- ✅ Masquer/afficher des éléments individuels
- ✅ Contrôler si un fichier est téléchargeable

### Organisation
- ✅ Créer des sections pour structurer le contenu
- ✅ Organiser les éléments par ordre
- ✅ Déplacer des éléments entre sections

### Gestion des fichiers
- ✅ Upload de fichiers pour chaque élément
- ✅ Téléchargement côté admin
- ✅ Suppression de fichiers

## 👤 Expérience Client

Le client voit une interface claire et organisée :

### Navigation par onglets
1. **Contenu du projet** : Sections et éléments organisés
2. **Mises à jour** : Historique des communications
3. **Documents** : Ancien système (rétrocompatibilité)

### Visualisation du contenu
- 📁 Sections avec titre et description
- 📦 Éléments avec icônes par type
- 🏷️ Badges pour identifier rapidement les types
- 📥 Bouton de téléchargement (si autorisé)

### Restrictions
- ❌ Ne voit que les sections/éléments marqués comme visibles
- ❌ Ne peut télécharger que les fichiers marqués comme téléchargeables
- ✅ Interface claire indiquant ce qui est disponible

## 🗂️ Architecture Backend

### Nouveaux modèles

#### ProjectSection
```javascript
{
  project: ObjectId,
  title: String,
  description: String,
  order: Number,
  isVisible: Boolean,
  createdBy: ObjectId,
  timestamps: true
}
```

#### ProjectItem
```javascript
{
  project: ObjectId,
  section: ObjectId (optionnel),
  type: Enum[LIVRABLE, DEVIS, FACTURE, ...],
  title: String,
  description: String,
  file: {
    originalName, storagePath, mimeType, size
  },
  url: String,
  content: String,
  order: Number,
  isVisible: Boolean,
  isDownloadable: Boolean,
  status: Enum[EN_ATTENTE, EN_COURS, TERMINE, VALIDE],
  createdBy: ObjectId,
  viewedAt: Date,
  downloadedAt: Date,
  timestamps: true
}
```

### Routes API

#### Admin
- `GET /api/admin/projects/:projectId/sections` - Liste des sections
- `POST /api/admin/projects/:projectId/sections` - Créer une section
- `PATCH /api/admin/projects/:projectId/sections/:sectionId` - Modifier une section
- `DELETE /api/admin/projects/:projectId/sections/:sectionId` - Supprimer une section
- `GET /api/admin/projects/:projectId/items` - Liste des items
- `POST /api/admin/projects/:projectId/items` - Créer un item (avec upload)
- `PATCH /api/admin/projects/:projectId/items/:itemId` - Modifier un item
- `DELETE /api/admin/projects/:projectId/items/:itemId` - Supprimer un item
- `GET /api/admin/projects/:projectId/items/:itemId/download` - Télécharger un fichier

#### Client
- `GET /api/projects/:projectId/sections` - Sections visibles uniquement
- `GET /api/projects/:projectId/items` - Items visibles uniquement
- `GET /api/projects/:projectId/items/:itemId` - Voir un item (marque comme vu)
- `GET /api/projects/:projectId/items/:itemId/download` - Télécharger (si autorisé)

## 🎨 Interface Admin

### Onglet "Contenu du projet"

#### Formulaire d'ajout de section
- Titre (requis)
- Description (optionnel)
- Visibilité (checkbox)

#### Formulaire d'ajout d'élément
- Section parente (sélection)
- Type d'élément (sélection)
- Titre (requis)
- Description (optionnel)
- Fichier (optionnel)
- Visible (checkbox)
- Téléchargeable (checkbox)

#### Affichage
- Liste des sections avec leurs éléments
- Éléments sans section affichés séparément
- Actions rapides :
  - 👁️ Masquer/Afficher
  - 📥 Télécharger
  - 🗑️ Supprimer

## 📱 Interface Client

### Design épuré et intuitif
- Onglets pour naviguer entre les contenus
- Sections clairement identifiées
- Icônes pour chaque type d'élément
- Badges pour identifier rapidement
- Boutons de téléchargement visibles

### États vides
- Messages clairs quand aucun contenu
- Encourage l'admin à ajouter du contenu

## 🔄 Migration depuis l'ancien système

Le système est **rétrocompatible** :
- L'ancien système de documents reste accessible
- Onglet "Documents (ancien)" dans l'interface admin
- Les clients peuvent toujours accéder aux anciens documents
- Migration progressive possible

## 📊 Cas d'usage

### Exemple 1 : Site web
```
Section "Design"
  - Maquette : Accueil.fig (téléchargeable)
  - Maquette : Pages internes.fig (téléchargeable)
  
Section "Développement"
  - Livrable : Version beta (lien)
  - Documentation : Guide utilisateur.pdf (téléchargeable)
  
Section "Facturation"
  - Devis : Devis-001.pdf (téléchargeable)
  - Facture : Facture-001.pdf (téléchargeable)
```

### Exemple 2 : Application mobile
```
Section "Conception"
  - Cahier des charges : CDC-App.pdf
  - Maquette : Wireframes.pdf
  
Section "Développement"
  - Livrable : APK Android v1.0 (téléchargeable)
  - Livrable : IPA iOS v1.0 (téléchargeable)
  
Section "Documentation"
  - Documentation : Guide technique.pdf
  - Documentation : Guide utilisateur.pdf
```

## 🚀 Avantages

### Pour l'admin
- ✅ Organisation claire du contenu
- ✅ Contrôle total sur la visibilité
- ✅ Flexibilité dans la structure
- ✅ Suivi des téléchargements

### Pour le client
- ✅ Navigation intuitive
- ✅ Accès facile aux documents
- ✅ Vue d'ensemble du projet
- ✅ Téléchargements simples

## 🔮 Évolutions possibles

1. **Notifications** : Alerter le client des nouveaux éléments
2. **Commentaires** : Permettre au client de commenter
3. **Versions** : Gérer plusieurs versions d'un même fichier
4. **Prévisualisation** : Aperçu des fichiers sans téléchargement
5. **Recherche** : Rechercher dans le contenu du projet
6. **Tags** : Système de tags pour filtrer
7. **Historique** : Voir l'historique des modifications

---

**Date** : 2 février 2026  
**Version** : 2.0.0  
**Statut** : ✅ Implémenté et fonctionnel
