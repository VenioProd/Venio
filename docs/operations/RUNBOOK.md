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

- HTTP frontend : `curl https://venio.paris`
- HTTP backend : requêter via `https://venio.paris/api/...`
- Mongo : vérifier dans les logs backend au démarrage (`MongoDB connected` ou similaire)

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
