# Tests du système de contenu de projet

## ✅ Checklist de test

### Backend

#### Modèles
- [x] ProjectSection créé avec tous les champs
- [x] ProjectItem créé avec tous les champs
- [x] Index définis pour les performances

#### Routes Admin - Sections
- [ ] GET /api/admin/projects/:projectId/sections
- [ ] POST /api/admin/projects/:projectId/sections
- [ ] PATCH /api/admin/projects/:projectId/sections/:sectionId
- [ ] DELETE /api/admin/projects/:projectId/sections/:sectionId

#### Routes Admin - Items
- [ ] GET /api/admin/projects/:projectId/items
- [ ] POST /api/admin/projects/:projectId/items (avec fichier)
- [ ] PATCH /api/admin/projects/:projectId/items/:itemId
- [ ] DELETE /api/admin/projects/:projectId/items/:itemId
- [ ] GET /api/admin/projects/:projectId/items/:itemId/download

#### Routes Client
- [ ] GET /api/projects/:projectId/sections (seulement visibles)
- [ ] GET /api/projects/:projectId/items (seulement visibles)
- [ ] GET /api/projects/:projectId/items/:itemId
- [ ] GET /api/projects/:projectId/items/:itemId/download (seulement si downloadable)

### Frontend Admin

#### Page ProjectDetail
- [ ] Onglets fonctionnels (Détails, Contenu, Mises à jour, Documents)
- [ ] Formulaire création de section
- [ ] Formulaire création d'item
- [ ] Upload de fichier
- [ ] Toggle visibilité section
- [ ] Toggle visibilité item
- [ ] Suppression section
- [ ] Suppression item
- [ ] Téléchargement fichier admin
- [ ] Affichage sections avec items
- [ ] Affichage items sans section
- [ ] États vides

### Frontend Client

#### Page ProjectDetail
- [ ] Onglets fonctionnels (Contenu, Mises à jour, Documents)
- [ ] Affichage sections visibles uniquement
- [ ] Affichage items visibles uniquement
- [ ] Icônes par type d'item
- [ ] Badges de type
- [ ] Bouton téléchargement (si autorisé)
- [ ] Téléchargement fichier
- [ ] États vides
- [ ] Breadcrumb navigation

## 🧪 Scénarios de test

### Scénario 1 : Création complète d'un projet

1. **Admin crée un projet**
   - Aller dans Admin > Comptes clients
   - Sélectionner un client
   - Créer un nouveau projet

2. **Admin ajoute des sections**
   - Onglet "Contenu du projet"
   - Créer section "Design" (visible)
   - Créer section "Développement" (visible)
   - Créer section "Brouillons" (masquée)

3. **Admin ajoute des éléments**
   - Dans "Design" : Maquette avec fichier (visible, téléchargeable)
   - Dans "Développement" : Livrable avec fichier (visible, téléchargeable)
   - Dans "Brouillons" : Note (masquée)
   - Sans section : Devis avec fichier (visible, téléchargeable)

4. **Client consulte le projet**
   - Se connecter en tant que client
   - Voir le projet
   - Vérifier que seules 2 sections sont visibles
   - Vérifier que 3 éléments sont visibles
   - Télécharger un fichier

### Scénario 2 : Gestion de la visibilité

1. **Admin masque une section**
   - Cliquer sur "Masquer" pour la section "Design"
   - Vérifier l'icône 👁️

2. **Client vérifie**
   - Rafraîchir la page client
   - Vérifier que la section "Design" n'apparaît plus

3. **Admin rend visible**
   - Cliquer sur "Afficher"
   - Client vérifie que c'est de nouveau visible

### Scénario 3 : Upload et téléchargement

1. **Admin upload un fichier**
   - Créer un item "Livrable"
   - Joindre un fichier PDF
   - Marquer comme visible et téléchargeable

2. **Admin télécharge**
   - Cliquer sur le bouton 📥
   - Vérifier que le fichier se télécharge

3. **Client télécharge**
   - Voir l'item dans le projet
   - Cliquer sur "Télécharger"
   - Vérifier que le fichier se télécharge

4. **Admin désactive le téléchargement**
   - Modifier l'item
   - Décocher "Téléchargeable"
   - Client vérifie que le bouton a disparu

### Scénario 4 : Suppression

1. **Admin supprime un item**
   - Cliquer sur 🗑️
   - Confirmer la suppression
   - Vérifier que l'item disparaît

2. **Admin supprime une section**
   - Cliquer sur 🗑️ sur une section
   - Confirmer
   - Vérifier que les items deviennent "sans section"

## 🐛 Tests de régression

### Ancien système de documents
- [ ] Les anciens documents sont toujours visibles
- [ ] L'upload d'anciens documents fonctionne
- [ ] Le téléchargement d'anciens documents fonctionne

### Mises à jour
- [ ] Les mises à jour s'affichent
- [ ] L'ajout de mise à jour fonctionne
- [ ] Les dates sont correctes

### Détails du projet
- [ ] La modification du projet fonctionne
- [ ] Le changement de statut fonctionne

## 🔒 Tests de sécurité

### Isolation client
- [ ] Un client ne peut pas voir les projets d'un autre client
- [ ] Un client ne peut pas accéder aux items masqués
- [ ] Un client ne peut pas télécharger les fichiers non-téléchargeables

### Authentification
- [ ] Les routes nécessitent une authentification
- [ ] Les routes admin nécessitent le rôle ADMIN
- [ ] Les tokens expirés sont rejetés

## 📊 Tests de performance

### Chargement
- [ ] Le chargement d'un projet avec 50 items est rapide
- [ ] Le chargement des sections est optimisé
- [ ] Les requêtes sont minimales

### Upload
- [ ] L'upload de fichiers volumineux fonctionne
- [ ] La progression est visible
- [ ] Les erreurs sont gérées

## 🎨 Tests UI/UX

### Responsive
- [ ] L'interface admin est responsive
- [ ] L'interface client est responsive
- [ ] Les onglets fonctionnent sur mobile

### Accessibilité
- [ ] Les boutons ont des labels clairs
- [ ] Les formulaires sont accessibles
- [ ] Les erreurs sont visibles

### Design
- [ ] Les icônes sont cohérentes
- [ ] Les badges sont lisibles
- [ ] Les animations sont fluides

## 📝 Résultats attendus

### Backend
- ✅ Toutes les routes répondent correctement
- ✅ Les fichiers sont stockés et récupérables
- ✅ Les permissions sont respectées
- ✅ Les erreurs sont gérées proprement

### Frontend
- ✅ L'interface est intuitive
- ✅ Les actions sont claires
- ✅ Les états de chargement sont visibles
- ✅ Les erreurs sont affichées

### Expérience utilisateur
- ✅ L'admin peut gérer facilement le contenu
- ✅ Le client trouve facilement les documents
- ✅ Le téléchargement est simple
- ✅ La navigation est fluide

---

**Instructions pour tester** :
1. Démarrer le backend : `cd backend && npm run dev`
2. Démarrer le frontend : `npm run dev`
3. Créer un compte admin via bootstrap
4. Créer un compte client
5. Créer un projet
6. Suivre les scénarios ci-dessus

**Rapporter les bugs** :
- Décrire le problème
- Indiquer les étapes pour reproduire
- Joindre des captures d'écran si possible
