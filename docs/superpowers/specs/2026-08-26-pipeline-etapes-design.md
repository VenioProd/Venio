# Design — Pipeline d'étapes de production + validations client

**Date** : 2026-08-26
**Objectif** : donner à chaque projet un pipeline d'étapes de production ordonnées, visibles par
le client sous forme de timeline, avec des jalons que le client valide nominativement (ou pour
lesquels il demande des retouches) avant que la production ne continue. Les validations sont
horodatées et traçables, le verrouillage des transitions est appliqué côté backend, et les
templates de projet savent pré-instancier un pipeline type.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Modélisation | Nouveau modèle **`ProjectPhase`**, document séparé référençant le projet (pattern `ProjectSection`/`ProjectUpdate`). Rien n'est embarqué dans `Project`. |
| Statuts | `A_VENIR` → `EN_COURS` → (`EN_ATTENTE_VALIDATION` si validation client requise) → `TERMINEE`. Enums français majuscules, convention existante. |
| Verrouillage | Backend : une étape ne peut pas passer `EN_COURS` tant qu'une étape précédente avec `requiresClientValidation=true` n'est pas validée. Les routes admin refusent la transition. |
| Validation client | Nominative et horodatée (même esprit que la signature des `QuoteProposal`), réservée au propriétaire du projet. Mention « Validée par X le … » visible côté client et admin. |
| Retouches | Le client peut demander des retouches avec **commentaire obligatoire** : l'étape repasse `EN_COURS`, l'admin est notifié. |
| Templates | `ProjectTemplate` gagne `defaultPhases` ; instanciation **côté backend** à la création d'un projet depuis un template, puis étapes librement modifiables par projet. |
| Notifications | Système existant (`createNotification`, push web, préférences). Client notifié à la demande de validation ; admins notifiés à la validation ou à la demande de retouches. |
| Hors périmètre | Demandes de changement (change requests) et coffre documentaire : chantiers séparés. Voir §Hors périmètre. |

## Contexte : ce qui existe déjà et qu'on réutilise

### Backend

- **Pattern de modèle** : [`backend/src/models/ProjectSection.ts`](../../../backend/src/models/ProjectSection.ts)
  — document séparé avec `project: ObjectId ref 'Project'`, `title`, `description`, `order`,
  `createdBy`, `timestamps: true`, index composé `{ project: 1, order: 1 }`. `ProjectPhase` suit
  exactement ce squelette. Les interfaces vivent dans
  `backend/src/types/models/project.ts` (ré-exportées par `backend/src/types/models/index.ts`),
  les enums dans `backend/src/types/enums.ts`.
- **Pattern de validation nominative** : le `signatureSchema` de
  [`backend/src/models/QuoteProposal.ts`](../../../backend/src/models/QuoteProposal.ts)
  (`signedAt`, `signerUserId`, `signerName`, `signerEmail`) — le bloc `validation` de
  `ProjectPhase` en reprend l'esprit (horodatage + identité dénormalisée dans le document).
- **Routes admin** : sous-routers de `backend/src/routes/admin/projects/`
  ([`sections.ts`](../../../backend/src/routes/admin/projects/sections.ts) comme référence) :
  `router.use(auth)` (`backend/src/middleware/auth.ts`) + `router.use(requireAdmin)` puis
  `requirePermission(PERMISSIONS.X)` par route (`backend/src/middleware/role.ts`,
  `backend/src/lib/permissions.ts`). Montage dans
  [`backend/src/routes/admin/projects/index.ts`](../../../backend/src/routes/admin/projects/index.ts)
  sous le préfixe `/api/admin/projects`.
