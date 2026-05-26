# Guide d'utilisation - Gestion du contenu des projets

## 🎯 Introduction

Ce guide explique comment utiliser le nouveau système de gestion de contenu pour organiser et partager des documents, livrables et informations avec vos clients.

## 📂 Concepts de base

### Sections
Les **sections** sont des conteneurs qui permettent d'organiser le contenu du projet en parties logiques.

**Exemples de sections** :
- "Design et maquettes"
- "Développement"
- "Facturation"
- "Documentation"
- "Livrables finaux"

### Éléments (Items)
Les **éléments** sont les contenus individuels que vous ajoutez dans les sections ou directement au projet.

**Types d'éléments** :
- 📦 **Livrable** : Produits finis, versions, releases
- 💰 **Devis** : Estimations de coût
- 🧾 **Facture** : Documents de facturation
- 📝 **Contrat** : Documents contractuels
- 📋 **Cahier des charges** : Spécifications du projet
- 🎨 **Maquette** : Designs, wireframes, prototypes
- 📚 **Documentation** : Guides, manuels
- 🔗 **Lien** : Liens vers des ressources externes
- 📌 **Note** : Informations textuelles
- 📄 **Autre** : Type personnalisé

## 🚀 Comment utiliser

### 1. Accéder à un projet

1. Connectez-vous à l'interface admin
2. Cliquez sur "Comptes clients"
3. Sélectionnez un client
4. Cliquez sur un projet

### 2. Organiser avec des sections

#### Créer une section

1. Dans l'onglet **"Contenu du projet"**
2. Remplissez le formulaire "Ajouter une section" :
   - **Titre** : Nom de la section (ex: "Design")
   - **Description** : Explication optionnelle
   - **Visible pour le client** : Cochez si le client doit voir cette section
3. Cliquez sur "Créer la section"

#### Gérer les sections

Pour chaque section, vous pouvez :
- **👁️ Masquer/Afficher** : Contrôler la visibilité pour le client
- **🗑️ Supprimer** : Supprimer la section (les éléments restent)

> **Astuce** : Créez une section "Brouillons" que vous gardez masquée pour préparer du contenu avant de le partager.

### 3. Ajouter des éléments

#### Créer un élément

1. Remplissez le formulaire "Ajouter un élément" :
   - **Section** : Choisissez une section ou laissez vide
   - **Type** : Sélectionnez le type d'élément
   - **Titre** : Nom descriptif (ex: "Maquette page d'accueil")
   - **Description** : Détails supplémentaires
   - **Fichier** : Joignez un fichier si nécessaire
   - **Visible** : Cochez pour que le client le voie
   - **Téléchargeable** : Cochez pour autoriser le téléchargement

2. Cliquez sur "Ajouter l'élément"

#### Gérer les éléments

Pour chaque élément, vous pouvez :
- **👁️ Masquer/Afficher** : Contrôler la visibilité
- **📥 Télécharger** : Récupérer le fichier
- **🗑️ Supprimer** : Supprimer l'élément et son fichier

## 💡 Cas d'usage pratiques

### Cas 1 : Projet de site web

```
📁 Section "Design"
  🎨 Maquette : Page d'accueil (visible, téléchargeable)
  🎨 Maquette : Pages internes (visible, téléchargeable)
  📌 Note : Couleurs et typographie (visible)

📁 Section "Développement"
  📦 Livrable : Site en ligne - Version beta (visible, lien)
  📚 Documentation : Guide d'administration (visible, téléchargeable)

📁 Section "Facturation"
  💰 Devis : Devis initial (visible, téléchargeable)
  🧾 Facture : Acompte 50% (visible, téléchargeable)
  🧾 Facture : Solde (masqué jusqu'au paiement)
```

### Cas 2 : Application mobile

```
📁 Section "Conception"
  📋 Cahier des charges : Spécifications v1.0 (visible)
  🎨 Maquette : Wireframes (visible, téléchargeable)

📁 Section "Développement"
  📦 Livrable : APK Android v1.0 (visible, téléchargeable)
  📦 Livrable : IPA iOS v1.0 (visible, téléchargeable)
  📌 Note : Identifiants de test (visible)

📁 Section "Documentation"
  📚 Documentation : Guide utilisateur (visible, téléchargeable)
  📚 Documentation : Guide technique (masqué)
```

