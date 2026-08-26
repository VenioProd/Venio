# Design — Coffre documentaire, dépôt de fichiers client, accueil « À faire »

**Date** : 2026-08-26
**Objectif** : donner au client connecté (1) une page « Mes documents » au niveau du compte qui
agrège tous les documents que Venio met déjà à sa disposition (devis, factures, contrats,
livrables, fichiers projet), (2) un espace « Vos fichiers » où il dépose lui-même ses éléments
(logos, textes, photos, briefs) avec rattachement projet optionnel et notification de l'admin,
et (3) un bloc « À faire » en tête du Dashboard listant les actions attendues de lui (devis à
signer, factures dues, et — branchés plus tard — étapes à valider et demandes à confirmer).

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| « Mes documents » | Page **au niveau du compte** (pas par projet). **Agrégation pure** de l'existant, aucun nouveau stockage, aucun nouveau flux de fichier : les téléchargements passent par les endpoints scopés existants. |
| « Vos fichiers » | Dépôt **par le client**, rattachement projet **optionnel**, upload multiple avec limites de taille et de type. Nouveau modèle **`ClientUpload`** (justification § Contexte). |
| Visibilité admin | Fichiers déposés visibles dans `ClientAccountDetail` (nouvel onglet) et dans le `ProjectDetail` admin quand rattachés à un projet. |
| « À faire » | Un endpoint agrégé « action items » typé. Les types `ETAPE_A_VALIDER` et `DEMANDE_A_CONFIRMER` sont **déclarés dans le contrat** mais jamais émis dans ce lot (branchés par les chantiers pipeline d'étapes et demandes). |
| Notifications | Système existant (`createNotification`, push web) : les SUPER_ADMIN sont notifiés à chaque dépôt client, avec `dedupeKey` anti-spam. |
| Conventions | Enums en français majuscules. Textes UI en français en dur, comme tout l'espace client existant (l'i18n `src/i18n/` ne couvre que le site public — Navbar, SEO, LanguageSwitch). |

## Contexte : ce qui existe déjà

### Sources de documents côté client

- [`BillingDocument`](../../../backend/src/models/BillingDocument.ts) : `type: 'QUOTE' | 'INVOICE'`,
  `client` (ref User), `project`, `status`, `pdfStoragePath`, `dueAt`, `paidAt`, `total`. PDF servi au
  client par `GET /api/projects/:projectId/billing/:documentId/pdf`
  ([`backend/src/routes/client/quotes.ts`](../../../backend/src/routes/client/quotes.ts), statuts
  visibles `ISSUED/SENT/ACCEPTED/PAID`, guard path-traversal, `pdfStoragePath` jamais renvoyé au front).
- [`QuoteProposal`](../../../backend/src/models/QuoteProposal.ts) : une proposition **signée** produit
  un `BillingDocument` `QUOTE` avec PDF (`buildBillingDocumentForProposal` dans
  [`quoteSignature.ts`](../../../backend/src/lib/quoteSignature.ts), stocké
  `uploads/billing/<projectId>/QUOTE-….pdf`). **La proposition n'a pas de PDF propre** : « QuoteProposal
  signées (PDF) » = le PDF du `BillingDocument` issu de la signature, déjà couvert par la source
  précédente. La signature crée aussi un `ProjectItem` `CAHIER_DES_CHARGES` non téléchargeable.
- [`ProjectItem`](../../../backend/src/models/ProjectItem.ts) : types
  `LIVRABLE/DEVIS/FACTURE/CONTRAT/CAHIER_DES_CHARGES/MAQUETTE/DOCUMENTATION/LIEN/NOTE/AUTRE`, flags
  `isVisible`, `isDownloadable`, sous-doc `file { originalName, storagePath, mimeType, size }`.
  Téléchargement client : `GET /api/projects/:projectId/items/:itemId/download`
  ([`projectContent.ts`](../../../backend/src/routes/client/projectContent.ts)) — filtre
  `isVisible + isDownloadable`, `storagePath` masqué dans les listes. Les **contrats** sont des
  `ProjectItem` de type `CONTRAT`.
- [`Document`](../../../backend/src/models/Document.ts) (modèle historique) : fichiers uploadés par
  l'admin sur un projet (`type: 'DEVIS' | 'FACTURE' | 'FICHIER_PROJET'`, `project` **required**).
  Listé au client par `GET /api/projects/:id` et `GET /api/projects/:id/documents`
  ([`projects.ts`](../../../backend/src/routes/projects.ts)), téléchargé via
  `GET /api/documents/:id/download` ([`documents.ts`](../../../backend/src/routes/documents.ts),
  contrôle `getProjectAccess` + guard path-traversal). Ces fichiers sont **déjà visibles du client**
  projet par projet : la page « Mes documents » les agrège aussi (type `FICHIER_PROJET`), sinon elle
  serait incomplète par rapport à ce que le client voit déjà.

