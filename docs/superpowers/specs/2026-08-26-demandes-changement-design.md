# Design — Demandes de changement client

Date : 2026-08-26
Statut : cadrage validé, prêt pour plan d'implémentation
Dépôt : frontend React+Vite (`src/`), backend Express+Mongoose (`backend/src/`)

## Objectif

Permettre à un client (compte `User` rôle `CLIENT`, ou un collaborateur invité sur ses
projets) de soumettre des **demandes de changement** depuis l'espace client — avec ou sans
projet actif (ex. site livré en maintenance) — puis à l'admin de les **qualifier** :

- **incluse** (retouche/maintenance) → planifiée directement ;
- **à chiffrer** → une `QuoteProposal` préremplie est créée et liée à la demande ; la
  **signature du devis** fait passer la demande en `PLANIFIEE` automatiquement ;
- **refusée** (motif obligatoire).

La demande est ensuite suivie jusqu'à la livraison et la validation par le client, avec fil
de discussion, pièces jointes, notifications dans les deux sens et traçabilité.

## Contexte existant (fichiers réutilisés)

| Brique | Fichier | Ce qu'on réutilise |
|---|---|---|
| Pièces jointes + fil de discussion | `backend/src/models/InternalTicket.ts` | `fileSchema` (`filename`, `originalName`, `mimetype`, `size`, `_id:false`) et `replySchema` (`authorId`, `authorName`, `message`, `attachments`, `timestamps: { createdAt: true, updatedAt: false }`) — patterns copiés dans le nouveau modèle |
| Upload multer | `backend/src/routes/admin/tickets.ts` | `multer.diskStorage` vers un dossier dédié, nom `${Date.now()}-${safeName}` (regex `[^a-zA-Z0-9._-]` → `_`), limite 50 Mo, `upload.array('files', 10)`, route de service de fichiers avec garde anti-traversée (`filePath.startsWith(uploadsDir)`) et vérification d'appartenance du fichier à un document visible |
| Sync Nextcloud | `backend/src/lib/nextcloud.ts` | `syncUploadToNextcloud(file, type, id)` — le type `UploadType` est une union fermée : ajouter `'demandes-client'` à `UploadType` **et** à `UPLOAD_FOLDER_LABELS` (label `Demandes-Client`) |
| Devis | `backend/src/models/QuoteProposal.ts` | `project`/`client`/`createdBy` **requis**, statuts `DRAFT/SENT/SIGNED/EXPIRED/CANCELLED` ; création admin via `POST /api/admin/quote-proposals` (`backend/src/routes/admin/quoteProposals.ts`, `PERMISSIONS.MANAGE_BILLING`) |
| **Route de signature (siège du hook)** | `backend/src/routes/client/quotes.ts` — `router.post('/:projectId/proposals/:id/sign', …)` (déclarée l. 217), monté par `app.use('/api/projects', clientQuoteRoutes)` dans `backend/src/index.ts` ⇒ URL effective **`POST /api/projects/:projectId/proposals/:id/sign`** | Le verrou `lockProposalForSignature` (`backend/src/lib/quoteSignature.ts`, `findOneAndUpdate({ _id, status: 'SENT' } → 'SIGNED')`) rend la signature atomique ; le hook s'insère juste après le test `if (!locked) return 409` |
| Notifications | `backend/src/lib/notifications.ts` (`createNotification` : in-app + socket + push, préférences via `shouldNotify`), `backend/src/lib/notifyHelpers.ts` (`notifySuperAdmins`, `notifyUsers`) | Appels en `.catch(() => {})`, jamais bloquants |
| Types de notification | `backend/src/types/enums.ts` (`NotificationType`), `backend/src/models/Notification.ts` (enum du champ `type`), `backend/src/models/NotificationPreferences.ts` (`NOTIFICATION_TYPES` pour les toggles de préférences) | Tout nouveau type doit être ajouté aux **deux premiers** ; le troisième est optionnel (un type absent des préférences est autorisé par défaut : `prefs[type]?.[channel] !== false`) |
| Accès projet côté client | `backend/src/lib/projectAccess.ts` — `getProjectAccess(projectId, userId)` → `{ project, role: OWNER/EDITOR/VIEWER }` ou `null` (sans révéler l'existence du projet) | Résolution du compte (`project.client`) quand un collaborateur poste sur un projet |
| Middlewares | `backend/src/middleware/auth.ts` (défaut `auth`), `backend/src/middleware/role.ts` (`requireRole('CLIENT')`, `requireAdmin`, `requirePermission`) | Les routes client existantes (`backend/src/routes/client/quotes.ts`) font `router.use(auth)` + contrôle `req.user!.role !== 'CLIENT'` ; on utilise `requireRole('CLIENT')` qui factorise ce même contrôle |
| RBAC | `rbac-matrix.json` + `backend/src/lib/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`) — synchronisés par le test `backend/src/__tests__/rbac-matrix.test.ts` (`expect(PERMISSIONS).toEqual(matrix.permissions)` et égalité des `rolePermissions`) ; le frontend importe la matrice directement (`src/lib/permissions.ts`, `src/lib/rbac.ts`, nav sidebar via `matrix.navigation`) | Toute permission ajoutée doit l'être **en même temps** dans la matrice et dans la lib backend |
| Traçabilité | `backend/src/lib/activityLog.ts` + `backend/src/models/ActivityLog.ts` (⚠ `project` **requis**, `action` enum fermée), `backend/src/models/AuditLog.ts` (souple, utilisé par `quotes.ts` : `AuditLog.create({...}).catch(() => {})`) | ActivityLog quand un projet existe, AuditLog systématiquement (voir Sécurité) |
| UI admin tickets | `src/pages/admin/ticket-list/` (`index.tsx` + `TicketCard/TicketDetail/TicketFilters/TicketStats` + `types.ts` avec `STATUS_CONFIG`/`PRIORITY_CONFIG`), `src/components/AdminSidebar.tsx` (map `ICONS`, badge `admin-sb-badge` alimenté par un polling 60 s — pattern `pendingDecisionsCount`, l. 135-161 et 247-254) | Structure de la nouvelle page admin et du badge compteur |
| UI espace client | `src/App.tsx` (routes `/espace-client` sous `ClientShell` + `ProtectedRoute role="CLIENT"`, l. 199-216 ; routes admin sous `RequirePermission`), `src/components/ClientSidebar.tsx` (`NAV_ITEMS`), `src/pages/espace-client/Dashboard.tsx` (sections `client-dashboard-stats` / `client-dashboard-projects`, classes `ClientPortal.css`), `src/pages/espace-client/QuoteProposal.tsx` (pattern frise `STEPS`), `src/services/quotes.ts` + `src/lib/api.ts` (`apiFetch`/`apiUpload`) | Routing, nav, dashboard, frise, couche service |

