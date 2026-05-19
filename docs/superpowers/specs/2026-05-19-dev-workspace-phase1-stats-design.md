# Dev Workspace — Phase 1 : Backend stats & progression projet

**Date** : 2026-05-19
**Statut** : Design approuvé (en attente de plan d'implémentation)
**Contexte** : Première phase du chantier « rapprocher `/admin/dev` de Linear ». Le plan global comporte 9 phases ; ce spec couvre **uniquement la phase 1 — backend lecture seule**. Aucune modification de modèle de données, aucun changement front.

## Objectif

Exposer côté backend les agrégats nécessaires à la future UI « Projects » type Linear :
- KPI enrichis (urgentes, bloquées, velocity, completed 7j/14j) sur l'endpoint admin existant `GET /api/admin/dev/stats` (rétro-compatible).
- Nouveau `GET /api/admin/dev/overview` qui retourne la liste des projets avec leur **progression %**, leur **health**, et leurs compteurs.
- Mirroir agent : `GET /api/v1/agent/dev/stats` et `/api/v1/agent/dev/overview` (scope `read:dev`).
- Factorisation des calculs dans `backend/src/lib/dev/stats.ts`.

## Hors scope

Explicitement reportés à des phases ultérieures :
- Ajout de champs sur `DevProject` ou `DevIssue` (`icon`, `progress`, `estimate`, `targetDate`, `startDate`, `sortOrder`, `archivedAt`, `rank`, `githubBranch`, `githubPrUrl`, `blockedReason`). → Phase 2.
- Modifications UI (`src/pages/admin/dev-workspace/index.tsx`, icônes Lucide, board kanban). → Phases 3–5.
- Milestones, cycles, activity timeline, intégration GitHub. → Phases 6–8.
- Routes de mutation (`PATCH /issues/:id/rank`, bulk updates). → Phase 5.

## État existant

- Modèles Mongoose : `backend/src/models/DevProject.ts`, `DevIssue.ts`, `DevIssueComment.ts`.
- `DevProject` : `key, name, description, color, status (ACTIVE|PAUSED|ARCHIVED), lead, members, createdBy, timestamps`.
- `DevIssue.DEV_ISSUE_STATUSES` : `BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED`.
- `DevIssue.DEV_ISSUE_PRIORITIES` : inclut `URGENT` (le code de stats actuel itère sur la constante).
- Route actuelle `backend/src/routes/admin/dev/stats.ts` retourne :
  `{ total, open, completedRecent, totalProjects, byStatus, byPriority }`.
- Pas de route stats côté agent (`backend/src/routes/agent/dev.ts` n'expose que projets/issues/comments).

## Conception

### 1. Module partagé `backend/src/lib/dev/stats.ts`

Fonctions pures, testables sans réseau :

```ts
// Poids pour la progression pondérée par statut
export const STATUS_WEIGHT: Record<DevIssueStatus, number> = {
  BACKLOG: 0,
  TODO: 10,
  IN_PROGRESS: 50,
  IN_REVIEW: 80,
  DONE: 100,
  CANCELLED: 0, // exclue du calcul, pas pondérée
}

// Calcule un pourcentage 0-100 (arrondi entier) pour un projet,
// à partir de comptes par statut. Ignore CANCELLED au numérateur ET dénominateur.
export function computeProgress(byStatus: Record<DevIssueStatus, number>): number

// Heuristique health v1 :
//   blocked > 0           → 'blocked'
//   urgent > 0 && p < 50  → 'at_risk'
//   sinon                 → 'on_track'
export type ProjectHealth = 'on_track' | 'at_risk' | 'blocked'
export function computeHealth(counts: ProjectCounts, progress: number): ProjectHealth

// Agrégat global (KPI) — accepte un match Mongo optionnel (filtre projet).
export async function computeStats(match?: Record<string, unknown>): Promise<StatsPayload>

// Agrégat par projet pour /overview. Renvoie un projet par DevProject existant,
// même si le projet n'a aucune issue (counts = 0, progress = 0).
export async function computeOverview(): Promise<OverviewPayload>
```

**Convention « blocked » phase 1** : pas de champ dédié encore. On considère bloquée toute issue ayant un label dont le nom (case-insensitive) vaut `blocked` ou `blocker`. À documenter dans le code et le README dev. Le champ `blockedReason` arrivera en phase 2.

### 2. Endpoint `GET /api/admin/dev/stats` enrichi

Rétro-compatible — on ajoute des champs, on n'en retire aucun.

**Avant** :
```json
{ "total": 0, "open": 0, "completedRecent": 0, "totalProjects": 0, "byStatus": {}, "byPriority": {} }
```

**Après** :
```json
{
  "total": 0,
  "open": 0,
  "completedRecent": 0,
  "completed7d": 0,
  "completed14d": 0,
  "urgent": 0,
  "blocked": 0,
  "totalProjects": 0,
  "velocity14d": 0.0,
  "byStatus": {},
  "byPriority": {}
}
```

- `completedRecent` reste = `completed14d` (alias rétro-compat).
- `urgent` : `priority = URGENT AND status NOT IN (DONE, CANCELLED)`.
- `blocked` : issues avec label `blocked`/`blocker` (case-insensitive), status NOT IN (DONE, CANCELLED).
- `velocity14d` : `completed14d / 14`, arrondi à 2 décimales.
- Conserve le paramètre query `?project=<id>` pour filtrer.

### 3. Nouveau `GET /api/admin/dev/overview`

Pas de pagination — la liste reste petite (dizaines de projets max). Permission : `VIEW_DEV`.

**Réponse** :
```json
{
  "kpis": {
    "totalProjects": 4,
    "activeProjects": 3,
    "totalOpen": 27,
    "urgent": 2,
    "blocked": 1,
    "completed7d": 5,
    "completed14d": 11,
    "velocity14d": 0.79
  },
  "projects": [
    {
      "_id": "...",
      "key": "VEN",
      "name": "Venio core",
      "color": "#7c5cff",
      "status": "ACTIVE",
      "lead": { "_id": "...", "name": "...", "email": "..." } | null,
      "counts": {
        "total": 12, "open": 7, "done": 4, "cancelled": 1,
        "urgent": 1, "blocked": 0,
        "byStatus": { "BACKLOG": 2, "TODO": 3, "IN_PROGRESS": 2, "IN_REVIEW": 0, "DONE": 4, "CANCELLED": 1 }
      },
      "progress": 42,
      "health": "at_risk",
      "lastActivityAt": "2026-05-18T14:22:00Z"
    }
  ]
}
```

**Implémentation** :
- Un seul aggregate sur `DevIssue` groupé par `project` retournant `byStatus`, `byPriority`, max(updatedAt), counts dérivés.
- `DevProject.find({})` en parallèle, lookup `lead` minimal (`name email`).
- Merge en mémoire — inclure les projets sans issues (counts = 0).
- `lastActivityAt` = `max(project.updatedAt, max(issue.updatedAt))`.
- Tri : `status ACTIVE` d'abord, puis `lastActivityAt desc`.

### 4. Routes agent miroir

Dans `backend/src/routes/agent/dev.ts`, ajouter :

- `GET /dev/stats` (scope `read:dev`) — accepte `?project=<id>`, même payload que `/admin/dev/stats`.
- `GET /dev/overview` (scope `read:dev`) — même payload que `/admin/dev/overview`.

Les deux délèguent à `computeStats` / `computeOverview`. **Aucune divergence de shape** entre admin et agent — c'est explicite dans le test.

### 5. Tests

`backend/src/__tests__/dev-stats-lib.test.ts` (unitaires, pas de DB) :
- `computeProgress` : vide → 0 ; tout DONE → 100 ; tout CANCELLED → 0 ; mix défini → valeur attendue exacte ; CANCELLED ignorées au dénominateur.
- `computeHealth` : matrice (blocked, urgent, progress) → label attendu.

`backend/src/__tests__/admin-dev-stats.test.ts` (intégration, suit le pattern des autres tests admin) :
- `/stats` rétro-compat : tous les anciens champs présents.
- `/stats` nouveaux champs : urgent, blocked, completed7d, velocity14d.
- `/stats?project=xxx` filtre correctement.
- `/overview` : projets sans issues présents avec progress=0.
- `/overview` : un projet avec issues mixtes → progress et health corrects.
- `/overview` : tri ACTIVE d'abord puis lastActivityAt desc.
- 403 sans permission `VIEW_DEV`.

`backend/src/__tests__/agent-dev-stats.test.ts` :
- Mêmes assertions de shape que admin, via token agent avec scope `read:dev`.
- 401 sans token ; 403 avec scope insuffisant (`write:dev` seul).

### 6. Erreurs & cas limites

- Aucun projet → `kpis = zéros`, `projects = []`.
- Projet sans issues → présent dans `projects`, `progress = 0`, `health = 'on_track'`.
- Issue avec `project` orphelin (projet supprimé non encore cascadé) → ignorée dans `/overview` (l'aggregate ne matche pas avec `DevProject.find`).
- `?project=<id_invalide>` sur `/stats` : actuellement l'ID invalide est silencieusement ignoré (match vide). On garde ce comportement.

## Critères d'acceptation

1. Tous les tests existants de `admin-dev-stats` (s'il y en a) passent toujours.
2. Les 3 nouveaux fichiers de tests passent.
3. `curl /api/admin/dev/stats` retourne les nouveaux champs en plus des anciens.
4. `curl /api/admin/dev/overview` retourne le payload spécifié.
5. `curl /api/v1/agent/dev/overview` avec token scope `read:dev` retourne le même payload.
6. Aucun changement dans `src/pages/admin/dev-workspace/`.
7. Aucune migration de modèle.

## Décisions tranchées (notes de design)

- **Progression pondérée par statut** plutôt que DONE/total brut ou pondérée par estimate : reflète mieux l'avancement réel, ne dépend d'aucun nouveau champ DB, isolation propre de la phase 1.
- **Endpoint dual `/stats` + `/overview`** plutôt qu'un seul endpoint riche : `/stats` reste léger pour widgets KPI, `/overview` porte la donnée par projet. Pas de breaking change.
- **Convention « blocked » par label** plutôt qu'attendre la phase 2 : permet un KPI immédiat sans migration. Sera remplacée par `blockedReason` quand le modèle sera enrichi.
- **Health en heuristique simple** : signal indicatif, pas une métrique d'engagement. Sera affiné quand `targetDate` existera.
