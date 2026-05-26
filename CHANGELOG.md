# Changelog

Toutes les évolutions notables de Venio sont consignées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et de
[Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/).
Versionnement [SemVer](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

## [Unreleased]

### Audit de stabilisation (sprint « Stabiliser et alléger »)

#### Ajouté
- **CI** : workflow GitHub Actions (typecheck + test:all + lint) sur chaque PR, deploy gated par CI verte.
- **DX** : ESLint 9 flat config (front + back), Prettier 3, Husky 9, lint-staged, commitlint Conventional Commits.
- **Logs structurés** : passage de tous les `console.log` runtime backend à `pino` + middleware `pino-http`.
- **Observabilité** : Sentry SDK front + back (`@sentry/react`, `@sentry/node`), source maps backend en prod.
- **Sécurité** : CSP via Helmet sans `'unsafe-inline'` sur `scriptSrc`, rate limit auth durci
  (login 5/15min avec `skipSuccessfulRequests`, password reset 3/15min), `SECURITY.md` publié.
- **Ops** : runbook (`docs/runbook.md`), `CONTRIBUTING.md`, healthcheck Docker (`HEALTHCHECK` + `docker compose ps`),
  `/api/health` enrichi (statut Mongo).
- **Maintenance auto** : Dependabot sur npm (root + backend) + github-actions, hebdomadaire, groupé minor+patch.

#### Modifié
- **TypeScript** strict : `noUnusedLocals` + `noUnusedParameters` activés, nombre de `: any` réduit
  (51 → ≤ 25 dans `src/`), typages User étendus (`title`, `customPermissions`).
- **Architecture** : aucun fichier > 800 lignes dans `src/pages/` ou `backend/src/routes/`. Top 10 (jusqu'à 1702 lignes)
  refactoré, contexte React introduit là où nécessaire (`InternalProjectList`, `Settings`, `education`).
- **Routing** : mount `/api/admin/projects` consolidé (4 montages → 1).
- **Boot** : sortie des migrations du chemin de démarrage backend.

#### Supprimé
- Markdowns racine obsolètes (audit, design summaries) + dossier `design-backup/`.
- Cibles de déploiement inutilisées (IONOS scripts).
- Dépendances mortes : `html2canvas`, downgrade `lucide-react ^1.16.0` vers la version utilisée.

#### Corrigé
- 45 TODO/FIXME triagés (corrigés, supprimés ou convertis en issues tracker).
- Tests flaky permission documentés.

---

## Note

Avant ce sprint, l'historique des releases n'était pas tenu de façon structurée.
Les évolutions antérieures sont consultables via `git log` et l'historique des PRs GitHub.
