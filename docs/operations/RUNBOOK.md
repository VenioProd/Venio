# Runbook Venio

## Démarrage

### Local dev
```bash
# Terminal 1
cd backend && npm run dev   # :3000
# Terminal 2
npm run dev                 # :5501
```

### Prod (VPS)
Le déploiement passe par `.github/workflows/deploy-ionos.yml` qui :
1. SSH sur le VPS
2. `git fetch origin main && git reset --hard origin/main`
3. Restaure `.env` sauvegardé avant le reset
4. `docker compose -f docker-compose.prod.yml build --no-cache`
5. Swap container

Déclencheur : push sur la branche `main` (hors `README.md` et `docs/**`).

## Health checks

### Endpoint public `/api/health` (enrichi en chantier #5)
```bash
curl -s https://venio.paris/api/health | jq
# {
#   "status": "ok" | "degraded",
#   "version": "1.0.0",
#   "uptime": 42,
#   "mongo": { "ok": true, "state": 1, "pingMs": 3 },
#   "checkedAt": "2026-05-26T..."
# }
```
Codes retour :
- **200** si tout va bien (`status: "ok"` + `mongo.ok: true` + ping < 1s)
- **503** si Mongo est down ou unreachable (`status: "degraded"`)

Convient parfaitement pour un load balancer ou un monitoring externe (UptimeRobot, etc.).

### Endpoint admin `/api/admin/health` (auth requise)
Détail complet (SMTP, push, uploads, schedulers). Ne pas exposer publiquement.

### Logs structurés (pino)
Le backend log en JSON (prod) ou pretty-print (dev) via `pino`. Niveau configurable par `LOG_LEVEL`.

```bash
# Container Docker en prod
docker compose -f docker-compose.prod.yml logs -f venio | jq '. | select(.level >= 40)'
# 40 = warn et plus
```

Les champs `Authorization`, `cookie`, `password*`, `token*` sont auto-redactés.

### Monitoring d'erreurs (Sentry — chantier #6)
Configuré si `SENTRY_DSN` / `VITE_SENTRY_DSN` sont définis. Sinon désactivé silencieusement.
- 5xx remontent dans Sentry, pas les 4xx (filtrés par `beforeSend`)
- 10% de tracing en prod, 100% en dev

### Mongo
Vérifier au démarrage dans les logs backend : `{ level: 30, msg: "Connected to Mongo" }`.

## Backups

- Sauvegarder régulièrement la base MongoDB (`mongodump`) avant toute opération destructive
- Le `.env` est sauvegardé automatiquement par le workflow GitHub Actions avant chaque `git reset --hard`

## Uploads

- Stockage local : `backend/uploads/` (tickets, projets, messagerie, etc.)
- Sync optionnelle vers Nextcloud via `backend/src/lib/nextcloud.ts`
- Les uploads sont servis par routes Express dédiées (vérification de chemin pour éviter directory traversal)

## Jobs / schedulers

Au boot serveur :
- `startScheduler()` — CRM automation legacy
- `initAutomationEngine()` — moteur d'automatisation
- `startAutoLockScheduler()` — verrouillage auto des écritures comptables VALIDATED expirées

## Migrations one-shot

Les migrations historiques ont été **sorties du boot** (chantier #5 / audit 2026-05-26).
Elles sont maintenant des scripts standalone versionnés dans `backend/scripts/migrations/`.

```bash
# Local dev
cd backend
MONGODB_URI=... npx tsx scripts/migrations/001-unset-plain-password.ts

# Prod (depuis le container)
docker compose -f docker-compose.prod.yml exec venio \
  node --experimental-strip-types --experimental-detect-module \
  scripts/migrations/001-unset-plain-password.ts
```

Toutes les migrations sont **idempotentes** (réexécutables sans risque). Voir [`backend/scripts/migrations/README.md`](../../backend/scripts/migrations/README.md).

## Cleanup démo

⚠️ Le cleanup démo n'est **plus** exécuté au boot serveur (Phase 2 / VEN-353).

Usage manuel :
```bash
cd backend

# Toujours commencer par un dry-run
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry

# Si le dry-run est satisfaisant, lancer le nettoyage effectif
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo
```

La variable `ALLOW_DEMO_CLEANUP=true` est **obligatoire** — sans elle, le script lève une erreur immédiatement.

**Ne jamais lancer en prod sans backup MongoDB préalable.**

## Incidents typiques

| Symptôme | Action |
|---|---|
| 401 en boucle sur le front | Inspecter le `localStorage.auth_token`. Token expiré ou invalide → logout + relogin. |
| Backend ne démarre pas | Vérifier connexion MongoDB (`MONGODB_URI`), variables d'env (`JWT_SECRET`, `SUPER_ADMIN_*`) |
| Upload qui échoue silencieusement | Vérifier le quota disque, les permissions sur `backend/uploads/`, et que le client utilise bien `apiUpload` (sans forcer `Content-Type`) |
| Bundle trop gros | `npm run build` + comparer aux chunks documentés dans `docs/optimisation/BUNDLE_AUDIT_*.md` |
| Tests qui échouent en local mais pas en CI | Ne pas confondre `npm test` (frontend seul) et `npm run test:all` (frontend + backend) |
| Warnings duplicate index au démarrage | Normalement corrigés (Phase 4 / VEN-355). Si réapparus, vérifier `ExternalSource` et `QualiopiCriterion` |

## Tests

```bash
# Frontend uniquement (racine)
npm test                   # 62 tests environ

# Backend uniquement (lent — MongoMemoryServer non parallèle)
cd backend && npm test     # 313 tests environ

# Tout (frontend puis backend)
npm run test:all
```

Voir [docs/superpowers/plans/2026-05-18-venio-optimization.md](../superpowers/plans/2026-05-18-venio-optimization.md) pour le plan d'optimisation complet.

## CI/CD

### CI (chantier #3 — audit 2026-05-26)
Workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) qui s'exécute sur :
- `pull_request` vers `main`
- `push` sur `main`
- `workflow_dispatch` (manuel)

Jobs :
- **quality** : `npm ci` (root + backend) + `typecheck:all` + `lint`
- **tests** : `npm ci` (root + backend) + `test:all`

Concurrency group + cancel-in-progress pour éviter les builds doublons.

### Déploiement gaté
[`deploy-ionos.yml`](../../.github/workflows/deploy-ionos.yml) ne s'exécute QUE si CI verte (`workflow_run` après CI completed/success sur `main`). `workflow_dispatch` reste possible pour déploiement manuel.

## Sécurité (chantier #6)

### CSP
Headers Helmet en prod avec CSP stricte (pas de `'unsafe-inline'` sur scriptSrc) :
- scriptSrc : `'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`
- connectSrc : auto-inclut l'origine Sentry si `SENTRY_DSN` défini
- styleSrc : `'unsafe-inline'` conservé (à durcir séparément)

### Secrets
Stockés dans `.env` (jamais commité). Variables clés :
- Backend : `JWT_SECRET`, `MONGODB_URI`, `SUPER_ADMIN_*`, `SENTRY_DSN`, `NEXTCLOUD_*`, `VAPID_*`, `SMTP_*`
- Frontend : `VITE_SENTRY_DSN`, `VITE_EMAILJS_*`

Voir [`backend/.env.example`](../../backend/.env.example) et [`.env.example`](../../.env.example) racine pour la liste exhaustive.