## Modèle de données

Nouveau fichier `backend/src/models/ChangeRequest.ts`. Interfaces `IChangeRequestFile`,
`IChangeRequestReply`, `IChangeRequest` déclarées dans le fichier (comme `InternalTicket.ts`),
schémas embarqués copiés du pattern tickets.

```ts
// fileSchema : identique à InternalTicket.fileSchema
//   { filename, originalName, mimetype, size } — { _id: false }
// replySchema : identique à InternalTicket.replySchema
//   { authorId: ref User, authorName, message, attachments: [fileSchema] }
//   — { timestamps: { createdAt: true, updatedAt: false } }

const statusHistorySchema = new Schema(
  {
    status: { type: String, required: true },        // valeur du statut atteint
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    note: { type: String, default: '' },             // motif de refus, commentaire de correction…
  },
  { _id: false },
)

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    // Rattachement au COMPTE client (User rôle CLIENT). Toujours renseigné.
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Projet optionnel : null pour une demande hors projet (site en maintenance).
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    pageUrl: { type: String, default: '', trim: true },   // URL de la page concernée

    // Priorité PERÇUE par le client — informative, pas un SLA.
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE'], default: 'NORMALE' },

    status: {
      type: String,
      enum: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS', 'LIVREE', 'VALIDEE', 'REFUSEE'],
      default: 'SOUMISE',
    },
    // Trace de la décision de qualification. « Incluse » n'est PAS un statut :
    // la demande incluse passe directement en PLANIFIEE (décision validée),
    // qualification en garde la mémoire pour l'UI et les KPI.
    qualification: { type: String, enum: ['INCLUSE', 'A_CHIFFRER'], default: null },
    refusalReason: { type: String, default: '' },         // rempli ssi REFUSEE

    // Devis lié quand qualification = A_CHIFFRER. Lien unidirectionnel :
    // QuoteProposal n'est pas modifié, le hook signature retrouve la demande
    // par ce champ.
    quoteProposal: { type: Schema.Types.ObjectId, ref: 'QuoteProposal', default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },  // compte ou collaborateur
    createdByName: { type: String, required: true },

    attachments: { type: [fileSchema], default: [] },
    replies: [replySchema],

    statusHistory: { type: [statusHistorySchema], default: [] },  // alimente la frise
    deliveredAt: { type: Date, default: null },
    validatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

changeRequestSchema.index({ client: 1, status: 1, createdAt: -1 })
changeRequestSchema.index({ status: 1, createdAt: -1 })       // file admin
changeRequestSchema.index({ project: 1 })
changeRequestSchema.index({ quoteProposal: 1 })               // lookup du hook signature
```

Règles d'intégrité (appliquées par les routes, pas par Mongoose) :

- `refusalReason` non vide ⟺ `status === 'REFUSEE'`.
- `quoteProposal` non nul ⟹ `qualification === 'A_CHIFFRER'`.
- `statusHistory` reçoit une entrée à chaque transition (y compris la création :
  `{ status: 'SOUMISE', at, byUserId: createdBy, byName }`).

## Cycle de vie

```
                    ┌───────────── admin « incluse » ─────────────┐
                    │                                             ▼
SOUMISE ── admin « à chiffrer » ──► A_CHIFFRER ── signature devis ──► PLANIFIEE ──► EN_COURS ──► LIVREE ──► VALIDEE
   │                                    │                                  ▲            │
   │                                    │                                  └── admin ───┘   LIVREE ── correction client ──► EN_COURS
   └── admin « refuser » ──► REFUSEE ◄──┘ (devis expiré/annulé, motif requis)
```

Transitions autorisées — toute autre transition est refusée en **409** avec code
`INVALID_TRANSITION` :

