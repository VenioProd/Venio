# Plan de découpage des fichiers obèses (> 800 lignes)

Chantier #8 de l'audit de stabilisation Venio 2026-05-26 ([VENIO-52](https://venio.paris/admin/dev/projects/6a0cd683b41e50fe5a9bed6a)).

Le DOD exige **aucun fichier > 800 lignes dans `src/pages/` ou `backend/src/routes/`**. L'effort dépasse une seule PR (9 fichiers très denses, ~12 000 lignes cumulées avec state local, hooks et logique métier imbriquée), il a été éclaté en 9 issues GitHub indépendantes.

## Inventaire (snapshot au merge du chantier 8)

| Lignes | Fichier | Issue |
|---:|---|---|
| 1702 | [src/pages/admin/education/index.tsx](../../src/pages/admin/education/index.tsx) | [#87](https://github.com/VenioProd/Venio/issues/87) |
| 1677 | [src/pages/admin/InternalProjectList.tsx](../../src/pages/admin/InternalProjectList.tsx) | [#88](https://github.com/VenioProd/Venio/issues/88) |
| 1617 | [src/pages/admin/accounting/Settings.tsx](../../src/pages/admin/accounting/Settings.tsx) | [#89](https://github.com/VenioProd/Venio/issues/89) |
| 1303 | [src/pages/admin/dev-workspace/DevProjectCockpit.tsx](../../src/pages/admin/dev-workspace/DevProjectCockpit.tsx) | [#90](https://github.com/VenioProd/Venio/issues/90) |
| 1292 | [src/pages/admin/intern-list/index.tsx](../../src/pages/admin/intern-list/index.tsx) | [#91](https://github.com/VenioProd/Venio/issues/91) |
| 1151 | [src/pages/admin/dev-workspace/index.tsx](../../src/pages/admin/dev-workspace/index.tsx) | [#92](https://github.com/VenioProd/Venio/issues/92) |
| 1059 | [backend/src/routes/admin/interns.ts](../../backend/src/routes/admin/interns.ts) | [#93](https://github.com/VenioProd/Venio/issues/93) |
| 930  | [src/pages/admin/InternalProjectDetail.tsx](../../src/pages/admin/InternalProjectDetail.tsx) | [#94](https://github.com/VenioProd/Venio/issues/94) |
| 888  | [src/pages/admin/AgentTokensList.tsx](../../src/pages/admin/AgentTokensList.tsx) | [#95](https://github.com/VenioProd/Venio/issues/95) |

Hors scope du DOD (dossier `backend/src/lib/`) mais à garder en tête :
- `backend/src/lib/dev/stats.ts` (799 lignes)
- `backend/src/lib/crmScheduler.ts` (789 lignes)

## Patterns recommandés

### Backend routes (ex: `interns.ts`)
Pattern éprouvé au chantier #7 (consolidation `/api/admin/projects`) :
1. Créer un dossier `routes/admin/<domaine>/`
2. Découper par sous-domaine : `core.ts`, `reports.ts`, `settings.ts`...
3. Router parent `index.ts` qui `router.use(subRouter)` chaque sous-router
4. Conserver les middlewares `auth + requireAdmin` au niveau parent quand possible

### Frontend pages (ex: `accounting/Settings.tsx`)
1. Identifier les sections logiques (onglets, formulaires indépendants)
2. Extraire chaque section en composant dans `pages/admin/<page>/sections/`
3. Extraire les hooks de data fetching dans `pages/admin/<page>/hooks/`
4. Le fichier `index.tsx` ne garde plus que le shell + le state d'orchestration
5. Cible : index.tsx ≈ 100-200 lignes

### Frontend page composite (ex: `education/index.tsx`)
Quand la page contient plusieurs vues (onglets) :
1. Une vue = un fichier dans `pages/admin/<page>/views/`
2. Un hook partagé pour les data fetching dans `pages/admin/<page>/hooks/useXxxData.ts`
3. Le `index.tsx` n'a plus que le `<Routes>` ou le sélecteur d'onglet + le shell

## Règles communes (rappel chantier 8)

- **Pas de feature flag** : on supprime franchement les anciens fichiers, on ne maintient pas deux versions
- **Pas de tests nouveaux** sauf si le découpage naturel en exige (interface entre sous-routers, par ex.)
- **Bench avant/après** dans la PR : `wc -l <fichier-original>` vs `wc -l <fichier-après>`

## Suivi

Avancement à suivre via les 9 issues GitHub (label `refactor` + `audit-2026-05-26`).
