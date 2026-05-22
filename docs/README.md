# Venio — Plateforme métier

Venio est une plateforme métier complète : site public, espace client, back-office admin, API backend, messagerie temps réel et API agent. Développée avec React 18 + Vite 5 (frontend) et Express 5 + MongoDB (backend).

## 📚 Documentation (dossier `docs/`)

| Dossier / Fichier | Contenu |
|--------|--------|
| [admin/](./admin/) | Design et contenu de l’interface admin |
| [accounting/](./accounting/) | API d’ingestion comptable (Arrow/HMAC), FEC, TVA |
| [architecture/](./architecture/) | Conventions d’API, contrats frontend/backend |
| [deploiement/](./deploiement/) | Guides déploiement VPS/IONOS, config, debug |
| [design/](./design/) | Arrière-plans, gradients, changements visuels |
| [operations/](./operations/) | Runbook — exploitation, incidents, cleanup |
| [optimisation/](./optimisation/) | Performance GPU, SEO, bundles, résumés |
| [projet/](./projet/) | Système de contenu projet, tests, README projet |
| [api-agent.md](./api-agent.md) | API agent Bearer — scopes, idempotency, endpoints |

## 📋 Démarrage rapide

### Pour développer localement
```bash
npm install    # Installer les dépendances
npm run dev    # Lancer le serveur (localhost:5501)
```

### Pour déployer sur IONOS (venio.pro)

**Option 1 : Déploiement automatique (recommandé) 🤖**
```bash
git add .
git commit -m "Description des modifications"
git push origin main
# Le site se déploie automatiquement en 2-5 minutes !
```

👉 **📖 Guide déploiement automatique : [DEPLOY_AUTOMATIQUE.md](./deploiement/DEPLOY_AUTOMATIQUE.md)** (configuration une seule fois, puis automatique)

**Option 2 : Déploiement manuel via FTP**
```bash
npm run deploy:ionos   # Build + vérification + instructions
# Puis uploader le contenu de dist/ via FTP sur IONOS
```