### Cas 3 : Identité visuelle

```
📁 Section "Logos"
  📦 Livrable : Logo principal (PNG) (visible, téléchargeable)
  📦 Livrable : Logo principal (SVG) (visible, téléchargeable)
  📦 Livrable : Déclinaisons (visible, téléchargeable)

📁 Section "Charte graphique"
  📚 Documentation : Charte complète.pdf (visible, téléchargeable)
  🎨 Maquette : Exemples d'application (visible, téléchargeable)

📁 Section "Fichiers sources"
  📦 Livrable : Fichiers Illustrator (visible, téléchargeable)
  📦 Livrable : Fichiers Photoshop (visible, téléchargeable)
```

## 🎯 Bonnes pratiques

### Organisation

1. **Créez des sections logiques**
   - Regroupez par phase du projet
   - Ou par type de contenu
   - Gardez une structure simple

2. **Nommage clair**
   - Utilisez des titres descriptifs
   - Ajoutez des numéros de version si pertinent
   - Exemple : "Maquette v2.1 - Page d'accueil"

3. **Descriptions utiles**
   - Expliquez le contenu
   - Indiquez les changements
   - Donnez des instructions si nécessaire

### Visibilité

1. **Contrôle progressif**
   - Créez du contenu masqué
   - Validez en interne
   - Rendez visible quand prêt

2. **Gestion des livrables**
   - Masquez les versions obsolètes
   - Gardez visible uniquement la dernière version
   - Archivez dans une section masquée si besoin

3. **Documents sensibles**
   - Marquez comme "non téléchargeable" si consultation uniquement
   - Ou gardez masqué jusqu'au moment approprié

### Communication

1. **Ajoutez des mises à jour**
   - Utilisez l'onglet "Mises à jour"
   - Informez le client des nouveaux contenus
   - Expliquez les changements importants

2. **Notes explicatives**
   - Utilisez le type "Note" pour des instructions
   - Ajoutez des descriptions détaillées
   - Guidez le client dans l'utilisation

## 🔒 Sécurité et confidentialité

### Contrôle d'accès

- ✅ Seul le client propriétaire voit son projet
- ✅ L'admin contrôle ce qui est visible
- ✅ Les fichiers ne sont accessibles qu'avec authentification

### Fichiers téléchargeables

- ✅ Contrôlez qui peut télécharger
- ✅ Suivez les téléchargements (date)
- ✅ Supprimez les fichiers sensibles après livraison

## 📊 Suivi

### Informations trackées

Pour chaque élément, le système enregistre :
- Date de création
- Date de première visualisation par le client
- Date de téléchargement par le client

> **Note** : Ces informations seront bientôt visibles dans l'interface admin.

## ❓ Questions fréquentes

### Puis-je déplacer un élément d'une section à une autre ?
Oui, modifiez l'élément et changez la section parente.

### Que se passe-t-il si je supprime une section ?
Les éléments de la section deviennent "sans section" mais ne sont pas supprimés.

### Puis-je ajouter plusieurs fichiers à un élément ?
Non, un élément = un fichier. Créez plusieurs éléments ou utilisez une archive ZIP.

### Le client peut-il télécharger un élément masqué ?
Non, les éléments masqués sont complètement invisibles pour le client.

### Puis-je changer la visibilité après création ?
Oui, utilisez le bouton 👁️ pour masquer/afficher à tout moment.

### Quelle est la différence avec l'ancien système de documents ?
L'ancien système reste disponible pour la rétrocompatibilité. Le nouveau système offre plus de flexibilité et de contrôle.

## 🆘 Support

Pour toute question ou problème :
1. Consultez ce guide
2. Vérifiez la documentation technique
3. Contactez le support technique

---

**Dernière mise à jour** : 2 février 2026  
**Version du guide** : 1.0