| De | Vers | Par | Déclencheur | Effets de bord |
|---|---|---|---|---|
| — | `SOUMISE` | Client (compte ou collaborateur) | `POST /api/client/change-requests` | Uploads synchronisés Nextcloud ; entrée `statusHistory` ; `notifySuperAdmins(CHANGE_REQUEST_CREATED)` ; AuditLog ; ActivityLog si `project` |
| `SOUMISE` | `PLANIFIEE` | Admin | Action « Inclure » (`POST …/:id/qualify-include`) | `qualification = 'INCLUSE'` ; notif client `CHANGE_REQUEST_QUALIFIED` ; AuditLog ; ActivityLog si `project` |
| `SOUMISE` | `A_CHIFFRER` | Admin | Action « À chiffrer » (`POST …/:id/qualify-quote`) | Crée une `QuoteProposal` `DRAFT` préremplie (`title` = titre de la demande, `intro` = description, `project`/`client` résolus — voir API) ; `quoteProposal` posé sur la demande ; si la demande n'avait pas de projet, `project` est posé au passage ; `qualification = 'A_CHIFFRER'` ; notif client `CHANGE_REQUEST_QUALIFIED` ; AuditLog ; ActivityLog |
| `A_CHIFFRER` | `PLANIFIEE` | **Système (hook signature)** | Signature du devis lié — voir encadré ci-dessous | Entrée `statusHistory` (`byUserId` = signataire) ; `notifySuperAdmins(CHANGE_REQUEST_PLANNED)` ; AuditLog `CHANGE_REQUEST_PLANNED` |
| `SOUMISE` | `REFUSEE` | Admin | `POST …/:id/refuse`, **motif obligatoire** (400 sinon) | `refusalReason` ; notif client `CHANGE_REQUEST_QUALIFIED` (résultat refus) ; AuditLog ; ActivityLog si `project` |
| `A_CHIFFRER` | `REFUSEE` | Admin | Idem — couvre le devis expiré, annulé ou décliné (sans cela la demande resterait bloquée) | Idem ; le devis lié n'est **pas** annulé automatiquement — l'admin le fait via `POST /api/admin/quote-proposals/:id/cancel` existant |
| `PLANIFIEE` | `EN_COURS` | Admin | `POST …/:id/start` | Notif client : aucune (décision : le client est notifié à la qualification, au devis, à la livraison) ; AuditLog |
| `EN_COURS` | `LIVREE` | Admin | `POST …/:id/deliver` | `deliveredAt = now` ; notif client `CHANGE_REQUEST_DELIVERED` ; AuditLog ; ActivityLog si `project` |
| `LIVREE` | `VALIDEE` | **Client — compte uniquement** (`req.user.id === client`, même logique que `OWNER_REQUIRED` des devis) | `POST /api/client/change-requests/:id/validate` | `validatedAt = now` ; AuditLog ; ActivityLog si `project` |
| `LIVREE` | `EN_COURS` | Client (compte ou collaborateur visible) | `POST /api/client/change-requests/:id/request-correction`, **commentaire obligatoire** (400 sinon) | Le commentaire est ajouté au fil (`replies`) **et** en `note` de `statusHistory` ; `notifySuperAdmins(CHANGE_REQUEST_REPLY)` ; AuditLog |

États terminaux : `VALIDEE`, `REFUSEE`. Aucune route ne les mute (le fil de discussion
reste ouvert en lecture et en réponse).

### Le hook « signature → PLANIFIEE »

Emplacement exact : `backend/src/routes/client/quotes.ts`, handler de
`router.post('/:projectId/proposals/:id/sign', …)` (l. 217-275, URL effective
`POST /api/projects/:projectId/proposals/:id/sign`, montée dans `backend/src/index.ts` via
`app.use('/api/projects', clientQuoteRoutes)` derrière un rate-limit 10 req/15 min).

Insertion **immédiatement après** le bloc :

```ts
if (!locked) {
  return res.status(409).json({ error: 'Cette proposition a déjà été signée', code: 'PROPOSAL_ALREADY_SIGNED' })
}
// ── HOOK ICI ──
```

c'est-à-dire une fois le verrou `lockProposalForSignature` acquis (la proposition est
juridiquement `SIGNED`), et **avant** `buildBillingDocumentForProposal` — ainsi un échec de
génération du PDF (récupérable via `rebuild-document`) ne laisse pas la demande bloquée en
`A_CHIFFRER`.

```ts
promoteChangeRequestOnSignature(locked, req.user!).catch(() => {})
```

`promoteChangeRequestOnSignature` (helper dans `backend/src/lib/` ou dans le modèle) :

- `ChangeRequest.findOneAndUpdate({ quoteProposal: locked._id, status: 'A_CHIFFRER' }, { $set: { status: 'PLANIFIEE' }, $push: { statusHistory: … } })` — même mécanique de verrou par prédicat d'état que la signature elle-même : idempotent, sans course ;
- si un document a matché : `notifySuperAdmins(CHANGE_REQUEST_PLANNED)` + `AuditLog.create(...).catch(() => {})` ;
- si aucun ne matche (devis sans demande liée) : no-op silencieux.

