# Coffre documentaire, dépôt de fichiers client, accueil « À faire » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au client connecté une page « Mes documents » (agrégation pure de l'existant), un
espace « Vos fichiers » (dépôt client via un nouveau modèle `ClientUpload`), et un bloc « À faire »
en tête du Dashboard — plus les écrans admin miroir (fiche client, détail projet).

**Architecture:** Backend Express/Mongoose : deux nouveaux routers client (`vault.ts`, `files.ts`)
montés sur un nouveau préfixe `/api/client`, deux nouvelles routes admin réutilisant les permissions
`MANAGE_CLIENTS`/`VIEW_CONTENT` existantes, un nouveau modèle `ClientUpload`. « Mes documents »
n'introduit aucune route de fichier : elle agrège trois sources existantes et renvoie leurs
`downloadUrl` déjà scopées. Frontend React : deux nouvelles pages client, un bloc ajouté au
Dashboard, un onglet ajouté à `ClientAccountDetail`, une section ajoutée à `ProjectDocumentsTab`.

**Tech Stack:** Express, Mongoose, multer, vitest + supertest + `mongodb-memory-server` (backend),
React + TypeScript + vitest (frontend), thème CSS `monolithe-portal.css` / `ClientPortal.css`.

## Global Constraints

- Aucune nouvelle route de fichier pour « Mes documents » : les `downloadUrl` pointent uniquement
  vers les 3 endpoints existants (`GET /api/projects/:projectId/billing/:documentId/pdf`,
  `GET /api/projects/:projectId/items/:itemId/download`, `GET /api/documents/:id/download`).
- Nouveau modèle `ClientUpload` — ne jamais étendre `Document.ts` (cf. spec § justification).
- Stockage des dépôts client : `uploads/client-files/<clientId>/`, jamais de fichier servi sans
  vérification d'appartenance dans la même requête.
- Multer : pattern `admin/tickets.ts` adapté — `20 * 1024 * 1024` octets/fichier, `10` fichiers/requête,
  allowlist MIME, nom de fichier sanitizé `/[^a-zA-Z0-9._-]/g`.
- Montage `/api/client` **avant** `apiNotFound` dans `backend/src/index.ts`.
- `CLIENT_FILE_UPLOADED` doit être ajouté aux **trois** registres de notifications :
  `NotificationType` (`backend/src/types/enums.ts`), l'enum du schéma
  (`backend/src/models/Notification.ts`), `NOTIFICATION_TYPES`
  (`backend/src/models/NotificationPreferences.ts`) — verrouillé par un test dédié.
- `FICHIER_CLIENT_DEPOSE` ajouté à `ActivityAction` (`types/enums.ts`) **et** à l'enum du schéma
  `ActivityLog.ts` — uniquement émis quand un projet est rattaché au dépôt.
- 404 (jamais 403) quand une ressource n'appartient pas au demandeur, conformément à
  `getProjectAccess`.
- Aucun `storagePath`/`pdfStoragePath` dans aucune réponse API, côté client comme admin.
- RBAC admin inchangé : `MANAGE_CLIENTS` (fiche client), `VIEW_CONTENT` (contenu projet) — pas de
  nouvelle permission, `rbac-matrix.json` non touché.
- Textes UI en français en dur (pas d'i18n), style `ClientPortal.css` / `monolithe-portal.css`.
- Ne pas toucher aux chantiers « pipeline d'étapes » (`ETAPE_A_VALIDER`) ni « demandes »
  (`DEMANDE_A_CONFIRMER`) — seuls le type et le rendu générique sont posés.

---

## File Structure

**Backend — nouveaux fichiers :**
- `backend/src/types/models/upload.ts` — interface `IClientUpload`
- `backend/src/models/ClientUpload.ts` — modèle Mongoose
- `backend/src/routes/client/vault.ts` — `GET /documents`, `GET /action-items`
- `backend/src/routes/client/files.ts` — `POST/GET /files`, `GET /files/:id/download`, `DELETE /files/:id`
- `backend/src/routes/admin/clients/files.ts` — `GET /:id/files`, `GET /:id/files/:fileId/download`
- `backend/src/routes/admin/projects/clientFiles.ts` — `GET /:projectId/client-files` (+ download)
- `backend/src/__tests__/client-vault.test.ts`
- `backend/src/__tests__/client-files.test.ts`
- `backend/src/__tests__/admin-client-files.test.ts`
- `backend/src/__tests__/notification-registries.test.ts`

**Backend — fichiers modifiés :**
- `backend/src/types/enums.ts` — `ClientUploadCategory`, `ClientVaultDocumentType`,
  `ClientVaultSource`, `ClientActionItemType`, `+ 'CLIENT_FILE_UPLOADED'` sur `NotificationType`,
  `+ 'FICHIER_CLIENT_DEPOSE'` sur `ActivityAction`
- `backend/src/types/models/index.ts` — export `IClientUpload`
- `backend/src/models/Notification.ts` — enum schéma `+ 'CLIENT_FILE_UPLOADED'`
- `backend/src/models/NotificationPreferences.ts` — `NOTIFICATION_TYPES` `+ 'CLIENT_FILE_UPLOADED'`
- `backend/src/models/ActivityLog.ts` — enum schéma `+ 'FICHIER_CLIENT_DEPOSE'`
- `backend/src/index.ts` — montage `/api/client`
- `backend/src/routes/admin/clients/index.ts` — montage `files.ts`
- `backend/src/routes/admin/projects/index.ts` — montage `clientFiles.ts`

**Frontend — nouveaux fichiers :**
- `src/types/clientVault.types.ts`
- `src/services/clientVault.ts`
- `src/services/clientFiles.ts`
- `src/services/adminProjectFiles.ts`
- `src/pages/espace-client/Documents.tsx` (+ `Documents.test.tsx`)
- `src/pages/espace-client/MyFiles.tsx`
- `src/pages/admin/client-detail/FilesTab.tsx`

**Frontend — fichiers modifiés :**
- `src/components/ClientSidebar.tsx` — 2 entrées `NAV_ITEMS`
- `src/App.tsx` — 2 lazy imports + 2 routes
- `src/pages/espace-client/Dashboard.tsx` — bloc « À faire » (+ complément `Dashboard.test.tsx`)
- `src/pages/admin/client-detail/types.ts` — entrée `TABS`, `FilesTabProps`
- `src/pages/admin/client-detail/index.tsx` — chargement + rendu `FilesTab`
- `src/services/adminClients.ts` — `listAdminClientFiles`, `adminClientFileDownloadUrl`
- `src/pages/admin/project-detail/types.ts` — `ProjectDocumentsTabProps.projectId`
- `src/pages/admin/project-detail/ProjectDocumentsTab.tsx` — section fichiers client
- `src/pages/admin/project-detail/index.tsx` — passe `projectId` à `ProjectDocumentsTab`

---

## Task 1: Types partagés et enums backend

**Files:**
- Modify: `backend/src/types/enums.ts`

**Interfaces:**
- Produces: `ClientUploadCategory`, `ClientVaultDocumentType`, `ClientVaultSource`,
  `ClientActionItemType` — consommés par Task 2 (modèle), Task 5-6 (routes vault), Task 7 (routes
  files), et tout le frontend via miroir TypeScript (Task 12).
- Produces: `NotificationType` étendu avec `'CLIENT_FILE_UPLOADED'`, `ActivityAction` étendu avec
  `'FICHIER_CLIENT_DEPOSE'`.

Ce fichier ne contient que des types (pas de logique), donc pas de cycle TDD ici — vérification par
compilation TypeScript aux tâches suivantes.

- [ ] **Step 1: Ajouter les nouveaux types**

Ouvrir `backend/src/types/enums.ts`, ajouter à la fin du fichier :

```typescript
// ─── Client Vault ───
export type ClientUploadCategory = 'LOGO' | 'TEXTE' | 'PHOTO' | 'BRIEF' | 'AUTRE'

export type ClientVaultDocumentType = 'DEVIS' | 'FACTURE' | 'CONTRAT' | 'LIVRABLE' | 'FICHIER_PROJET'
export type ClientVaultSource = 'BILLING' | 'PROJECT_ITEM' | 'DOCUMENT'

export type ClientActionItemType =
  | 'DEVIS_A_SIGNER'
  | 'FACTURE_A_PAYER'
  | 'ETAPE_A_VALIDER'
  | 'DEMANDE_A_CONFIRMER'
```

Puis localiser le bloc `export type NotificationType =` et ajouter une ligne à la fin de l'union
(avant le point-virgule implicite du dernier membre) :

```typescript
  | 'BRIEF_ASSIGNED'
  | 'BRIEF_STATUS_CHANGED'
  | 'CLIENT_FILE_UPLOADED'
```

Puis localiser le bloc `export type ActivityAction =` et ajouter une ligne à la fin de l'union :

```typescript
  | 'UPDATE_POSTED'
  | 'BILLING_CREATED'
  | 'FICHIER_CLIENT_DEPOSE'
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune nouvelle erreur liée à `enums.ts` (les erreurs préexistantes éventuelles, sans
rapport, sont acceptables).

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/enums.ts
git commit -m "feat(backend): ajouter les types du coffre documentaire et deux enums"
```

---

## Task 2: Modèle `ClientUpload`

**Files:**
- Create: `backend/src/types/models/upload.ts`
- Modify: `backend/src/types/models/index.ts`
- Create: `backend/src/models/ClientUpload.ts`
- Test: `backend/src/__tests__/client-upload-model.test.ts`

**Interfaces:**
- Consumes: `ClientUploadCategory` (Task 1)
- Produces: `IClientUpload` (interface), `ClientUpload` (modèle Mongoose par défaut) — consommés par
  Task 5-9 (toutes les routes).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/client-upload-model.test.ts` :

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ClientUpload from '../models/ClientUpload.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import bcrypt from 'bcryptjs'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle ClientUpload', () => {
  it('crée un dépôt sans projet avec les valeurs par défaut', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c@example.test', passwordHash, role: 'CLIENT' })

    const upload = await ClientUpload.create({
      client: client._id,
      originalName: 'logo.png',
      storagePath: 'uploads/client-files/x/1-logo.png',
      mimeType: 'image/png',
      size: 1234,
    })

    expect(upload.project).toBeNull()
    expect(upload.category).toBe('AUTRE')
    expect(upload.note).toBe('')
    expect(upload.downloadedByAdminAt).toBeNull()
    expect(upload.createdAt).toBeInstanceOf(Date)
  })

  it('rattache un projet et une catégorie explicites', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c2@example.test', passwordHash, role: 'CLIENT' })
    const project = await Project.create({ name: 'Site vitrine', client: client._id })

    const upload = await ClientUpload.create({
      client: client._id,
      project: project._id,
      category: 'BRIEF',
      note: 'Brief v2',
      originalName: 'brief.pdf',
      storagePath: 'uploads/client-files/x/2-brief.pdf',
      mimeType: 'application/pdf',
      size: 42,
    })

    expect(String(upload.project)).toBe(String(project._id))
    expect(upload.category).toBe('BRIEF')
  })

  it('rejette une catégorie hors enum', async () => {
    const passwordHash = await bcrypt.hash('x', 4)
    const client = await User.create({ name: 'Client', email: 'c3@example.test', passwordHash, role: 'CLIENT' })

    await expect(
      ClientUpload.create({
        client: client._id,
        category: 'INVALIDE',
        originalName: 'x.png',
        storagePath: 'uploads/client-files/x/3-x.png',
        mimeType: 'image/png',
        size: 1,
      }),
    ).rejects.toThrow(mongoose.Error.ValidationError)
  })
})
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd backend && npx vitest run src/__tests__/client-upload-model.test.ts`
Expected: FAIL — `Cannot find module '../models/ClientUpload.js'`

- [ ] **Step 3: Créer l'interface `IClientUpload`**

Créer `backend/src/types/models/upload.ts` :

```typescript
import type { Document, Types } from 'mongoose'
import type { ClientUploadCategory } from '../enums.js'

export interface IClientUpload extends Document {
  client: Types.ObjectId
  project: Types.ObjectId | null
  category: ClientUploadCategory
  note: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  downloadedByAdminAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

Ouvrir `backend/src/types/models/index.ts` et ajouter, avec les autres blocs d'export :

```typescript
export type { IClientUpload } from './upload.js'
```

- [ ] **Step 4: Créer le modèle**

Créer `backend/src/models/ClientUpload.ts` :

```typescript
import mongoose from 'mongoose'
import type { IClientUpload } from '../types/models/index.js'

const clientUploadSchema = new mongoose.Schema<IClientUpload>(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    category: {
      type: String,
      enum: ['LOGO', 'TEXTE', 'PHOTO', 'BRIEF', 'AUTRE'],
      default: 'AUTRE',
    },
    note: { type: String, default: '' },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    downloadedByAdminAt: { type: Date, default: null },
  },
  { timestamps: true },
)

