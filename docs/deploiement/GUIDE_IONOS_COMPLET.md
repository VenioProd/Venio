# 📘 Guide complet Ionos - Syntaxes et configurations

Guide de référence complet pour configurer et déployer sur Ionos via GitHub Actions.

> ✅ **Configuration validée et testée** - Cette configuration a été testée avec succès sur Ionos.

## ⚡ Configuration validée (testée et fonctionnelle)

Voici la configuration exacte qui fonctionne pour Ionos :

### Workflow GitHub Actions (testé et validé)

```yaml
name: 🚀 Déploiement automatique sur Ionos

on:
  push:
    branches:
      - master
    paths-ignore:
      - 'README.md'
      - 'DEPLOY_IONOS.md'
      - '.gitignore'
  workflow_dispatch:

jobs:
  deploy:
    name: Build et déploiement sur Ionos
    runs-on: ubuntu-latest
    
    steps:
      - name: 📥 Checkout du code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # ⚠️ OBLIGATOIRE

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 📥 Installer les dépendances
        run: npm ci

      - name: 🏗️ Build du projet
        run: npm run build:ionos

      - name: ✅ Vérifier le build
        run: npm run deploy:check

      - name: 🚀 Déployer sur Ionos via SFTP
        uses: milanmk/actions-file-deployer@master
        with:
          remote-protocol: 'sftp'  # ⚠️ Entre guillemets simples
          remote-host: ${{ secrets.FTP_SERVER }}
          remote-user: ${{ secrets.FTP_USERNAME }}
          remote-password: ${{ secrets.FTP_PASSWORD }}
          remote-port: 22  # ⚠️ Port SFTP standard Ionos
          remote-path: ${{ secrets.FTP_SERVER_DIR }}
          local-path: './dist/'
          sync: 'full'  # ⚠️ Entre guillemets simples, pas 'delta' ni true

      - name: ✅ Déploiement terminé
        run: |
          echo "✅ Site déployé avec succès sur https://venio.pro"
          echo "🔄 Les modifications peuvent prendre quelques minutes à apparaître"
```

### Secrets GitHub (configuration Ionos)

| Secret | Format exact | Exemple Ionos | ⚠️ Règles |
|--------|-------------|---------------|----------|
| `FTP_SERVER` | `home[ID].1and1-data.host` | `home353429004.1and1-data.host` | Pas de `sftp://`, pas de `//` |
| `FTP_USERNAME` | Identifiant SFTP | `u123456789` | Tel quel, sans espaces |
| `FTP_PASSWORD` | Mot de passe SFTP | `votre_mot_de_passe` | Tel quel, sans espaces |
| `FTP_SERVER_DIR` | `/dossier/` | `/VenioReact/` | Commence ET finit par `/` |

### Paramètres Ionos validés

- **Protocole** : `SFTP` (recommandé par Ionos)
- **Port** : `22` (port SFTP standard)
- **Action GitHub** : `milanmk/actions-file-deployer@master`
- **Synchronisation** : `'full'` (synchronisation complète)

## 🔐 Configuration des secrets GitHub

### Secrets requis

Dans **Settings** → **Secrets and variables** → **Actions**, créez ces 4 secrets :

| Nom du secret | Exemple de valeur | Description |
|---------------|-------------------|-------------|
| `FTP_SERVER` | `home353429004.1and1-data.host` | Serveur SFTP/FTP (sans `sftp://` ni `//`) |
| `FTP_USERNAME` | `u123456789` | Identifiant SFTP/FTP |
| `FTP_PASSWORD` | `votre_mot_de_passe` | Mot de passe SFTP/FTP |
| `FTP_SERVER_DIR` | `/VenioReact/` | Répertoire web (commence et se termine par `/`) |

### ⚠️ Règles importantes

- **FTP_SERVER** : 
  - ✅ `home353429004.1and1-data.host` (correct)
  - ❌ `sftp://home353429004.1and1-data.host` (ne pas inclure le protocole)
  - ❌ `//home353429004.1and1-data.host` (pas de double slash)