Le hook est **best-effort** : il ne peut jamais faire échouer la signature (`.catch(() => {})`,
même philosophie que les `AuditLog.create().catch()` déjà présents dans cette route).

## API

### Routes client — nouveau routeur `backend/src/routes/client/changeRequests.ts`

Monté dans `backend/src/index.ts` : `app.use('/api/client/change-requests', clientChangeRequestRoutes)`
(nouveau préfixe `/api/client/*` ; les routes client existantes vivent sous `/api/projects`
car elles sont scopées projet — une ressource scopée **compte** justifie ce préfixe dédié).

Garde-fous globaux : `router.use(auth)` puis `router.use(requireRole('CLIENT'))`
(`backend/src/middleware/role.ts`). Multer dédié : dossier `uploads/change-requests`,
mêmes réglages que `backend/src/routes/admin/tickets.ts` (50 Mo, 10 fichiers, safeName).

**Visibilité** (appliquée à toutes les lectures) : une demande est visible ssi
`client === req.user.id` **ou** `createdBy === req.user.id`. Une demande non visible répond
**404** (convention `quotes.ts` : ne pas révéler l'existence).

| Méthode | Chemin | Payload / query | Comportement |
|---|---|---|---|
| GET | `/api/client/change-requests` | `?status=` optionnel | Liste des demandes visibles, tri `createdAt` desc. Renvoie `{ changeRequests }` avec `project` peuplé (`name`) et, si `quoteProposal` et statut du devis ∈ `SENT/SIGNED/EXPIRED`, un lien exploitable (`projectId` + `proposalId`) |
| POST | `/api/client/change-requests` | multipart : `title` (requis), `description` (requis), `pageUrl?` (si présent : URL http/https valide, sinon 400), `projectId?`, `priority?` (`BASSE/NORMALE/HAUTE`), `files[]` (≤10) | Si `projectId` : `getProjectAccess(projectId, req.user.id)` doit être non nul (404 sinon) et `client = access.project.client` — un collaborateur crée ainsi pour le compte du propriétaire. Sans `projectId` : `client = req.user.id`. `createdBy = req.user.id`. Statut `SOUMISE`. `syncUploadToNextcloud(f, 'demandes-client', id)`. 201 |
| GET | `/api/client/change-requests/:id` | — | Détail : demande + `replies` (avec `authorAvatarUrl`, pattern `GET /api/admin/tickets/:id`) + `statusHistory` |
| POST | `/api/client/change-requests/:id/reply` | multipart : `message` (requis), `files[]` | Ajoute au fil (`authorId`/`authorName` = utilisateur courant). Le fil reste ouvert sur **tous** les statuts, terminaux compris (question après refus, remerciement après validation) — répondre ne change jamais le statut. `notifySuperAdmins(CHANGE_REQUEST_REPLY)` |
| POST | `/api/client/change-requests/:id/validate` | — | `LIVREE → VALIDEE`. Réservé au **compte** : si `req.user.id !== String(client)` → 403 `{ code: 'OWNER_REQUIRED' }`. 409 `INVALID_TRANSITION` hors `LIVREE` |
| POST | `/api/client/change-requests/:id/request-correction` | JSON : `{ comment }` requis | `LIVREE → EN_COURS` + reply + note d'historique. 400 sans commentaire, 409 hors `LIVREE` |
| GET | `/api/client/change-requests/files/:filename` | — | Sert un fichier ssi il appartient (attachments ou replies.attachments) à une demande **visible** du demandeur ; garde anti-traversée ; 404 sinon (pattern exact de `GET /api/admin/tickets/files/:filename`) |

### Routes admin — nouveau routeur `backend/src/routes/admin/changeRequests.ts`

Monté : `app.use('/api/admin/change-requests', adminChangeRequestRoutes)`.
Garde-fous : `router.use(auth)`, `router.use(requireAdmin)`, puis `requirePermission(…)` par
route (pattern `backend/src/routes/admin/tickets.ts`). Deux nouvelles permissions (voir
Sécurité & RBAC) : `view_change_requests`, `manage_change_requests`.

| Méthode | Chemin | Permission | Payload / query | Comportement |
|---|---|---|---|---|
| GET | `/api/admin/change-requests` | `VIEW_CHANGE_REQUESTS` | `?status=&client=&project=` | File filtrable, tri `createdAt` desc, `client` (name, companyName, avatar) et `project` (name) peuplés |
| GET | `/api/admin/change-requests/stats` | `VIEW_CHANGE_REQUESTS` | — | `{ aTraiter, enCours }` : `countDocuments({ status: 'SOUMISE' })` et `countDocuments({ status: { $in: ['PLANIFIEE','EN_COURS','LIVREE'] } })` — `aTraiter` alimente le badge sidebar |
| GET | `/api/admin/change-requests/:id` | `VIEW_CHANGE_REQUESTS` | — | Détail complet (replies enrichies d'avatars, devis lié peuplé : `status`, `title`, totaux non nécessaires) |
| POST | `/api/admin/change-requests/:id/reply` | `MANAGE_CHANGE_REQUESTS` | multipart : `message`, `files[]` | Réponse admin dans le fil ; `notifyUsers([client, createdBy], CHANGE_REQUEST_REPLY, excludeUserId: admin)` |
| POST | `/api/admin/change-requests/:id/qualify-include` | `MANAGE_CHANGE_REQUESTS` | — | `SOUMISE → PLANIFIEE`, `qualification = 'INCLUSE'` |
| POST | `/api/admin/change-requests/:id/qualify-quote` | `MANAGE_CHANGE_REQUESTS` **et** `MANAGE_BILLING` (deux `requirePermission` chaînés — la route crée un devis) | JSON : `{ projectId? , expiresAt? }` — `projectId` **obligatoire si la demande n'a pas de projet** (400 `PROJECT_REQUIRED_FOR_QUOTE` sinon ; le projet doit appartenir au même compte : `project.client === changeRequest.client`, 422 sinon) | Crée la `QuoteProposal` `DRAFT` : `project`, `client`, `createdBy = req.user.id`, `title` = titre de la demande, `intro` = description, `expiresAt` transmis, `questions/lines` vides (l'admin les construit ensuite via les routes `/api/admin/quote-proposals` existantes). Pose `quoteProposal` + `project` (si absent) sur la demande, `SOUMISE → A_CHIFFRER`. Renvoie `{ changeRequest, proposal }` |
| POST | `/api/admin/change-requests/:id/refuse` | `MANAGE_CHANGE_REQUESTS` | JSON : `{ reason }` requis (400 sinon) | `SOUMISE|A_CHIFFRER → REFUSEE` |
| POST | `/api/admin/change-requests/:id/start` | `MANAGE_CHANGE_REQUESTS` | — | `PLANIFIEE → EN_COURS` |
| POST | `/api/admin/change-requests/:id/deliver` | `MANAGE_CHANGE_REQUESTS` | — | `EN_COURS → LIVREE`, `deliveredAt` |
| GET | `/api/admin/change-requests/files/:filename` | `VIEW_CHANGE_REQUESTS` | — | Service de fichiers (garde anti-traversée), sans filtre d'auteur : tout admin habilité voit toutes les demandes |

**Hook secondaire — envoi du devis lié** : dans `POST /api/admin/quote-proposals/:id/send`
(`backend/src/routes/admin/quoteProposals.ts`), après le passage `DRAFT → SENT` :
`ChangeRequest.findOne({ quoteProposal: proposal._id })` ; si trouvée, notif client
`CHANGE_REQUEST_QUOTE_SENT` (lien vers la page du devis côté client). Best-effort,
`.catch(() => {})`.

Erreurs communes : 400 validation (express-validator, pattern `quotes.ts`), 404 introuvable
ou non visible, 403 `OWNER_REQUIRED` (validation client) ou permission manquante, 409
`INVALID_TRANSITION`.

## UI client

### Navigation et routes

- `src/components/ClientSidebar.tsx` : nouvelle entrée dans `NAV_ITEMS` —
  `{ to: '/espace-client/demandes', label: 'Demandes', icon: MessageSquarePlus, activePrefixes: ['/espace-client/demandes'] }`
  (icône lucide, comme les entrées existantes).
- `src/App.tsx`, bloc `/espace-client` sous `ClientShell` (l. 202-216), imports `lazy`
  comme les pages existantes :
  - `demandes` → `ClientChangeRequests` (liste)
  - `demandes/nouvelle` → `ClientChangeRequestNew` (formulaire)
  - `demandes/:id` → `ClientChangeRequestDetail` (détail)

### Pages (nouveaux fichiers `src/pages/espace-client/`)

Style : classes `ClientPortal.css` existantes (`portal-container`, `portal-input`,
`client-dashboard-*`, cartes/badges), cohérent Monolithe (cf. spec 2026-06-23).
Couche service : nouveau `src/services/changeRequests.ts` sur le modèle de
`src/services/quotes.ts` (`apiFetch` pour le JSON, `apiUpload` pour le multipart, comme
`src/pages/admin/ticket-list/index.tsx`).

- **`ChangeRequests.tsx` (liste)** — cartes (titre, statut en badge, priorité, projet
  éventuel, date, nombre de réponses), filtre par statut, CTA « Nouvelle demande ».
  État vide avec explication (« Une retouche, une évolution ? Décrivez-la, nous la
  qualifions sous 48 h ouvrées » — texte indicatif, à ajuster à l'intégration).
- **`ChangeRequestNew.tsx` (formulaire)** — champs : titre (requis), description (requis,
  textarea), URL de la page concernée (optionnel, `type="url"`), projet (select optionnel
  alimenté par `GET /api/projects` — le même appel que le Dashboard ; première option
  « Aucun projet / site en maintenance »), priorité (`Basse/Normale/Haute`, défaut
  Normale), pièces jointes (≤10 fichiers, 50 Mo — mêmes limites que le backend, affichées).
  Soumission `apiUpload`, redirection vers le détail créé.
- **`ChangeRequestDetail.tsx` (détail)** — trois zones :
  1. **Frise de statut** (pattern visuel des `STEPS` de
     `src/pages/espace-client/QuoteProposal.tsx`) : `Soumise → Qualification → Planifiée →
     En cours → Livrée → Validée`. L'étape « Qualification » affiche le résultat
     (`Incluse dans votre contrat` / `Devis n° lié` / rien si en attente). Une demande
     `REFUSEE` remplace la frise par un bandeau de refus avec le motif. Les dates viennent
     de `statusHistory`.
  2. **Corps** : description, URL concernée (lien), priorité, pièces jointes
     (téléchargées via `/api/client/change-requests/files/:filename`), et si un devis est
     lié et visible (`SENT/SIGNED/EXPIRED`) un encart « Devis à signer » pointant vers
     `/espace-client/projets/:projectId/propositions/:proposalId` (route existante).
  3. **Fil de discussion** : réponses horodatées avec avatars (pattern TicketDetail),
     zone de réponse avec pièces jointes.
  Actions contextuelles au statut `LIVREE` : « Valider la livraison » (compte uniquement —
  masquée pour un collaborateur) et « Demander une correction » (modal avec commentaire
  obligatoire).

### Dashboard

`src/pages/espace-client/Dashboard.tsx` : nouvelle section **« Vos demandes en cours »**
insérée entre les stats (`client-dashboard-stats`) et « Mes projets »
(`client-dashboard-projects`). Chargée via `GET /api/client/change-requests` (ajoutée au
`Promise.all` existant, `.catch` silencieux comme `task-progress-all`) ; affiche jusqu'à
3 demandes non terminées (statut ∉ `VALIDEE`/`REFUSEE`) : titre, badge de statut, date ;
lien « Toutes vos demandes → » vers `/espace-client/demandes` et CTA « Nouvelle demande ».
Section masquée si le compte n'a aucune demande ; si toutes les demandes sont terminées,
la section n'affiche que le lien et le CTA.

## UI admin

### Navigation, permissions, badge

- `rbac-matrix.json` → `navigation` : nouvelle entrée
  `{ "id": "change-requests", "section": "Suivi", "screen": "/admin/demandes-clients", "label": "Demandes clients", "permission": "view_change_requests", "roles": [] }`
  (la sidebar la rendra automatiquement via `getVisibleNavigation` de `src/lib/rbac.ts`).
- `src/components/AdminSidebar.tsx` : ajouter l'icône dans la map `ICONS`
  (`'change-requests': Inbox` — lucide), et le **badge compteur** sur
  `/admin/demandes-clients` : même pattern que `pendingDecisionsCount` (state + `apiFetch`
  de `/api/admin/change-requests/stats` + `setInterval` 60 s, rendu
  `<span className="admin-sb-badge">` avec `aria-label`), conditionné à
  `hasPermission(user, 'view_change_requests')` et affiché si `aTraiter > 0`.
- `src/App.tsx` : routes sous `/admin` avec le wrapper existant
  `<RequirePermission permission={PERMISSIONS.VIEW_CHANGE_REQUESTS} redirectTo="/admin">` :
  `demandes-clients` (liste) et `demandes-clients/:id` (détail).

### Pages (nouveau dossier `src/pages/admin/change-requests/`)

Structure calquée sur `src/pages/admin/ticket-list/` : `index.tsx` (page liste),
`ChangeRequestCard.tsx`, `ChangeRequestFilters.tsx`, `types.ts` (avec `STATUS_CONFIG` et
`PRIORITY_CONFIG` : libellés/couleurs par enum), plus une page détail
`ChangeRequestDetail.tsx` routée séparément (le workflow de qualification justifie une
pleine page, contrairement au dépliage inline des tickets).

- **Liste** (`/admin/demandes-clients`) — **liste, pas kanban** (décision validée).
  Filtres : statut (tous + chaque valeur), client (select alimenté par la liste
  `/api/admin/clients` existante), projet (texte ou select dépendant du client). Chaque
  ligne/carte : titre, client (avatar + société), projet ou « Hors projet », priorité,
  statut, date, badge « devis lié » le cas échéant.
- **Détail** (`/admin/demandes-clients/:id`) —
  - En-tête : titre, client, projet, priorité, `pageUrl`, pièces jointes
    (via `/api/admin/change-requests/files/:filename`), frise `statusHistory`.
  - **Bloc qualification** (visible si `SOUMISE`, actions gardées par
    `hasPermission(user, 'manage_change_requests')`) :
    - **Inclure** — confirmation (`useConfirm`, pattern ticket-list) → `qualify-include` ;
    - **À chiffrer** — modal : select projet pré-rempli (obligatoire si la demande n'en a
      pas ; liste des projets du compte), `expiresAt` optionnel → `qualify-quote`. Après
      création, le bloc devis (ci-dessous) prend le relais ;
    - **Refuser** — modal avec motif obligatoire → `refuse`.
  - **Bloc devis lié** (si `quoteProposal`) : statut du devis, lien texte vers le projet,
    et bouton « Envoyer au client » (`POST /api/admin/quote-proposals/:id/send` existant,
    visible si devis `DRAFT` et `manage_billing`). La construction des lignes/questions du
    devis reste du ressort du chantier devis (cf. Hors périmètre).
  - **Transitions** : boutons contextuels « Démarrer » (`PLANIFIEE`), « Marquer livrée »
    (`EN_COURS`). L'état `LIVREE` affiche « En attente de validation client ».
  - **Fil de discussion** : réponses + upload (pattern `handleReply` de
    `src/pages/admin/ticket-list/index.tsx`, `apiUpload`).

## Notifications

Nouveaux types — à ajouter **simultanément** dans `backend/src/types/enums.ts`
(`NotificationType`) **et** dans l'enum du champ `type` de
`backend/src/models/Notification.ts` (sans le second, `Notification.create` échoue en
validation et la notif est silencieusement perdue — voir Frictions), et dans
`NOTIFICATION_TYPES` de `backend/src/models/NotificationPreferences.ts` pour offrir les
toggles de préférences (in-app/push) :

| Événement | Type | Destinataires | Helper | Lien |
|---|---|---|---|---|
| Soumission d'une demande | `CHANGE_REQUEST_CREATED` | SUPER_ADMIN actifs | `notifySuperAdmins` | `/admin/demandes-clients/:id` |
| Réponse client dans le fil (y compris demande de correction) | `CHANGE_REQUEST_REPLY` | SUPER_ADMIN actifs | `notifySuperAdmins` | `/admin/demandes-clients/:id` |
| Réponse admin dans le fil | `CHANGE_REQUEST_REPLY` | `client` + `createdBy` (dédupliqués, admin exclu) | `notifyUsers` | `/espace-client/demandes/:id` |
| Qualification (incluse, à chiffrer ou refus) | `CHANGE_REQUEST_QUALIFIED` | `client` + `createdBy` | `notifyUsers` | `/espace-client/demandes/:id` |
| Envoi du devis lié (hook dans `quoteProposals.ts` `/send`) | `CHANGE_REQUEST_QUOTE_SENT` | `client` + `createdBy` | `notifyUsers` | `/espace-client/projets/:projectId/propositions/:proposalId` |
| Livraison | `CHANGE_REQUEST_DELIVERED` | `client` + `createdBy` | `notifyUsers` | `/espace-client/demandes/:id` |
| Signature → demande planifiée (hook signature) | `CHANGE_REQUEST_PLANNED` | SUPER_ADMIN actifs | `notifySuperAdmins` | `/admin/demandes-clients/:id` |

Tous les appels passent par `createNotification` (`backend/src/lib/notifications.ts`) :
in-app + socket `notification:new` + web push, préférences respectées, toujours en
`.catch(() => {})`. Pas de `dedupeKey` (chaque événement est ponctuel). Pas d'email dédié
(voir Hors périmètre).

## Sécurité & RBAC

- **Scoping client** : `auth` + `requireRole('CLIENT')` sur tout le routeur client ;
  visibilité `client === req.user.id || createdBy === req.user.id` ; création sur projet
  validée par `getProjectAccess` (`backend/src/lib/projectAccess.ts`) ; ressource non
  visible → **404** (jamais 403, convention `client/quotes.ts` : ne pas révéler
  l'existence). `validate` réservé au compte (403 `OWNER_REQUIRED`), aligné sur la règle
  « signer engage : réservé au propriétaire » des devis.
- **Permissions admin** : ajout de `VIEW_CHANGE_REQUESTS: 'view_change_requests'` et
  `MANAGE_CHANGE_REQUESTS: 'manage_change_requests'` dans **les deux sources synchronisées
  par test** (`backend/src/__tests__/rbac-matrix.test.ts`) :
  - `rbac-matrix.json` → `permissions` + `rolePermissions` ;
  - `backend/src/lib/permissions.ts` → `PERMISSIONS` + `ROLE_PERMISSIONS`.

  Attribution : `SUPER_ADMIN`, `ADMIN`, `MANAGER` → les deux ; `COMMERCIAL`, `VIEWER` →
  `view_change_requests` seul ; autres rôles → rien (ajustable via
  `grantedPermissions`/`deniedPermissions` par compte, mécanique existante).
  Le frontend hérite automatiquement (imports directs de `rbac-matrix.json` dans
  `src/lib/permissions.ts` et `src/lib/rbac.ts`).
- **`qualify-quote`** exige en plus `MANAGE_BILLING` (elle crée un document de
  facturation) : deux `requirePermission` chaînés.
- **Uploads** : mêmes bornes que les tickets (50 Mo/fichier, 10 fichiers, noms
  assainis) ; service de fichiers derrière vérification d'appartenance + garde
  anti-traversée (`path.resolve` + `startsWith(uploadsDir)`) des deux côtés (client
  filtré par visibilité, admin par permission).
- **Traçabilité** :
  - `AuditLog` (`backend/src/models/AuditLog.ts`) : **toutes** les actions structurantes
    — création, chaque qualification, chaque transition (dont le hook signature), refus —
    avec `userId`, `email`, `metadata: { changeRequestId, from, to, proposalId? }`,
    `.catch(() => {})` (pattern `client/quotes.ts`). C'est la trace de référence car elle
    fonctionne aussi pour les demandes **sans projet**.
  - `ActivityLog` via `logActivity` (`backend/src/lib/activityLog.ts`) : **uniquement quand
    `project` est renseigné** (le champ `project` y est requis), avec extension de l'enum
    `action` de `backend/src/models/ActivityLog.ts` : `CHANGE_REQUEST_CREATED`,
    `CHANGE_REQUEST_QUALIFIED`, `CHANGE_REQUEST_STATUS_CHANGED`. Le fil d'activité projet
    montre ainsi les demandes rattachées.
- Les mutations d'état utilisent des `findOneAndUpdate` à prédicat d'état
  (`{ _id, status: <attendu> }`) pour éliminer les transitions concurrentes — même
  mécanique que `lockProposalForSignature`.

## Tests

Backend (vitest, dans `backend/src/__tests__/`, sur le modèle de
`quote-proposal-signature.test.ts` / `quote-proposal-client.test.ts`) :

1. **`change-request-lifecycle.test.ts`** —
   - cycle nominal « incluse » : création client → `qualify-include` → `start` → `deliver`
     → `validate` ; vérifie `qualification`, `statusHistory`, `deliveredAt`/`validatedAt` ;
   - cycle « à chiffrer » : `qualify-quote` crée la `QuoteProposal` `DRAFT` préremplie
     (title/intro/project/client), pose `quoteProposal` et `project` sur la demande ;
   - `qualify-quote` sans `projectId` sur une demande hors projet → 400
     `PROJECT_REQUIRED_FOR_QUOTE` ; avec un projet d'un autre compte → 422 ;
   - refus sans motif → 400 ; refus depuis `SOUMISE` et `A_CHIFFRER` → `REFUSEE` ;
   - transitions interdites (ex. `validate` sur `EN_COURS`, `deliver` sur `SOUMISE`,
     mutation d'un état terminal) → 409 `INVALID_TRANSITION` ;
   - `request-correction` : `LIVREE → EN_COURS`, commentaire poussé dans `replies` et
     `statusHistory` ; sans commentaire → 400 ;
   - `validate` par un collaborateur (non-compte) → 403 `OWNER_REQUIRED`.
2. **Hook signature → PLANIFIEE** (extension de `quote-proposal-signature.test.ts` ou
   fichier dédié) —
   - signature d'un devis lié à une demande `A_CHIFFRER` → demande `PLANIFIEE`, entrée
     d'historique, notification créée ;
   - signature d'un devis **sans** demande liée → 201, aucun effet parasite ;
   - demande déjà `REFUSEE` (liée mais plus `A_CHIFFRER`) → la signature réussit, la
     demande n'est pas modifiée (prédicat d'état) ;
   - un échec simulé du hook ne fait pas échouer la réponse 201 de signature.
3. **Scoping client** —
   - le client B ne voit ni la liste ni le détail ni les fichiers des demandes du client A
     (404) ;
   - un collaborateur (ProjectMember) crée une demande sur le projet : `client` =
     propriétaire du projet ; il voit cette demande ; il ne voit pas les autres demandes
     du compte qu'il n'a pas créées ;
   - `projectId` d'un projet auquel l'utilisateur n'a pas accès → 404 ;
   - un admin sans `view_change_requests` → 403 sur la file ; sans
     `manage_change_requests` → 403 sur les actions ; `qualify-quote` sans
     `manage_billing` → 403.
4. **Uploads** —
   - création multipart avec fichiers : `attachments` persistés (filename/originalName/
     mimetype/size), fichiers présents sur disque ;
   - service de fichiers : le bon client télécharge (200), un autre client → 404, un nom
     de fichier hors répertoire (`../`) → 403/404 ;
   - réponse avec pièces jointes dans le fil (client et admin).
5. **RBAC** — `rbac-matrix.test.ts` reste vert après ajout des permissions (synchronisation
   matrice ↔ `lib/permissions.ts` vérifiée par le test existant, sans modification de
   celui-ci).

Frontend (vitest + testing-library, comme `AdminSidebar.test.tsx` /
`QuoteProposal.test.tsx`) :

6. Sidebar admin : le badge « Demandes clients » s'affiche avec le compteur de
   `/api/admin/change-requests/stats` et se masque à zéro ; l'entrée nav est absente sans
   `view_change_requests`.
7. Dashboard client : la section « Vos demandes en cours » liste les demandes actives et
   disparaît sans demande.
8. Formulaire client : titre/description requis, soumission multipart, redirection.

## Hors périmètre

- **Pipeline d'étapes de production** et **coffre documentaire** : chantiers séparés. Une
  demande `VALIDEE` pourra ultérieurement être **liée à une étape** de ce futur pipeline —
  cette liaison n'est **pas** spécifiée ici ; aucun champ n'est réservé pour elle.
- **Construction du devis côté admin** (lignes, questions, prévisualisation) : ce chantier
  crée le `DRAFT` prérempli et offre le bouton « Envoyer » ; l'édition complète relève du
  chantier devis (spec 2026-07-26, section Front/Admin, onglet « Propositions » — non
  encore implémenté côté `src/pages/admin`).
- **Emails transactionnels dédiés** aux demandes (hors web push/in-app existants) — le
  pattern `sendTicketReplyEmail` n'est pas décliné dans ce lot.
- **Vue kanban admin, SLA, KPI dédiés** (temps de qualification, etc.).
- **Suppression/archivage** d'une demande (les états terminaux `VALIDEE`/`REFUSEE`
  suffisent à sortir de la file active ; un archivage pourra reprendre le pattern
  `isArchived` des tickets plus tard).
- **Notifications aux admins non-SUPER_ADMIN** : les broadcasts utilisent
  `notifySuperAdmins`, comme les tickets internes ; un ciblage plus fin (owner du compte
  client via `ownerAdminId`) est une évolution possible, non couverte.