clientUploadSchema.index({ client: 1, createdAt: -1 })
clientUploadSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IClientUpload>('ClientUpload', clientUploadSchema)
```

- [ ] **Step 5: Vérifier que le test passe**

Run: `cd backend && npx vitest run src/__tests__/client-upload-model.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/types/models/upload.ts backend/src/types/models/index.ts backend/src/models/ClientUpload.ts backend/src/__tests__/client-upload-model.test.ts
git commit -m "feat(backend): ajouter le modèle ClientUpload"
```

---

## Task 3: Synchroniser les trois registres de notifications

**Files:**
- Modify: `backend/src/models/Notification.ts`
- Modify: `backend/src/models/NotificationPreferences.ts`
- Test: `backend/src/__tests__/notification-registries.test.ts`

**Interfaces:**
- Consumes: `NotificationType` étendu (Task 1)
- Produces: enum du schéma `Notification` acceptant `'CLIENT_FILE_UPLOADED'`, préférence
  paramétrable pour ce type — consommé par Task 8 (`notifySuperAdmins` dans `client/files.ts`).

Ce test verrouille au passage la désynchronisation historique documentée dans la spec : sans lui, un
`createNotification({ type: 'CLIENT_FILE_UPLOADED', ... })` échouerait silencieusement (l'appel est
en `.catch(() => {})` dans le pipeline existant).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/notification-registries.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import Notification from '../models/Notification.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import ActivityLog from '../models/ActivityLog.js'

describe('registres de notifications — synchronisation CLIENT_FILE_UPLOADED', () => {
  it("l'enum du schéma Notification accepte CLIENT_FILE_UPLOADED", () => {
    const enumValues = (Notification.schema.path('type') as unknown as { enumValues: string[] }).enumValues
    expect(enumValues).toContain('CLIENT_FILE_UPLOADED')
  })

  it('NOTIFICATION_TYPES (préférences) contient CLIENT_FILE_UPLOADED', () => {
    expect(NOTIFICATION_TYPES).toContain('CLIENT_FILE_UPLOADED')
  })
})

describe('ActivityLog — synchronisation FICHIER_CLIENT_DEPOSE', () => {
  it("l'enum du schéma ActivityLog accepte FICHIER_CLIENT_DEPOSE", () => {
    const enumValues = (ActivityLog.schema.path('action') as unknown as { enumValues: string[] }).enumValues
    expect(enumValues).toContain('FICHIER_CLIENT_DEPOSE')
  })
})
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `cd backend && npx vitest run src/__tests__/notification-registries.test.ts`
Expected: FAIL — les 2 premières assertions (Notification) puis la 3ᵉ (ActivityLog) échouent.

- [ ] **Step 3: Étendre l'enum du schéma `Notification`**

Ouvrir `backend/src/models/Notification.ts`, dans le tableau `enum` du champ `type`, ajouter en
dernière valeur :

```typescript
    type: {
      type: String,
      enum: [
        'TASK_ASSIGNED',
        'TASK_UPDATED',
        'PROJECT_UPDATE',
        'DOCUMENT_ADDED',
        'TICKET_CREATED',
        'TICKET_REPLY',
        'INTERNAL_MESSAGE',
        'DECISION_SUBMITTED',
        'DECISION_APPROVED',
        'DECISION_REJECTED',
        'DECISION_IMPROVEMENT',
        'SENSITIVE_ACTION_EXECUTED',
        'CLIENT_FILE_UPLOADED',
      ],
      required: true,
    },
```

- [ ] **Step 4: Étendre `NOTIFICATION_TYPES`**

Ouvrir `backend/src/models/NotificationPreferences.ts`, ajouter à la fin du tableau :

```typescript
export const NOTIFICATION_TYPES: NotificationType[] = [
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'PROJECT_UPDATE',
  'DOCUMENT_ADDED',
  'TICKET_CREATED',
  'TICKET_REPLY',
  'INTERNAL_MESSAGE',
  'CLIENT_FILE_UPLOADED',
]
```

- [ ] **Step 5: Étendre l'enum du schéma `ActivityLog`**

Ouvrir `backend/src/models/ActivityLog.ts`, dans le tableau `enum` du champ `action`, ajouter en
dernière valeur :

```typescript
      enum: [
        'PROJECT_CREATED',
        'PROJECT_UPDATED',
        'PROJECT_ARCHIVED',
        'PROJECT_UNARCHIVED',
        'STATUS_CHANGED',
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_MOVED',
        'TASK_DELETED',
        'TASK_COMMENT_ADDED',
        'DOCUMENT_UPLOADED',
        'SECTION_CREATED',
        'SECTION_DELETED',
        'ITEM_CREATED',
        'ITEM_DELETED',
        'UPDATE_POSTED',
        'BILLING_CREATED',
        'FICHIER_CLIENT_DEPOSE',
      ],
```

- [ ] **Step 6: Vérifier que le test passe**

Run: `cd backend && npx vitest run src/__tests__/notification-registries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/Notification.ts backend/src/models/NotificationPreferences.ts backend/src/models/ActivityLog.ts backend/src/__tests__/notification-registries.test.ts
git commit -m "fix(notifications): synchroniser les registres pour CLIENT_FILE_UPLOADED et FICHIER_CLIENT_DEPOSE"
```

---

## Task 4: Types partagés frontend `clientVault.types.ts`

**Files:**
- Create: `src/types/clientVault.types.ts`

**Interfaces:**
- Produces: `ClientVaultDocument`, `ClientActionItem`, `ClientUploadFile` — consommés par Task 10-15
  (services et pages client).

- [ ] **Step 1: Créer le fichier de types**

Créer `src/types/clientVault.types.ts` :

```typescript
export type ClientVaultDocumentType = 'DEVIS' | 'FACTURE' | 'CONTRAT' | 'LIVRABLE' | 'FICHIER_PROJET'
export type ClientVaultSource = 'BILLING' | 'PROJECT_ITEM' | 'DOCUMENT'

export interface ClientVaultDocument {
  id: string
  source: ClientVaultSource
  type: ClientVaultDocumentType
  title: string
  project: { id: string; name: string }
  date: string
  size: number | null
  mimeType: string | null
  downloadUrl: string
}

export type ClientActionItemType =
  | 'DEVIS_A_SIGNER'
  | 'FACTURE_A_PAYER'
  | 'ETAPE_A_VALIDER'
  | 'DEMANDE_A_CONFIRMER'

export interface ClientActionItem {
  type: ClientActionItemType
  title: string
  detail: string
  project: { id: string; name: string }
  link: string
  dueAt: string | null
  amount: number | null
  createdAt: string
}

export type ClientUploadCategory = 'LOGO' | 'TEXTE' | 'PHOTO' | 'BRIEF' | 'AUTRE'

export interface ClientUploadFile {
  id: string
  project: string | null
  category: ClientUploadCategory
  note: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  downloadedByAdminAt: string | null
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur liée à ce fichier (il n'est pas encore importé ailleurs).

- [ ] **Step 3: Commit**

```bash
git add src/types/clientVault.types.ts
git commit -m "feat(frontend): ajouter les types partagés du coffre documentaire"
```

---

## Task 5: Route `GET /api/client/documents` — agrégation « Mes documents »

**Files:**
- Create: `backend/src/routes/client/vault.ts`
- Test: `backend/src/__tests__/client-vault.test.ts`

**Interfaces:**
- Consumes: `getProjectAccess(projectId, userId): Promise<ProjectAccess | null>` (existant,
  `backend/src/lib/projectAccess.ts`), modèles `BillingDocument`, `ProjectItem`, `Document`,
  `Project`, `ProjectMember` (existants), `ClientVaultDocument`/`ClientVaultDocumentType` (Task 1)
- Produces: `router` par défaut exporté par `client/vault.ts`, monté en Task 9 sous `/api/client`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/__tests__/client-vault.test.ts` :

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientVaultRoutes from '../routes/client/vault.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'
import Document from '../models/Document.js'
import QuoteProposal from '../models/QuoteProposal.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/client', clientVaultRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeClient(email: string) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: 'Client', email, passwordHash, role: 'CLIENT' })
}

describe('GET /api/client/documents', () => {
  it('agrège BillingDocument visibles, ProjectItem téléchargeables et Document legacy du propriétaire', async () => {
    const owner = await makeClient('owner@example.test')
    const project = await Project.create({ name: 'Site vitrine', client: owner._id })

    await BillingDocument.create({
      type: 'INVOICE', number: 'FAC-001', project: project._id, client: owner._id,
      status: 'ISSUED', issuedAt: new Date(), pdfStoragePath: 'uploads/billing/x/FAC-001.pdf',
      createdBy: owner._id,
    })
    // Draft: ne doit pas apparaître
    await BillingDocument.create({
      type: 'QUOTE', number: 'DEV-DRAFT', project: project._id, client: owner._id,
      status: 'DRAFT', pdfStoragePath: null, createdBy: owner._id,
    })

    await ProjectItem.create({
      project: project._id, type: 'LIVRABLE', title: 'Maquette v1', isVisible: true, isDownloadable: true,
      file: { originalName: 'maquette.pdf', storagePath: 'uploads/items/x.pdf', mimeType: 'application/pdf', size: 100 },
      createdBy: owner._id,
    })
    // isVisible: false -> absent
    await ProjectItem.create({
      project: project._id, type: 'LIVRABLE', title: 'Interne', isVisible: false, isDownloadable: true,
      file: { originalName: 'x.pdf', storagePath: 'uploads/items/y.pdf', mimeType: 'application/pdf', size: 1 },
      createdBy: owner._id,
    })
    // isDownloadable: false -> absent
    await ProjectItem.create({
      project: project._id, type: 'CONTRAT', title: 'Contrat', isVisible: true, isDownloadable: false,
      file: { originalName: 'c.pdf', storagePath: 'uploads/items/z.pdf', mimeType: 'application/pdf', size: 1 },
      createdBy: owner._id,
    })
    // Sans fichier -> absent
    await ProjectItem.create({
      project: project._id, type: 'NOTE', title: 'Note', isVisible: true, isDownloadable: true,
      createdBy: owner._id,
    })

    await Document.create({
      project: project._id, type: 'FICHIER_PROJET', originalName: 'brief.pdf',
      storagePath: 'uploads/x/brief.pdf', mimeType: 'application/pdf', uploadedBy: owner._id,
    })

    const response = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)

    expect(response.body.documents).toHaveLength(3)
    const types = response.body.documents.map((d: { type: string }) => d.type).sort()
    expect(types).toEqual(['FACTURE', 'FICHIER_PROJET', 'LIVRABLE'])
    for (const doc of response.body.documents) {
      expect(doc.storagePath).toBeUndefined()
      expect(doc.pdfStoragePath).toBeUndefined()
    }
  })

  it('un collaborateur voit les documents du projet partagé, un tiers ne voit rien', async () => {
    const owner = await makeClient('owner2@example.test')
    const collaborator = await makeClient('collab@example.test')
    const outsider = await makeClient('outsider@example.test')
    const project = await Project.create({ name: 'Projet partagé', client: owner._id })
    await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'VIEWER', createdBy: owner._id })

    await Document.create({
      project: project._id, type: 'FICHIER_PROJET', originalName: 'partage.pdf',
      storagePath: 'uploads/x/partage.pdf', mimeType: 'application/pdf', uploadedBy: owner._id,
    })

    const collabResponse = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(collaborator._id)))
      .expect(200)
    expect(collabResponse.body.documents).toHaveLength(1)

    const outsiderResponse = await request(app)
      .get('/api/client/documents')
      .set('Cookie', await cookieFor(String(outsider._id)))
      .expect(200)
    expect(outsiderResponse.body.documents).toHaveLength(0)
  })

  it('filtre par type, projectId (y compris étranger -> vide) et q', async () => {
    const owner = await makeClient('owner3@example.test')
    const otherOwner = await makeClient('other@example.test')
    const project = await Project.create({ name: 'Filtrage', client: owner._id })
    const foreignProject = await Project.create({ name: 'Étranger', client: otherOwner._id })

    await Document.create({
      project: project._id, type: 'FICHIER_PROJET', originalName: 'rapport-final.pdf',
      storagePath: 'uploads/x/a.pdf', mimeType: 'application/pdf', uploadedBy: owner._id,
    })
    await Document.create({
      project: project._id, type: 'DEVIS', originalName: 'devis.pdf',
      storagePath: 'uploads/x/b.pdf', mimeType: 'application/pdf', uploadedBy: owner._id,
    })

    const cookie = await cookieFor(String(owner._id))

    const byType = await request(app).get('/api/client/documents?type=DEVIS').set('Cookie', cookie).expect(200)
    expect(byType.body.documents).toHaveLength(1)
    expect(byType.body.documents[0].type).toBe('DEVIS')

    const byForeignProject = await request(app)
      .get(`/api/client/documents?projectId=${foreignProject._id}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byForeignProject.body.documents).toHaveLength(0)