- **FTP_SERVER_DIR** :
  - ✅ `/VenioReact/` (commence et se termine par `/`)
  - ✅ `/httpdocs/VenioReact/` (si dans un sous-dossier)
  - ❌ `/VenioReact` (manque le `/` final)
  - ❌ `VenioReact/` (manque le `/` initial)

## 🔧 Configuration GitHub Actions Workflow

### Structure de base

```yaml
name: 🚀 Déploiement automatique sur Ionos

on:
  push:
    branches:
      - master
    paths-ignore:
      - 'README.md'
      - 'DEPLOY_IONOS.md'
      - '.gitignore'
  workflow_dispatch:

jobs:
  deploy:
    name: Build et déploiement sur Ionos
    runs-on: ubuntu-latest
    
    steps:
      - name: 📥 Checkout du code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # ⚠️ IMPORTANT pour la synchronisation delta

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 📥 Installer les dépendances
        run: npm ci

      - name: 🏗️ Build du projet
        run: npm run build:ionos

      - name: ✅ Vérifier le build
        run: npm run deploy:check

      - name: 🚀 Déployer sur Ionos via SFTP
        uses: milanmk/actions-file-deployer@master
        with:
          remote-protocol: 'sftp'
          remote-host: ${{ secrets.FTP_SERVER }}
          remote-user: ${{ secrets.FTP_USERNAME }}
          remote-password: ${{ secrets.FTP_PASSWORD }}
          remote-port: 22
          remote-path: ${{ secrets.FTP_SERVER_DIR }}
          local-path: './dist/'
          sync: 'full'
```

### Paramètres SFTP détaillés (Ionos)

#### Action : `milanmk/actions-file-deployer@master` ✅ Testée et validée

**Paramètres valides pour Ionos** :

| Paramètre | Type | Valeur Ionos | ⚠️ Format exact | Description |
|-----------|------|--------------|-----------------|-------------|
| `remote-protocol` | string | `'sftp'` | Entre guillemets simples | Protocole SFTP (recommandé Ionos) |
| `remote-host` | string | `${{ secrets.FTP_SERVER }}` | Format : `home[ID].1and1-data.host` | Serveur Ionos (sans `sftp://`) |
| `remote-user` | string | `${{ secrets.FTP_USERNAME }}` | Identifiant SFTP Ionos | Identifiant fourni par Ionos |
| `remote-password` | string | `${{ secrets.FTP_PASSWORD }}` | Mot de passe SFTP Ionos | Mot de passe fourni par Ionos |
| `remote-port` | number | `22` | Port SFTP standard | Port 22 pour SFTP (Ionos) |
| `remote-path` | string | `${{ secrets.FTP_SERVER_DIR }}` | Format : `/dossier/` | Chemin distant (commence et finit par `/`) |
| `local-path` | string | `'./dist/'` | Chemin relatif | Dossier local à déployer |
| `sync` | string | `'full'` | Entre guillemets simples | Synchronisation complète (recommandé) |

**⚠️ Points critiques pour Ionos** :
- `remote-protocol` : **DOIT** être `'sftp'` (entre guillemets simples)
- `remote-port` : **DOIT** être `22` pour SFTP Ionos
- `sync` : **DOIT** être `'full'` (entre guillemets simples), pas `true` ni `'delta'`
- `remote-path` : **DOIT** commencer et finir par `/` (ex: `/VenioReact/`)

