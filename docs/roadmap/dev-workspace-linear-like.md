# Dev Workspace - Plan d'implementation

Date: 2026-05-18

Objectif: creer dans Venio une section dediee au suivi des developpements, separee des modules existants.

## Decision produit

Construire un module dedie, inspire de Linear, mais limite au suivi dev.

Route recommandee: `/admin/dev`

Nom recommande: `Dev Workspace` ou `Dev Command`

Ce module ne doit pas reformater:

- `/admin/gestion`
- `/admin/projets-internes`
- la messagerie interne
- les projets clients
- les tickets support existants

Ces modules servent deja l'equipe et doivent rester stables.

## Pourquoi un module separe

L'usage vise n'est pas la gestion globale Venio mais le remplacement de Linear pour:

- bugs
- features
- refactors
- CI/CD
- deploiements
- PR GitHub
- suivi des agents IA
- backlog technique

Le modele actuel `Task` est lie aux projets clients et a la gestion operationnelle. Le reutiliser directement risquerait de polluer l'existant.

## MVP fonctionnel

### Navigation

Ajouter une entree sidebar admin:

- label: `Dev` ou `Developpement`
- route: `/admin/dev`
- icone: `Code2`, `GitPullRequest` ou `TerminalSquare`

### Vues

- Inbox: issues recentes/non triees
- Backlog
- Active
- My Work
- Blocked
- Review / PR ready
- Done
- Projects
- Agents

### Interface

- Liste dense type Linear
- Panneau detail lateral
- Kanban par statut
- Creation rapide
- Recherche
- Filtres persistants
- Commentaires
- Historique systeme minimal

### Champs issue

- key: `VEN-123`
- title
- description markdown
- type: FEATURE, BUG, CHORE, REFACTOR, SECURITY, CI, DEPLOY, DOC
- status: BACKLOG, TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED, CANCELED
- priority: P0, P1, P2, P3, P4
- assignee humain
- agentAssignee: KURO, MADARA, HASHIRAMA, ZEPHYR, NONE
- project
- labels
- estimate
- dueDate
- parent
- relations
- source: MANUAL, AGENT, GITHUB, LINEAR_IMPORT
- externalLinearId
- completedAt

### Champs GitHub

- repoFullName
- branch
- pullRequestUrl
- pullRequestNumber
- commitSha
- workflowRunUrl
- ciStatus

## Backend

### Modeles a creer

#### `DevProject`

Champs:

- name
- key
- description
- repoFullName
- status: ACTIVE, PAUSED, ARCHIVED
- color
- lead
- createdBy
- timestamps

#### `DevIssue`

Champs:

- key
- project
- title
- description
- type
- status
- priority
- assignee
- agentAssignee
- cycle
- labels
- estimate
- dueDate
- parent
- relations
- github
- source
- externalLinearId
- createdBy
- completedAt
- timestamps

Index:

- project + status
- project + key unique
- assignee + status
- agentAssignee + status
- priority + status
- labels
- github.pullRequestNumber

#### `DevIssueComment`

Champs:

- issue
- author
- agentAuthor
- content
- type: COMMENT, STATUS_UPDATE, AGENT_OUTPUT, SYSTEM
- timestamps

#### `DevCycle` optionnel MVP+

Champs:

- name
- startsAt
- endsAt
- status: PLANNED, ACTIVE, CLOSED
- project optionnel

## API admin

Creer `backend/src/routes/admin/dev.ts`.

Endpoints:

- `GET /api/admin/dev/projects`
- `POST /api/admin/dev/projects`
- `PATCH /api/admin/dev/projects/:id`
- `GET /api/admin/dev/issues`
- `POST /api/admin/dev/issues`
- `GET /api/admin/dev/issues/:id`
- `PATCH /api/admin/dev/issues/:id`
- `DELETE /api/admin/dev/issues/:id` ou soft delete
- `GET /api/admin/dev/issues/:id/comments`
- `POST /api/admin/dev/issues/:id/comments`
- `GET /api/admin/dev/stats`

Filtres:

- project
- status
- priority
- type
- assignee
- agentAssignee
- label
- q
- cycle
- github ciStatus

## API agent

Creer `backend/src/routes/agent/dev.ts`.

Scopes:

- `read:dev`
- `write:dev`

Endpoints:

- `GET /api/v1/agent/dev/projects`
- `GET /api/v1/agent/dev/issues`
- `POST /api/v1/agent/dev/issues`
- `PATCH /api/v1/agent/dev/issues/:id`
- `POST /api/v1/agent/dev/issues/:id/comments`
- `POST /api/v1/agent/dev/issues/:id/agent-status`

Objectif:

- Kuro peut creer une issue depuis Telegram ou une erreur CI.
- Madara/Hashirama peuvent etre assignes.
- Un agent peut poster son etat: queued/running/blocked/done.
- Un agent peut lier une PR, un commit ou un workflow GitHub.
- Le digest quotidien peut lire les issues ouvertes/bloquees.

## Permissions

Ajouter front/back:

- `view_dev`
- `manage_dev`

Roles recommandes:

- SUPER_ADMIN: view + manage
- ADMIN: view + manage selon besoin
- RH/VIEWER: pas d'acces par defaut

Ajouter un test de synchronisation permissions front/back si possible.

## Frontend

Creer:

- `src/pages/admin/DevWorkspace.tsx`
- `src/components/admin/dev/DevIssueList.tsx`
- `src/components/admin/dev/DevIssuePanel.tsx`
- `src/components/admin/dev/DevIssueForm.tsx`
- `src/components/admin/dev/DevKanban.tsx`
- `src/components/admin/dev/DevFilters.tsx`
- `src/services/dev.ts`
- `src/types/dev.types.ts`
- styles dedies ou integration au systeme admin existant

A ajouter:

- route `/admin/dev`
- entree sidebar
- protection par permission

## Import Linear

A faire apres MVP.

Importer depuis CSV ou API:

- Linear Project -> DevProject
- Linear Issue -> DevIssue
- status -> status Venio
- priority -> P0-P4
- assignee email -> User
- labels conserves
- URL Linear gardee en reference

Prevoir un dry-run avant import reel.

## Decoupage execution

### Phase 1 - Socle backend

- [ ] Ajouter permissions `view_dev` / `manage_dev`
- [ ] Creer modeles `DevProject`, `DevIssue`, `DevIssueComment`
- [ ] Ajouter sequence de cle issue par projet
- [ ] Ajouter routes admin dev
- [ ] Ajouter tests backend CRUD + filtres + permissions

### Phase 2 - Frontend MVP

- [ ] Ajouter route `/admin/dev`
- [ ] Ajouter entree sidebar
- [ ] Creer layout DevWorkspace
- [ ] Creer liste dense des issues
- [ ] Creer panneau detail
- [ ] Creer formulaire creation/edition
- [ ] Creer kanban statut
- [ ] Ajouter filtres/recherche

### Phase 3 - API agent

- [ ] Ajouter scopes `read:dev` / `write:dev`
- [ ] Ajouter routes `/api/v1/agent/dev/*`
- [ ] Ajouter OpenAPI agent
- [ ] Ajouter tests integration agent
- [ ] Verifier avec le token Kuro

### Phase 4 - Agents et GitHub

- [ ] Champs agent status
- [ ] Commentaires type AGENT_OUTPUT
- [ ] Champs PR/branch/workflow
- [ ] Vue Agents
- [ ] Action UI "confier a Madara/Hashirama"
- [ ] Mise a jour manuelle ou agent-driven des PR

### Phase 5 - Import Linear

- [ ] Export CSV Linear test
- [ ] Script import dry-run
- [ ] Mapping users/labels/status
- [ ] Import reel apres validation

## Criteres d'acceptation MVP

- Le module dev est accessible sans perturber les modules existants.
- Un admin peut creer un projet dev et des issues.
- Les issues ont une cle stable type `VEN-1`.
- Les vues list/kanban/detail fonctionnent.
- Les filtres principaux fonctionnent.
- Les permissions bloquent les roles non autorises.
- L'API agent permet a Kuro de creer et mettre a jour une issue.
- Les tests backend passent.
- Le build frontend passe.

## Risques a eviter

- Reutiliser `Task` directement et polluer la gestion client/equipe.
- Fusionner trop tot avec projets internes.
- Construire un clone Linear generique sans integration agents/GitHub.
- Oublier l'API agent des le depart.
- Lancer l'import Linear avant d'avoir stabilise le modele.

## Recommandation

Commencer par Phase 1 + Phase 2 en MVP isole.

Une fois le module utilisable, brancher API agent et GitHub.

Ce module doit devenir le cockpit dev interne de Venio, pas une copie decorative de Linear.
