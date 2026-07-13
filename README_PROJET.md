# Venio — guide projet

Ce document est le point d'entrée technique du dépôt. Il décrit l'application
telle qu'elle est exécutée ; les procédures d'exploitation sont dans le
[runbook](docs/operations/RUNBOOK.md).

## Architecture

```text
Navigateur
  └─ Vite en développement (:5501)
       ├─ /api       ─┐
       └─ /socket.io ─┼─ proxy vers VITE_API_PROXY_TARGET (défaut : :3000)
                     └─ Express + Socket.IO + MongoDB (:3000)
                          ├─ API métier et sessions humaines
                          ├─ API agent /api/v1/agent
                          └─ planificateurs et automatisations
```

En production, Vite génère les fichiers statiques lors du build Docker.
Express les sert avec l'API dans le même conteneur ; le reverse proxy du VPS
termine l'accès public. MongoDB n'est pas défini dans le compose du dépôt : son
URI est fournie par l'environnement.

## Ports et proxy local

- Le serveur Vite écoute sur **5501** (`vite.config.ts`).
- Le backend Express écoute sur **3000** si `PORT` n'est pas défini.
- `VITE_API_PROXY_TARGET` cible le backend pour `/api` et `/socket.io` en
  développement ; par défaut, `http://localhost:3000`.
- En production, le frontend est servi par Express : ce proxy Vite n'est pas
  utilisé.

## Installation et exécution

Utiliser Node.js 22, comme la CI et l'image Docker. Installer les dépendances
des deux projets, créer les fichiers d'environnement à partir des exemples,
puis renseigner `MONGODB_URI` côté backend.

```bash
npm install
npm --prefix backend install
cp .env.example .env
cp backend/.env.example backend/.env

# dans deux terminaux
npm --prefix backend run dev
npm run dev
```

Les fichiers `.env` contiennent de la configuration sensible et ne doivent pas
être committés. Les noms de variables, sans valeurs, sont documentés dans
[docs/deploiement/GUIDE_CONFIGURATION.md](docs/deploiement/GUIDE_CONFIGURATION.md).

## Scripts

### Frontend (racine)

| Commande                | Effet                                       |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | serveur Vite de développement               |
| `npm run build`         | build Vite, prerender et sitemap            |
| `npm run typecheck`     | vérification TypeScript                     |
| `npm run lint`          | ESLint                                      |
| `npm run format:check`  | vérification Prettier                       |
| `npm run test:frontend` | Vitest frontend                             |
| `npm run test:public`   | recette build/SEO/site public et Playwright |

### Backend

| Commande                                    | Effet                                          |
| ------------------------------------------- | ---------------------------------------------- |
| `npm --prefix backend run dev`              | backend TypeScript en watch                    |
| `npm --prefix backend run build`            | compilation TypeScript                         |
| `npm --prefix backend run typecheck`        | vérification TypeScript                        |
| `npm --prefix backend run lint`             | ESLint du backend                              |
| `npm --prefix backend test`                 | Vitest backend                                 |
| `npm --prefix backend run seed:demo`        | crée les données de démo prévues par le script |
| `npm --prefix backend run cleanup:demo:dry` | simule leur suppression, avec garde explicite  |

Pour les contrôles combinés, utiliser `npm run typecheck:all` et
`npm run test:all`.

## API, sessions et automatisations

Les utilisateurs humains sont authentifiés par une session serveur stockée
dans le cookie HTTP-only `venio_session`. L'API agent est distincte : elle
utilise `Authorization: Bearer vno_pat_…`, des scopes indépendants et une
`Idempotency-Key` sur chaque mutation. Consulter
[API_CONTRACTS.md](docs/architecture/API_CONTRACTS.md) et
[api-agent.md](docs/api-agent.md) avant toute intégration.

Après connexion MongoDB, le backend démarre le planificateur CRM, le moteur
d'automatisation et le verrouillage automatique des écritures comptables. Leur
état est visible via l'endpoint admin de santé pour un utilisateur autorisé.

## Livraison

La CI installe les dépendances, exécute les typechecks, le lint, les tests et
la recette publique. Après succès sur `main`, le déploiement VPS reconstruit
l'image multi-stage et remplace le conteneur. Voir
[docs/deploiement/README.md](docs/deploiement/README.md) et le
[runbook](docs/operations/RUNBOOK.md) pour les opérations et le rollback.