- **Routes client** : [`backend/src/routes/client/projectContent.ts`](../../../backend/src/routes/client/projectContent.ts)
  comme référence : `auth`, refus `403` si `req.user!.role !== 'CLIENT'`, scoping par
  `getProjectAccess(projectId, req.user!.id)` de
  [`backend/src/lib/projectAccess.ts`](../../../backend/src/lib/projectAccess.ts) (retourne
  `{ project, role: 'OWNER' | 'EDITOR' | 'VIEWER' }`, `404` si pas d'accès — on ne révèle pas
  l'existence du projet), sanitisation des items (`storagePath` et `createdBy` masqués).
  Restriction propriétaire : pattern `OWNER_REQUIRED` de `loadEditableProposal` dans
  [`backend/src/routes/client/quotes.ts`](../../../backend/src/routes/client/quotes.ts).
  Montage dans `backend/src/index.ts` sous `/api/projects` (à côté de
  `clientProjectContentRoutes`, `clientQuoteRoutes`).
- **Notifications** : `createNotification` de
  [`backend/src/lib/notifications.ts`](../../../backend/src/lib/notifications.ts) (in-app +
  socket `notification:new` + push web via `sendPushToUser` de `backend/src/lib/webPush.ts`,
  en respectant `shouldNotify` de `backend/src/lib/notificationPreferences.ts`). Broadcast :
  `notifyUsers` / `notifySuperAdmins` de
  [`backend/src/lib/notifyHelpers.ts`](../../../backend/src/lib/notifyHelpers.ts) (`notifyUsers`
  déduplique les destinataires). Les abonnements push (`backend/src/routes/push.ts`,
  `PushSubscription`) ne sont pas modifiés : tout passe par `createNotification`.
- **Traçabilité** : `logActivity` de
  [`backend/src/lib/activityLog.ts`](../../../backend/src/lib/activityLog.ts) +
  enum d'actions dans [`backend/src/models/ActivityLog.ts`](../../../backend/src/models/ActivityLog.ts)
  et `ActivityAction` dans `backend/src/types/enums.ts`. Le flux client
  `GET /api/projects/:id/activity` (`backend/src/routes/projects.ts`) filtre sur une liste
  blanche `clientVisibleActions`.
- **RBAC** : [`rbac-matrix.json`](../../../rbac-matrix.json) (racine du repo) est la source de
  vérité : le frontend l'importe directement (`src/lib/permissions.ts`), le backend duplique
  dans `backend/src/lib/permissions.ts` (`PERMISSIONS` + `ROLE_PERMISSIONS`) et le test
  [`backend/src/__tests__/rbac-matrix.test.ts`](../../../backend/src/__tests__/rbac-matrix.test.ts)
  vérifie la synchronisation.
- **Templates** : [`backend/src/models/ProjectTemplate.ts`](../../../backend/src/models/ProjectTemplate.ts)
  (`defaultSections`, `defaultTasks`), CRUD dans
  [`backend/src/routes/admin/templates.ts`](../../../backend/src/routes/admin/templates.ts)
  (filtrage `Array.isArray(x) ? x.filter((s) => s.title) : []`) et variante agent
  `backend/src/routes/agent/templates.ts`.

### Frontend

- **Client** : [`src/pages/espace-client/ProjectDetail.tsx`](../../../src/pages/espace-client/ProjectDetail.tsx),
  onglet `progress` (libellé « Avancement » — c'est l'onglet « Progression » du cadrage ;
  clé d'URL `?tab=progress` via `useTabState` de `src/hooks/useTabState.ts`). Il affiche
  aujourd'hui les infos projet/échéances, l'avancement des tâches et le fil d'activité —
  blocs conservés. Réutilise `ItemCard` (`src/components/ItemCard.tsx`) et `apiDownload`
  pour les livrables.
- **Admin** : `src/pages/admin/ProjectDetail.tsx` est un ré-export de
  [`src/pages/admin/project-detail/index.tsx`](../../../src/pages/admin/project-detail/index.tsx)
  (onglets `details` / `content` / `tasks` / `activity` / `updates` / `documents` / `messages`,
  composants par onglet dans `src/pages/admin/project-detail/`, logique contenu dans
  `hooks/useProjectContent.ts`). Gating UI par `hasPermission(user, PERMISSIONS.X)` de
  `src/lib/permissions.ts`.
- **Types partagés frontend** : [`src/types/project.types.ts`](../../../src/types/project.types.ts).
- **Routes canoniques** (`src/App.tsx`) : client `/espace-client/projets/:id`,
  admin `/admin/projets/:id` (les liens `/admin/projects/:id` sont des redirects).

## Modèle de données

### Nouveau modèle `ProjectPhase`

Fichier : `backend/src/models/ProjectPhase.ts`. Interface `IProjectPhase` (+
`IPhaseValidation`, `IPhaseRevisionRequest`) dans `backend/src/types/models/project.ts`,
ré-exportée par `backend/src/types/models/index.ts`. Nouvel enum dans
`backend/src/types/enums.ts` :

```ts
export type PhaseStatus = 'A_VENIR' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'TERMINEE'
```

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `project` | ObjectId ref `Project`, required | — | Rattachement (pattern `ProjectSection`) |
| `title` | String, required | — | Nom de l'étape |
| `description` | String | `''` | Détail affiché au client |
| `order` | Number | `0` | Position dans le pipeline (tri croissant) |
| `dueAt` | Date | `null` | Échéance indicative, optionnelle |
| `status` | enum `PhaseStatus` | `'A_VENIR'` | Statut courant |
| `requiresClientValidation` | Boolean | `false` | Jalon bloquant : le client doit valider |
| `linkedItems` | [ObjectId ref `ProjectItem`] | `[]` | Livrables que le client consulte avant de valider |
| `validation.validatedBy` | ObjectId ref `User` | `null` | Qui a validé |
| `validation.validatedByName` | String | `''` | Nom dénormalisé au moment de la validation (même esprit que `signerName` de `QuoteProposal`) |
| `validation.validatedAt` | Date | `null` | Horodatage de la validation |
| `validation.comment` | String | `''` | Commentaire optionnel du client |
| `revisionRequests[]` | sous-docs (`_id: true`) | `[]` | Historique des demandes de retouches |
| `revisionRequests[].requestedBy` | ObjectId ref `User`, required | — | Auteur de la demande |
| `revisionRequests[].requestedByName` | String | `''` | Nom dénormalisé |
| `revisionRequests[].comment` | String, required | — | Commentaire (obligatoire) |
| `revisionRequests[].createdAt` | Date | `Date.now` | Horodatage |
| `revisionRequests[].resolvedAt` | Date | `null` | Résolution par l'admin (`null` = ouverte) |
| `revisionRequests[].resolvedBy` | ObjectId ref `User` | `null` | Admin qui a résolu |
| `createdBy` | ObjectId ref `User`, required | — | Traçabilité (pattern `ProjectSection`) |
| timestamps | `{ timestamps: true }` | — | `createdAt` / `updatedAt` |

Index : `projectPhaseSchema.index({ project: 1, order: 1 })` (pattern `ProjectSection`).

Le sous-schema `validation` est déclaré `{ _id: false }` avec `default: () => ({})` (pattern
`signatureSchema`). Une étape est dite **validée** ssi `validation.validatedAt !== null`.

### Modification `ProjectTemplate`

Fichier : `backend/src/models/ProjectTemplate.ts` + interface `ITemplatePhase` dans
`backend/src/types/models/project.ts` :

```ts
defaultPhases: [
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    requiresClientValidation: { type: Boolean, default: false },
  },
]
```

L'ordre d'instanciation est l'ordre du tableau (pas de champ `order` dans le template).
`dueAt` et `linkedItems` ne sont pas templatisables (dates et livrables sont propres à chaque
projet).

Routes à étendre pour accepter `defaultPhases` (même filtrage que `defaultSections` :
`Array.isArray(defaultPhases) ? defaultPhases.filter((p) => p.title) : []`) :
- `POST /api/admin/templates` et `PATCH /api/admin/templates/:id`
  (`backend/src/routes/admin/templates.ts`) ;
- `POST` / `PATCH` de `backend/src/routes/agent/templates.ts` (miroir du champ, aucune autre
  route agent n'est ajoutée).

### Instanciation depuis un template

`POST /api/admin/projects` (`backend/src/routes/admin/projects/core.ts`) accepte un champ
optionnel `templateId` :

1. Si `templateId` est fourni et résout vers un `ProjectTemplate` existant, après le
   `Project.create(...)` le backend crée un `ProjectPhase` par entrée de `defaultPhases`
   (`order` = index du tableau, `status: 'A_VENIR'`, `createdBy` = admin appelant,
   `dueAt: null`, `linkedItems: []`).
2. `templateId` invalide ou inconnu → `400` (`{ error: 'Template non trouvé' }`), aucun projet
   créé (la vérification précède `Project.create`).
3. Sans `templateId` : comportement actuel inchangé, aucune étape créée.
4. Les étapes instanciées sont ensuite librement modifiables par projet (ajout, retrait,
   renommage, réordonnancement) via les routes admin ci-dessous ; aucun lien n'est conservé
   vers le template.

Côté frontend, `src/pages/admin/project-form/index.tsx` mémorise l'`_id` du template
sélectionné dans `applyTemplate` (nouvel état `selectedTemplateId`) et l'envoie dans le
payload de création. Le comportement existant d'`applyTemplate` (pré-remplissage description,
serviceTypes, tags, priorité, budget) est conservé tel quel.

> Note d'ancrage : aujourd'hui `defaultSections`/`defaultTasks` ne sont **pas** instanciés à la
> création (le template ne sert qu'à pré-remplir le formulaire ; les sections par défaut
> viennent de l'automation `project.auto_create_full_workspace`,
> `backend/src/automation/jobs/projectAutoWorkspace.ts`, indépendante des templates). Ce
> chantier n'y touche pas : seules les `defaultPhases` sont instanciées côté backend, via le
> `templateId` transmis explicitement. Aligner sections/tâches sur ce mécanisme est un
> chantier séparé.

## Transitions de statut et règles de verrouillage

### Règle de verrouillage (backend, unique source de vérité)

Une étape `P` peut passer `EN_COURS` **ssi** toute étape du même projet avec
`order < P.order` et `requiresClientValidation === true` est validée
(`validation.validatedAt !== null`). La règle porte sur *toutes* les étapes précédentes (pas
seulement l'immédiate), ce qui la rend robuste au réordonnancement. Refus : `409` avec
`code: 'PHASE_LOCKED'` et `blockingPhase: { _id, title }` dans la réponse (pattern des codes
d'erreur de `backend/src/routes/client/quotes.ts` : `OWNER_REQUIRED`, `PROPOSAL_EXPIRED`…).

### Tableau des transitions autorisées

| De | Vers | Qui | Endpoint | Conditions / refus |
|---|---|---|---|---|
| `A_VENIR` | `EN_COURS` | Admin (`manage_phases`) | `POST …/start` | Règle de verrouillage ci-dessus, sinon `409 PHASE_LOCKED` |
| `EN_COURS` | `EN_ATTENTE_VALIDATION` | Admin (`manage_phases`) | `POST …/request-validation` | `requiresClientValidation === true`, sinon `409 VALIDATION_NOT_REQUIRED`. Notifie le client. |
| `EN_COURS` | `TERMINEE` | Admin (`manage_phases`) | `POST …/complete` | `requiresClientValidation === false`, sinon `409 CLIENT_VALIDATION_REQUIRED` (l'admin ne peut pas court-circuiter un jalon client ; l'échappatoire assumée : annuler la demande si l'étape est `EN_ATTENTE_VALIDATION`, passer `requiresClientValidation` à `false` via `PATCH` — geste explicite et tracé — puis `complete`). |
| `EN_ATTENTE_VALIDATION` | `TERMINEE` | Client **OWNER** | `POST /api/projects/…/validate` | Écrit le bloc `validation` (nominatif, horodaté). `403 OWNER_REQUIRED` pour EDITOR/VIEWER. Notifie les admins. |
| `EN_ATTENTE_VALIDATION` | `EN_COURS` | Client OWNER ou EDITOR | `POST /api/projects/…/revisions` | Commentaire obligatoire (`422 COMMENT_REQUIRED` si vide après trim). Ajoute une entrée `revisionRequests`. Notifie les admins. |
| `EN_ATTENTE_VALIDATION` | `EN_COURS` | Admin (`manage_phases`) | `POST …/cancel-validation-request` | Annule la demande sans trace de retouche. |
| `EN_COURS` | `A_VENIR` | Admin (`manage_phases`) | `POST …/revert` | Toujours autorisé (étape non validée par construction). |
| `TERMINEE` | `EN_COURS` | Admin (`manage_phases`) | `POST …/revert` | **Uniquement si non validée** (`validation.validatedAt === null`), sinon `409 VALIDATED_PHASE_IMMUTABLE`. Rouvrir un jalon validé par le client est hors périmètre. |

Toute autre transition → `409` `{ code: 'INVALID_TRANSITION' }`.

### Immutabilité d'une étape validée

Une étape validée (`validation.validatedAt !== null`) est figée dans ce qu'elle atteste :

- `PATCH` refuse `title`, `description`, `dueAt`, `requiresClientValidation`, `linkedItems`
  (`409 VALIDATED_PHASE_IMMUTABLE`) ; seul `order` reste modifiable (le réordonnancement
  d'affichage n'altère pas la preuve, et la règle de verrouillage ne regarde que des étapes
  déjà validées).
- `DELETE` refuse (`409 VALIDATED_PHASE_IMMUTABLE`).

## API

Tous les payloads/réponses sont en JSON, erreurs `{ error, code? }` (conventions existantes).

### Admin — nouveau sous-router `backend/src/routes/admin/projects/phases.ts`

Monté dans `backend/src/routes/admin/projects/index.ts` (préfixe `/api/admin/projects`).
Middlewares : `auth` + `requireAdmin` en tête de router, `requirePermission(...)` par route.
Chaque route vérifie d'abord `Project.findById(projectId)` → `404` (pattern `sections.ts`).

| Méthode | Chemin | Permission | Payload → effet |
|---|---|---|---|
| GET | `/:projectId/phases` | `view_phases` | — → `{ phases }` triées par `order`, `linkedItems` peuplés (`title type status isVisible`), `revisionRequests[].requestedBy` et `validation.validatedBy` peuplés (`name email`) |
| POST | `/:projectId/phases` | `manage_phases` | `{ title (requis), description?, dueAt?, requiresClientValidation?, linkedItems?, order? }` → crée l'étape (`status: 'A_VENIR'`, `createdBy` = appelant ; `order` auto = max+1 si absent, pattern `sections.ts` ; chaque id de `linkedItems` doit appartenir au projet sinon `422 INVALID_LINKED_ITEMS`) |
| PATCH | `/:projectId/phases/:phaseId` | `manage_phases` | `{ title?, description?, dueAt?, requiresClientValidation?, linkedItems?, order? }` → modifie (voir immutabilité ; jamais `status` ni `validation` par cette route) |
| PATCH | `/:projectId/phases/reorder` | `manage_phases` | `{ phaseIds: string[] }` → `order` = index dans le tableau ; `422 INVALID_PHASE_LIST` si la liste ne couvre pas exactement les étapes du projet |
| POST | `/:projectId/phases/:phaseId/start` | `manage_phases` | — → `A_VENIR` → `EN_COURS` (verrouillage §ci-dessus) |
| POST | `/:projectId/phases/:phaseId/request-validation` | `manage_phases` | — → `EN_COURS` → `EN_ATTENTE_VALIDATION`, notifie le client |
| POST | `/:projectId/phases/:phaseId/complete` | `manage_phases` | — → `EN_COURS` → `TERMINEE` (si `requiresClientValidation=false`) |
| POST | `/:projectId/phases/:phaseId/cancel-validation-request` | `manage_phases` | — → `EN_ATTENTE_VALIDATION` → `EN_COURS` |
| POST | `/:projectId/phases/:phaseId/revert` | `manage_phases` | — → `EN_COURS`→`A_VENIR` ou `TERMINEE`(non validée)→`EN_COURS` |
| POST | `/:projectId/phases/:phaseId/revisions/:revisionId/resolve` | `manage_phases` | — → `resolvedAt = now`, `resolvedBy` = appelant ; `409 REVISION_ALREADY_RESOLVED` si déjà résolue |
| DELETE | `/:projectId/phases/:phaseId` | `manage_phases` | — → supprime (refus si validée) |

Toutes les routes de mutation renvoient `{ phase }` (ou `{ phases }` pour `reorder`,
`{ message }` pour `DELETE`) et journalisent via `logActivity` (§Sécurité).

> Attention Express : déclarer `PATCH /:projectId/phases/reorder` **avant**
> `PATCH /:projectId/phases/:phaseId`, sinon `reorder` est capturé par `:phaseId`.

### Client — nouveau router `backend/src/routes/client/projectPhases.ts`

Monté dans `backend/src/index.ts` sous `/api/projects` (à côté de
`clientProjectContentRoutes`). Middlewares/garde-fous du pattern `projectContent.ts` :
`auth`, `403` si rôle ≠ `CLIENT`, `getProjectAccess` → `404` sinon.

| Méthode | Chemin | Accès | Payload → effet |
|---|---|---|---|
| GET | `/:projectId/phases` | OWNER, EDITOR, VIEWER | — → `{ phases }` triées par `order`. `linkedItems` peuplés mais **filtrés `isVisible: true`** et sanitisés (`storagePath` et `createdBy` masqués, pattern `projectContent.ts`) ; `createdBy` de l'étape masqué ; `revisionRequests` exposées (`requestedByName`, `comment`, `createdAt`, `resolvedAt`). |
| POST | `/:projectId/phases/:phaseId/validate` | **OWNER uniquement** (`403 OWNER_REQUIRED` sinon, pattern `quotes.ts`) | `{ comment? }` → exige `status === 'EN_ATTENTE_VALIDATION'` (`409 INVALID_TRANSITION` sinon) ; écrit `validation = { validatedBy: user.id, validatedByName: user.name, validatedAt: now, comment }`, `status = 'TERMINEE'` ; notifie les admins. |
| POST | `/:projectId/phases/:phaseId/revisions` | OWNER ou EDITOR (`403` pour VIEWER) | `{ comment }` **obligatoire** (`422 COMMENT_REQUIRED` si vide après trim) → exige `status === 'EN_ATTENTE_VALIDATION'` ; pousse `revisionRequests += { requestedBy, requestedByName, comment, createdAt: now }`, `status = 'EN_COURS'` ; notifie les admins. |

Le téléchargement/consultation des livrables liés passe par les routes client existantes
`GET /api/projects/:projectId/items/:itemId` et `…/download` — rien à ajouter.

## UI client

Fichier : `src/pages/espace-client/ProjectDetail.tsx`, onglet `progress`
(« Avancement », `?tab=progress`). Nouveaux types `PhaseStatus`, `ProjectPhase`,
`PhaseRevisionRequest` dans `src/types/project.types.ts`.

- Chargement : `GET /api/projects/:id/phases` ajouté au `Promise.all` initial (échec toléré
  comme `task-progress`).
- **Timeline verticale des étapes en tête d'onglet** ; les blocs existants (« Informations du
  projet » avec priorité/dates/échéances, « Avancement des tâches », « Activité récente »)
  sont conservés en dessous, inchangés.
- Chaque étape : indicateur d'état (point/numéro sur la ligne verticale), titre, description,
  `dueAt` formatée (`toLocaleDateString('fr-FR')`, conventions du fichier), badge de statut.
  Libellés : `A_VENIR` → « À venir », `EN_COURS` → « En cours », `EN_ATTENTE_VALIDATION` →
  « En attente de votre validation », `TERMINEE` → « Terminée ».
- Étape validée : mention **« Validée par {validatedByName} le {validatedAt} »** (+ commentaire
  éventuel).
- Étape `EN_ATTENTE_VALIDATION` (mise en avant visuelle) :
  - liste des `linkedItems` rendue avec `ItemCard` (téléchargement via `downloadItem`
    existant) ;
  - `accessRole === 'OWNER'` : champ commentaire (optionnel pour valider, obligatoire pour
    les retouches) + boutons **« Valider cette étape »** (confirmation avant envoi →
    `POST …/validate`) et **« Demander des retouches »** (désactivé tant que le commentaire
    est vide → `POST …/revisions`) ; rechargement des phases après succès ;
  - `accessRole === 'EDITOR'` : mention « En attente de validation par le propriétaire du
    projet » + bouton « Demander des retouches » seul (commentaire obligatoire) ;
  - `accessRole === 'VIEWER'` : mention seule, aucun bouton.
- Demandes de retouches non résolues : affichées sous l'étape (commentaire + date), pour que
  le client retrouve ce qu'il a demandé.
- État vide (aucune étape) : bloc vide du même style que les autres onglets
  (« Le déroulé du projet apparaîtra ici. ») ; les blocs existants restent affichés.

## UI admin

Fichier : `src/pages/admin/project-detail/index.tsx` — nouvel onglet **« Étapes »**
(clé `phases`, `?tab=phases`), rendu par un nouveau composant
`src/pages/admin/project-detail/ProjectPhasesTab.tsx` avec sa logique dans
`src/pages/admin/project-detail/hooks/useProjectPhases.ts` (miroir du pattern
`useProjectContent`). Gating : onglet visible si `hasPermission(user, PERMISSIONS.VIEW_PHASES)`,
actions si `MANAGE_PHASES` (garde-fou `ensurePermission` existant).

Fonctionnalités :

- Liste ordonnée des étapes avec statut, `dueAt`, badge « Validation client requise »,
  mention « Validée par X le … » le cas échéant, compteur de demandes de retouches ouvertes.
- **Réordonner** : boutons monter/descendre par ligne → `PATCH …/phases/reorder` avec la liste
  complète des ids réordonnée. Le réordonnancement reste possible sur une étape validée
  (seule l'édition de son contenu est figée, cf. §Immutabilité).
- **Créer / éditer / supprimer** : formulaire titre, description, échéance,
  case « Validation client requise », sélection multiple des livrables liés parmi les `items`
  du projet déjà chargés par la page (un item lié avec `isVisible=false` affiche un
  avertissement : le client ne le verra pas). Champs désactivés sur étape validée.
- **Actions de transition** par étape selon son statut : « Démarrer », « Demander la
  validation client », « Marquer terminée », « Annuler la demande », « Rouvrir » —
  mappées 1:1 sur les endpoints ; les erreurs `409` (`PHASE_LOCKED`, etc.) sont affichées via
  le `setError` existant, avec le titre de l'étape bloquante pour `PHASE_LOCKED`.
- **Demandes de retouches** : sous chaque étape, liste des demandes (auteur, date,
  commentaire, état) avec bouton « Marquer traitée » → `POST …/resolve`.

## Notifications (événements → destinataires)

Trois nouveaux types, ajoutés à **quatre endroits** (tous nécessaires) :
`NotificationType` dans `backend/src/types/enums.ts`, **l'enum du modèle**
`backend/src/models/Notification.ts`, `NOTIFICATION_TYPES` dans
`backend/src/models/NotificationPreferences.ts` (pour l'écran de préférences), et
`NOTIFICATION_TYPE_LABELS` dans `src/services/notificationPreferences.ts`.

| Événement (déclencheur) | Type | Destinataires | Lien |
|---|---|---|---|
| Admin demande la validation (`request-validation`) | `PHASE_VALIDATION_REQUESTED` | `project.client` (propriétaire) via `createNotification` | `/espace-client/projets/:id?tab=progress` |
| Client valide l'étape (`validate`) | `PHASE_VALIDATED` | `project.assignedTo` (si défini) + tous les `SUPER_ADMIN` actifs, via `notifyUsers` (dédupliqué, `excludeUserId` sans objet : l'acteur est un client) | `/admin/projets/:id?tab=phases` |
| Client demande des retouches (`revisions`) | `PHASE_REVISION_REQUESTED` | idem `PHASE_VALIDATED` | `/admin/projets/:id?tab=phases` |

`metadata` : `{ projectId, phaseId }` dans les trois cas. In-app + push découlent
automatiquement de `createNotification` (préférences par type et par canal respectées) ;
**aucun email dédié** dans ce chantier (le canal `email` des préférences reste sans effet pour
ces types, comme pour la plupart des types existants).

## Sécurité & RBAC

- **Nouvelles permissions** : `VIEW_PHASES: 'view_phases'` et `MANAGE_PHASES: 'manage_phases'`,
  ajoutées en parallèle dans :
  1. `rbac-matrix.json` → `permissions` + `rolePermissions` ;
  2. `backend/src/lib/permissions.ts` → `PERMISSIONS` + `ROLE_PERMISSIONS`.
  La synchronisation est vérifiée par `backend/src/__tests__/rbac-matrix.test.ts` ; le
  frontend lit la matrice directement (`src/lib/permissions.ts`), rien d'autre à faire côté
  front.
- **Attribution** (miroir exact de `view_content`/`edit_content`) :
  `view_phases` → SUPER_ADMIN, ADMIN, MANAGER, RH, COMMERCIAL, VIEWER, STAGIAIRE ;
  `manage_phases` → SUPER_ADMIN, ADMIN, MANAGER.
- Pas d'entrée `apiActions` dans la matrice : cette section ne recense que les actions
  exposées aux agents API, et ce chantier n'ajoute **aucune route agent**.
- **Scoping client** : toutes les routes client passent par `getProjectAccess`
  (`backend/src/lib/projectAccess.ts`) — `404` hors périmètre, validation réservée à `OWNER`,
  retouches à `OWNER`/`EDITOR`, lecture pour les trois rôles. `linkedItems` filtrés
  `isVisible: true` et sanitisés.
- **Traçabilité `ActivityLog`** : nouvelles actions ajoutées à l'enum du modèle
  (`backend/src/models/ActivityLog.ts`) et à `ActivityAction` (`backend/src/types/enums.ts`) :
  `PHASE_CREATED`, `PHASE_UPDATED`, `PHASE_DELETED`, `PHASE_STATUS_CHANGED`,
  `PHASE_VALIDATION_REQUESTED`, `PHASE_VALIDATED`, `PHASE_REVISION_REQUESTED`,
  `PHASE_REVISION_RESOLVED`. Chaque route de mutation (admin et client) appelle `logActivity`
  avec un `summary` français explicite (ex. « Étape "Maquettes" validée par Jean Dupont »)
  et `metadata: { phaseId, from?, to? }`.
- **Visibilité client du fil d'activité** : `PHASE_STATUS_CHANGED`, `PHASE_VALIDATED` et
  `PHASE_REVISION_REQUESTED` sont ajoutés à `clientVisibleActions` dans
  `backend/src/routes/projects.ts`, avec libellés/icônes correspondants dans
  `getActivityLabel`/`getActivityIcon` de `src/pages/espace-client/ProjectDetail.tsx`.
  Les autres actions PHASE_* restent internes.

## Tests

Backend (vitest, patterns existants : tests colocalisés type
`backend/src/models/InboxPin.test.ts` et suite `backend/src/__tests__/`) :

1. **Transitions verrouillées** (routes admin) :
   - étape 2 refuse `start` (`409 PHASE_LOCKED` + `blockingPhase`) tant que l'étape 1
     (`requiresClientValidation=true`) n'est pas validée ; accepte après validation ;
   - `complete` refuse sur une étape `requiresClientValidation=true`
     (`409 CLIENT_VALIDATION_REQUIRED`) ;
   - `request-validation` refuse si `requiresClientValidation=false`
     (`409 VALIDATION_NOT_REQUIRED`) ;
   - `revert` refuse sur étape validée, `PATCH` (hors `order`) et `DELETE` refusent sur étape
     validée (`409 VALIDATED_PHASE_IMMUTABLE`) ;
   - transition non listée → `409 INVALID_TRANSITION`.
2. **Validation traçable** (routes client) :
   - `validate` par le OWNER écrit `validatedBy`, `validatedByName`, `validatedAt` et passe
     l'étape `TERMINEE` ; par un EDITOR → `403 OWNER_REQUIRED` ;
   - `revisions` sans commentaire (ou espaces) → `422 COMMENT_REQUIRED` ; avec commentaire :
     entrée `revisionRequests` horodatée + statut `EN_COURS` ;
   - `resolve` admin renseigne `resolvedAt`/`resolvedBy` ; double résolution →
     `409 REVISION_ALREADY_RESOLVED` ;
   - scoping : un client sans accès au projet reçoit `404` ; `linkedItems` de la liste client
     ne contiennent ni `storagePath` ni item `isVisible:false`.
3. **Instanciation depuis template** :
   - `POST /api/admin/projects` avec `templateId` (template à N `defaultPhases`) crée N
     `ProjectPhase` en `A_VENIR`, `order` 0..N-1, `requiresClientValidation` recopié ;
   - `templateId` inconnu → `400` sans projet créé ; sans `templateId` → aucune étape ;
   - les étapes instanciées sont modifiables/supprimables ensuite (aucun couplage template).
4. **RBAC** : `rbac-matrix.test.ts` passe avec les deux nouvelles permissions (matrice et
   `backend/src/lib/permissions.ts` synchronisés) ; une route `phases` admin répond `403` pour
   un rôle sans la permission (ex. COMMERCIAL sur `POST …/phases`).
5. **Notifications** : `request-validation` crée une notification `PHASE_VALIDATION_REQUESTED`
   pour `project.client` ; `validate`/`revisions` notifient `assignedTo` + SUPER_ADMIN sans
   doublon (types présents dans l'enum du modèle `Notification` — l'oubli ferait échouer la
   création en silence, cf. friction connue ci-dessous).

## Hors périmètre (chantiers séparés)

- **Demandes de changement** (change requests : le client demande une évolution hors
  pipeline) — chantier séparé ; `revisionRequests` ne couvre que les retouches d'un jalon en
  attente de validation.
- **Coffre documentaire** (dépôt/organisation de documents côté client) — chantier séparé ;
  ce chantier ne fait que *référencer* des `ProjectItem` existants.
- Emails transactionnels dédiés aux étapes (seuls in-app + push sont câblés ici).
- Routes agent (`/api/v1/agent/...`) pour les étapes, et entrée `apiActions` associée.
- Alignement de l'instanciation de `defaultSections`/`defaultTasks` sur le mécanisme
  `templateId` (comportement actuel conservé).
- Rouvrir/invalider une étape déjà validée par le client.
- Les dettes connues de l'espace client (tokens de reset en mémoire, politique de mot de
  passe, 2FA client) restent traitées ailleurs.

## Frictions connues du code existant (à traiter pendant l'implémentation)

1. **Enum du modèle `Notification` désynchronisé** : `backend/src/models/Notification.ts`
   n'accepte qu'une douzaine de types alors que `NotificationType`
   (`backend/src/types/enums.ts`) en compte ~50. Exemple réel : `PROJECT_ITEM_VALIDATED`
   émis par `backend/src/routes/admin/projects/items.ts:228` échoue en validation Mongoose et
   est avalé par le `.catch(() => {})`. Les trois nouveaux types **doivent** être ajoutés à
   l'enum du modèle (le test n°5 le verrouille). La resynchronisation complète de l'enum est
   un correctif opportuniste hors de ce chantier.
2. **Templates non instanciés côté backend** : la décision « étapes instanciées à la création
   depuis un template » impose le nouveau champ `templateId` sur `POST /api/admin/projects`
   (voir §Instanciation) puisque ni le backend ni le formulaire n'instancient quoi que ce soit
   aujourd'hui — sans remettre en cause la décision, c'est le chemin qui la rend possible.
