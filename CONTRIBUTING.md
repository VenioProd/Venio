# Contribuer à Venio

Guide pour collaborateurs internes et agents (Claude, Codex, etc.).

## Setup local

```bash
# Frontend (port 5501)
npm install
cp .env.example .env  # configurer VITE_EMAILJS_*, optionnel VITE_SENTRY_DSN
npm run dev

# Backend (port 3000)
cd backend
npm install
cp .env.example .env  # configurer MONGODB_URI, JWT_SECRET, SUPER_ADMIN_*
npm run dev
```

Prérequis : Node 20+, instance MongoDB (locale ou distante).

## Workflow Git

Branches : `feat/...`, `fix/...`, `refactor/...`, `chore/...`, `docs/...`.

Commits : format **Conventional Commits**.

```
feat(crm): ajout du filtre par tag
fix(tickets): isSuperAdmin élargi à RH+ADMIN
refactor(routes): consolide les mounts /api/admin/projects
chore(deps): npm audit fix
docs(ops): runbook enrichi avec healthcheck
```

Scope optionnel mais recommandé (`crm`, `tickets`, `accounting`, `dev-workspace`, `ci`, `deps`...).

### Hook pre-commit (Husky + lint-staged)
Au moment d'un `git commit`, sur les fichiers staged :
- ESLint --fix
- Prettier --write

Les warnings ESLint ne bloquent pas, les errors oui.

## CI

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) s'exécute sur chaque PR vers `main` :

1. `npm ci` (frontend + backend)
2. `npm run typecheck:all` (front + back)
3. `npm run lint`
4. `npm run test:all` (Vitest)

**CI verte obligatoire avant merge.**

Le déploiement (`deploy-ionos.yml`) ne se déclenche qu'après CI success.

## Tests

```bash
# Frontend uniquement (Vitest + jsdom)
npm run test:frontend

# Backend (Vitest + mongodb-memory-server)
npm --prefix backend test

# Tout
npm run test:all
```

Ne pas commit avec des tests cassés.

## Style code

- **TypeScript strict** : `noUnusedLocals` + `noUnusedParameters` activés. Préfixer les params inutilisés par `_` (`_req`, `_ctx`).
- **`:any` est un dernier recours.** Préférer `unknown` + narrowing, ou créer un type local. Voir helper `src/lib/errors.ts > getErrorMessage(err: unknown)`.
- **Pas de `console.log` dans le runtime backend.** Utiliser `import logger from '...logger.js'` (pino). `console` ok dans `scripts/*` (CLI tools) et tests.
- **Fichiers < 800 lignes** dans `src/pages/` et `backend/src/routes/`. Au-delà, découper en sous-composants/sous-routers.
- **Pas de feature flags ni backwards-compat hacks** : on supprime franchement.

## Permissions

La matrice `rbac-matrix.json` est la source de vérité des rôles, permissions et navigations. Le frontend l'importe directement ; le backend est vérifié contre elle par `backend/src/__tests__/rbac-matrix.test.ts`. Le test `src/lib/__tests__/permissions-sync.test.ts` contrôle aussi que les valeurs frontend/backend ne divergent pas.

Routes admin sensibles : protéger côté frontend (`<RequirePermission>`) ET côté backend (`requirePermission` middleware).

## Réviser une PR

Checklist :
- [ ] CI verte
- [ ] Description claire (le **pourquoi** plus que le **quoi**)
- [ ] Changements ciblés (une PR = un chantier)
- [ ] Pas de `console.log` orphelin
- [ ] Pas de TODO sans issue référencée
- [ ] Tests passent (si modif backend, vérifier les routes affectées)
- [ ] Migrations DB documentées dans `backend/scripts/migrations/README.md` si applicable

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour signaler une vulnérabilité (ne PAS ouvrir d'issue publique).

## Documentation

- [README.md](README.md) — démarrage
- [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md) — exploitation
- [docs/deploiement/README.md](docs/deploiement/README.md) — déploiement VPS
- [docs/api-agent.md](docs/api-agent.md) — API agent (Bearer + scopes)
- [docs/architecture/API_CONTRACTS.md](docs/architecture/API_CONTRACTS.md) — conventions d'API
