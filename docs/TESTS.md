# Lancer les tests de façon fiable

Ce guide décrit comment exécuter toute la suite de tests (backend et frontend) sans fausses alertes dues à l'environnement.

## Principes

- **NODE_ENV=test est forcé** par les configurations Vitest (`backend/vitest.config.ts` et la section `test` de `vite.config.ts`). Un shell qui exporte `NODE_ENV=production` (poste de déploiement, CI mal réglée) ne fait donc plus échouer les tests frontend (« act(...) is not supported in production builds of React ») ni changer le comportement des gardes « production » du backend.
- **Les tests backend d'intégration utilisent `mongodb-memory-server`** : ils démarrent un vrai `mongod`. Les fichiers sont exécutés l'un après l'autre (`fileParallelism: false`) pour ne pas saturer la machine avec plusieurs bases en mémoire.
- **Aucune clé API ni service externe** n'est nécessaire : Nextcloud, SMTP, Stripe, etc. sont mockés ou désactivés dans les tests.

## Méthode recommandée : Docker, image Debian (pas Alpine)

Utiliser `node:22-bookworm-slim` avec `libcurl4`, **pas** `node:*-alpine`.

Raison : `mongodb-memory-server` télécharge un binaire `mongod` officiel compilé pour glibc et lié à `libcurl`. Sur Alpine (musl), il ne démarre pas ou échoue de façon intermittente ; sur Debian slim, il manque seulement `libcurl4`, qu'il faut installer.

### Depuis un dossier de travail propre

```bash
# 1. Copier le dépôt (sans node_modules) dans un dossier temporaire
#    Fichiers suivis uniquement :   git archive HEAD | tar -x -C /tmp/venio-tests
#    Avec modifications locales :   tar -c --exclude=node_modules --exclude=.git . | tar -x -C /tmp/venio-tests
mkdir -p /tmp/venio-tests
git archive HEAD | tar -x -C /tmp/venio-tests

# 2. Lancer la suite backend dans un conteneur jetable
docker run --rm -v /tmp/venio-tests:/w -w /w/backend node:22-bookworm-slim sh -c '
  apt-get update -qq && apt-get install -y -qq libcurl4 >/dev/null &&
  npm ci --no-audit --no-fund &&
  NODE_ENV=test npx vitest run
'
```

Si le démon Docker est distant (`DOCKER_HOST` pointe vers une socket ou un hôte qui ne partage pas le système de fichiers), remplacer le montage `-v` par un conteneur nommé et `docker cp` :

```bash
docker run -d --name venio-tests node:22-bookworm-slim sleep infinity
docker cp /tmp/venio-tests/. venio-tests:/w
docker exec venio-tests sh -c 'apt-get update -qq && apt-get install -y -qq libcurl4 >/dev/null && cd /w/backend && npm ci --no-audit --no-fund'
docker exec venio-tests sh -c 'cd /w/backend && NODE_ENV=test npx vitest run'
docker rm -f venio-tests   # ménage
```

Garder le conteneur entre deux essais évite de refaire `npm ci` ; recopier seulement les fichiers modifiés avec `docker cp`.

### Cibler quelques fichiers

```bash
docker exec venio-tests sh -c 'cd /w/backend && NODE_ENV=test npx vitest run src/__tests__/crm-routes'
```

(Le texte est un filtre sur le chemin : ici, toutes les suites `crm-routes-*`.)

## Frontend

Les tests frontend (jsdom, React Testing Library) n'ont pas besoin de MongoDB :

```bash
npm ci
NODE_ENV=test npx vitest run
```

Le dossier `backend/` est exclu de cette exécution (voir la section `test.exclude` de `vite.config.ts`) ; il a sa propre configuration.

## Vérifications statiques

```bash
npx tsc --noEmit -p .          # frontend
npx tsc --noEmit -p backend    # backend
npm run lint
```

## Exécution locale sans Docker

Possible pour les suites qui n'utilisent pas `mongodb-memory-server` (tests unitaires, frontend) :

```bash
NODE_ENV=test npx vitest run chemin/du/fichier.test.ts
```

Pour les suites d'intégration backend, la fiabilité n'est garantie que dans l'image Debian ci-dessus : sur une machine où `mongod` ne se télécharge pas ou ne démarre pas (Alpine, `libcurl` absent, système de fichiers en lecture seule), les suites échouent dès `beforeAll` avec un délai dépassé, sans lien avec le code testé.

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| `beforeAll` / `hookTimeout` dépassé dès le démarrage d'une suite d'intégration | `mongod` ne démarre pas (Alpine, `libcurl4` manquant) | Utiliser `node:22-bookworm-slim` + `libcurl4` |
| `libcurl.so.4: cannot open shared object file` | `libcurl4` non installé | `apt-get install -y libcurl4` |
| « act(...) is not supported in production builds of React » | `NODE_ENV=production` dans le shell, config ancienne | Les configs forcent désormais `test` ; sinon `NODE_ENV=test` |
| `Cannot find package 'stripe'` / `csv-parse` | `node_modules` partagé ou incomplet | `npm ci` dans `backend/` dans un dossier propre |
| Un test passe seul et échoue dans la suite complète | État partagé entre fichiers | Chaque suite doit `clearDb()` en `beforeEach` (voir `helpers/mongoTestEnv.ts`) |

## Tests de non-régression du CRM (leads)

Les fichiers `backend/src/__tests__/crm-routes-*.test.ts` figent le contrat HTTP des routes leads, côté admin (`/api/admin/crm/leads`) et côté agent (`/api/v1/agent/leads`), ainsi que le périmètre par rôle (`lib/crmScope.ts`) :

- `crm-routes-admin-leads.test.ts` : POST / PATCH / DELETE, statuts, motif de perte, assignation, auto-qualification, passage à WON, Idempotency-Key ;
- `crm-routes-agent-leads.test.ts` : POST / PATCH / DELETE de l'API agent, scopes, formes d'erreur ;
- `crm-routes-scope.test.ts` : `leadScopeFilter`, `isLeadOutOfScope`, `canReadLead`, `readsWholeCrm`, et leurs effets HTTP selon le rôle ;
- `crm-routes-helpers.ts` : équipe type (un utilisateur par rôle) et réglages CRM déterministes (pas de round-robin ni d'e-mail).

Ces tests décrivent le comportement **actuel**, pas le comportement souhaité. Les bugs relevés par l'audit du 6 novembre 2026 y figurent en `it.todo` : transformer un `it.todo` en test réel au moment de corriger le bug correspondant. Un refactor qui conserve le contrat doit laisser toute la suite verte.