### Accès, scoping, fichiers

- Auth par cookie de session : [`middleware/auth.ts`](../../../backend/src/middleware/auth.ts) pose
  `req.user`. Les routes client vérifient `req.user!.role === 'CLIENT'` **dans le handler** puis
  scoppent via [`getProjectAccess(projectId, userId)`](../../../backend/src/lib/projectAccess.ts)
  (propriétaire = `project.client`, sinon `ProjectMember` → rôle `OWNER/EDITOR/VIEWER` ; `null` → 404
  pour ne pas révéler l'existence du projet).
- Aucune route client n'existe **au niveau du compte** : tout `backend/src/routes/client/*` est monté
  sur `/api/projects` ([`index.ts`](../../../backend/src/index.ts) lignes ~332-346). Ce lot introduit
  le montage `/api/client`.
- Le dossier `backend/uploads/` n'est **pas servi statiquement** : chaque fichier passe par une route
  contrôlée. Sous-dossiers par domaine : `uploads/tickets`, `uploads/billing/<projectId>/`,
  `uploads/avatars`, etc.
- Pattern multer de référence : [`admin/tickets.ts`](../../../backend/src/routes/admin/tickets.ts)
  lignes 18-28 — `diskStorage` vers `path.resolve('uploads/tickets')` (mkdir récursif au chargement),
  filename `${Date.now()}-${originalname sanitizé /[^a-zA-Z0-9._-]/}`,
  `limits: { fileSize: 50 Mo }`, `upload.array('files', 10)`.
- Traçabilité : [`ActivityLog`](../../../backend/src/models/ActivityLog.ts) (`project` **required**,
  enum d'actions) + [`ClientActivity`](../../../backend/src/models/ClientActivity.ts) (`clientId`
  required, `type` texte libre — alimente l'onglet « Notes & Activités » de `ClientAccountDetail`)
  + `AuditLog` (actions de sécurité).
- Notifications : [`createNotification`](../../../backend/src/lib/notifications.ts) (in-app + socket
  + push web, préférences par type, `dedupeKey` anti-doublon) et
  [`notifySuperAdmins`](../../../backend/src/lib/notifyHelpers.ts) (pattern utilisé par le formulaire
  de contact public).

### `Document.ts` étendu ou nouveau modèle ? → **nouveau modèle `ClientUpload`**

Étendre `Document` a été écarté après lecture de ses usages réels
(`routes/projects.ts`, `routes/documents.ts`, `routes/admin/projects/core.ts`,
`routes/agent/documents.ts`, tests `client-portal-access.test.ts` et
`agent-billing-documents-integration.test.ts`) :

1. **`project` est `required`** ; le dépôt client a un rattachement projet *optionnel*. Le rendre
   optionnel casserait l'invariant de toutes les routes existantes — en particulier
   `GET /api/documents/:id/download` qui fait `Project.findById(document.project)` et répond 404 si
   absent : un document sans projet deviendrait intéléchargeable ou exigerait une refonte du contrôle
   d'accès de la route.
2. **Exposition immédiate non voulue** : tout `Document` d'un projet est renvoyé au client par
   `GET /api/projects/:id` et `GET /api/projects/:id/documents` **sans filtre**, listé côté admin
   dans le ProjectDetail, et exposé en CRUD par l'API agent (`routes/agent/documents.ts`). Y insérer
   des dépôts client mélangerait deux sens de circulation (Venio→client vs client→Venio) dans des
   écrans et des scopes qui n'ont pas été conçus pour.
3. **Schéma inadapté** : enum `DEVIS/FACTURE/FICHIER_PROJET` (nature comptable, pas catégories de
   dépôt), pas de champ `size`, pas de propriétaire compte, sémantique `uploadedBy` = admin.

Un modèle dédié `ClientUpload` garde `Document` intact (zéro migration, zéro régression) et porte
une sémantique claire : *fichier fourni par le client*.

## Modèle de données

### `ClientUpload` (nouveau)

Fichier : `backend/src/models/ClientUpload.ts` (+ interface `IClientUpload` dans
`backend/src/types/models/index.ts`).

| Champ | Type | Rôle |
|---|---|---|
| `client` | ref User, required | Le compte client déposant (= `req.user.id` au dépôt). Pour un collaborateur invité qui dépose sur un projet partagé, c'est **son** compte : le fichier apparaît dans **sa** fiche `ClientAccountDetail` et, via `project`, dans le projet. |
| `project` | ref Project, default `null` | Rattachement optionnel |
| `category` | enum `'LOGO' \| 'TEXTE' \| 'PHOTO' \| 'BRIEF' \| 'AUTRE'`, default `'AUTRE'` | Catégorie choisie par le client |
| `note` | String, default `''` | Message facultatif du déposant (max 500 caractères, validé côté route) |
| `originalName` | String, required | Nom d'origine |
| `storagePath` | String, required | Chemin relatif `uploads/client-files/<clientId>/<timestamp>-<nom-sanitizé>` — **jamais renvoyé au front** (client comme admin) |
| `mimeType` | String, required | |
| `size` | Number, required | Octets |
| `downloadedByAdminAt` | Date, default `null` | Premier téléchargement admin (accusé de prise en charge) |
| timestamps | `{ timestamps: true }` | `createdAt` = date de dépôt |

Index : `{ client: 1, createdAt: -1 }`, `{ project: 1, createdAt: -1 }`.

Stockage : `backend/uploads/client-files/<clientId>/` (sous-dossier par compte, mkdir récursif au
chargement du routeur, même pattern que `uploads/tickets`).

### Types partagés (contrats de réponse, pas de nouvelles collections)

Dans `backend/src/types/enums.ts` :

```ts
// Ligne de « Mes documents »
export type ClientVaultDocumentType = 'DEVIS' | 'FACTURE' | 'CONTRAT' | 'LIVRABLE' | 'FICHIER_PROJET'
export type ClientVaultSource = 'BILLING' | 'PROJECT_ITEM' | 'DOCUMENT'

// Action item du bloc « À faire »
export type ClientActionItemType =
  | 'DEVIS_A_SIGNER'      // émis dans ce lot
  | 'FACTURE_A_PAYER'     // émis dans ce lot
  | 'ETAPE_A_VALIDER'     // déclaré ici, émis par le chantier « pipeline d'étapes »
  | 'DEMANDE_A_CONFIRMER' // déclaré ici, émis par le chantier « demandes »
```

Côté front, miroirs dans `src/types/clientVault.types.ts` :

```ts
export interface ClientVaultDocument {
  id: string
  source: ClientVaultSource
  type: ClientVaultDocumentType
  title: string                       // ex. « FAC-2026-0012 », titre de l'item, originalName
  project: { id: string; name: string }
  date: string                        // ISO — issuedAt (billing), updatedAt (item), uploadedAt (document)
  size: number | null                 // octets si connu (ProjectItem.file.size), sinon null
  mimeType: string | null
  downloadUrl: string                 // pointe vers un endpoint scopé EXISTANT (cf. API)
}

export interface ClientActionItem {
  type: ClientActionItemType
  title: string                       // ex. « Proposition “Refonte site” à signer »
  detail: string                      // ex. « Montant : 4 800 € TTC — expire le 12/09 », '' sinon
  project: { id: string; name: string }
  link: string                        // route SPA cible, ex. /espace-client/projets/:pid/propositions/:id
  dueAt: string | null                // ISO — échéance facture / expiration devis
  amount: number | null               // total TTC quand pertinent
  createdAt: string                   // ISO — pour le tri
}
```

Le Dashboard rend chaque item à partir de `title/detail/link` : quand les chantiers 1 et 2
commenceront à émettre `ETAPE_A_VALIDER` et `DEMANDE_A_CONFIRMER`, **aucun changement front ne sera
nécessaire** hors icône/couleur par type (un fallback neutre est prévu pour tout type inconnu).

## API

Tous les endpoints client ci-dessous : middleware `auth` + garde `req.user!.role === 'CLIENT'` dans
le handler (403 sinon), comme `routes/client/*` aujourd'hui. Nouveaux fichiers :

- `backend/src/routes/client/vault.ts` — « Mes documents » + « À faire »
- `backend/src/routes/client/files.ts` — dépôt « Vos fichiers »

Montés dans `backend/src/index.ts` **avant** le handler `apiNotFound` (le commentaire ligne ~348
l'exige) :

```ts
app.use('/api/client', clientVaultRoutes)
app.use('/api/client', clientFileRoutes)
```

### 1. Agrégation documents — `GET /api/client/documents`

| | |
|---|---|
| Permission | Session `CLIENT` |
| Query | `type?` (`ClientVaultDocumentType`), `projectId?` (MongoId), `q?` (recherche insensible à la casse sur `title`) |
| Réponse | `{ documents: ClientVaultDocument[] }`, triés `date` décroissante |

Périmètre : `projectIds` = projets **accessibles** (`Project.find({ client: userId })` ∪ projets de
`ProjectMember.find({ user: userId })`) — soit exactement ce que le client voit déjà projet par
projet ; si `projectId` est fourni, il doit appartenir à cet ensemble (sinon réponse vide, pas de
404 révélateur). Trois requêtes agrégées côté serveur :

| Source | Requête | Mapping |
|---|---|---|
| `BILLING` | `BillingDocument.find({ project: { $in: projectIds }, status: { $in: ['ISSUED','SENT','ACCEPTED','PAID'] }, pdfStoragePath: { $ne: null } })` | `QUOTE` → `DEVIS`, `INVOICE` → `FACTURE` ; `title` = `number` ; `date` = `issuedAt ?? createdAt` ; `downloadUrl` = `/api/projects/<pid>/billing/<id>/pdf`. Les **propositions signées** sont couvertes ici : leur PDF est le `BillingDocument` `QUOTE` créé à la signature. |
| `PROJECT_ITEM` | `ProjectItem.find({ project: { $in: projectIds }, isVisible: true, isDownloadable: true, 'file.storagePath': { $exists: true, $ne: null } })` | `type === 'CONTRAT'` → `CONTRAT`, tout autre type → `LIVRABLE` ; `title` = `title` ; `size`/`mimeType` depuis `file` ; `date` = `updatedAt` ; `downloadUrl` = `/api/projects/<pid>/items/<id>/download` |
| `DOCUMENT` | `Document.find({ project: { $in: projectIds } })` | `type` conservé (`DEVIS`/`FACTURE`/`FICHIER_PROJET`) ; `title` = `originalName` ; `date` = `uploadedAt` ; `downloadUrl` = `/api/documents/<id>/download` |

Règles :

- **Aucun `storagePath`/`pdfStoragePath` dans la réponse.**
- **Aucune nouvelle route de fichier** : les `downloadUrl` pointent vers les trois endpoints
  existants, qui refont chacun leur propre contrôle d'accès au téléchargement. La défense reste en
  profondeur : compromettre l'agrégateur ne donne accès à aucun octet.
- Filtres `type`/`q` appliqués après mapping ; endpoint sans effet de bord (pas de `viewedAt`).

### 2. Action items — `GET /api/client/action-items`

| | |
|---|---|
| Permission | Session `CLIENT` |
| Query | aucune |
| Réponse | `{ items: ClientActionItem[] }`, triés `dueAt` croissant (nulls en dernier), puis `createdAt` décroissant |

`ownedProjectIds` = `Project.find({ client: userId })` uniquement : signer et payer sont réservés au
propriétaire (même règle que `loadEditableProposal` dans `client/quotes.ts` — un collaborateur
`EDITOR` ne signe pas), on ne lui affiche donc pas d'action qu'il ne peut pas faire.

| Type | Requête | Champs |
|---|---|---|
| `DEVIS_A_SIGNER` | `QuoteProposal.find({ project: { $in: ownedProjectIds }, status: 'SENT', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] })` — filtre pur, **sans** muter le statut (contrairement à `applyExpiry`, ce endpoint de lecture reste sans effet de bord ; l'expiration réelle bascule à la lecture de la proposition, comme aujourd'hui) | `title` = `Proposition « <title> » à signer` ; `dueAt` = `expiresAt` ; `amount` = total TTC via `computeQuoteTotals` ; `link` = `/espace-client/projets/<pid>/propositions/<id>` |
| `FACTURE_A_PAYER` | `BillingDocument.find({ project: { $in: ownedProjectIds }, type: 'INVOICE', status: { $in: ['ISSUED','SENT'] } })` | `title` = `Facture <number> à régler` ; `dueAt` = `dueAt` ; `amount` = `total` ; `link` = `/espace-client/projets/<pid>/facturation` |
| `ETAPE_A_VALIDER` | **jamais émis dans ce lot** — le chantier « pipeline d'étapes » ajoutera sa requête ici | contrat déjà défini par `ClientActionItem` |
| `DEMANDE_A_CONFIRMER` | **jamais émis dans ce lot** — le chantier « demandes » ajoutera sa requête ici | contrat déjà défini par `ClientActionItem` |

### 3. Dépôt de fichiers client — `backend/src/routes/client/files.ts`

Multer local au routeur, pattern `admin/tickets.ts` adapté :

```ts
const baseDir = path.resolve('uploads/client-files')
// destination: (req) => sous-dossier String(req.user!.id), mkdir récursif
// filename:    `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },   // 20 Mo / fichier, 10 fichiers / requête
  fileFilter,                                           // allowlist ci-dessous
})
```

MIME autorisés (`fileFilter`, sinon rejet avec erreur dédiée → réponse 400 JSON
`{ error: 'Type de fichier non autorisé', code: 'UNSUPPORTED_FILE_TYPE' }`) :
`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `application/pdf`,
`text/plain`, `text/markdown`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
`application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/zip`.
Les erreurs multer (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`) sont interceptées par un handler d'erreur
du routeur et rendues en 413/400 JSON — jamais en HTML par le handler global.

| Méthode & chemin | Permission | Payload / Query | Comportement |
|---|---|---|---|
| `POST /api/client/files` | Session `CLIENT` | `multipart/form-data` : `files[]` (1-10), `projectId?`, `category?`, `note?` | Si `projectId` fourni : `getProjectAccess(projectId, userId)` sinon **404 + suppression des fichiers déjà écrits sur disque** (multer écrit avant le handler). Crée un `ClientUpload` par fichier. Puis : notification admin (§ Notifications), `ClientActivity` (`type: 'FICHIER_DEPOSE'`, un par dépôt avec le nombre de fichiers), et si projet rattaché un `ActivityLog` `action: 'FICHIER_CLIENT_DEPOSE'`. Réponse 201 `{ files: [...] }` (sans `storagePath`). |
| `GET /api/client/files` | Session `CLIENT` | `projectId?`, `q?` (sur `originalName`) | `ClientUpload.find({ client: userId })` + filtres. Réponse `{ files }` (sans `storagePath`), tri `createdAt` desc. |
| `GET /api/client/files/:id/download` | Session `CLIENT` | — | `findOne({ _id, client: userId })` sinon 404. Guard path-traversal identique à `documents.ts` (résolution sous `uploads/`), puis `res.download(filePath, originalName)`. |
| `DELETE /api/client/files/:id` | Session `CLIENT` | — | `findOne({ _id, client: userId })` sinon 404. `fs.unlink` (best-effort) + suppression du document + `ClientActivity` `type: 'FICHIER_SUPPRIME'`. Réponse 200 `{ ok: true }`. |

Un client ne voit et ne supprime que **ses** fichiers (`client: userId` dans chaque requête) ; le
rattachement projet ne donne aucun droit de lecture aux autres membres du projet côté client
(l'espace « Vos fichiers » est personnel ; la lecture croisée est côté admin uniquement).

### 4. Côté admin

| Méthode & chemin | Permission | Comportement |
|---|---|---|
| `GET /api/admin/clients/:id/files` | `requirePermission(MANAGE_CLIENTS)` | Tous les `ClientUpload` du compte `:id` (`client: :id`), avec `project` populé (`name`), tri `createdAt` desc. À implémenter dans `backend/src/routes/admin/clients/` (nouveau fichier `files.ts` branché dans son `index.ts`), avec le helper `ensureClient` existant. |
| `GET /api/admin/clients/:id/files/:fileId/download` | `requirePermission(MANAGE_CLIENTS)` | `findOne({ _id: fileId, client: :id })` sinon 404 ; pose `downloadedByAdminAt` s'il est nul ; guard path-traversal ; `res.download`. |
| `GET /api/admin/projects/:projectId/client-files` | `requirePermission(VIEW_CONTENT)` | `ClientUpload.find({ project: :projectId })` avec `client` populé (`name`, `companyName`). Dans `backend/src/routes/admin/projects/` (les routes projet existantes utilisent déjà `VIEW_CONTENT`/`EDIT_CONTENT`). |
| `GET /api/admin/projects/:projectId/client-files/:fileId/download` | `requirePermission(VIEW_CONTENT)` | `findOne({ _id: fileId, project: :projectId })` sinon 404 ; pose `downloadedByAdminAt` s'il est nul ; guard path-traversal ; `res.download`. |

Pas de suppression admin dans ce lot (§ Hors périmètre).

## UI client

Deux nouvelles routes sous le shell client dans `src/App.tsx` (lazy, comme les autres) et deux
entrées dans `NAV_ITEMS` de [`ClientSidebar.tsx`](../../../src/components/ClientSidebar.tsx) :
« Mes documents » (icône `FileText`, `/espace-client/documents`) et « Vos fichiers » (icône
`UploadCloud`, `/espace-client/fichiers`), entre « Mes projets » et « Guide ». Styles :
`ClientPortal.css` existant (classes `portal-container`, `portal-card`, `portal-input`,
`portal-button`, patterns de filtres du Dashboard).

### Page « Mes documents » — `src/pages/espace-client/Documents.tsx`

- Charge en parallèle `GET /api/client/documents` et `GET /api/projects` (pour le filtre projet).
- Barre de filtres (même construction que les filtres du Dashboard) : recherche texte (sur `title`,
  côté client sur la liste chargée), select type (`Tous les types`, `Devis`, `Factures`, `Contrats`,
  `Livrables`, `Fichiers projet`), select projet (`Tous les projets` + noms).
- Liste en tableau/lignes : badge type (libellés français ci-dessus), titre, nom du projet
  (lien vers `/espace-client/projets/:id`), date formatée `fr-FR`, taille lisible quand connue,
  bouton « Télécharger » = `<a href={downloadUrl}>` (les trois endpoints existants répondent en
  `attachment`).
- États : skeleton pendant chargement (composants `Skeleton` existants), erreur en
  `client-dashboard-error`, vide : « Aucun document pour le moment. Vos devis, factures, contrats et
  livrables apparaîtront ici. »

### Page « Vos fichiers » — `src/pages/espace-client/MyFiles.tsx`

- **Zone de dépôt** en tête : input `multiple` + drag-and-drop, rappel des limites
  (« 10 fichiers max, 20 Mo par fichier — images, PDF, documents bureautiques, ZIP »), select
  catégorie (`Logo`, `Texte`, `Photo`, `Brief`, `Autre`), select projet optionnel
  (`Aucun projet — compte` + projets de `GET /api/projects`), champ note facultatif.
  Envoi `FormData` → `POST /api/client/files` ; toasts succès/erreur ; les erreurs
  `UNSUPPORTED_FILE_TYPE` et taille/nombre affichent le message serveur.
- **Liste des fichiers déposés** (`GET /api/client/files`) : nom, catégorie, projet éventuel, date,
  taille, note ; actions « Télécharger » (`/api/client/files/:id/download`) et « Supprimer »
  (confirmation via `ConfirmModal` existant, puis `DELETE`).
- Vide : « Déposez ici vos logos, textes, photos et briefs : l'équipe Venio est notifiée à chaque
  dépôt. »

### Bloc « À faire » — modification de `src/pages/espace-client/Dashboard.tsx`

- Nouveau fetch `GET /api/client/action-items` ajouté au `Promise.all` de chargement (avec
  `.catch(() => ({ items: [] }))` comme `task-progress-all` : le bloc ne casse jamais le Dashboard).
- Rendu **entre le hero et les stats**. Si `items.length === 0`, le bloc est masqué entièrement
  (pas d'état vide décoratif).
- Une carte par item : pictogramme + couleur par type (`DEVIS_A_SIGNER` accent primaire,
  `FACTURE_A_PAYER` accent alerte, tout type non reconnu — dont les futurs `ETAPE_A_VALIDER` /
  `DEMANDE_A_CONFIRMER` — style neutre), `title`, `detail`, échéance formatée quand `dueAt` non nul
  (« avant le … », en rouge si dépassée), CTA « Voir » vers `link`. En-tête de section :
  « À faire — {n} action(s) attendue(s) de votre part ».
- Le composant de carte est générique (piloté par les données) : brancher les types 1 et 2 plus tard
  ne demande aucun changement structurel ici.

## UI admin

### `ClientAccountDetail` — fichiers reçus

Fichiers : `src/pages/admin/client-detail/` (`types.ts`, `index.tsx`, nouveau `FilesTab.tsx`).

- Nouvel onglet `{ id: 'files', label: 'Fichiers reçus' }` dans `TABS`
  ([`types.ts`](../../../src/pages/admin/client-detail/types.ts)), rendu dans
  [`index.tsx`](../../../src/pages/admin/client-detail/index.tsx) à côté des onglets existants.
- `FilesTab` liste `GET /api/admin/clients/:id/files` (chargé dans le `loadAll` existant, avec
  `.catch(() => ({ files: [] }))` comme les blocs facultatifs) : nom, catégorie, projet éventuel
  (lien vers le ProjectDetail admin), note, date, taille, indicateur « téléchargé le … » /
  « non consulté » (`downloadedByAdminAt`), bouton « Télécharger »
  (`/api/admin/clients/:id/files/:fileId/download`).
- Service front : nouvelles fonctions dans `src/services/adminClients.ts`
  (`listAdminClientFiles`, URL de téléchargement).

### `ProjectDetail` admin — fichiers du client sur le projet

Fichier : `src/pages/admin/project-detail/ProjectDocumentsTab.tsx` (+ `useProjectContent.ts` pour le
fetch).

- Nouvelle section « Fichiers déposés par le client » sous la liste des documents existante,
  alimentée par `GET /api/admin/projects/:projectId/client-files` : déposant (nom / société),
  nom du fichier, catégorie, note, date, bouton « Télécharger »
  (`/api/admin/projects/:projectId/client-files/:fileId/download`).
- Section masquée si la liste est vide.

## Notifications

Nouveau type **`CLIENT_FILE_UPLOADED`**, à ajouter aux **trois** endroits (voir friction ci-dessous) :

1. `NotificationType` dans [`types/enums.ts`](../../../backend/src/types/enums.ts) ;
2. **l'enum du schéma** [`models/Notification.ts`](../../../backend/src/models/Notification.ts) —
   indispensable : l'enum du modèle (12 valeurs) est aujourd'hui désynchronisé de l'union
   `NotificationType` (~30 valeurs), et tout `createNotification` avec un type hors enum échoue
   **silencieusement** (les appels sont en `.catch(() => {})`, cf. `PROJECT_ITEM_CREATED` dans
   `admin/projects/items.ts` qui ne produit jamais de notification) ;
3. `NOTIFICATION_TYPES` dans
   [`models/NotificationPreferences.ts`](../../../backend/src/models/NotificationPreferences.ts)
   pour que le type apparaisse dans les préférences (sans cela, `shouldNotify` reste fail-open et la
   notification part quand même, mais elle n'est pas paramétrable).

Émission au `POST /api/client/files` (une notification **par dépôt**, pas par fichier) via
`notifySuperAdmins` (même cible que le formulaire de contact public) :

```ts
notifySuperAdmins({
  type: 'CLIENT_FILE_UPLOADED',
  title: `Fichiers reçus de ${clientName}`,
  message: `${count} fichier(s)${projectName ? ` — projet ${projectName}` : ''}`,
  link: `/admin/comptes-clients/${clientId}?tab=files`,
  metadata: { clientId, projectId: projectId ?? null, count },
  dedupeKey: `client-files:${clientId}`,   // dépôts rapprochés : mise à jour de la notif non lue, un seul push
})
```

Le push web part par le pipeline existant de `createNotification` (`sendPushToUser`, badge, socket
`notification:new`) — rien à faire de plus.

## Sécurité & RBAC

- **Scoping client** : chaque route client vérifie `role === 'CLIENT'` puis scoppe par `userId`
  (`client: userId` pour `ClientUpload`) ou par `getProjectAccess` (rattachement projet au dépôt).
  404 — jamais 403 — quand la ressource n'appartient pas au demandeur, conformément au parti pris de
  `getProjectAccess` (« ne pas révéler l'existence »).
- **Téléchargements** : aucun fichier servi sans vérification d'appartenance dans la même requête —
  « Mes documents » délègue aux trois endpoints existants qui recontrôlent l'accès ;
  `client/files/:id/download` filtre `client: userId` ; les deux downloads admin filtrent par
  `client: :id` ou `project: :projectId` **et** passent `requirePermission`. Tous les downloads de
  fichiers `ClientUpload` appliquent le guard path-traversal de `documents.ts`
  (`path.resolve` + préfixe `uploads/`).
- **Aucun `storagePath` en sortie d'API**, côté client comme côté admin (pattern `projectContent.ts`
  / `client/quotes.ts`).
- **RBAC admin** : aucune nouvelle permission — `MANAGE_CLIENTS` (fiche client) et `VIEW_CONTENT`
  (contenu projet) couvrent exactement les deux surfaces admin ajoutées.
  [`rbac-matrix.json`](../../../rbac-matrix.json) et `lib/permissions.ts` sont donc **inchangés**.
- **Limites d'upload** : 20 Mo/fichier, 10 fichiers/requête, allowlist MIME, nom de fichier
  sanitizé, sous-dossier par compte. Fichiers orphelins supprimés quand la validation post-multer
  échoue (projectId invalide, note trop longue).
- **Traçabilité** : `ClientActivity` à chaque dépôt et suppression (visible dans « Notes &
  Activités ») ; `ActivityLog` avec la nouvelle action **`FICHIER_CLIENT_DEPOSE`** (à ajouter à
  l'enum du modèle `ActivityLog` **et** à `ActivityAction` dans `types/enums.ts`) uniquement quand
  un projet est rattaché — le champ `project` y est `required`, un dépôt sans projet ne peut pas y
  être journalisé, c'est le rôle de `ClientActivity`.

## Tests

Backend (vitest + supertest + `helpers/mongoTestEnv`, pattern
[`client-portal-access.test.ts`](../../../backend/src/__tests__/client-portal-access.test.ts) :
app express minimale montant les routeurs testés, `createSession` + cookie `venio_session`) :

1. **`client-vault.test.ts`** — agrégation & action items :
   - le propriétaire voit ses `BillingDocument` visibles, ses `ProjectItem` téléchargeables et ses
     `Document` legacy ; un `BillingDocument` `DRAFT`, un `ProjectItem` `isVisible: false` ou
     `isDownloadable: false`, et un item sans fichier n'apparaissent pas ;
   - un collaborateur (`ProjectMember`) voit les documents du projet partagé ; un tiers ne voit
     rien ; la réponse ne contient aucun `storagePath`/`pdfStoragePath` ;
   - filtres `type`, `projectId` (y compris projectId étranger → liste vide), `q` ;
   - action items : proposition `SENT` du propriétaire présente avec `amount` correct ; proposition
     expirée absente **et non mutée** ; proposition d'un projet où l'utilisateur n'est que membre
     absente ; facture `ISSUED` présente, `PAID`/`CANCELLED`/`DRAFT` absentes ; réponse limitée aux
     types `DEVIS_A_SIGNER`/`FACTURE_A_PAYER` dans ce lot.
2. **`client-files.test.ts`** — dépôt :
   - upload multiple OK (201, fichiers sur disque sous `uploads/client-files/<clientId>/`, documents
     créés, pas de `storagePath` dans la réponse) ; avec `projectId` accessible OK ; avec `projectId`
     étranger → 404 et **aucun fichier restant sur disque** ;
   - limites : 11ᵉ fichier refusé, fichier > 20 Mo refusé (réponse JSON, pas HTML), MIME hors
     allowlist → 400 `UNSUPPORTED_FILE_TYPE` ;
   - notification : un dépôt crée une notification `CLIENT_FILE_UPLOADED` par SUPER_ADMIN actif
     (une seule par dépôt multi-fichiers ; deuxième dépôt rapproché → mise à jour dedupe, pas de
     doublon) — ce test verrouille au passage l'ajout du type à l'enum du modèle `Notification` ;
   - traçabilité : `ClientActivity` créé ; `ActivityLog` `FICHIER_CLIENT_DEPOSE` créé si projet,
     absent sinon ;
   - scoping : client B ne liste pas (`GET` → liste vide), ne télécharge pas (404) et ne supprime
     pas (404) les fichiers de A ; A télécharge et supprime les siens (fichier disparu du disque) ;
   - path traversal : un `storagePath` forgé hors de `uploads/` → 403 (même réponse que le guard de
     `documents.ts`), fichier jamais servi.
3. **`admin-client-files.test.ts`** — côté admin :
   - `MANAGE_CLIENTS` requis sur `/api/admin/clients/:id/files` (+download) ; `VIEW_CONTENT` requis
     sur `/api/admin/projects/:projectId/client-files` (+download) ; un admin sans la permission →
     403 ;
   - le download par compte refuse un `fileId` d'un autre client (404) ; le download par projet
     refuse un `fileId` non rattaché à ce projet (404) ; `downloadedByAdminAt` posé au premier
     téléchargement, inchangé ensuite.

Frontend (vitest, pattern des tests de pages existants type `Billing.test.tsx`) :

4. `Documents.test.tsx` : rendu de la liste depuis une réponse mockée, filtres type/projet/recherche,
   liens de téléchargement corrects par source.
5. `Dashboard.test.tsx` (complément) : bloc « À faire » masqué quand `items` vide ; rendu des deux
   types émis ; un item de type inconnu (`ETAPE_A_VALIDER` simulé) est rendu avec le style neutre à
   partir de `title`/`link` sans erreur.

## Hors périmètre

- **`ETAPE_A_VALIDER`** (chantier « pipeline d'étapes ») et **`DEMANDE_A_CONFIRMER`** (chantier
  « demandes ») : seuls le type TypeScript, le tri et le rendu générique côté Dashboard sont posés
  ici ; leurs requêtes d'agrégation seront ajoutées dans `GET /api/client/action-items` par ces
  chantiers, sans changement de contrat.
- Suppression ou modération des `ClientUpload` par l'admin.
- Synchronisation Nextcloud des dépôts client (`syncUploadToNextcloud` existe pour les tickets ;
  non branchée ici).
- Quota de stockage par compte, antivirus, prévisualisation inline des fichiers.
- Paiement en ligne des factures (le bloc « À faire » renvoie vers la page facturation existante).
- Résorption globale de la désynchronisation enum `Notification`/`NotificationType` pour les types
  historiques (seul `CLIENT_FILE_UPLOADED` est garanti par ce lot ; le nettoyage global est signalé
  comme dette).