**⚠️ Paramètres invalides** :
- ❌ `delete-remote-files: true` (n'existe pas)
- ❌ `sync: true` (doit être `'full'` ou `'delta'`)
- ❌ `protocol: sftp` (utiliser `remote-protocol`)

#### Types de synchronisation

- **`sync: 'full'`** : Synchronisation complète
  - Remplace tous les fichiers sur le serveur
  - Recommandé pour les déploiements
  - Garantit que tous les fichiers sont à jour

- **`sync: 'delta'`** : Synchronisation incrémentale
  - Envoie uniquement les fichiers modifiés
  - Plus rapide mais nécessite `fetch-depth: 0` dans checkout
  - Utile pour les gros projets

### Configuration pour FTP (alternative)

Si SFTP ne fonctionne pas, vous pouvez utiliser FTP :

```yaml
- name: 🚀 Déployer sur Ionos via FTP
  uses: milanmk/actions-file-deployer@master
  with:
    remote-protocol: 'ftp'
    remote-host: ${{ secrets.FTP_SERVER }}
    remote-user: ${{ secrets.FTP_USERNAME }}
    remote-password: ${{ secrets.FTP_PASSWORD }}
    remote-port: 21
    remote-path: ${{ secrets.FTP_SERVER_DIR }}
    local-path: './dist/'
    sync: 'full'
```

## 📋 Informations Ionos standard (validées)

### Protocoles supportés par Ionos

| Protocole | Port | Sécurité | Recommandé Ionos | Status |
|-----------|------|----------|------------------|--------|
| **SFTP** | **22** | ✅ Élevée | ⭐ **Oui (recommandé)** | ✅ Testé et validé |
| FTP | 21 | ⚠️ Moyenne | Si SFTP indisponible | ⚠️ Non testé |
| FTPS | 990 | ✅ Élevée | Alternative | ⚠️ Non testé |

**⚠️ Ionos recommande SFTP (port 22)** - C'est la configuration validée et testée.

### Répertoires web courants Ionos

| Répertoire | Usage | Format |
|------------|-------|--------|
| `/httpdocs/` | Site principal (le plus courant) | `/httpdocs/` |
| `/www/` | Alternative à httpdocs | `/www/` |
| `/public_html/` | Certains hébergements | `/public_html/` |
| `/VenioReact/` | Dossier personnalisé | `/VenioReact/` |

**⚠️ Format obligatoire** : Le répertoire **DOIT** commencer et finir par `/`

### Format des serveurs Ionos (validé)

- **Format standard** : `home[ID].1and1-data.host`
- **Exemple validé** : `home353429004.1and1-data.host`
- **⚠️ Ne JAMAIS inclure** :
  - ❌ `sftp://` au début
  - ❌ `ftp://` au début
  - ❌ `//` au début
  - ✅ Juste le nom du serveur : `home353429004.1and1-data.host`

## 🐛 Erreurs courantes et solutions

### Erreur : "Invalid parameter - you provided 'sftp'"

**Cause** : L'action ne supporte pas le paramètre `protocol: sftp`

**Solution** : Utiliser `milanmk/actions-file-deployer` avec `remote-protocol: 'sftp'`

```yaml
# ❌ Incorrect
protocol: sftp

# ✅ Correct
remote-protocol: 'sftp'
```

### Erreur : "Unexpected input(s) 'delete-remote-files'"

**Cause** : Le paramètre `delete-remote-files` n'existe pas

**Solution** : Utiliser `sync: 'full'` à la place

```yaml
# ❌ Incorrect
delete-remote-files: true

# ✅ Correct
sync: 'full'
```

### Erreur : "Invalid synchronization: true"

**Cause** : `sync` doit être une string, pas un booléen

**Solution** : Utiliser `'full'` ou `'delta'` entre guillemets

```yaml
# ❌ Incorrect
sync: true

# ✅ Correct
sync: 'full'
# ou
sync: 'delta'
```

### Erreur : "Connection refused" ou "Connection timeout"

**Causes possibles** :
- Serveur incorrect dans `FTP_SERVER`
- Port incorrect (22 pour SFTP, 21 pour FTP)
- Firewall bloquant la connexion

**Solutions** :
- Vérifier que `FTP_SERVER` ne contient pas `sftp://` ou `//`
- Vérifier le port (22 pour SFTP, 21 pour FTP)
- Contacter le support Ionos si nécessaire

### Erreur : "Authentication failed"

**Causes possibles** :
- Identifiant ou mot de passe incorrect
- Espaces avant/après dans les secrets GitHub

**Solutions** :
- Vérifier les secrets dans GitHub (pas d'espaces)
- Tester la connexion avec Transmit
- Recréer les secrets si nécessaire

### Erreur : "No such file or directory"

**Causes possibles** :
- Le répertoire n'existe pas sur le serveur
- Chemin incorrect dans `FTP_SERVER_DIR`

**Solutions** :
- Vérifier que le dossier existe avec Transmit
- Vérifier que `FTP_SERVER_DIR` commence et se termine par `/`
- Créer le dossier si nécessaire

### Erreur : "Commit history not found for delta synchronization"

**Cause** : `fetch-depth: 0` manquant dans checkout

**Solution** : Ajouter `fetch-depth: 0` au checkout

```yaml
- name: 📥 Checkout du code
  uses: actions/checkout@v4
  with:
    fetch-depth: 0  # ⚠️ Important pour sync: 'delta'
```

## ✅ Checklist de configuration

Avant de déployer, vérifiez :

- [ ] Les 4 secrets GitHub sont créés avec les bons noms (en majuscules)
- [ ] `FTP_SERVER` ne contient pas `sftp://` ni `//`
- [ ] `FTP_SERVER_DIR` commence et se termine par `/`
- [ ] Le workflow utilise `remote-protocol: 'sftp'` (pas `protocol`)
- [ ] Le workflow utilise `sync: 'full'` (pas `delete-remote-files`)
- [ ] Le port est `22` pour SFTP ou `21` pour FTP
- [ ] `fetch-depth: 0` est présent dans le checkout
- [ ] La connexion fonctionne avec Transmit

## 🔄 Workflow complet fonctionnel (testé et validé)

Voici le workflow complet qui a été testé avec succès sur Ionos :

```yaml
name: 🚀 Déploiement automatique sur Ionos

on:
  push:
    branches:
      - master
    paths-ignore:
      - 'README.md'
      - 'DEPLOY_IONOS.md'
      - 'GUIDE_IONOS_COMPLET.md'
      - '.gitignore'
  workflow_dispatch:

jobs:
  deploy:
    name: Build et déploiement sur Ionos
    runs-on: ubuntu-latest
    
    steps:
      - name: 📥 Checkout du code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: 📦 Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 📥 Installer les dépendances
        run: npm ci

      - name: 🏗️ Build du projet
        run: npm run build:ionos

      - name: ✅ Vérifier le build
        run: npm run deploy:check

      - name: 🚀 Déployer sur Ionos via SFTP
        uses: milanmk/actions-file-deployer@master
        with:
          remote-protocol: 'sftp'
          remote-host: ${{ secrets.FTP_SERVER }}
          remote-user: ${{ secrets.FTP_USERNAME }}
          remote-password: ${{ secrets.FTP_PASSWORD }}
          remote-port: 22
          remote-path: ${{ secrets.FTP_SERVER_DIR }}
          local-path: './dist/'
          sync: 'full'

      - name: ✅ Déploiement terminé
        run: |
          echo "✅ Site déployé avec succès sur https://venio.pro"
          echo "🔄 Les modifications peuvent prendre quelques minutes à apparaître"
```

## 📞 Support

- **Documentation GitHub Actions** : https://docs.github.com/en/actions
- **Action milanmk/actions-file-deployer** : https://github.com/milanmk/actions-file-deployer
- **Support Ionos** : Disponible dans votre espace client

## 📝 Notes importantes

1. **Sécurité** : SFTP est plus sécurisé que FTP, utilisez-le si possible
2. **Secrets** : Ne jamais commiter les secrets dans le code, toujours utiliser GitHub Secrets
3. **Tests** : Testez toujours la connexion avec Transmit avant de configurer GitHub Actions
4. **Logs** : En cas d'erreur, consultez toujours les logs détaillés dans l'onglet Actions de GitHub