    const byQuery = await request(app).get('/api/client/documents?q=rapport').set('Cookie', cookie).expect(200)
    expect(byQuery.body.documents).toHaveLength(1)
    expect(byQuery.body.documents[0].title).toBe('rapport-final.pdf')
  })
})

describe('GET /api/client/action-items', () => {
  it('inclut une proposition SENT du propriétaire avec le bon montant, exclut une proposition expirée sans la muter', async () => {
    const owner = await makeClient('owner4@example.test')
    const project = await Project.create({ name: 'Devis', client: owner._id })

    await QuoteProposal.create({
      project: project._id, client: owner._id, createdBy: owner._id, title: 'Refonte',
      status: 'SENT', expiresAt: new Date(Date.now() + 86400000),
      lines: [{ description: 'Ligne', quantity: 1, unitPrice: 1000, taxRate: 20 }],
    })
    const expired = await QuoteProposal.create({
      project: project._id, client: owner._id, createdBy: owner._id, title: 'Expirée',
      status: 'SENT', expiresAt: new Date(Date.now() - 86400000),
      lines: [{ description: 'Ligne', quantity: 1, unitPrice: 500, taxRate: 0 }],
    })

    const response = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)

    const devisItems = response.body.items.filter((i: { type: string }) => i.type === 'DEVIS_A_SIGNER')
    expect(devisItems).toHaveLength(1)
    expect(devisItems[0].amount).toBe(1200)

    const stillSent = await QuoteProposal.findById(expired._id).select('status').lean()
    expect(stillSent?.status).toBe('SENT')
  })

  it('exclut une proposition dont le client est seulement membre, inclut une facture ISSUED et exclut PAID/DRAFT', async () => {
    const owner = await makeClient('owner5@example.test')
    const collaborator = await makeClient('collab2@example.test')
    const project = await Project.create({ name: 'Mixte', client: owner._id })
    await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'EDITOR', createdBy: owner._id })

    await QuoteProposal.create({
      project: project._id, client: owner._id, createdBy: owner._id, title: 'Pour le propriétaire',
      status: 'SENT', expiresAt: null, lines: [],
    })
    await BillingDocument.create({
      type: 'INVOICE', number: 'FAC-100', project: project._id, client: owner._id,
      status: 'ISSUED', total: 500, createdBy: owner._id,
    })
    await BillingDocument.create({
      type: 'INVOICE', number: 'FAC-101', project: project._id, client: owner._id,
      status: 'PAID', total: 300, createdBy: owner._id,
    })

    const collabResponse = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(collaborator._id)))
      .expect(200)
    expect(collabResponse.body.items).toHaveLength(0)

    const ownerResponse = await request(app)
      .get('/api/client/action-items')
      .set('Cookie', await cookieFor(String(owner._id)))
      .expect(200)
    const types = ownerResponse.body.items.map((i: { type: string }) => i.type).sort()
    expect(types).toEqual(['DEVIS_A_SIGNER', 'FACTURE_A_PAYER'])
    const facture = ownerResponse.body.items.find((i: { type: string }) => i.type === 'FACTURE_A_PAYER')
    expect(facture.amount).toBe(500)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `cd backend && npx vitest run src/__tests__/client-vault.test.ts`
Expected: FAIL — `Cannot find module '../routes/client/vault.js'`

- [ ] **Step 3: Implémenter le router**

Créer `backend/src/routes/client/vault.ts` :

```typescript
import express, { type NextFunction, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import Project from '../../models/Project.js'
import ProjectMember from '../../models/ProjectMember.js'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectItem from '../../models/ProjectItem.js'
import Document from '../../models/Document.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { computeQuoteTotals } from '../../lib/quoteTotals.js'
import type { ClientActionItem, ClientVaultDocument } from '../../types/enums.js'

const router = express.Router()
router.use(auth)

async function accessibleProjectIds(userId: string): Promise<string[]> {
  const [owned, memberOf] = await Promise.all([
    Project.find({ client: userId }).select('_id').lean(),
    ProjectMember.find({ user: userId }).select('project').lean(),
  ])
  const ids = new Set<string>()
  owned.forEach((project) => ids.add(String(project._id)))
  memberOf.forEach((member) => ids.add(String(member.project)))
  return Array.from(ids)
}

const CLIENT_VISIBLE_BILLING_STATUSES = ['ISSUED', 'SENT', 'ACCEPTED', 'PAID']

router.get('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const userId = req.user!.id
    const { type, projectId, q } = req.query as Record<string, string | undefined>

    let projectIds = await accessibleProjectIds(userId)
    if (projectId) {
      projectIds = projectIds.includes(projectId) ? [projectId] : []
    }
    if (projectIds.length === 0) return res.json({ documents: [] })

    const projects = await Project.find({ _id: { $in: projectIds } }).select('name').lean()
    const projectNameById = new Map(projects.map((project) => [String(project._id), project.name]))

    const [billingDocs, items, legacyDocs] = await Promise.all([
      BillingDocument.find({
        project: { $in: projectIds },
        status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
        pdfStoragePath: { $ne: null },
      }).lean(),
      ProjectItem.find({
        project: { $in: projectIds },
        isVisible: true,
        isDownloadable: true,
        'file.storagePath': { $exists: true, $ne: null },
      }).lean(),
      Document.find({ project: { $in: projectIds } }).lean(),
    ])

    const documents: ClientVaultDocument[] = []

    for (const doc of billingDocs) {
      const pid = String(doc.project)
      documents.push({
        id: String(doc._id),
        source: 'BILLING',
        type: doc.type === 'QUOTE' ? 'DEVIS' : 'FACTURE',
        title: doc.number,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: (doc.issuedAt ?? doc.createdAt).toISOString(),
        size: null,
        mimeType: null,
        downloadUrl: `/api/projects/${pid}/billing/${doc._id}/pdf`,
      })
    }

    for (const item of items) {
      const pid = String(item.project)
      documents.push({
        id: String(item._id),
        source: 'PROJECT_ITEM',
        type: item.type === 'CONTRAT' ? 'CONTRAT' : 'LIVRABLE',
        title: item.title,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: item.updatedAt.toISOString(),
        size: item.file?.size ?? null,
        mimeType: item.file?.mimeType ?? null,
        downloadUrl: `/api/projects/${pid}/items/${item._id}/download`,
      })
    }

    for (const doc of legacyDocs) {
      const pid = String(doc.project)
      documents.push({
        id: String(doc._id),
        source: 'DOCUMENT',
        type: doc.type,
        title: doc.originalName,
        project: { id: pid, name: projectNameById.get(pid) || '' },
        date: doc.uploadedAt.toISOString(),
        size: null,
        mimeType: doc.mimeType,
        downloadUrl: `/api/documents/${doc._id}/download`,
      })
    }

    let result = documents
    if (type) result = result.filter((d) => d.type === type)
    if (q) {
      const needle = q.toLowerCase()
      result = result.filter((d) => d.title.toLowerCase().includes(needle))
    }
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return res.json({ documents: result })
  } catch (err) {
    return next(err)
  }
})

router.get('/action-items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const userId = req.user!.id

    const ownedProjects = await Project.find({ client: userId }).select('name').lean()
    const ownedProjectIds = ownedProjects.map((project) => String(project._id))
    const projectNameById = new Map(ownedProjects.map((project) => [String(project._id), project.name]))

    if (ownedProjectIds.length === 0) return res.json({ items: [] })

    const now = new Date()
    const [proposals, invoices] = await Promise.all([
      QuoteProposal.find({
        project: { $in: ownedProjectIds },
        status: 'SENT',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }).lean(),
      BillingDocument.find({
        project: { $in: ownedProjectIds },
        type: 'INVOICE',
        status: { $in: ['ISSUED', 'SENT'] },
      }).lean(),
    ])

    const items: ClientActionItem[] = []

    for (const proposal of proposals) {
      const pid = String(proposal.project)
      const totals = computeQuoteTotals(proposal.lines, proposal.selectedOptionalLineIds)
      items.push({
        type: 'DEVIS_A_SIGNER',
        title: `Proposition « ${proposal.title} » à signer`,
        detail: '',
        project: { id: pid, name: projectNameById.get(pid) || '' },
        link: `/espace-client/projets/${pid}/propositions/${proposal._id}`,
        dueAt: proposal.expiresAt ? proposal.expiresAt.toISOString() : null,
        amount: totals.total,
        createdAt: proposal.createdAt.toISOString(),
      })
    }

    for (const invoice of invoices) {
      const pid = String(invoice.project)
      items.push({
        type: 'FACTURE_A_PAYER',
        title: `Facture ${invoice.number} à régler`,
        detail: '',
        project: { id: pid, name: projectNameById.get(pid) || '' },
        link: `/espace-client/projets/${pid}/facturation`,
        dueAt: invoice.dueAt ? invoice.dueAt.toISOString() : null,
        amount: invoice.total,
        createdAt: invoice.createdAt.toISOString(),
      })
    }

    items.sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      if (a.dueAt) return -1
      if (b.dueAt) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return res.json({ items })
  } catch (err) {
    return next(err)
  }
})

export default router
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx vitest run src/__tests__/client-vault.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/client/vault.ts backend/src/__tests__/client-vault.test.ts
git commit -m "feat(backend): agrégation Mes documents et action items du dashboard client"
```

---

## Task 6: Route `POST /api/client/files` — dépôt de fichiers

**Files:**
- Create: `backend/src/routes/client/files.ts`
- Test: `backend/src/__tests__/client-files.test.ts`

**Interfaces:**
- Consumes: `ClientUpload` (Task 2), `getProjectAccess` (existant), `notifySuperAdmins` (existant,
  `backend/src/lib/notifyHelpers.ts`), `ClientActivity`, `ActivityLog` (existants)
- Produces: `router` par défaut exporté par `client/files.ts`, monté en Task 9 sous `/api/client`.

Cette tâche couvre l'intégralité du fichier `files.ts` (upload + liste + download + delete) en un
seul cycle TDD, le multer et le handler d'erreurs étant partagés par toutes les routes du fichier.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/__tests__/client-files.test.ts` :

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientFileRoutes from '../routes/client/files.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ClientUpload from '../models/ClientUpload.js'
import ClientActivity from '../models/ClientActivity.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use('/api/client', clientFileRoutes)
})

afterAll(async () => {
  await teardownMongo()
  await fs.promises.rm(path.resolve('uploads/client-files'), { recursive: true, force: true }).catch(() => {})
})

beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeClient(email: string) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: 'Client', email, passwordHash, role: 'CLIENT' })
}