👉 **📖 Guide déploiement manuel : [DEPLOY_IONOS.md](./deploiement/DEPLOY_IONOS.md)** (instructions détaillées étape par étape)
👉 **Voir aussi la section [🌐 Déploiement en ligne](#-déploiement-en-ligne) pour plus de détails techniques**

## 🚀 Installation

```bash
# Installer les dépendances
npm install
```

## 💻 Développement

```bash
# Lancer le serveur de développement
npm run dev
```

Le site sera accessible sur `http://localhost:5501`

Le serveur est configuré pour être accessible depuis d'autres appareils sur le réseau local (`host: '0.0.0.0'`).

## 🏗️ Build

```bash
# Créer une version de production (standard)
npm run build

# Créer une version de production avec configuration IONOS
# Génère automatiquement le fichier .htaccess dans dist/
npm run build:ionos

# Prévisualiser la version de production localement
npm run preview
```

**Différence entre les commandes** :
- `npm run build` : Build standard, génère aussi le `.htaccess` (via `postbuild`)
- `npm run build:ionos` : Build optimisé pour IONOS avec génération explicite du `.htaccess`
- Les deux commandes produisent le même résultat dans le dossier `dist/`

**Contenu généré dans `dist/`** :
- `index.html` - Point d'entrée de l'application
- `assets/` - Fichiers JavaScript et CSS optimisés et minifiés
- `fonts/` - Polices Cabinet Grotesk (copiées depuis `public/fonts/`)
- `realisations/` - Images des réalisations (copiées depuis `public/realisations/`)
- `.htaccess` - Configuration Apache pour React Router (généré automatiquement)

## 📁 Structure du projet

L'application est intégralement écrite en TypeScript (`.ts` / `.tsx`).

```
venio/
├── src/                        # Frontend React + Vite
│   ├── components/             # Composants React (site public, admin, dashboard)
│   ├── pages/                  # Pages : site public, /admin/*, /espace-client/*
│   ├── context/                # Auth, I18n, Theme, Messaging, Notifications, Toast
│   ├── hooks/                  # Hooks réutilisables (useConfirm, useTabState, ...)
│   ├── services/               # Services métier (accounting, adminTasks, messaging, ...)
│   ├── lib/                    # api.ts (apiFetch/apiUpload/apiDownload), permissions, utils
│   ├── types/                  # Types partagés (auth, crm, projects, ...)
│   ├── styles/                 # Styles globaux et tokens de thème
│   ├── i18n/                   # Traductions
│   ├── App.tsx                 # Routing principal (React Router 7)
│   └── main.tsx                # Point d'entrée
├── backend/                    # API Express 5 + MongoDB (Mongoose)
│   ├── src/                    # Routes, middlewares, services, modèles
│   ├── uploads/                # Fichiers uploadés (servis via routes Express)
│   └── package.json            # Scripts backend (dev/build/test/seed/cleanup)
├── public/                     # Assets statiques publics (fonts, images)
├── scripts/                    # create-htaccess, generate-sitemap, prepare-deploy
├── docs/                       # Documentation (cf. table ci-dessus)
├── docker-compose.prod.yml     # Stack prod (frontend nginx + backend node)
├── vite.config.ts              # Configuration Vite (proxy /api, manualChunks)
├── tsconfig.json               # Configuration TypeScript
└── package.json                # Scripts racine (dev/build/test/test:all)
```

## 🛣️ Routes

Le site utilise React Router 7. Trois espaces cohabitent dans la même app :

**Site public**
- `/`, `/services/communication`, `/services/developpement`, `/services/conseil`
- `/poles`, `/realisations`, `/a-propos`, `/contact`
- `/legal`, `/cgu`, `/cgv`, `/confidentialite`

**Espace client** (`/espace-client/*`)
- Login, dashboard, projets, profil, etc. — protégé par `AuthContext` (rôle `CLIENT`)

**Back-office admin** (`/admin/*`)
- Login, dashboard, CRM, projets internes, comptabilité, tickets, ressources, Qualiopi,
  rapports de stage, gestion de tâches, dev-workspace, espace pédagogique, etc.
- Chaque route sensible est encadrée par `<RequirePermission permission={PERMISSIONS.X}>`
  et le backend re-vérifie la permission côté API.

## 🎨 Design

Le design utilise :
- Palette sombre avec accents violets/purple
- Style neumorphism soft
- Cartes arrondies avec effets hover
- Typographie **Cabinet Grotesk** (polices personnalisées)
- Glassmorphism sur la navigation
- Animations subtiles
- Arrière-plans animés (Vanta.js, animations CSS)
- Overlays décoratifs (points, grille, grain)

## 🌐 Déploiement en ligne

Votre site est connecté à GitHub (`https://github.com/raphaelbentv/Venio.git`). Voici comment le publier en ligne :

### Option 1 : IONOS (Hébergement avec domaine venio.pro) ⭐ Recommandé

Cette option permet de déployer le site sur votre propre domaine `venio.pro` hébergé chez IONOS France.

#### Prérequis
- ✅ Compte IONOS avec hébergement web activé
- ✅ Domaine `venio.pro` configuré chez IONOS
- ✅ Identifiants FTP/SFTP IONOS (disponibles dans l'espace client)
- ✅ Client FTP installé (FileZilla, Cyberduck, Transmit, etc.)

#### Étapes de déploiement

1. **Build du projet avec configuration IONOS** :
   ```bash
   npm run build:ionos
   ```
   Cette commande :
   - Crée la version optimisée dans `dist/`
   - Génère automatiquement le fichier `.htaccess` nécessaire pour React Router

2. **Récupérer vos identifiants IONOS** :
   - Connectez-vous à votre espace client IONOS
   - Allez dans "Hébergement" → "FTP"
   - Notez :
     - Serveur FTP (ex: `ftp.venio.pro` ou l'IP fournie)
     - Identifiant FTP
     - Mot de passe FTP
     - Répertoire web (généralement `/httpdocs/` ou `/www/`)

3. **Uploader les fichiers via FTP** :
   
   **Avec FileZilla (recommandé)** :
   - Téléchargez [FileZilla](https://filezilla-project.org/) (gratuit)
   - Ouvrez FileZilla → Fichier → Gestionnaire de sites
   - Créez un nouveau site avec vos identifiants IONOS
   - Connectez-vous
   - Dans le panneau de droite (serveur distant), naviguez vers `/httpdocs/` ou `/www/`
   - Dans le panneau de gauche (local), naviguez vers votre dossier `dist/`
   - **Important** : Activez l'affichage des fichiers cachés (Affichage → Afficher les fichiers cachés)
   - Sélectionnez TOUS les fichiers et dossiers de `dist/` :
     - `index.html`
     - Dossier `assets/` (et son contenu)
     - Dossier `fonts/` (et son contenu)
     - Dossier `realisations/` (et son contenu)
     - Fichier `.htaccess` ⚠️ **CRUCIAL** : ce fichier doit être uploadé !
   - Glissez-déposez ou faites un clic droit → Uploader
   - **Supprimez** d'abord tout le contenu existant dans `/httpdocs/` si nécessaire
   
   **Structure attendue sur le serveur** :
   ```
   /httpdocs/
   ├── index.html
   ├── .htaccess          ← Important pour React Router !
   ├── assets/
   │   ├── index-xxxxx.js
   │   └── index-xxxxx.css
   ├── fonts/
   │   └── [tous les fichiers .woff et .woff2]
   └── realisations/
       └── [toutes les images .jpg]
   ```

4. **Vérifier le DNS** :
   - Dans votre espace IONOS, vérifiez que le domaine `venio.pro` pointe vers votre hébergement
   - Type A ou CNAME doit être configuré correctement

5. **Activer HTTPS/SSL** :
   - Dans l'espace client IONOS, activez le certificat SSL pour `venio.pro`
   - IONOS propose généralement Let's Encrypt gratuitement

6. **Tester** :
   - Attendez quelques minutes (propagation DNS)
   - Visitez `https://venio.pro`
   - Testez toutes les routes : `/realisations`, `/contact`, `/a-propos`, etc.

#### Mettre à jour le site après modifications

1. **Modifier localement** :
   ```bash
   # Faites vos modifications dans votre éditeur
   npm run dev  # Pour tester en local
   ```

2. **Rebuild** :
   ```bash
   npm run build:ionos
   ```

3. **Uploader les nouveaux fichiers** :
   - Connectez-vous en FTP
   - Remplacez les fichiers modifiés dans le répertoire web
   - Ou supprimez tout et re-uploader le contenu de `dist/`

4. **Vider le cache** :
   - Appuyez sur `Ctrl+F5` (ou `Cmd+Shift+R` sur Mac) dans votre navigateur
   - Ou attendez quelques minutes

#### Fichiers générés automatiquement

Le script `scripts/create-htaccess.js` génère automatiquement un fichier `.htaccess` dans le dossier `dist/` avec :

- ✅ **Configuration React Router** : Redirige toutes les routes vers `index.html` pour que le routing côté client fonctionne
- ✅ **Compression Gzip** : Réduit la taille des fichiers HTML, CSS, JS et JSON
- ✅ **Cache des fichiers statiques** : Optimise le chargement des images, polices et assets
- ✅ **En-têtes de sécurité** : Protège contre certaines vulnérabilités web

**Contenu du `.htaccess` généré** :
```apache
# Redirection React Router
# Compression Gzip
# Cache des fichiers statiques
# En-têtes de sécurité (X-Content-Type-Options, X-Frame-Options, etc.)
```

Ce fichier est **essentiel** pour que votre site fonctionne correctement avec React Router sur IONOS.

#### Dépannage IONOS

**❌ Les routes ne fonctionnent pas (404 sur `/realisations`, `/contact`, etc.)** :
- ✅ Vérifiez que le fichier `.htaccess` est bien uploadé dans `/httpdocs/`
- ✅ Vérifiez que vous avez activé l'affichage des fichiers cachés dans votre client FTP
- ✅ Vérifiez que `mod_rewrite` est activé sur votre serveur IONOS
  - Contactez le support IONOS si nécessaire : ils peuvent l'activer pour vous
- ✅ Vérifiez que le fichier `.htaccess` n'est pas vide (doit contenir au moins les règles RewriteEngine)

**❌ Les fichiers ne se chargent pas (polices, images, CSS)** :
- ✅ Vérifiez que tous les dossiers sont bien uploadés : `assets/`, `fonts/`, `realisations/`
- ✅ Vérifiez que les dossiers contiennent bien leurs fichiers (pas seulement des dossiers vides)
- ✅ Vérifiez les permissions des fichiers :
  - Dossiers : 755 (rwxr-xr-x)
  - Fichiers : 644 (rw-r--r--)
- ✅ Vérifiez les chemins dans la console du navigateur (F12) pour voir les erreurs 404

**❌ HTTPS ne fonctionne pas** :
- ✅ Activez le certificat SSL dans votre espace client IONOS
  - Allez dans "Domaines" → "SSL" → Activez Let's Encrypt (gratuit)
- ✅ Attendez la validation (peut prendre quelques heures à 24h)
- ✅ Vérifiez que votre domaine pointe bien vers IONOS dans les DNS

**❌ Le site affiche une page blanche** :
- ✅ Vérifiez la console du navigateur (F12) pour les erreurs JavaScript
- ✅ Vérifiez que `index.html` est bien à la racine de `/httpdocs/`
- ✅ Vérifiez que les fichiers dans `assets/` sont bien accessibles

**❌ Les modifications ne s'affichent pas après upload** :
- ✅ Videz le cache du navigateur : `Ctrl+F5` (Windows) ou `Cmd+Shift+R` (Mac)
- ✅ Vérifiez que vous avez bien uploadé les nouveaux fichiers
- ✅ Attendez quelques minutes (cache du serveur)

### Option 2 : Vercel (Alternative - Gratuit et simple)

1. **Créer un compte Vercel** : Allez sur [vercel.com](https://vercel.com) et connectez-vous avec votre compte GitHub

2. **Importer le projet** :
   - Cliquez sur "Add New Project"
   - Sélectionnez votre dépôt `sitePersoReact`
   - Vercel détectera automatiquement que c'est un projet Vite

3. **Configuration** (généralement automatique) :
   - **Framework Preset** : Vite
   - **Build Command** : `npm run build`
   - **Output Directory** : `dist`
   - **Install Command** : `npm install`

4. **Déployer** : Cliquez sur "Deploy"

5. **URL** : Vercel vous donnera une URL comme `https://venio-xxxxx.vercel.app`

**Avantages** :
- ✅ Déploiement automatique à chaque `git push`
- ✅ HTTPS gratuit
- ✅ CDN global pour des performances optimales
- ✅ Prévisualisation des pull requests
- ✅ Domaine personnalisé gratuit

### Option 3 : Netlify (Alternative)

1. Allez sur [netlify.com](https://netlify.com) et connectez-vous avec GitHub
2. Cliquez sur "Add new site" → "Import an existing project"
3. Sélectionnez votre dépôt GitHub
4. Configuration :
   - **Build command** : `npm run build`
   - **Publish directory** : `dist`
5. Cliquez sur "Deploy site"

### Option 4 : GitHub Pages

1. Installez le package `gh-pages` :
   ```bash
   npm install --save-dev gh-pages
   ```

2. Ajoutez ces scripts dans `package.json` :
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

3. Déployez :
   ```bash
   npm run deploy
   ```

4. Activez GitHub Pages dans les paramètres du dépôt (Settings → Pages)

### Continuer à modifier le site

**Pour IONOS** : Voir la section "Mettre à jour le site après modifications" ci-dessus.

**Pour Vercel/Netlify** : Une fois déployé, vous pouvez continuer à travailler normalement :

1. **Modifier localement** : Faites vos changements dans votre éditeur
2. **Tester** : Lancez `npm run dev` pour tester en local
3. **Publier** : 
   ```bash
   git add .
   git commit -m "Description des modifications"
   git push origin main
   ```
4. **Déploiement automatique** : Vercel/Netlify déploiera automatiquement vos changements (généralement en 1-2 minutes)

### Configuration pour React Router

Si vous utilisez React Router (ce qui est le cas), vous devez créer un fichier de redirection pour que toutes les routes fonctionnent correctement :

**Pour Vercel** : Créez `vercel.json` à la racine :
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Pour Netlify** : Le fichier `public/_redirects` existe déjà dans le projet.

**Pour IONOS** : Le fichier `.htaccess` est généré automatiquement lors du build avec `npm run build:ionos`.

## 📝 Notes techniques

### Structure et organisation
- Les variables CSS sont définies dans `src/index.css`
- Chaque composant a son propre fichier CSS
- Le design est responsive (mobile-first)
- Les polices Cabinet Grotesk sont chargées depuis `/public/fonts/`
- Le serveur de développement est configuré sur le port **5501**

### Scripts disponibles

```bash
# Développement
npm run dev              # Lance le serveur de développement (localhost:5501)

# Build
npm run build            # Build standard (génère aussi .htaccess via postbuild)
npm run build:ionos      # Build optimisé pour IONOS avec .htaccess explicite
npm run preview          # Prévisualise la version de production localement

# Déploiement Ionos
npm run deploy:ionos     # Build + vérification + instructions de déploiement
npm run deploy:check      # Vérifie que le build est prêt pour déploiement

# Les scripts postbuild s'exécutent automatiquement après npm run build
```

### Fichiers de configuration

- **`vite.config.ts`** : Configuration Vite (port, host, plugins, manualChunks pour split vendor)
- **`vercel.json`** : Configuration pour déploiement Vercel (React Router)
- **`public/_redirects`** : Configuration pour déploiement Netlify (React Router)
- **`scripts/create-htaccess.js`** : Script qui génère automatiquement `.htaccess` pour IONOS
- **`.htaccess`** : Généré automatiquement dans `dist/` (ne pas modifier manuellement)

### Workflow de développement recommandé

1. **Développement local** :
   ```bash
   npm run dev
   # Modifiez votre code, testez sur localhost:5501
   ```

2. **Test de production local** :
   ```bash
   npm run build:ionos
   npm run preview
   # Testez la version optimisée avant déploiement
   ```

3. **Déploiement IONOS** :
   ```bash
   npm run build:ionos
   # Uploader le contenu de dist/ via FTP
   ```

4. **Versionning** :
   ```bash
   git add .
   git commit -m "Description des modifications"
   git push origin main
   ```

### Support et ressources

- **Documentation Vite** : https://vitejs.dev/
- **Documentation React Router** : https://reactrouter.com/
- **Support IONOS** : Disponible dans votre espace client ou par téléphone

## 🧪 Commandes utiles — tests

| Commande | Scope |
|---|---|
| `npm run test` ou `npm run test:frontend` | Tests frontend uniquement (Vitest, racine) |
| `npm run test:backend` | Tests backend uniquement (`npm --prefix backend test`) |
| `npm run test:all` | Frontend puis backend en séquence |
| `cd backend && npm test` | Tests backend directement depuis le dossier backend |

> Note : `npm test` à la racine lance UNIQUEMENT les tests frontend. Pour tout tester, utiliser `npm run test:all`.

## 🔧 Commandes backend utiles

```bash
cd backend

# Démarrage
npm run dev                            # tsx --watch, port 3000

# Démo
npm run seed:demo                      # Données de démo
npm run cleanup:demo:dry               # Dry-run nettoyage démo (ALLOW_DEMO_CLEANUP=true requis)
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry   # Dry-run
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo        # Nettoyage effectif

# Migrations
npm run accounting:migrate-billing:dry  # Dry-run migration billing
npm run accounting:migrate-billing      # Migration billing
```

⚠️ Le cleanup démo n'est **plus** exécuté au boot serveur. Voir [docs/operations/RUNBOOK.md](./operations/RUNBOOK.md).

