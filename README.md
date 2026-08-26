# Venio — plateforme métier

Venio réunit le site public, l'espace client et le back-office dans une même
application frontend. Le backend expose l'API métier, les flux temps réel et
l'API agent.

## Points d'entrée

- [README_PROJET.md](README_PROJET.md) — architecture, démarrage et scripts
- [docs/README.md](docs/README.md) — index de toute la documentation
- [docs/architecture/API_CONTRACTS.md](docs/architecture/API_CONTRACTS.md) — contrats HTTP
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md) — exploitation et incidents
- [docs/deploiement/README.md](docs/deploiement/README.md) — déploiement VPS

## Architecture actuelle

| Couche          | Implémentation                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Frontend        | React 18, TypeScript, Vite 5, React Router 7 et Socket.IO client                                  |
| Backend         | Node.js, Express 5, MongoDB via Mongoose et Socket.IO                                             |
| API agent       | `/api/v1/agent`, tokens Bearer à scopes et idempotence des mutations                              |
| Automatisations | Planificateur CRM, moteur d'automatisation et verrouillage comptable au démarrage du backend      |
| Production      | Image Docker unique : build Vite servi statiquement par Express, derrière le reverse proxy du VPS |

## Démarrage local

Prérequis : Node.js 22 (version des images Docker et de la CI) et une instance
MongoDB accessible.

```bash
# Dépendances et configuration frontend
npm install
cp .env.example .env

# Dépendances et configuration backend
npm --prefix backend install
cp backend/.env.example backend/.env
```

Renseigner au minimum `MONGODB_URI` dans `backend/.env`, sans jamais commiter
ce fichier. `CREDENTIALS_KEY` chiffre les secrets stockés (identifiants de
filiales, secrets des webhooks sortants — cf. `docs/webhooks-sortants.md`) et
doit rester stable : la changer rend illisibles les secrets existants. Lancer
ensuite deux terminaux :

```bash
# Terminal 1 — API Express : http://localhost:3000
npm --prefix backend run dev

# Terminal 2 — Vite : http://localhost:5501
npm run dev
```

Vite écoute sur le port **5501** et proxyfie `/api` et `/socket.io` vers
`VITE_API_PROXY_TARGET`. Sa valeur par défaut est `http://localhost:3000` ;
la définir dans `.env` permet de viser un autre backend de développement. Le
backend écoute sur le port **3000** par défaut (`PORT` peut le remplacer).

## Scripts courants

| Contexte | Commande                             | Rôle                                              |
| -------- | ------------------------------------ | ------------------------------------------------- |
| Frontend | `npm run dev`                        | Démarre Vite sur `:5501`                          |
| Frontend | `npm run build`                      | Produit `dist/`, puis génère prerender et sitemap |
| Frontend | `npm run typecheck`                  | Vérifie TypeScript sans émettre de fichiers       |
| Frontend | `npm run test:frontend`              | Lance Vitest frontend une fois                    |
| Frontend | `npm run lint`                       | Lance ESLint à la racine                          |
| Frontend | `npm run format:check`               | Vérifie Prettier sur les formats configurés       |
| Backend  | `npm --prefix backend run dev`       | Démarre `tsx --watch` sur `:3000`                 |
| Backend  | `npm --prefix backend run build`     | Compile TypeScript vers `backend/dist/`           |
| Backend  | `npm --prefix backend run typecheck` | Vérifie TypeScript sans émettre de fichiers       |
| Backend  | `npm --prefix backend test`          | Lance Vitest backend une fois                     |
| Ensemble | `npm run typecheck:all`              | Typecheck frontend puis backend                   |
| Ensemble | `npm run test:all`                   | Tests frontend puis backend                       |

Le nettoyage démo est détaillé dans le
[runbook](docs/operations/RUNBOOK.md) et n'est jamais exécuté au démarrage.

## Déploiement

La CI s'exécute sur les pull requests vers `main` et les pushes sur `main`. Le
workflow de déploiement s'exécute après une CI réussie, ou manuellement, et
met à jour le checkout VPS avant de reconstruire `docker-compose.prod.yml`.
Il y a une courte interruption lors du remplacement du conteneur. Les détails
opérationnels et le rollback sont dans le [runbook](docs/operations/RUNBOOK.md).

## Licence

Propriétaire — usage interne Venio.