describe('POST /api/client/files', () => {
  it('accepte un dépôt multiple sans projet : fichiers sur disque, documents créés, pas de storagePath en réponse', async () => {
    const client = await makeClient('deposant@example.test')

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('category', 'LOGO')
      .field('note', 'Logo v2')
      .attach('files', Buffer.from('fake-png'), { filename: 'logo.png', contentType: 'image/png' })
      .attach('files', Buffer.from('fake-pdf'), { filename: 'brief.pdf', contentType: 'application/pdf' })
      .expect(201)

    expect(response.body.files).toHaveLength(2)
    for (const file of response.body.files) {
      expect(file.storagePath).toBeUndefined()
    }

    const stored = await ClientUpload.find({ client: client._id })
    expect(stored).toHaveLength(2)
    for (const doc of stored) {
      expect(fs.existsSync(path.resolve(process.cwd(), doc.storagePath))).toBe(true)
      expect(doc.storagePath).toContain(`uploads/client-files/${client._id}`)
    }
  })

  it('accepte un dépôt avec projectId accessible', async () => {
    const client = await makeClient('proprio@example.test')
    const project = await Project.create({ name: 'Site', client: client._id })

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('projectId', String(project._id))
      .attach('files', Buffer.from('data'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(201)

    expect(response.body.files[0].project).toBe(String(project._id))
  })

  it("refuse un projectId étranger (404) et ne laisse aucun fichier sur disque", async () => {
    const client = await makeClient('sans-acces@example.test')
    const otherClient = await makeClient('autre@example.test')
    const foreignProject = await Project.create({ name: 'Étranger', client: otherClient._id })

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('projectId', String(foreignProject._id))
      .attach('files', Buffer.from('data'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(404)

    expect(response.body.error).toBeDefined()
    const remaining = await ClientUpload.find({ client: client._id })
    expect(remaining).toHaveLength(0)
    const dir = path.resolve('uploads/client-files', String(client._id))
    const files = fs.existsSync(dir) ? await fs.promises.readdir(dir) : []
    expect(files).toHaveLength(0)
  })

  it('refuse un 11e fichier (400/413) et un MIME hors allowlist (400 UNSUPPORTED_FILE_TYPE)', async () => {
    const client = await makeClient('limites@example.test')
    const cookie = await cookieFor(String(client._id))

    let requestBuilder = request(app).post('/api/client/files').set('Cookie', cookie)
    for (let i = 0; i < 11; i++) {
      requestBuilder = requestBuilder.attach('files', Buffer.from(`f${i}`), { filename: `f${i}.pdf`, contentType: 'application/pdf' })
    }
    const tooMany = await requestBuilder
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error).toBeDefined()

    const badMime = await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('exe'), { filename: 'virus.exe', contentType: 'application/x-msdownload' })
      .expect(400)
    expect(badMime.body.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('crée une notification CLIENT_FILE_UPLOADED par SUPER_ADMIN actif, une seule par dépôt, dedupe au dépôt suivant', async () => {
    const client = await makeClient('notif@example.test')
    const passwordHash = await bcrypt.hash('x', 4)
    const admin = await User.create({ name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true })
    const cookie = await cookieFor(String(client._id))

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('a'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('files', Buffer.from('b'), { filename: 'b.pdf', contentType: 'application/pdf' })
      .expect(201)

    const notifications = await Notification.find({ recipient: admin._id, type: 'CLIENT_FILE_UPLOADED' })
    expect(notifications).toHaveLength(1)

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('c'), { filename: 'c.pdf', contentType: 'application/pdf' })
      .expect(201)

    const afterSecond = await Notification.find({ recipient: admin._id, type: 'CLIENT_FILE_UPLOADED' })
    expect(afterSecond).toHaveLength(1)
  })

  it('trace un ClientActivity systématiquement, un ActivityLog FICHIER_CLIENT_DEPOSE seulement si projet', async () => {
    const client = await makeClient('trace@example.test')
    const project = await Project.create({ name: 'Traçable', client: client._id })
    const cookie = await cookieFor(String(client._id))

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('a'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(201)
    const activities = await ClientActivity.find({ clientId: client._id, type: 'FICHIER_DEPOSE' })
    expect(activities).toHaveLength(1)
    const logsWithoutProject = await ActivityLog.find({ action: 'FICHIER_CLIENT_DEPOSE' })
    expect(logsWithoutProject).toHaveLength(0)

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .field('projectId', String(project._id))
      .attach('files', Buffer.from('b'), { filename: 'b.pdf', contentType: 'application/pdf' })
      .expect(201)
    const logsWithProject = await ActivityLog.find({ action: 'FICHIER_CLIENT_DEPOSE', project: project._id })
    expect(logsWithProject).toHaveLength(1)
  })
})

describe('scoping et sécurité des fichiers déposés', () => {
  it('un client B ne liste pas, ne télécharge pas et ne supprime pas les fichiers du client A ; A gère les siens', async () => {
    const clientA = await makeClient('a@example.test')
    const clientB = await makeClient('b@example.test')
    const cookieA = await cookieFor(String(clientA._id))
    const cookieB = await cookieFor(String(clientB._id))

    const uploadResponse = await request(app)
      .post('/api/client/files')
      .set('Cookie', cookieA)
      .attach('files', Buffer.from('secret'), { filename: 'secret.pdf', contentType: 'application/pdf' })
      .expect(201)
    const fileId = uploadResponse.body.files[0].id

    const listB = await request(app).get('/api/client/files').set('Cookie', cookieB).expect(200)
    expect(listB.body.files).toHaveLength(0)

    await request(app).get(`/api/client/files/${fileId}/download`).set('Cookie', cookieB).expect(404)
    await request(app).delete(`/api/client/files/${fileId}`).set('Cookie', cookieB).expect(404)

    await request(app).get(`/api/client/files/${fileId}/download`).set('Cookie', cookieA).expect(200)
    await request(app).delete(`/api/client/files/${fileId}`).set('Cookie', cookieA).expect(200)

    const stored = await ClientUpload.findById(fileId)
    expect(stored).toBeNull()
  })

  it('un storagePath forgé hors de uploads/ répond 403 et ne sert jamais le fichier', async () => {
    const client = await makeClient('traversal@example.test')
    const forged = await ClientUpload.create({
      client: client._id,
      originalName: 'evil.txt',
      storagePath: '../../etc/passwd',
      mimeType: 'text/plain',
      size: 1,
    })

    const response = await request(app)
      .get(`/api/client/files/${forged._id}/download`)
      .set('Cookie', await cookieFor(String(client._id)))
      .expect(403)
    expect(response.body.error).toBeDefined()
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `cd backend && npx vitest run src/__tests__/client-files.test.ts`
Expected: FAIL — `Cannot find module '../routes/client/files.js'`

- [ ] **Step 3: Implémenter le router**

Créer `backend/src/routes/client/files.ts` :

```typescript
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import auth from '../../middleware/auth.js'
import ClientUpload from '../../models/ClientUpload.js'
import ActivityLog from '../../models/ActivityLog.js'
import ClientActivity from '../../models/ClientActivity.js'
import User from '../../models/User.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()
router.use(auth)

const baseDir = path.resolve('uploads/client-files')

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
])

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(baseDir, String(req.user!.id))
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('UNSUPPORTED_FILE_TYPE'))
    }
  },
})

const CATEGORIES = new Set(['LOGO', 'TEXTE', 'PHOTO', 'BRIEF', 'AUTRE'])

async function removeFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})))
}

function handleUploadErrors(err: unknown, res: Response): boolean {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Fichier trop volumineux (20 Mo max)', code: 'FILE_TOO_LARGE' })
      return true
    }
    res.status(400).json({ error: 'Trop de fichiers (10 maximum)', code: 'TOO_MANY_FILES' })
    return true
  }
  if (err instanceof Error && err.message === 'UNSUPPORTED_FILE_TYPE') {
    res.status(400).json({ error: 'Type de fichier non autorisé', code: 'UNSUPPORTED_FILE_TYPE' })
    return true
  }
  return false
}

router.post(
  '/files',
  (req: Request, res: Response, next: NextFunction) => {
    upload.array('files', 10)(req, res, (err) => {
      if (err) {
        if (handleUploadErrors(err, res)) return
        return next(err)
      }
      next()
    })
  },
  async (req: Request, res: Response, next: NextFunction) => {
    const files = (req.files as Express.Multer.File[]) || []
    try {
      if (req.user!.role !== 'CLIENT') {
        await removeFiles(files)
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (files.length === 0) {
        return res.status(400).json({ error: 'Aucun fichier reçu' })
      }

      const { projectId, category, note } = req.body as { projectId?: string; category?: string; note?: string }
      const trimmedNote = String(note ?? '').slice(0, 500)
      const resolvedCategory = category && CATEGORIES.has(category) ? category : 'AUTRE'

      let project = null
      if (projectId) {
        const access = await getProjectAccess(projectId, req.user!.id)
        if (!access) {
          await removeFiles(files)
          return res.status(404).json({ error: 'Projet non trouvé' })
        }
        project = access.project
      }

      const created = await ClientUpload.create(
        files.map((file) => ({
          client: req.user!.id,
          project: project ? project._id : null,
          category: resolvedCategory,
          note: trimmedNote,
          originalName: file.originalname,
          storagePath: path.relative(process.cwd(), file.path),
          mimeType: file.mimetype,
          size: file.size,
        })),
      )

      const clientUser = await User.findById(req.user!.id).select('name companyName').lean()
      const clientName = clientUser?.companyName || clientUser?.name || 'Client'

      await notifySuperAdmins({
        type: 'CLIENT_FILE_UPLOADED',
        title: `Fichiers reçus de ${clientName}`,
        message: `${files.length} fichier(s)${project ? ` — projet ${project.name}` : ''}`,
        link: `/admin/comptes-clients/${req.user!.id}?tab=files`,
        metadata: { clientId: req.user!.id, projectId: project ? String(project._id) : null, count: files.length },
        dedupeKey: `client-files:${req.user!.id}`,
      })

      await ClientActivity.create({
        clientId: req.user!.id,
        type: 'FICHIER_DEPOSE',
        label: `${files.length} fichier(s) déposé(s)${project ? ` sur le projet ${project.name}` : ''}`,
        payload: { count: files.length, projectId: project ? String(project._id) : null },
        actorId: req.user!.id,
      })

      if (project) {
        await ActivityLog.create({
          project: project._id,
          action: 'FICHIER_CLIENT_DEPOSE',
          actor: req.user!.id,
          summary: `${files.length} fichier(s) déposé(s) par le client`,
          metadata: { count: files.length },
        })
      }

      return res.status(201).json({
        files: created.map((doc) => ({
          id: String(doc._id),
          project: doc.project ? String(doc.project) : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      await removeFiles(files)
      return next(err)
    }
  },
)

router.get('/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const { projectId, q } = req.query as Record<string, string | undefined>
    const query: Record<string, unknown> = { client: req.user!.id }
    if (projectId) query.project = projectId
    if (q) query.originalName = { $regex: q, $options: 'i' }

    const files = await ClientUpload.find(query).sort({ createdAt: -1 }).lean()
    return res.json({
      files: files.map((doc) => ({
        id: String(doc._id),
        project: doc.project ? String(doc.project) : null,
        category: doc.category,
        note: doc.note,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        createdAt: doc.createdAt.toISOString(),
        downloadedByAdminAt: doc.downloadedByAdminAt ? doc.downloadedByAdminAt.toISOString() : null,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/files/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const file = await ClientUpload.findOne({ _id: req.params.id, client: req.user!.id })
    if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

    const uploadsDir = path.resolve(process.cwd(), 'uploads')
    const filePath = path.resolve(process.cwd(), file.storagePath)
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' })
    }
    return res.download(filePath, file.originalName)
  } catch (err) {
    return next(err)
  }
})

router.delete('/files/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const file = await ClientUpload.findOne({ _id: req.params.id, client: req.user!.id })
    if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

    const filePath = path.resolve(process.cwd(), file.storagePath)
    await fs.promises.unlink(filePath).catch(() => {})
    await ClientUpload.deleteOne({ _id: file._id })
    await ClientActivity.create({
      clientId: req.user!.id,
      type: 'FICHIER_SUPPRIME',
      label: `Fichier « ${file.originalName} » supprimé`,
      payload: { fileId: String(file._id) },
      actorId: req.user!.id,
    })

    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd backend && npx vitest run src/__tests__/client-files.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/client/files.ts backend/src/__tests__/client-files.test.ts
git commit -m "feat(backend): dépôt, liste, téléchargement et suppression des fichiers client"
```

---

## Task 7: Monter `/api/client` dans `backend/src/index.ts`

**Files:**
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `client/vault.ts` (Task 5), `client/files.ts` (Task 6)

- [ ] **Step 1: Ajouter les imports**

Ouvrir `backend/src/index.ts`, localiser les imports des autres routers `client*` (proche de
`clientProjectContentRoutes`, `clientQuoteRoutes`), ajouter :

```typescript
import clientVaultRoutes from './routes/client/vault.js'
import clientFileRoutes from './routes/client/files.js'
```

- [ ] **Step 2: Monter les routers avant `apiNotFound`**

Localiser le bloc :

```typescript
app.use('/api/projects', clientQuoteRoutes)

// This must stay after every /api mount and before static files / the SPA
// fallback. app.all covers the namespace root, unknown GET, mutations and
// non-standard API methods.
app.all(['/api', '/api/{*path}'], apiNotFound)
```

Insérer entre les deux :

```typescript
app.use('/api/projects', clientQuoteRoutes)

app.use('/api/client', clientVaultRoutes)
app.use('/api/client', clientFileRoutes)

// This must stay after every /api mount and before static files / the SPA
// fallback. app.all covers the namespace root, unknown GET, mutations and
// non-standard API methods.
app.all(['/api', '/api/{*path}'], apiNotFound)
```

- [ ] **Step 3: Vérifier que le serveur démarre et que les routes répondent**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur.

Run: `cd backend && npx vitest run src/__tests__/client-vault.test.ts src/__tests__/client-files.test.ts`
Expected: PASS (tous les tests déjà écrits, inchangés — cette étape ne fait que confirmer le montage
réel, les tests précédents montaient les routers directement donc restent verts indépendamment).

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): monter /api/client (Mes documents, Vos fichiers)"
```

---

## Task 8: Routes admin — `GET /api/admin/clients/:id/files`

**Files:**
- Create: `backend/src/routes/admin/clients/files.ts`
- Modify: `backend/src/routes/admin/clients/index.ts`
- Test: `backend/src/__tests__/admin-client-files.test.ts` (partie 1)

**Interfaces:**
- Consumes: `ensureClient(clientId, req)` (existant, `backend/src/routes/admin/clients/helpers.ts`),
  `requirePermission(PERMISSIONS.MANAGE_CLIENTS)` (existant), `ClientUpload` (Task 2)
- Produces: `router` par défaut, monté dans `admin/clients/index.ts`.

- [ ] **Step 1: Écrire les tests qui échouent (partie admin/clients)**

Créer `backend/src/__tests__/admin-client-files.test.ts` :

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminClientRoutes from '../routes/admin/clients/index.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ClientUpload from '../models/ClientUpload.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/clients', adminClientRoutes)
  app.use('/api/admin/projects', adminProjectRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: role, email, passwordHash, role, isActive: true, ...extra })
}

describe('GET /api/admin/clients/:id/files', () => {
  it('exige MANAGE_CLIENTS, refuse un admin sans la permission (403)', async () => {
    const client = await makeUser('client@example.test', 'CLIENT')
    const viewer = await makeUser('viewer@example.test', 'VIEWER')

    await request(app)
      .get(`/api/admin/clients/${client._id}/files`)
      .set('Cookie', await cookieFor(String(viewer._id)))
      .expect(403)
  })

  it('liste les fichiers du compte pour un SUPER_ADMIN, refuse un fileId étranger au téléchargement', async () => {
    const client = await makeUser('client2@example.test', 'CLIENT')
    const otherClient = await makeUser('other@example.test', 'CLIENT')
    const admin = await makeUser('admin@example.test', 'SUPER_ADMIN')

    const file = await ClientUpload.create({
      client: client._id, originalName: 'a.pdf', storagePath: 'uploads/client-files/x/a.pdf',
      mimeType: 'application/pdf', size: 1,
    })
    const foreignFile = await ClientUpload.create({
      client: otherClient._id, originalName: 'b.pdf', storagePath: 'uploads/client-files/y/b.pdf',
      mimeType: 'application/pdf', size: 1,
    })

    const adminCookie = await cookieFor(String(admin._id))

    const list = await request(app).get(`/api/admin/clients/${client._id}/files`).set('Cookie', adminCookie).expect(200)
    expect(list.body.files).toHaveLength(1)
    expect(list.body.files[0].id).toBe(String(file._id))
    expect(list.body.files[0].storagePath).toBeUndefined()

    await request(app)
      .get(`/api/admin/clients/${client._id}/files/${foreignFile._id}/download`)
      .set('Cookie', adminCookie)
      .expect(404)
  })

  it('pose downloadedByAdminAt au premier téléchargement, inchangé ensuite', async () => {
    const client = await makeUser('client3@example.test', 'CLIENT')
    const admin = await makeUser('admin2@example.test', 'SUPER_ADMIN')
    const file = await ClientUpload.create({
      client: client._id, originalName: 'c.txt', storagePath: 'uploads/client-files/x/c.txt',
      mimeType: 'text/plain', size: 1,
    })
    const fs = await import('fs')
    const path = await import('path')
    const dir = path.resolve('uploads/client-files/x')
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(path.resolve('uploads/client-files/x/c.txt'), 'contenu')

    const adminCookie = await cookieFor(String(admin._id))
    await request(app).get(`/api/admin/clients/${client._id}/files/${file._id}/download`).set('Cookie', adminCookie).expect(200)
    const afterFirst = await ClientUpload.findById(file._id).select('downloadedByAdminAt').lean()
    expect(afterFirst?.downloadedByAdminAt).toBeTruthy()
    const firstTimestamp = afterFirst?.downloadedByAdminAt

    await request(app).get(`/api/admin/clients/${client._id}/files/${file._id}/download`).set('Cookie', adminCookie).expect(200)
    const afterSecond = await ClientUpload.findById(file._id).select('downloadedByAdminAt').lean()
    expect(afterSecond?.downloadedByAdminAt?.getTime()).toBe(firstTimestamp?.getTime())

    await fs.promises.rm(path.resolve('uploads/client-files'), { recursive: true, force: true })
  })
})

describe('GET /api/admin/projects/:projectId/client-files', () => {
  it('exige VIEW_CONTENT, refuse un fileId non rattaché à ce projet (404)', async () => {
    const client = await makeUser('client4@example.test', 'CLIENT')
    const admin = await makeUser('admin3@example.test', 'SUPER_ADMIN')
    const rh = await makeUser('rh@example.test', 'RH')
    const project = await Project.create({ name: 'Projet A', client: client._id })
    const otherProject = await Project.create({ name: 'Projet B', client: client._id })

    const file = await ClientUpload.create({
      client: client._id, project: project._id, originalName: 'd.pdf',
      storagePath: 'uploads/client-files/x/d.pdf', mimeType: 'application/pdf', size: 1,
    })

    await request(app)
      .get(`/api/admin/projects/${project._id}/client-files`)
      .set('Cookie', await cookieFor(String(rh._id)))
      .expect(403)

    const adminCookie = await cookieFor(String(admin._id))
    const list = await request(app).get(`/api/admin/projects/${project._id}/client-files`).set('Cookie', adminCookie).expect(200)
    expect(list.body.files).toHaveLength(1)
    expect(list.body.files[0].client.name).toBe('CLIENT')

    await request(app)
      .get(`/api/admin/projects/${otherProject._id}/client-files/${file._id}/download`)
      .set('Cookie', adminCookie)
      .expect(404)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `cd backend && npx vitest run src/__tests__/admin-client-files.test.ts`
Expected: FAIL — `Cannot find module '../routes/admin/clients/files.js'` (les routes n'existent pas
encore ; la route projects échoue aussi via 404 générique `apiNotFound` non monté ici, donc erreurs
d'import en premier).

- [ ] **Step 3: Implémenter la route admin/clients/files.ts**

Créer `backend/src/routes/admin/clients/files.ts` :

```typescript
import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'path'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientUpload from '../../../models/ClientUpload.js'
import { ensureClient } from './helpers.js'

const router = express.Router()

router.get(
  '/:id/files',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id, req)
      if (!client) return res.status(404).json({ error: 'Client non trouvé' })

      const files = await ClientUpload.find({ client: client._id }).populate('project', 'name').sort({ createdAt: -1 }).lean()

      return res.json({
        files: files.map((doc) => ({
          id: String(doc._id),
          project: doc.project ? { id: String((doc.project as { _id: unknown })._id), name: (doc.project as { name: string }).name } : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
          downloadedByAdminAt: doc.downloadedByAdminAt ? doc.downloadedByAdminAt.toISOString() : null,
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id/files/:fileId/download',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id, req)
      if (!client) return res.status(404).json({ error: 'Client non trouvé' })

      const file = await ClientUpload.findOne({ _id: req.params.fileId, client: client._id })
      if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

      const uploadsDir = path.resolve(process.cwd(), 'uploads')
      const filePath = path.resolve(process.cwd(), file.storagePath)
      if (!filePath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      if (!file.downloadedByAdminAt) {
        file.downloadedByAdminAt = new Date()
        await file.save()
      }

      return res.download(filePath, file.originalName)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 4: Monter le router**

Ouvrir `backend/src/routes/admin/clients/index.ts` et ajouter :

```typescript
import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import crudRouter from './crud.js'
import contactsRouter from './contacts.js'
import notesRouter from './notes.js'
import projectsRouter from './projects.js'
import billingRouter from './billing.js'
import filesRouter from './files.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.use(crudRouter)
router.use(contactsRouter)
router.use(notesRouter)
router.use(projectsRouter)
router.use(billingRouter)
router.use(filesRouter)

export default router
```

- [ ] **Step 5: Vérifier que les tests `admin/clients` passent (les tests `admin/projects` échouent encore)**

Run: `cd backend && npx vitest run src/__tests__/admin-client-files.test.ts`
Expected: FAIL sur le describe `GET /api/admin/projects/:projectId/client-files` uniquement
(`Cannot find module '../routes/admin/projects/index.js'` importe correctement mais la route
`/client-files` n'existe pas encore → 404 générique attendu 200/403).

- [ ] **Step 6: Commit intermédiaire**

```bash
git add backend/src/routes/admin/clients/files.ts backend/src/routes/admin/clients/index.ts backend/src/__tests__/admin-client-files.test.ts
git commit -m "feat(backend): admin - fichiers reçus par compte client (MANAGE_CLIENTS)"
```

---

## Task 9: Routes admin — `GET /api/admin/projects/:projectId/client-files`

**Files:**
- Create: `backend/src/routes/admin/projects/clientFiles.ts`
- Modify: `backend/src/routes/admin/projects/index.ts`
- Test: `backend/src/__tests__/admin-client-files.test.ts` (déjà écrit en Task 8, describe restant)

**Interfaces:**
- Consumes: `requirePermission(PERMISSIONS.VIEW_CONTENT)` (existant), `ClientUpload` (Task 2)
- Produces: `router` par défaut, monté dans `admin/projects/index.ts`.

- [ ] **Step 1: Confirmer l'échec ciblé**

Run: `cd backend && npx vitest run src/__tests__/admin-client-files.test.ts -t "GET /api/admin/projects/:projectId/client-files"`
Expected: FAIL — la route `/api/admin/projects/:projectId/client-files` répond 404 générique au lieu
de 403/200 attendus.

- [ ] **Step 2: Implémenter la route**

Créer `backend/src/routes/admin/projects/clientFiles.ts` :

```typescript
import express, { type Request, type Response, type NextFunction } from 'express'
import path from 'path'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientUpload from '../../../models/ClientUpload.js'

const router = express.Router()

router.get(
  '/:projectId/client-files',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = await ClientUpload.find({ project: req.params.projectId })
        .populate('client', 'name companyName')
        .sort({ createdAt: -1 })
        .lean()

      return res.json({
        files: files.map((doc) => ({
          id: String(doc._id),
          client: doc.client
            ? {
                id: String((doc.client as { _id: unknown })._id),
                name: (doc.client as { name: string }).name,
                companyName: (doc.client as { companyName?: string }).companyName || '',
              }
            : null,
          category: doc.category,
          note: doc.note,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          createdAt: doc.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:projectId/client-files/:fileId/download',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await ClientUpload.findOne({ _id: req.params.fileId, project: req.params.projectId })
      if (!file) return res.status(404).json({ error: 'Fichier non trouvé' })

      const uploadsDir = path.resolve(process.cwd(), 'uploads')
      const filePath = path.resolve(process.cwd(), file.storagePath)
      if (!filePath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      if (!file.downloadedByAdminAt) {
        file.downloadedByAdminAt = new Date()
        await file.save()
      }

      return res.download(filePath, file.originalName)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 3: Monter le router**

Ouvrir `backend/src/routes/admin/projects/index.ts` et ajouter :

```typescript
import express from 'express'
import coreRouter from './core.js'
import sectionsRouter from './sections.js'
import itemsRouter from './items.js'
import clientFilesRouter from './clientFiles.js'
import tasksRouter from '../tasks/index.js'
import messagesRouter from '../messages.js'

const router = express.Router()

router.use(coreRouter)
router.use(sectionsRouter)
router.use(itemsRouter)
router.use(clientFilesRouter)
router.use(tasksRouter)
router.use(messagesRouter)

export default router
```

- [ ] **Step 4: Vérifier que tous les tests admin passent**

Run: `cd backend && npx vitest run src/__tests__/admin-client-files.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Lancer toute la suite backend**

Run: `cd backend && npx vitest run`
Expected: PASS pour tous les fichiers de tests (nouveaux et existants — aucune régression).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/projects/clientFiles.ts backend/src/routes/admin/projects/index.ts
git commit -m "feat(backend): admin - fichiers déposés par le client sur un projet (VIEW_CONTENT)"
```

---

## Task 10: Services frontend `clientVault.ts` et `clientFiles.ts`

**Files:**
- Create: `src/services/clientVault.ts`
- Create: `src/services/clientFiles.ts`

**Interfaces:**
- Consumes: `apiFetch`, `apiUpload` (existants, `src/lib/api.ts`), `ClientVaultDocument`,
  `ClientActionItem`, `ClientUploadFile` (Task 4)
- Produces: `listClientDocuments`, `listClientActionItems`, `listClientFiles`, `uploadClientFiles`,
  `deleteClientFile`, `clientFileDownloadUrl` — consommés par Task 11-14 (pages) et Task 15
  (Dashboard).

- [ ] **Step 1: Créer `src/services/clientVault.ts`**

```typescript
import { apiFetch } from '../lib/api'
import type { ClientActionItem, ClientVaultDocument } from '../types/clientVault.types'

export function listClientDocuments(
  params: { type?: string; projectId?: string; q?: string } = {},
): Promise<{ documents: ClientVaultDocument[] }> {
  const query = new URLSearchParams()
  if (params.type) query.set('type', params.type)
  if (params.projectId) query.set('projectId', params.projectId)
  if (params.q) query.set('q', params.q)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/client/documents${suffix}`)
}

export function listClientActionItems(): Promise<{ items: ClientActionItem[] }> {
  return apiFetch('/api/client/action-items')
}
```

- [ ] **Step 2: Créer `src/services/clientFiles.ts`**

```typescript
import { apiFetch, apiUpload } from '../lib/api'
import type { ClientUploadFile } from '../types/clientVault.types'

export function listClientFiles(params: { projectId?: string; q?: string } = {}): Promise<{ files: ClientUploadFile[] }> {
  const query = new URLSearchParams()
  if (params.projectId) query.set('projectId', params.projectId)
  if (params.q) query.set('q', params.q)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/client/files${suffix}`)
}

export function uploadClientFiles(formData: FormData): Promise<{ files: ClientUploadFile[] }> {
  return apiUpload('/api/client/files', formData)
}

export function deleteClientFile(fileId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/client/files/${fileId}`, { method: 'DELETE' })
}

export function clientFileDownloadUrl(fileId: string): string {
  return `/api/client/files/${fileId}/download`
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add src/services/clientVault.ts src/services/clientFiles.ts
git commit -m "feat(frontend): services Mes documents et Vos fichiers"
```

---

## Task 11: Page « Mes documents »

**Files:**
- Create: `src/pages/espace-client/Documents.tsx`
- Test: `src/pages/espace-client/Documents.test.tsx`

**Interfaces:**
- Consumes: `listClientDocuments` (Task 10), `apiFetch('/api/projects')` (existant),
  `ClientVaultDocument` (Task 4)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/pages/espace-client/Documents.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientDocuments from './Documents'
import * as clientVaultService from '../../services/clientVault'
import { apiFetch } from '../../lib/api'

vi.mock('../../services/clientVault')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

const documents = [
  {
    id: '1', source: 'BILLING' as const, type: 'FACTURE' as const, title: 'FAC-001',
    project: { id: 'p1', name: 'Site vitrine' }, date: '2026-08-01T00:00:00.000Z',
    size: null, mimeType: null, downloadUrl: '/api/projects/p1/billing/1/pdf',
  },
  {
    id: '2', source: 'PROJECT_ITEM' as const, type: 'LIVRABLE' as const, title: 'Maquette v1',
    project: { id: 'p1', name: 'Site vitrine' }, date: '2026-08-05T00:00:00.000Z',
    size: 2048, mimeType: 'application/pdf', downloadUrl: '/api/projects/p1/items/2/download',
  },
]

beforeEach(() => {
  vi.mocked(clientVaultService.listClientDocuments).mockResolvedValue({ documents })
  vi.mocked(apiFetch).mockResolvedValue({ projects: [{ _id: 'p1', name: 'Site vitrine' } as never] })
})

describe('Documents (Mes documents)', () => {
  it('affiche la liste chargée', async () => {
    render(<MemoryRouter><ClientDocuments /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('filtre par type', async () => {
    render(<MemoryRouter><ClientDocuments /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Tous les types'), { target: { value: 'LIVRABLE' } })

    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument()
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('filtre par recherche texte', async () => {
    render(<MemoryRouter><ClientDocuments /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Rechercher un document...'), { target: { value: 'maquette' } })

    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument()
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('affiche des liens de téléchargement corrects par source', async () => {
    render(<MemoryRouter><ClientDocuments /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    const links = screen.getAllByText('Télécharger') as HTMLAnchorElement[]
    expect(links[0].getAttribute('href')).toBe('/api/projects/p1/billing/1/pdf')
    expect(links[1].getAttribute('href')).toBe('/api/projects/p1/items/2/download')
  })

  it("affiche l'état vide quand la liste est vide", async () => {
    vi.mocked(clientVaultService.listClientDocuments).mockResolvedValue({ documents: [] })
    render(<MemoryRouter><ClientDocuments /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Aucun document pour le moment')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/pages/espace-client/Documents.test.tsx`
Expected: FAIL — `Cannot find module './Documents'`

- [ ] **Step 3: Implémenter la page**

Créer `src/pages/espace-client/Documents.tsx` :

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { listClientDocuments } from '../../services/clientVault'
import { SkeletonGrid } from '../../components/Skeleton'
import type { ClientVaultDocument } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const TYPE_LABELS: Record<string, string> = {
  DEVIS: 'Devis',
  FACTURE: 'Factures',
  CONTRAT: 'Contrats',
  LIVRABLE: 'Livrables',
  FICHIER_PROJET: 'Fichiers projet',
}

function formatSize(size: number | null): string {
  if (size === null) return '—'
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

const ClientDocuments = () => {
  const [documents, setDocuments] = useState<ClientVaultDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [projectFilter, setProjectFilter] = useState('ALL')

  useEffect(() => {
    const load = async () => {
      try {
        const [documentsData, projectsData] = await Promise.all([
          listClientDocuments(),
          apiFetch<{ projects: Project[] }>('/api/projects'),
        ])
        setDocuments(documentsData.documents)
        setProjects(projectsData.projects || [])
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement documents')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let result = [...documents]
    if (typeFilter !== 'ALL') result = result.filter((d) => d.type === typeFilter)
    if (projectFilter !== 'ALL') result = result.filter((d) => d.project.id === projectFilter)
    if (search.trim()) {
      const needle = search.toLowerCase()
      result = result.filter((d) => d.title.toLowerCase().includes(needle))
    }
    return result
  }, [documents, typeFilter, projectFilter, search])

  return (
    <div className="portal-container">
      <h1>Mes documents</h1>

      {loading && <SkeletonGrid count={4} className="client-dashboard-grid" />}

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <input
              className="portal-input"
              type="text"
              placeholder="Rechercher un document..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: '200px' }}
            />
            <select
              className="portal-input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ flex: '0 0 auto', width: 'auto', minWidth: '160px' }}
            >
              <option value="ALL">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="portal-input"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ flex: '0 0 auto', width: 'auto', minWidth: '160px' }}
            >
              <option value="ALL">Tous les projets</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="client-dashboard-empty">
              <div className="client-dashboard-empty-icon">📄</div>
              <h3>Aucun document pour le moment</h3>
              <p>Vos devis, factures, contrats et livrables apparaîtront ici.</p>
            </div>
          ) : (
            <div className="portal-list">
              {filtered.map((doc) => (
                <div
                  key={`${doc.source}-${doc.id}`}
                  className="portal-card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                >
                  <div>
                    <span className="portal-badge">{TYPE_LABELS[doc.type] || doc.type}</span>
                    <h3 style={{ margin: '8px 0 4px' }}>{doc.title}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <Link to={`/espace-client/projets/${doc.project.id}`} className="portal-link">
                        {doc.project.name}
                      </Link>
                      {' · '}
                      {new Date(doc.date).toLocaleDateString('fr-FR')}
                      {' · '}
                      {formatSize(doc.size)}
                    </p>
                  </div>
                  <a className="portal-button" href={doc.downloadUrl}>
                    Télécharger
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ClientDocuments
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/pages/espace-client/Documents.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/espace-client/Documents.tsx src/pages/espace-client/Documents.test.tsx
git commit -m "feat(frontend): page Mes documents (agrégation client)"
```

---

## Task 12: Page « Vos fichiers »

**Files:**
- Create: `src/pages/espace-client/MyFiles.tsx`

**Interfaces:**
- Consumes: `listClientFiles`, `uploadClientFiles`, `deleteClientFile`, `clientFileDownloadUrl`
  (Task 10), `apiFetch('/api/projects')` (existant), `ConfirmModal` (existant), `useToast` (existant,
  `src/context/ToastContext`)

Pas de fichier de test dédié dans la spec pour cette page (seule `Documents.test.tsx` et le
complément `Dashboard.test.tsx` sont listés § Tests) — implémentation directe, puis vérification
manuelle en Task 19.

- [ ] **Step 1: Implémenter la page**

Créer `src/pages/espace-client/MyFiles.tsx` :

```tsx
import React, { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { listClientFiles, uploadClientFiles, deleteClientFile, clientFileDownloadUrl } from '../../services/clientFiles'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import type { ClientUploadFile } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const CATEGORY_LABELS: Record<string, string> = {
  LOGO: 'Logo',
  TEXTE: 'Texte',
  PHOTO: 'Photo',
  BRIEF: 'Brief',
  AUTRE: 'Autre',
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

const ClientMyFiles = () => {
  const { showToast } = useToast()
  const [files, setFiles] = useState<ClientUploadFile[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [category, setCategory] = useState('AUTRE')
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [filesData, projectsData] = await Promise.all([
        listClientFiles(),
        apiFetch<{ projects: Project[] }>('/api/projects'),
      ])
      setFiles(filesData.files)
      setProjects(projectsData.projects || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement fichiers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedFiles.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files', file))
      if (projectId) formData.append('projectId', projectId)
      formData.append('category', category)
      if (note.trim()) formData.append('note', note.trim())

      await uploadClientFiles(formData)
      setSelectedFiles([])
      setNote('')
      showToast('Fichiers envoyés', 'success')
      await load()
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur lors de l’envoi', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteClientFile(pendingDeleteId)
      setFiles((current) => current.filter((f) => f.id !== pendingDeleteId))
      showToast('Fichier supprimé', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur suppression', 'error')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="portal-container">
      <h1>Vos fichiers</h1>

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      <div className="portal-card" style={{ marginBottom: 24 }}>
        <form onSubmit={handleUpload} style={{ display: 'grid', gap: 12 }}>
          <input
            className="portal-input"
            type="file"
            multiple
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            10 fichiers max, 20 Mo par fichier — images, PDF, documents bureautiques, ZIP
          </p>
          <select className="portal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select className="portal-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Aucun projet — compte</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
          <textarea
            className="portal-input"
            placeholder="Note facultative"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="portal-button" type="submit" disabled={uploading || selectedFiles.length === 0}>
            {uploading ? 'Envoi...' : 'Déposer'}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="portal-spinner" />
      ) : files.length === 0 ? (
        <div className="client-dashboard-empty">
          <div className="client-dashboard-empty-icon">📁</div>
          <h3>Déposez ici vos logos, textes, photos et briefs</h3>
          <p>L'équipe Venio est notifiée à chaque dépôt.</p>
        </div>
      ) : (
        <div className="portal-list">
          {files.map((file) => (
            <div
              key={file.id}
              className="portal-card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
            >
              <div>
                <span className="portal-badge">{CATEGORY_LABELS[file.category] || file.category}</span>
                <h3 style={{ margin: '8px 0 4px' }}>{file.originalName}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                  {new Date(file.createdAt).toLocaleDateString('fr-FR')} · {formatSize(file.size)}
                  {file.note && ` · ${file.note}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="portal-button" href={clientFileDownloadUrl(file.id)}>
                  Télécharger
                </a>
                <button type="button" className="portal-button secondary" onClick={() => setPendingDeleteId(file.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={pendingDeleteId !== null}
        title="Supprimer le fichier"
        message="Voulez-vous vraiment supprimer ce fichier ? Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}

export default ClientMyFiles
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add src/pages/espace-client/MyFiles.tsx
git commit -m "feat(frontend): page Vos fichiers (dépôt client)"
```

---

## Task 13: Navigation client — `ClientSidebar.tsx` et routes `App.tsx`

**Files:**
- Modify: `src/components/ClientSidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Documents.tsx` (Task 11), `MyFiles.tsx` (Task 12)

- [ ] **Step 1: Ajouter les entrées de navigation**

Ouvrir `src/components/ClientSidebar.tsx`, modifier l'import lucide-react :

```tsx
import { BookOpen, FileText, FolderKanban, HelpCircle, LogOut, UploadCloud, User, X, type LucideIcon } from 'lucide-react'
```

Modifier le tableau `NAV_ITEMS` :

```tsx
const NAV_ITEMS: ClientNavItem[] = [
  {
    to: '/espace-client',
    label: 'Mes projets',
    icon: FolderKanban,
    end: true,
    activePrefixes: ['/espace-client/projets'],
  },
  { to: '/espace-client/documents', label: 'Mes documents', icon: FileText },
  { to: '/espace-client/fichiers', label: 'Vos fichiers', icon: UploadCloud },
  { to: '/espace-client/guide', label: 'Guide', icon: BookOpen },
  { to: '/espace-client/profil', label: 'Profil', icon: User },
]
```

- [ ] **Step 2: Ajouter les routes lazy dans `App.tsx`**

Ouvrir `src/App.tsx`, localiser le bloc d'imports lazy « Espace client » et ajouter deux lignes :

```tsx
// Lazy-loaded: Espace client
const ClientShell = lazy(() => import('./components/ClientShell'))
const ClientLogin = lazy(() => import('./pages/espace-client/Login'))
const ClientDashboard = lazy(() => import('./pages/espace-client/Dashboard'))
const ClientDocuments = lazy(() => import('./pages/espace-client/Documents'))
const ClientMyFiles = lazy(() => import('./pages/espace-client/MyFiles'))
const ClientProjectDetail = lazy(() => import('./pages/espace-client/ProjectDetail'))
const ClientProjectInvitationAccept = lazy(() => import('./pages/espace-client/ProjectInvitationAccept'))
const ClientProfile = lazy(() => import('./pages/espace-client/Profile'))
const ClientQuoteProposal = lazy(() => import('./pages/espace-client/QuoteProposal'))
const ClientBilling = lazy(() => import('./pages/espace-client/Billing'))
```

Localiser le bloc de routes `/espace-client` et ajouter deux routes enfants :

```tsx
<Route index element={<ClientDashboard />} />
<Route path="documents" element={<ClientDocuments />} />
<Route path="fichiers" element={<ClientMyFiles />} />
<Route path="guide" element={<ClientGuide />} />
<Route path="profil" element={<ClientProfile />} />
<Route path="projets/:id" element={<ClientProjectDetail />} />
<Route path="projets/:projectId/propositions/:proposalId" element={<ClientQuoteProposal />} />
<Route path="projets/:projectId/facturation" element={<ClientBilling />} />
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add src/components/ClientSidebar.tsx src/App.tsx
git commit -m "feat(frontend): navigation et routes Mes documents / Vos fichiers"
```

---

## Task 14: Bloc « À faire » dans `Dashboard.tsx`

**Files:**
- Modify: `src/pages/espace-client/Dashboard.tsx`
- Test: `src/pages/espace-client/Dashboard.test.tsx` (créer, complément — aucun test existant sur ce
  fichier)

**Interfaces:**
- Consumes: `listClientActionItems` (Task 10), `ClientActionItem`/`ClientActionItemType` (Task 4)

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/pages/espace-client/Dashboard.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientDashboard from './Dashboard'
import { apiFetch } from '../../lib/api'
import * as clientVaultService from '../../services/clientVault'
import { AuthContext } from '../../context/AuthContext'

vi.mock('../../services/clientVault')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

const authValue = {
  user: { id: 'u1', name: 'Client Test', email: 'c@test.fr', role: 'CLIENT' as const },
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue as never}>
        <ClientDashboard />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path === '/api/projects') return Promise.resolve({ projects: [] })
    if (path === '/api/projects/task-progress-all') return Promise.resolve({ progress: {} })
    return Promise.resolve({})
  })
})

describe('Dashboard — bloc À faire', () => {
  it('masque le bloc quand action-items est vide', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({ items: [] })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText(/À faire/)).not.toBeInTheDocument()
  })

  it('rend les deux types émis dans ce lot', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({
      items: [
        {
          type: 'DEVIS_A_SIGNER', title: 'Proposition « Refonte » à signer', detail: '',
          project: { id: 'p1', name: 'Refonte' }, link: '/espace-client/projets/p1/propositions/1',
          dueAt: '2026-09-12T00:00:00.000Z', amount: 4800, createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          type: 'FACTURE_A_PAYER', title: 'Facture FAC-002 à régler', detail: '',
          project: { id: 'p1', name: 'Refonte' }, link: '/espace-client/projets/p1/facturation',
          dueAt: null, amount: 1200, createdAt: '2026-08-02T00:00:00.000Z',
        },
      ],
    })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Proposition « Refonte » à signer')).toBeInTheDocument())
    expect(screen.getByText('Facture FAC-002 à régler')).toBeInTheDocument()
    expect(screen.getByText(/À faire/)).toBeInTheDocument()
  })

  it('rend un type inconnu (ETAPE_A_VALIDER simulé) avec le style neutre sans erreur', async () => {
    vi.mocked(clientVaultService.listClientActionItems).mockResolvedValue({
      items: [
        {
          type: 'ETAPE_A_VALIDER' as never, title: 'Étape « Maquettes » à valider', detail: '',
          project: { id: 'p1', name: 'Refonte' }, link: '/espace-client/projets/p1',
          dueAt: null, amount: null, createdAt: '2026-08-03T00:00:00.000Z',
        },
      ],
    })
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Étape « Maquettes » à valider')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/pages/espace-client/Dashboard.test.tsx`
Expected: FAIL — `listClientActionItems` n'est pas appelé par le composant actuel, le texte « À faire »
n'existe pas, les assertions échouent.

- [ ] **Step 3: Implémenter le bloc**

Ouvrir `src/pages/espace-client/Dashboard.tsx`. Ajouter l'import et le type :

```tsx
import { listClientActionItems } from '../../services/clientVault'
import type { ClientActionItem, ClientActionItemType } from '../../types/clientVault.types'
```

Ajouter un state et étendre le chargement :

```tsx
const [actionItems, setActionItems] = useState<ClientActionItem[]>([])
```

Modifier le `useEffect` de chargement pour ajouter l'appel en parallèle :

```tsx
useEffect(() => {
  const load = async () => {
    try {
      const [projectsData, progressData, actionItemsData] = await Promise.all([
        apiFetch<{ projects: Project[] }>('/api/projects'),
        apiFetch<{ progress: TaskProgressMap }>('/api/projects/task-progress-all').catch(() => ({ progress: {} })),
        listClientActionItems().catch(() => ({ items: [] })),
      ])
      setProjects(projectsData.projects || [])
      setTaskProgress(progressData.progress || {})
      setActionItems(actionItemsData.items || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement projets')
    } finally {
      setLoading(false)
    }
  }
  load()
}, [])
```

Ajouter juste avant le composant `ClientDashboard`, une constante de style par type et un formateur
d'échéance :

```tsx
const ACTION_ITEM_STYLE: Record<string, { icon: string; className: string }> = {
  DEVIS_A_SIGNER: { icon: '✍️', className: 'client-action-item-primary' },
  FACTURE_A_PAYER: { icon: '💳', className: 'client-action-item-alert' },
}

function formatDueDate(dueAt: string | null): { label: string; overdue: boolean } | null {
  if (!dueAt) return null
  const date = new Date(dueAt)
  const overdue = date.getTime() < Date.now()
  return { label: `avant le ${date.toLocaleDateString('fr-FR')}`, overdue }
}
```

Insérer le bloc JSX **entre** la section `client-dashboard-hero` et le rendu conditionnel des stats
(`{loading && ...}` / `{!loading && !error && (...)}`) :

```tsx
{!loading && !error && actionItems.length > 0 && (
  <section className="client-dashboard-todo" style={{ padding: '0 24px', marginBottom: 24 }}>
    <h2 className="client-dashboard-section-title">
      À faire — {actionItems.length} action{actionItems.length > 1 ? 's' : ''} attendue
      {actionItems.length > 1 ? 's' : ''} de votre part
    </h2>
    <div className="portal-list" style={{ marginTop: 12 }}>
      {actionItems.map((item, index) => {
        const style = ACTION_ITEM_STYLE[item.type] || { icon: '📌', className: 'client-action-item-neutral' }
        const due = formatDueDate(item.dueAt)
        return (
          <div
            key={`${item.type}-${index}`}
            className={`portal-card ${style.className}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span aria-hidden style={{ fontSize: 20 }}>
                {style.icon}
              </span>
              <div>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                {item.detail && (
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{item.detail}</p>
                )}
                {due && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: due.overdue ? '#f87171' : 'var(--text-secondary)' }}>
                    {due.label}
                  </p>
                )}
              </div>
            </div>
            <Link className="portal-button" to={item.link}>
              Voir
            </Link>
          </div>
        )
      })}
    </div>
  </section>
)}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/pages/espace-client/Dashboard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Vérifier l'absence de régression sur le reste du Dashboard**

Run: `npx vitest run src/pages/espace-client/`
Expected: PASS (`Documents.test.tsx` et `Dashboard.test.tsx`)

- [ ] **Step 6: Commit**

```bash
git add src/pages/espace-client/Dashboard.tsx src/pages/espace-client/Dashboard.test.tsx
git commit -m "feat(frontend): bloc À faire sur le dashboard client"
```

---

## Task 15: Admin — onglet « Fichiers reçus » dans `ClientAccountDetail`

**Files:**
- Modify: `src/services/adminClients.ts`
- Modify: `src/pages/admin/client-detail/types.ts`
- Create: `src/pages/admin/client-detail/FilesTab.tsx`
- Modify: `src/pages/admin/client-detail/index.tsx`

**Interfaces:**
- Consumes: `ClientUploadFile`/`ClientUploadCategory` (Task 4), `TABS` (existant, à étendre)
- Produces: `listAdminClientFiles`, `adminClientFileDownloadUrl` — consommés par `FilesTab.tsx` et
  `index.tsx`.

- [ ] **Step 1: Ajouter le service**

Ouvrir `src/services/adminClients.ts`, ajouter à la fin du fichier :

```typescript
export async function listAdminClientFiles(clientId: string) {
  const response = await apiFetch(`/api/admin/clients/${clientId}/files`)
  return extractData(response)
}

export function adminClientFileDownloadUrl(clientId: string, fileId: string): string {
  return `/api/admin/clients/${clientId}/files/${fileId}/download`
}
```

- [ ] **Step 2: Étendre `TABS` et les types**

Ouvrir `src/pages/admin/client-detail/types.ts`. Ajouter l'import et l'interface :

```typescript
import type { ClientUploadFile } from '../../../types/clientVault.types'
```

```typescript
export interface FilesTabProps {
  files: ClientUploadFile[]
  clientId: string
}
```

Ajouter une entrée dans `TABS`, entre `'notes'` et `'billing'` (ou en dernier, ordre indifférent
fonctionnellement) :

```typescript
export const TABS = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'cloud', label: 'Cloud' },
  { id: 'projects', label: 'Projets' },
  { id: 'deliverables', label: 'Livrables' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'notes', label: 'Notes & Activités' },
  { id: 'files', label: 'Fichiers reçus' },
  { id: 'billing', label: 'Facturation' },
]
```

- [ ] **Step 3: Créer `FilesTab.tsx`**

Créer `src/pages/admin/client-detail/FilesTab.tsx`, sur le modèle de `NotesTab.tsx` :

```tsx
import React from 'react'
import { Link } from 'react-router-dom'
import type { FilesTabProps } from './types'
import { adminClientFileDownloadUrl } from '../../../services/adminClients'

const CATEGORY_LABELS: Record<string, string> = {
  LOGO: 'Logo',
  TEXTE: 'Texte',
  PHOTO: 'Photo',
  BRIEF: 'Brief',
  AUTRE: 'Autre',
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

const FilesTab: React.FC<FilesTabProps> = ({ files, clientId }) => (
  <div className="portal-list">
    {files.length === 0 ? (
      <div className="admin-empty-state" style={{ padding: '24px' }}>
        <p className="admin-empty-state-text">Aucun fichier reçu pour le moment.</p>
      </div>
    ) : (
      <div className="admin-list">
        {files.map((file) => (
          <div key={file.id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">
                {file.originalName}
                <span className="portal-badge" style={{ marginLeft: 8 }}>
                  {CATEGORY_LABELS[file.category] || file.category}
                </span>
              </h3>
              <p className="admin-list-item-subtitle">
                {new Date(file.createdAt).toLocaleString('fr-FR')} · {formatSize(file.size)}
                {file.note && ` · ${file.note}`}
                {' · '}
                {file.downloadedByAdminAt
                  ? `téléchargé le ${new Date(file.downloadedByAdminAt).toLocaleDateString('fr-FR')}`
                  : 'non consulté'}
              </p>
            </div>
            <div className="admin-list-item-actions">
              <a className="portal-button secondary" href={adminClientFileDownloadUrl(clientId, file.id)}>
                Télécharger
              </a>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)

export default FilesTab
```

- [ ] **Step 4: Câbler dans `index.tsx`**

Ouvrir `src/pages/admin/client-detail/index.tsx`. Ajouter les imports :

```typescript
import { listAdminClientFiles } from '../../../services/adminClients'
import type { ClientUploadFile } from '../../../types/clientVault.types'
import FilesTab from './FilesTab'
```

Ajouter le state :

```typescript
const [files, setFiles] = useState<ClientUploadFile[]>([])
```

Dans `loadAll`, ajouter l'appel au `Promise.all` (avec `.catch` comme les autres blocs facultatifs) :

```typescript
const [
  clientRes,
  projectsRes,
  progressRes,
  deliverablesRes,
  contactsRes,
  notesRes,
  activitiesRes,
  billingSummaryRes,
  billingDocumentsRes,
  cloudRes,
  filesRes,
] = (await Promise.all([
  getAdminClient(userId!),
  listAdminClientProjects(userId!),
  getAdminClientProgress(userId!),
  listAdminClientDeliverables(userId!),
  listAdminClientContacts(userId!),
  listAdminClientNotes(userId!),
  listAdminClientActivities(userId!),
  getAdminClientBillingSummary(userId!).catch(() => ({ summary: null })),
  listAdminClientBillingDocuments(userId!).catch(() => ({ documents: [] })),
  getAdminClientCloud(userId!).catch(() => ({ cloud: null })),
  listAdminClientFiles(userId!).catch(() => ({ files: [] })),
])) as [
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
]
```

Puis, juste après `setCloudInfo(...)` :

```typescript
setCloudInfo((cloudRes.cloud as CloudInfo) || null)
setFiles((filesRes.files as ClientUploadFile[]) || [])
```

Enfin, dans le rendu, ajouter la branche après `'notes'` :

```tsx
{activeTab === 'files' && <FilesTab files={files} clientId={userId!} />}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur.

- [ ] **Step 6: Commit**

```bash
git add src/services/adminClients.ts src/pages/admin/client-detail/types.ts src/pages/admin/client-detail/FilesTab.tsx src/pages/admin/client-detail/index.tsx
git commit -m "feat(frontend): onglet Fichiers reçus dans la fiche client admin"
```

---

## Task 16: Admin — section « Fichiers déposés par le client » dans `ProjectDocumentsTab`

**Files:**
- Create: `src/services/adminProjectFiles.ts`
- Modify: `src/pages/admin/project-detail/types.ts`
- Modify: `src/pages/admin/project-detail/ProjectDocumentsTab.tsx`
- Modify: `src/pages/admin/project-detail/index.tsx`

**Interfaces:**
- Consumes: `ClientUploadCategory` (Task 4)
- Produces: `listProjectClientFiles`, `projectClientFileDownloadUrl` — consommés par
  `ProjectDocumentsTab.tsx`.

`ProjectDocumentsTab` ne reçoit actuellement pas `projectId` (confirmé : appel en
`src/pages/admin/project-detail/index.tsx:605`, props limitées à `documents`, `canEditProjects`,
`onUpload`). Cette tâche ajoute la prop, en s'appuyant sur la variable `id` déjà en scope dans
`index.tsx` (déjà utilisée pour `<ActivityTimeline projectId={id} />`).

- [ ] **Step 1: Créer le service**

Créer `src/services/adminProjectFiles.ts` :

```typescript
import { apiFetch } from '../lib/api'

export interface AdminProjectClientFile {
  id: string
  client: { id: string; name: string; companyName: string } | null
  category: 'LOGO' | 'TEXTE' | 'PHOTO' | 'BRIEF' | 'AUTRE'
  note: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
}

export function listProjectClientFiles(projectId: string): Promise<{ files: AdminProjectClientFile[] }> {
  return apiFetch(`/api/admin/projects/${projectId}/client-files`)
}

export function projectClientFileDownloadUrl(projectId: string, fileId: string): string {
  return `/api/admin/projects/${projectId}/client-files/${fileId}/download`
}
```

- [ ] **Step 2: Étendre `ProjectDocumentsTabProps`**

Ouvrir `src/pages/admin/project-detail/types.ts`, modifier :

```typescript
export interface ProjectDocumentsTabProps {
  documents: ProjectDocument[]
  canEditProjects: boolean
  onUpload: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  projectId: string
}
```

- [ ] **Step 3: Ajouter la section au composant**

Ouvrir `src/pages/admin/project-detail/ProjectDocumentsTab.tsx`, remplacer le contenu par :

```tsx
import React, { useEffect, useState } from 'react'
import type { ProjectDocumentsTabProps } from './types'
import { listProjectClientFiles, projectClientFileDownloadUrl, type AdminProjectClientFile } from '../../../services/adminProjectFiles'

const getDocumentTypeLabel = (type: string): string => {
  switch (type) {
    case 'DEVIS':
      return 'Devis'
    case 'FACTURE':
      return 'Facture'
    case 'FICHIER_PROJET':
      return 'Fichier projet'
    default:
      return type
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  LOGO: 'Logo',
  TEXTE: 'Texte',
  PHOTO: 'Photo',
  BRIEF: 'Brief',
  AUTRE: 'Autre',
}

const ProjectDocumentsTab: React.FC<ProjectDocumentsTabProps> = ({
  documents,
  canEditProjects,
  onUpload,
  projectId,
}) => {
  const [clientFiles, setClientFiles] = useState<AdminProjectClientFile[]>([])

  useEffect(() => {
    if (!projectId) return
    listProjectClientFiles(projectId)
      .then((data) => setClientFiles(data.files || []))
      .catch(() => setClientFiles([]))
  }, [projectId])

  return (
    <div style={{ marginTop: 24 }}>
      <div className="admin-form-section">
        <h2>Téléverser un document (ancien système)</h2>
        {canEditProjects ? (
          <form className="portal-list" onSubmit={onUpload}>
            <select className="portal-input" name="type" required>
              <option value="">Type de document</option>
              <option value="DEVIS">Devis</option>
              <option value="FACTURE">Facture</option>
              <option value="FICHIER_PROJET">Fichier projet</option>
            </select>
            <input className="portal-input" type="file" name="file" required style={{ padding: '8px 14px' }} />
            <button className="portal-button" type="submit">
              📎 Téléverser
            </button>
          </form>
        ) : (
          <div className="admin-info">Accès lecture seule aux documents.</div>
        )}
      </div>

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        <h2>Documents</h2>
        <div className="portal-list">
          {documents.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: '24px' }}>
              <p className="admin-empty-state-text">Aucun document</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc._id} className="admin-document-item">
                <strong>{doc.originalName}</strong>
                <p>
                  <span className="admin-badge" style={{ marginRight: '8px' }}>
                    {getDocumentTypeLabel(doc.type)}
                  </span>
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {clientFiles.length > 0 && (
        <div className="admin-form-section" style={{ marginTop: 24 }}>
          <h2>Fichiers déposés par le client</h2>
          <div className="portal-list">
            {clientFiles.map((file) => (
              <div key={file.id} className="admin-document-item">
                <strong>{file.originalName}</strong>
                <p>
                  <span className="admin-badge" style={{ marginRight: '8px' }}>
                    {CATEGORY_LABELS[file.category] || file.category}
                  </span>
                  {file.client && (file.client.companyName || file.client.name)}
                  {' · '}
                  {new Date(file.createdAt).toLocaleDateString('fr-FR')}
                  {file.note && ` · ${file.note}`}
                </p>
                <a className="portal-button secondary" href={projectClientFileDownloadUrl(projectId, file.id)}>
                  Télécharger
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectDocumentsTab
```

- [ ] **Step 4: Passer `projectId` depuis `index.tsx`**

Ouvrir `src/pages/admin/project-detail/index.tsx`, modifier l'appel ligne ~605 :

```tsx
{activeTab === 'documents' && (
  <ProjectDocumentsTab documents={documents} canEditProjects={canEditProjects} onUpload={handleUpload} projectId={id ?? ''} />
)}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune nouvelle erreur.

- [ ] **Step 6: Commit**

```bash
git add src/services/adminProjectFiles.ts src/pages/admin/project-detail/types.ts src/pages/admin/project-detail/ProjectDocumentsTab.tsx src/pages/admin/project-detail/index.tsx
git commit -m "feat(frontend): section Fichiers déposés par le client dans le détail projet admin"
```

---

## Task 17: Vérification finale complète

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Suite backend complète**

Run: `cd backend && npx vitest run`
Expected: PASS — tous les fichiers, y compris les 4 nouveaux (`client-vault.test.ts`,
`client-files.test.ts`, `admin-client-files.test.ts`, `notification-registries.test.ts`,
`client-upload-model.test.ts`), aucune régression sur la suite existante.

- [ ] **Step 2: Typecheck backend**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Suite frontend complète**

Run: `npx vitest run`
Expected: PASS — tous les fichiers, y compris `Documents.test.tsx` et `Dashboard.test.tsx`, aucune
régression.

- [ ] **Step 4: Typecheck frontend**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 5: Build frontend**

Run: `npm run build`
Expected: build réussi, sans erreur ni warning bloquant lié aux nouveaux fichiers.

- [ ] **Step 6: Vérification manuelle en navigateur (superpowers:verification-before-completion)**

Démarrer le serveur de dev (`preview_start`), se connecter en tant que client, vérifier :
- Nav sidebar : « Mes documents » et « Vos fichiers » visibles entre « Mes projets » et « Guide ».
- `/espace-client/documents` : liste, filtres type/projet/recherche, boutons Télécharger.
- `/espace-client/fichiers` : dépôt multi-fichiers, liste, téléchargement, suppression (confirmation).
- Dashboard : bloc « À faire » visible si devis `SENT` ou facture `ISSUED` existent en base de test,
  absent sinon.
- Admin : onglet « Fichiers reçus » dans une fiche client, section « Fichiers déposés par le client »
  dans l'onglet Documents d'un projet ayant reçu un dépôt.

- [ ] **Step 7: superpowers:requesting-code-review avant merge**

Ne pas commiter cette étape — lancer la revue de code une fois toutes les tâches précédentes vertes.
