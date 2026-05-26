# Venio — Plateforme métier (site public + back-office)

## Architecture

- Site public (React 18 + Vite 5 + React Router 7) — port dev 5501
- Espace client + back-office admin (même app frontend)
- API backend Express 5 + MongoDB (Mongoose) — port dev 3000
- Messagerie interne temps réel (Socket.IO)
- API agent (Bearer tokens) avec idempotency
- Modules: CRM, projets, comptabilité, Qualiopi, tickets, ressources, automatisations
- Intégrations: nodemailer, web-push, Nextcloud sync, jsPDF (lazy)

## Stack

| Couche | Technos |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, React Router 7, Recharts, Socket.IO client, jsPDF (lazy) |
| Backend | Node, Express 5, Mongoose, JWT, bcryptjs, Multer, Helmet, express-rate-limit, Socket.IO, nodemailer, web-push, otpauth (2FA), pdfkit, qrcode |
| Tests | Vitest (frontend + backend séparés), supertest, mongodb-memory-server |

## Démarrage rapide

### Prérequis
- Node 20+ (recommandé)
- Une instance MongoDB locale ou distante (URI dans `.env`)

### Frontend
```bash
npm install
npm run dev   # http://localhost:5501
```

### Backend
```bash
cd backend
npm install
cp .env.example .env  # à ajuster
npm run dev   # http://localhost:3000
```

Le frontend proxy `/api/*` et `/socket.io/*` vers `VITE_API_PROXY_TARGET` (défaut http://localhost:3000).

## Scripts

### Frontend (racine)
| Script | Effet |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Build prod (`dist/`) + sitemap (via `postbuild`) |
| `npm run sitemap` | (Re)génère uniquement le sitemap |
| `npm run test` / `npm run test:frontend` | Tests frontend uniquement |
| `npm run test:backend` | `npm --prefix backend test` |
| `npm run test:all` | Frontend puis backend |
| `npm run typecheck` | TS strict |

### Backend (`cd backend`)
| Script | Effet |
|---|---|
| `npm run dev` | tsx --watch |
| `npm run build` | Compile TypeScript |
| `npm start` | `node dist/index.js` |
| `npm test` | Vitest backend |
| `npm run seed:demo` / `seed:client-projects` | Données de démo |
| `npm run cleanup:demo:dry` / `cleanup:demo` | Nettoyage démo (garde `ALLOW_DEMO_CLEANUP=true`) |
| `npm run accounting:migrate-billing` | Migration billing |

## Permissions

Source de vérité = liste canonique de 26 permissions, dupliquée intentionnellement entre `src/lib/permissions.ts` et `backend/src/lib/permissions.ts`. Un test `src/lib/__tests__/permissions-sync.test.ts` détecte toute dérive.

Toutes les routes admin sensibles sont protégées par `<RequirePermission>` côté frontend ET filtrées côté backend (cf. tickets).

## Documentation détaillée

- [docs/README.md](docs/README.md) — index général
- [docs/api-agent.md](docs/api-agent.md) — API agent (Bearer + scopes + idempotency)
- [docs/architecture/API_CONTRACTS.md](docs/architecture/API_CONTRACTS.md) — conventions d'API
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md) — exploitation
- [docs/deploiement/](docs/deploiement/) — déploiement VPS / IONOS
- [docs/optimisation/](docs/optimisation/) — bundles, perf, SEO
- [docs/accounting/](docs/accounting/), [docs/admin/](docs/admin/), [docs/projet/](docs/projet/) — modules

## Licence

Propriétaire — usage interne Venio.
