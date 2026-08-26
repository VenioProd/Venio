# Demandes de changement client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un client de soumettre des demandes de changement depuis l'espace client, à l'admin de les qualifier (incluse / à chiffrer / refusée) et de les suivre jusqu'à la validation, avec fil de discussion, pièces jointes, notifications et traçabilité.

**Architecture :** Un modèle Mongoose `ChangeRequest` rattaché au **compte client** (`client`) avec projet optionnel, muté exclusivement par des `findOneAndUpdate` à prédicat d'état (pas de transition concurrente possible). Deux routeurs Express distincts — `/api/client/change-requests` (session CLIENT, visibilité `client === user || createdBy === user`) et `/api/admin/change-requests` (permissions RBAC). Le passage `A_CHIFFRER → PLANIFIEE` n'est jamais déclenché par un humain : un hook best-effort greffé dans la route de signature de devis existante le fait.

**Tech Stack :** Backend Express 5 + Mongoose + multer + express-validator, tests vitest + supertest + mongodb-memory-server. Frontend React 19 + Vite + react-router-dom, tests vitest + @testing-library/react.

## Global Constraints

- **La spec fait foi** : `docs/superpowers/specs/2026-08-26-demandes-changement-design.md`. Relire la section correspondante avant chaque tâche.
- **TDD strict** : test écrit et vu échouer AVANT toute ligne d'implémentation.
- **Imports ESM avec extension `.js`** partout dans `backend/src` (le projet compile en NodeNext) — `import X from '../models/X.js'`, y compris depuis les tests.
- **Statuts** (valeurs exactes, jamais traduites en base) : `SOUMISE`, `A_CHIFFRER`, `PLANIFIEE`, `EN_COURS`, `LIVREE`, `VALIDEE`, `REFUSEE`.
- **Qualification** (trace de décision, pas un statut) : `INCLUSE`, `A_CHIFFRER`, ou `null`.
- **Priorités** : `BASSE`, `NORMALE`, `HAUTE` (défaut `NORMALE`). Pas d'`URGENTE` — la planche admin en montre une, la spec fait foi.
- **Codes d'erreur exacts** : `INVALID_TRANSITION` (409), `PROJECT_REQUIRED_FOR_QUOTE` (400), `OWNER_REQUIRED` (403). Ressource non visible → **404**, jamais 403.
- **Uploads** : 50 Mo par fichier, 10 fichiers max, nom `${Date.now()}-${safeName}` avec `safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_')`, dossier `uploads/change-requests`.
- **Notifications et AuditLog toujours en `.catch(() => {})`** — jamais bloquants, jamais `await` dans le chemin de réponse quand la spec dit best-effort.
- **`ActivityLog` uniquement si `project` est renseigné** (le champ y est requis) ; `AuditLog` systématiquement.
- **Aucune référence lisible type « DEM-021 »** : les planches en affichent une, le modèle de la spec n'a pas de champ `reference`. Ne pas en inventer un.
- **Style portail** : thème MONOLITHE global (`src/styles/monolithe-portal.css`, posé sur `html` par `App.tsx`). Les pages réutilisent les classes existantes de `src/pages/espace-client/ClientPortal.css` et `src/pages/admin/AdminPortal.css` — aucun nouveau fichier CSS.
- **Ne pas toucher** aux chantiers pipeline d'étapes ni coffre documentaire (specs séparées du même dossier).
- Commandes de vérification : `npm --prefix backend test -- <fichier>`, `npm --prefix backend run typecheck`, `npx vitest run <fichier>`, `npm run typecheck`.

## File Structure

**Backend — créés**

| Fichier | Responsabilité |
|---|---|
| `backend/src/models/ChangeRequest.ts` | Schéma + interfaces `IChangeRequestFile`, `IChangeRequestReply`, `IChangeRequestStatusEntry`, `IChangeRequest` |
| `backend/src/lib/changeRequestFlow.ts` | Machine à états (`ALLOWED_TRANSITIONS`, `transitionChangeRequest`), hook `promoteChangeRequestOnSignature`, helpers d'audit/notification partagés client+admin |
| `backend/src/routes/client/changeRequests.ts` | Routeur client (liste, création, détail, réponse, validate, request-correction, fichiers) |
| `backend/src/routes/admin/changeRequests.ts` | Routeur admin (file, stats, détail, réponse, qualifications, refus, start, deliver, fichiers) |
| `backend/src/__tests__/change-request-model.test.ts` | Verrouillage du schéma |
| `backend/src/__tests__/change-request-enums.test.ts` | Verrouillage `NotificationType` ↔ enum du modèle `Notification` |
| `backend/src/__tests__/change-request-flow.test.ts` | Machine à états + hook signature en unitaire |
| `backend/src/__tests__/change-request-client.test.ts` | Routes client : cycle, scoping, uploads |
| `backend/src/__tests__/change-request-admin.test.ts` | Routes admin : qualification, transitions, RBAC |
| `backend/src/__tests__/change-request-signature-hook.test.ts` | Hook intégré à la route de signature |

**Backend — modifiés**

| Fichier | Modification |
|---|---|
| `backend/src/types/enums.ts` | 6 `NotificationType`, 5 `AuditAction`, 3 `ActivityAction` |
| `backend/src/models/Notification.ts` | 6 valeurs dans l'enum du champ `type` |
| `backend/src/models/NotificationPreferences.ts` | 6 valeurs dans `NOTIFICATION_TYPES` |
| `backend/src/models/AuditLog.ts` | 5 valeurs dans l'enum `action` |
| `backend/src/models/ActivityLog.ts` | 3 valeurs dans l'enum `action` |
| `backend/src/lib/nextcloud.ts` | `'demandes-client'` dans `UploadType` + `UPLOAD_FOLDER_LABELS` |
| `backend/src/lib/permissions.ts` | `VIEW_CHANGE_REQUESTS`, `MANAGE_CHANGE_REQUESTS` + attributions par rôle |
| `backend/src/routes/client/quotes.ts` | Hook signature après `lockProposalForSignature` |
| `backend/src/routes/admin/quoteProposals.ts` | Hook `CHANGE_REQUEST_QUOTE_SENT` après `DRAFT → SENT` |
| `backend/src/index.ts` | Montage des deux routeurs |
| `rbac-matrix.json` | 2 permissions + attributions + entrée `navigation` |

**Frontend — créés**

| Fichier | Responsabilité |
|---|---|
| `src/types/changeRequest.types.ts` | Types partagés client + admin |
| `src/services/changeRequests.ts` | Couche service (client + admin) sur `apiFetch`/`apiUpload` |
| `src/pages/espace-client/ChangeRequests.tsx` | Liste client |
| `src/pages/espace-client/ChangeRequestNew.tsx` | Formulaire de soumission |
| `src/pages/espace-client/ChangeRequestDetail.tsx` | Détail : frise, corps, fil, actions |
| `src/pages/espace-client/ChangeRequestNew.test.tsx` | Validation + soumission + redirection |
| `src/pages/espace-client/Dashboard.test.tsx` | Section « Vos demandes en cours » |
| `src/pages/admin/change-requests/types.ts` | `STATUS_CONFIG`, `PRIORITY_CONFIG`, helpers de format |
| `src/pages/admin/change-requests/index.tsx` | File admin |
| `src/pages/admin/change-requests/ChangeRequestDetail.tsx` | Détail admin + qualification |
| `src/pages/admin/change-requests/ChangeRequestFilters.tsx` | Filtres statut / client / projet |
| `src/components/AdminSidebar.changeRequests.test.tsx` | Badge + visibilité RBAC de l'entrée nav |

**Frontend — modifiés** : `src/App.tsx` (5 routes), `src/components/ClientSidebar.tsx` (entrée nav), `src/components/AdminSidebar.tsx` (icône + badge), `src/lib/adminNavigation.ts` (zone), `src/pages/espace-client/Dashboard.tsx` (section).

---

### Task 1 : Registres transverses (enums, préférences, Nextcloud)

Aucune route ne fonctionne sans ces enums : un `Notification.create` d'un type absent de l'enum du modèle échoue en validation et la notif est perdue silencieusement. Idem pour `AuditLog.action` et `ActivityLog.action`, **fermées toutes les deux** (la spec les décrit comme « souples » : c'est faux pour `AuditLog`, vérifié dans le code).

**Files:**
- Modify: `backend/src/types/enums.ts` (fin de `NotificationType` l. 135, fin de `AuditAction` l. 195, fin de `ActivityAction` l. 70)
- Modify: `backend/src/models/Notification.ts:8-24`
- Modify: `backend/src/models/NotificationPreferences.ts:41-49`
- Modify: `backend/src/models/AuditLog.ts:74-77`
- Modify: `backend/src/models/ActivityLog.ts:8-29`
- Modify: `backend/src/lib/nextcloud.ts:420-445`
- Test: `backend/src/__tests__/change-request-enums.test.ts`

**Interfaces:**
- Produces : les littéraux `'CHANGE_REQUEST_CREATED' | 'CHANGE_REQUEST_REPLY' | 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_QUOTE_SENT' | 'CHANGE_REQUEST_DELIVERED' | 'CHANGE_REQUEST_PLANNED'` assignables à `NotificationType` ; `'CHANGE_REQUEST_CREATED' | 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_REFUSED' | 'CHANGE_REQUEST_PLANNED' | 'CHANGE_REQUEST_STATUS_CHANGED'` assignables à `AuditAction` ; `'CHANGE_REQUEST_CREATED' | 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_STATUS_CHANGED'` assignables à `ActivityAction` ; `'demandes-client'` assignable à `UploadType`.

- [ ] **Step 1 : Écrire le test de verrouillage**

Créer `backend/src/__tests__/change-request-enums.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import Notification from '../models/Notification.js'
import NotificationPreferences, { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import AuditLog from '../models/AuditLog.js'
import ActivityLog from '../models/ActivityLog.js'
import { UPLOAD_TYPES } from '../lib/nextcloud.js'

const CHANGE_REQUEST_NOTIFICATION_TYPES = [
  'CHANGE_REQUEST_CREATED',
  'CHANGE_REQUEST_REPLY',
  'CHANGE_REQUEST_QUALIFIED',
  'CHANGE_REQUEST_QUOTE_SENT',
  'CHANGE_REQUEST_DELIVERED',
  'CHANGE_REQUEST_PLANNED',
]

function enumValues(model: { schema: { path: (p: string) => unknown } }, path: string): string[] {
  const schemaPath = model.schema.path(path) as { enumValues?: string[] }
  return schemaPath.enumValues ?? []
}

describe('registres transverses des demandes de changement', () => {
  // Sans cette égalité, createNotification lève en validation Mongoose et la
  // notification est perdue en silence (le .catch(() => {}) de l'appelant).
  it('déclare chaque type de notification dans l’enum du modèle Notification', () => {
    const modelValues = enumValues(Notification, 'type')
    for (const type of CHANGE_REQUEST_NOTIFICATION_TYPES) {
      expect(modelValues, `${type} manque dans models/Notification.ts`).toContain(type)
    }
  })

  it('offre un toggle de préférences pour chaque type', () => {
    for (const type of CHANGE_REQUEST_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPES).toContain(type)
    }
    expect(NotificationPreferences.modelName).toBe('NotificationPreferences')
  })

  it('déclare les actions d’audit des demandes', () => {
    const actions = enumValues(AuditLog, 'action')
    for (const action of [
      'CHANGE_REQUEST_CREATED',
      'CHANGE_REQUEST_QUALIFIED',
      'CHANGE_REQUEST_REFUSED',
      'CHANGE_REQUEST_PLANNED',
      'CHANGE_REQUEST_STATUS_CHANGED',
    ]) {
      expect(actions, `${action} manque dans models/AuditLog.ts`).toContain(action)
    }
  })

  it('déclare les actions d’activité projet des demandes', () => {
    const actions = enumValues(ActivityLog, 'action')
    for (const action of ['CHANGE_REQUEST_CREATED', 'CHANGE_REQUEST_QUALIFIED', 'CHANGE_REQUEST_STATUS_CHANGED']) {
      expect(actions, `${action} manque dans models/ActivityLog.ts`).toContain(action)
    }
  })

  it('expose un dossier Nextcloud dédié', () => {
    expect(UPLOAD_TYPES).toContain('demandes-client')
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-enums.test.ts
```

Attendu : échec à l'import (`UPLOAD_TYPES` n'est pas exporté par `lib/nextcloud.js`).

- [ ] **Step 3 : Étendre `backend/src/types/enums.ts`**

À la fin de `ActivityAction` (après `| 'BILLING_CREATED'`, l. 70) :

```ts
  // ── Demandes de changement client ──
  | 'CHANGE_REQUEST_CREATED'
  | 'CHANGE_REQUEST_QUALIFIED'
  | 'CHANGE_REQUEST_STATUS_CHANGED'
```

À la fin de `NotificationType` (après `| 'BRIEF_STATUS_CHANGED'`) :

```ts
  // Demandes de changement client
  | 'CHANGE_REQUEST_CREATED'
  | 'CHANGE_REQUEST_REPLY'
  | 'CHANGE_REQUEST_QUALIFIED'
  | 'CHANGE_REQUEST_QUOTE_SENT'
  | 'CHANGE_REQUEST_DELIVERED'
  | 'CHANGE_REQUEST_PLANNED'
```

À la fin de `AuditAction` (après `| 'QUOTE_PROPOSAL_EXPIRED'`) :

```ts
  // ── Demandes de changement client ──
  | 'CHANGE_REQUEST_CREATED'
  | 'CHANGE_REQUEST_QUALIFIED'
  | 'CHANGE_REQUEST_REFUSED'
  | 'CHANGE_REQUEST_PLANNED'
  | 'CHANGE_REQUEST_STATUS_CHANGED'
```

- [ ] **Step 4 : Étendre les enums des trois modèles**

`backend/src/models/Notification.ts`, dans le tableau `enum` du champ `type`, après `'SENSITIVE_ACTION_EXECUTED',` :

```ts
        'CHANGE_REQUEST_CREATED',
        'CHANGE_REQUEST_REPLY',
        'CHANGE_REQUEST_QUALIFIED',
        'CHANGE_REQUEST_QUOTE_SENT',
        'CHANGE_REQUEST_DELIVERED',
        'CHANGE_REQUEST_PLANNED',
```

`backend/src/models/AuditLog.ts`, après `'QUOTE_PROPOSAL_EXPIRED',` :

```ts
        // ── Demandes de changement client ──
        'CHANGE_REQUEST_CREATED',
        'CHANGE_REQUEST_QUALIFIED',
        'CHANGE_REQUEST_REFUSED',
        'CHANGE_REQUEST_PLANNED',
        'CHANGE_REQUEST_STATUS_CHANGED',
```

`backend/src/models/ActivityLog.ts`, après `'BILLING_CREATED',` :

```ts
        'CHANGE_REQUEST_CREATED',
        'CHANGE_REQUEST_QUALIFIED',
        'CHANGE_REQUEST_STATUS_CHANGED',
```

`backend/src/models/NotificationPreferences.ts`, à la fin de `NOTIFICATION_TYPES` (après `'INTERNAL_MESSAGE',`) :

```ts
  'CHANGE_REQUEST_CREATED',
  'CHANGE_REQUEST_REPLY',
  'CHANGE_REQUEST_QUALIFIED',
  'CHANGE_REQUEST_QUOTE_SENT',
  'CHANGE_REQUEST_DELIVERED',
  'CHANGE_REQUEST_PLANNED',
```

- [ ] **Step 5 : Ajouter le type d'upload Nextcloud**

Dans `backend/src/lib/nextcloud.ts`, remplacer la déclaration `export type UploadType = …` (l. 420-431) par une source unique dérivée d'un tableau, pour que le test puisse la lire à l'exécution :

```ts
export const UPLOAD_TYPES = [
  'taches',
  'projets',
  'tickets',
  'facturation',
  'ressources',
  'qualiopi',
  'projets-internes',
  'stagiaires',
  'rapports',
  'conventions',
  'filiales',
  'demandes-client',
] as const

export type UploadType = (typeof UPLOAD_TYPES)[number]
```

Puis ajouter l'entrée dans `UPLOAD_FOLDER_LABELS`, après `filiales: 'Filiales',` :

```ts
  'demandes-client': 'Demandes-Client',
```

- [ ] **Step 6 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-enums.test.ts
```

Attendu : 5 tests passés.

- [ ] **Step 7 : Vérifier que rien n'a régressé**

```bash
npm --prefix backend run typecheck
```

Attendu : aucune sortie (exit 0).

- [ ] **Step 8 : Commit**

```bash
git add backend/src/types/enums.ts backend/src/models/Notification.ts backend/src/models/NotificationPreferences.ts backend/src/models/AuditLog.ts backend/src/models/ActivityLog.ts backend/src/lib/nextcloud.ts backend/src/__tests__/change-request-enums.test.ts
git commit -m "feat(demandes): déclarer les types de notification, audit, activité et upload"
```

---

### Task 2 : Permissions RBAC

`rbac-matrix.json` et `backend/src/lib/permissions.ts` sont deux sources synchronisées par `backend/src/__tests__/rbac-matrix.test.ts` (`expect(PERMISSIONS).toEqual(matrix.permissions)` + égalité ensembliste des `rolePermissions`). Toute désynchronisation casse un test existant. Le frontend hérite automatiquement (il importe la matrice).

**Files:**
- Modify: `rbac-matrix.json` (clés `permissions`, `rolePermissions`, `navigation`)
- Modify: `backend/src/lib/permissions.ts:14-46` (objet `PERMISSIONS`) et `:50-160` (`ROLE_PERMISSIONS`)
- Modify: `backend/src/types/enums.ts` (`Permission`, fin de l'union l. 235)
- Modify: `src/lib/adminNavigation.ts:41-69` (`ZONE_BY_NAVIGATION_ID`)
- Modify: `src/components/AdminSidebar.tsx:63-92` (`ICONS`)
- Test: `backend/src/__tests__/rbac-matrix.test.ts` (existant, non modifié)

**Interfaces:**
- Consumes : rien.
- Produces : `PERMISSIONS.VIEW_CHANGE_REQUESTS === 'view_change_requests'`, `PERMISSIONS.MANAGE_CHANGE_REQUESTS === 'manage_change_requests'` (backend et frontend, même objet côté front via `src/lib/permissions.ts`) ; entrée de navigation d'`id: 'change-requests'`, `screen: '/admin/demandes-clients'`.

- [ ] **Step 1 : Vérifier que le test RBAC est vert avant modification**

```bash
npm --prefix backend test -- rbac-matrix.test.ts
```

Attendu : 3 tests passés. C'est la ligne de base.

- [ ] **Step 2 : Ajouter les permissions dans `rbac-matrix.json` uniquement**

Dans `permissions`, après `"MANAGE_TICKETS": "manage_tickets",` :

```json
  "VIEW_CHANGE_REQUESTS": "view_change_requests",
  "MANAGE_CHANGE_REQUESTS": "manage_change_requests",
```

Dans `rolePermissions` : ajouter `"view_change_requests"` et `"manage_change_requests"` aux tableaux `SUPER_ADMIN`, `ADMIN`, `MANAGER` ; ajouter `"view_change_requests"` seul aux tableaux `COMMERCIAL` et `VIEWER`. Ne rien ajouter aux autres rôles.

Dans `navigation`, après l'entrée `"tickets"` :

```json
  {
    "id": "change-requests",
    "section": "Suivi",
    "screen": "/admin/demandes-clients",
    "label": "Demandes clients",
    "permission": "view_change_requests",
    "roles": []
  },
```

- [ ] **Step 3 : Lancer le test RBAC, vérifier qu'il échoue**

```bash
npm --prefix backend test -- rbac-matrix.test.ts
```

Attendu : ÉCHEC sur `expect(PERMISSIONS).toEqual(matrix.permissions)` — la matrice contient deux clés que `lib/permissions.ts` n'a pas.

- [ ] **Step 4 : Synchroniser le backend**

`backend/src/types/enums.ts`, à la fin de l'union `Permission` :

```ts
  // ── Demandes de changement client ──
  | 'view_change_requests'
  | 'manage_change_requests'
```

`backend/src/lib/permissions.ts`, dans `PERMISSIONS` après `MANAGE_TICKETS: 'manage_tickets',` :

```ts
  VIEW_CHANGE_REQUESTS: 'view_change_requests',
  MANAGE_CHANGE_REQUESTS: 'manage_change_requests',
```

Dans `ROLE_PERMISSIONS` : `SUPER_ADMIN` hérite automatiquement (`new Set(Object.values(PERMISSIONS))`). Ajouter aux `Set` de `ADMIN` et `MANAGER` :

```ts
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
    PERMISSIONS.MANAGE_CHANGE_REQUESTS,
```

Ajouter aux `Set` de `COMMERCIAL` et `VIEWER` :

```ts
    PERMISSIONS.VIEW_CHANGE_REQUESTS,
```

- [ ] **Step 5 : Lancer le test RBAC, vérifier qu'il passe**

```bash
npm --prefix backend test -- rbac-matrix.test.ts
```

Attendu : 3 tests passés.

- [ ] **Step 6 : Classer l'entrée de nav et lui donner une icône**

Sans icône, `npm run typecheck` échoue : `ICONS` est typé `Record<(typeof NAVIGATION)[number]['id'], LucideIcon>` et devient incomplet.

`src/components/AdminSidebar.tsx` — ajouter `Inbox` à l'import lucide (liste alphabétique de l'import existant) puis, dans `ICONS`, après `tickets: LifeBuoy,` :

```ts
  'change-requests': Inbox,
```

`src/lib/adminNavigation.ts`, dans `ZONE_BY_NAVIGATION_ID`, après `tickets: 'Clients & projets',` :

```ts
  'change-requests': 'Clients & projets',
```

- [ ] **Step 7 : Vérifier les deux typechecks**

```bash
npm run typecheck && npm --prefix backend run typecheck
```

Attendu : aucune sortie (exit 0).

- [ ] **Step 8 : Commit**

```bash
git add rbac-matrix.json backend/src/lib/permissions.ts backend/src/types/enums.ts src/lib/adminNavigation.ts src/components/AdminSidebar.tsx
git commit -m "feat(demandes): ajouter les permissions view/manage_change_requests"
```

---

### Task 3 : Modèle `ChangeRequest`

**Files:**
- Create: `backend/src/models/ChangeRequest.ts`
- Test: `backend/src/__tests__/change-request-model.test.ts`

**Interfaces:**
- Consumes : rien (les enums de la Task 1 ne sont pas utilisés ici).
- Produces :
  - `export interface IChangeRequestFile { filename: string; originalName: string; mimetype: string; size: number }`
  - `export interface IChangeRequestReply { _id?: string; authorId: mongoose.Types.ObjectId; authorName: string; message: string; attachments: IChangeRequestFile[]; createdAt: Date }`
  - `export interface IChangeRequestStatusEntry { status: string; at: Date; byUserId: mongoose.Types.ObjectId; byName: string; note: string }`
  - `export interface IChangeRequest extends Document { client; project: mongoose.Types.ObjectId | null; title; description; pageUrl; priority: 'BASSE'|'NORMALE'|'HAUTE'; status: 'SOUMISE'|'A_CHIFFRER'|'PLANIFIEE'|'EN_COURS'|'LIVREE'|'VALIDEE'|'REFUSEE'; qualification: 'INCLUSE'|'A_CHIFFRER'|null; refusalReason: string; quoteProposal: mongoose.Types.ObjectId | null; createdBy; createdByName; attachments; replies; statusHistory; deliveredAt: Date | null; validatedAt: Date | null; createdAt; updatedAt }`
  - `export default mongoose.model<IChangeRequest>('ChangeRequest', changeRequestSchema)`

- [ ] **Step 1 : Écrire le test du modèle**

Créer `backend/src/__tests__/change-request-model.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ChangeRequest from '../models/ChangeRequest.js'

const someId = () => new mongoose.Types.ObjectId()

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle ChangeRequest', () => {
  it('applique les valeurs par défaut du cycle de vie', async () => {
    const clientId = someId()
    const created = await ChangeRequest.create({
      client: clientId,
      title: 'Corriger le formulaire de contact',
      description: 'Le champ téléphone refuse les numéros étrangers.',
      createdBy: clientId,
      createdByName: 'Claire Corbel',
    })

    expect(created.status).toBe('SOUMISE')
    expect(created.priority).toBe('NORMALE')
    expect(created.project).toBeNull()
    expect(created.qualification).toBeNull()
    expect(created.quoteProposal).toBeNull()
    expect(created.refusalReason).toBe('')
    expect(created.pageUrl).toBe('')
    expect(created.attachments).toEqual([])
    expect(created.replies).toEqual([])
    expect(created.statusHistory).toEqual([])
    expect(created.deliveredAt).toBeNull()
    expect(created.validatedAt).toBeNull()
  })

  it('exige un compte client, un titre et une description', async () => {
    await expect(ChangeRequest.create({ title: 'x', description: 'y' })).rejects.toThrow()
    await expect(
      ChangeRequest.create({ client: someId(), description: 'y', createdBy: someId(), createdByName: 'A' }),
    ).rejects.toThrow()
    await expect(
      ChangeRequest.create({ client: someId(), title: 'x', createdBy: someId(), createdByName: 'A' }),
    ).rejects.toThrow()
  })

  it('refuse un statut, une priorité ou une qualification hors énumération', async () => {
    const base = { client: someId(), title: 'x', description: 'y', createdBy: someId(), createdByName: 'A' }
    await expect(ChangeRequest.create({ ...base, status: 'EN_ATTENTE' })).rejects.toThrow()
    await expect(ChangeRequest.create({ ...base, priority: 'URGENTE' })).rejects.toThrow()
    await expect(ChangeRequest.create({ ...base, qualification: 'PLANIFIEE' })).rejects.toThrow()
  })

  it('embarque pièces jointes, réponses horodatées et historique de statut', async () => {
    const clientId = someId()
    const created = await ChangeRequest.create({
      client: clientId,
      title: 'Nouvelle page « Ateliers »',
      description: 'Présenter le calendrier des ateliers.',
      createdBy: clientId,
      createdByName: 'Claire Corbel',
      attachments: [
        { filename: '1-plan.pdf', originalName: 'plan.pdf', mimetype: 'application/pdf', size: 2048 },
      ],
      replies: [{ authorId: clientId, authorName: 'Claire Corbel', message: 'Merci !', attachments: [] }],
      statusHistory: [{ status: 'SOUMISE', at: new Date(), byUserId: clientId, byName: 'Claire Corbel' }],
    })

    expect(created.attachments[0]!.originalName).toBe('plan.pdf')
    // _id: false sur le sous-schéma fichier — un fichier n'est pas une entité.
    expect((created.attachments[0] as unknown as { _id?: unknown })._id).toBeUndefined()
    expect(created.replies[0]!.createdAt).toBeInstanceOf(Date)
    expect(created.statusHistory[0]!.status).toBe('SOUMISE')
    expect(created.statusHistory[0]!.note).toBe('')
  })

  it('indexe la file admin et le lookup du hook signature', () => {
    const indexes = ChangeRequest.schema.indexes().map(([fields]) => Object.keys(fields).join(','))
    expect(indexes).toContain('client,status,createdAt')
    expect(indexes).toContain('status,createdAt')
    expect(indexes).toContain('project')
    expect(indexes).toContain('quoteProposal')
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-model.test.ts
```

Attendu : ÉCHEC — `Cannot find module '../models/ChangeRequest.js'`.

- [ ] **Step 3 : Écrire le modèle**

Créer `backend/src/models/ChangeRequest.ts` :

```ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IChangeRequestFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface IChangeRequestReply {
  _id?: string
  authorId: mongoose.Types.ObjectId
  authorName: string
  message: string
  attachments: IChangeRequestFile[]
  createdAt: Date
}

export interface IChangeRequestStatusEntry {
  status: string
  at: Date
  byUserId: mongoose.Types.ObjectId
  byName: string
  note: string
}

export interface IChangeRequest extends Document {
  client: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId | null
  title: string
  description: string
  pageUrl: string
  priority: 'BASSE' | 'NORMALE' | 'HAUTE'
  status: 'SOUMISE' | 'A_CHIFFRER' | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE' | 'REFUSEE'
  qualification: 'INCLUSE' | 'A_CHIFFRER' | null
  refusalReason: string
  quoteProposal: mongoose.Types.ObjectId | null
  createdBy: mongoose.Types.ObjectId
  createdByName: string
  attachments: IChangeRequestFile[]
  replies: IChangeRequestReply[]
  statusHistory: IChangeRequestStatusEntry[]
  deliveredAt: Date | null
  validatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const fileSchema = new Schema<IChangeRequestFile>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
)

const replySchema = new Schema<IChangeRequestReply>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    message: { type: String, required: true },
    attachments: { type: [fileSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const statusHistorySchema = new Schema<IChangeRequestStatusEntry>(
  {
    status: { type: String, required: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
)

const changeRequestSchema = new Schema<IChangeRequest>(
  {
    // Rattachement au COMPTE client (User rôle CLIENT). Toujours renseigné :
    // une demande survit à la fin d'un projet (site livré en maintenance).
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    pageUrl: { type: String, default: '', trim: true },

    // Priorité PERÇUE par le client — informative, pas un SLA.
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE'], default: 'NORMALE' },

    status: {
      type: String,
      enum: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS', 'LIVREE', 'VALIDEE', 'REFUSEE'],
      default: 'SOUMISE',
    },
    // « Incluse » n'est pas un statut : la demande incluse passe directement en
    // PLANIFIEE. Ce champ garde la mémoire de la décision pour l'UI et les KPI.
    qualification: { type: String, enum: ['INCLUSE', 'A_CHIFFRER'], default: null },
    refusalReason: { type: String, default: '' },

    // Lien unidirectionnel : QuoteProposal n'est pas modifié, le hook de
    // signature retrouve la demande par ce champ.
    quoteProposal: { type: Schema.Types.ObjectId, ref: 'QuoteProposal', default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },

    attachments: { type: [fileSchema], default: [] },
    replies: [replySchema],

    statusHistory: { type: [statusHistorySchema], default: [] },
    deliveredAt: { type: Date, default: null },
    validatedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

changeRequestSchema.index({ client: 1, status: 1, createdAt: -1 })
changeRequestSchema.index({ status: 1, createdAt: -1 })
changeRequestSchema.index({ project: 1 })
changeRequestSchema.index({ quoteProposal: 1 })

export default mongoose.model<IChangeRequest>('ChangeRequest', changeRequestSchema)
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-model.test.ts
```

Attendu : 5 tests passés.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/models/ChangeRequest.ts backend/src/__tests__/change-request-model.test.ts
git commit -m "feat(demandes): modèle ChangeRequest rattaché au compte client"
```

---

### Task 4 : Machine à états et hook de signature (`lib/changeRequestFlow.ts`)

Toute mutation d'état passe par ce module, jamais par un `save()` direct : le prédicat d'état (`{ _id, status: from }`) rend deux transitions concurrentes mutuellement exclusives, comme `lockProposalForSignature`.

**Files:**
- Create: `backend/src/lib/changeRequestFlow.ts`
- Test: `backend/src/__tests__/change-request-flow.test.ts`

**Interfaces:**
- Consumes : `ChangeRequest` (Task 3), `AuditAction`/`NotificationType` (Task 1), `notifySuperAdmins`/`notifyUsers` (`lib/notifyHelpers.js`), `logActivity` (`lib/activityLog.js`), `AuditLog` (`models/AuditLog.js`).
- Produces :
  - `export type ChangeRequestStatus = 'SOUMISE' | 'A_CHIFFRER' | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE' | 'REFUSEE'`
  - `export const ALLOWED_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]>`
  - `export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean`
  - `export interface FlowActor { id: string; name: string; email: string }`
  - `export function actorFromRequest(user: { id: string; name?: string; email: string }): FlowActor`
  - `export async function transitionChangeRequest(params: { id: string; from: ChangeRequestStatus; to: ChangeRequestStatus; actor: FlowActor; note?: string; set?: Record<string, unknown> }): Promise<IChangeRequest | null>`
  - `export function auditChangeRequest(params: { action: AuditAction; actor: FlowActor; changeRequest: IChangeRequest; extra?: Record<string, unknown> }): void`
  - `export function logChangeRequestActivity(params: { changeRequest: IChangeRequest; action: 'CHANGE_REQUEST_CREATED' | 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_STATUS_CHANGED'; actor: FlowActor; summary: string }): void`
  - `export async function promoteChangeRequestOnSignature(proposal: { _id: unknown }, user: { id: string; name?: string; email: string }): Promise<IChangeRequest | null>`

- [ ] **Step 1 : Écrire le test de la machine à états**

Créer `backend/src/__tests__/change-request-flow.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ChangeRequest from '../models/ChangeRequest.js'
import AuditLog from '../models/AuditLog.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  promoteChangeRequestOnSignature,
  transitionChangeRequest,
} from '../lib/changeRequestFlow.js'

const actor = { id: '', name: 'Raphael', email: 'admin@example.test' }

async function seedRequest(overrides: Record<string, unknown> = {}) {
  const clientId = new mongoose.Types.ObjectId()
  return ChangeRequest.create({
    client: clientId,
    title: 'Module de réservation',
    description: 'Réserver un créneau depuis le site.',
    createdBy: clientId,
    createdByName: 'Claire Corbel',
    ...overrides,
  })
}

beforeAll(setupMongo)
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const admin = await User.create({
    name: 'Raphael',
    email: 'admin@example.test',
    passwordHash: 'x',
    role: 'SUPER_ADMIN',
    isActive: true,
  })
  actor.id = String(admin._id)
})

describe('transitions autorisées', () => {
  it('décrit le cycle de vie de la spec', () => {
    expect(ALLOWED_TRANSITIONS.SOUMISE.sort()).toEqual(['A_CHIFFRER', 'PLANIFIEE', 'REFUSEE'])
    expect(ALLOWED_TRANSITIONS.A_CHIFFRER.sort()).toEqual(['PLANIFIEE', 'REFUSEE'])
    expect(ALLOWED_TRANSITIONS.PLANIFIEE).toEqual(['EN_COURS'])
    expect(ALLOWED_TRANSITIONS.EN_COURS).toEqual(['LIVREE'])
    expect(ALLOWED_TRANSITIONS.LIVREE.sort()).toEqual(['EN_COURS', 'VALIDEE'])
    // États terminaux : aucune route ne les mute.
    expect(ALLOWED_TRANSITIONS.VALIDEE).toEqual([])
    expect(ALLOWED_TRANSITIONS.REFUSEE).toEqual([])
  })

  it('rejette une transition non déclarée', () => {
    expect(canTransition('SOUMISE', 'LIVREE')).toBe(false)
    expect(canTransition('VALIDEE', 'EN_COURS')).toBe(false)
    expect(canTransition('LIVREE', 'VALIDEE')).toBe(true)
  })
})

describe('transitionChangeRequest', () => {
  it('pousse une entrée d’historique et applique les champs complémentaires', async () => {
    const created = await seedRequest({ status: 'EN_COURS' })
    const updated = await transitionChangeRequest({
      id: String(created._id),
      from: 'EN_COURS',
      to: 'LIVREE',
      actor,
      note: 'Mise en ligne effectuée',
      set: { deliveredAt: new Date('2026-08-22T10:00:00Z') },
    })

    expect(updated!.status).toBe('LIVREE')
    expect(updated!.deliveredAt).toEqual(new Date('2026-08-22T10:00:00Z'))
    expect(updated!.statusHistory).toHaveLength(1)
    expect(updated!.statusHistory[0]!.status).toBe('LIVREE')
    expect(updated!.statusHistory[0]!.byName).toBe('Raphael')
    expect(updated!.statusHistory[0]!.note).toBe('Mise en ligne effectuée')
  })

  it('renvoie null quand l’état courant n’est pas celui attendu', async () => {
    const created = await seedRequest({ status: 'SOUMISE' })
    const updated = await transitionChangeRequest({
      id: String(created._id),
      from: 'EN_COURS',
      to: 'LIVREE',
      actor,
    })

    expect(updated).toBeNull()
    expect((await ChangeRequest.findById(created._id))!.status).toBe('SOUMISE')
  })

  it('n’applique qu’une seule fois deux transitions concurrentes', async () => {
    const created = await seedRequest({ status: 'PLANIFIEE' })
    const results = await Promise.all([
      transitionChangeRequest({ id: String(created._id), from: 'PLANIFIEE', to: 'EN_COURS', actor }),
      transitionChangeRequest({ id: String(created._id), from: 'PLANIFIEE', to: 'EN_COURS', actor }),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await ChangeRequest.findById(created._id))!.statusHistory).toHaveLength(1)
  })
})

describe('promoteChangeRequestOnSignature', () => {
  it('planifie la demande liée, trace et notifie', async () => {
    const proposalId = new mongoose.Types.ObjectId()
    const created = await seedRequest({
      status: 'A_CHIFFRER',
      qualification: 'A_CHIFFRER',
      quoteProposal: proposalId,
    })

    const promoted = await promoteChangeRequestOnSignature({ _id: proposalId }, actor)

    expect(promoted!.status).toBe('PLANIFIEE')
    expect(promoted!.statusHistory[0]!.status).toBe('PLANIFIEE')
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    expect((await ChangeRequest.findById(created._id))!.status).toBe('PLANIFIEE')
  })

  it('ne fait rien pour un devis sans demande liée', async () => {
    const promoted = await promoteChangeRequestOnSignature({ _id: new mongoose.Types.ObjectId() }, actor)

    expect(promoted).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_PLANNED' })).toBe(0)
  })

  it('laisse intacte une demande liée qui n’est plus A_CHIFFRER', async () => {
    const proposalId = new mongoose.Types.ObjectId()
    const created = await seedRequest({
      status: 'REFUSEE',
      qualification: 'A_CHIFFRER',
      quoteProposal: proposalId,
      refusalReason: 'Hors périmètre',
    })

    expect(await promoteChangeRequestOnSignature({ _id: proposalId }, actor)).toBeNull()
    expect((await ChangeRequest.findById(created._id))!.status).toBe('REFUSEE')
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-flow.test.ts
```

Attendu : ÉCHEC — `Cannot find module '../lib/changeRequestFlow.js'`.

- [ ] **Step 3 : Écrire la lib**

Créer `backend/src/lib/changeRequestFlow.ts` :

```ts
import ChangeRequest, { type IChangeRequest } from '../models/ChangeRequest.js'
import AuditLog from '../models/AuditLog.js'
import { logActivity } from './activityLog.js'
import { notifySuperAdmins } from './notifyHelpers.js'
import type { ActivityAction, AuditAction } from '../types/enums.js'

export type ChangeRequestStatus =
  | 'SOUMISE'
  | 'A_CHIFFRER'
  | 'PLANIFIEE'
  | 'EN_COURS'
  | 'LIVREE'
  | 'VALIDEE'
  | 'REFUSEE'

/**
 * Cycle de vie de la spec. VALIDEE et REFUSEE sont terminaux : le fil de
 * discussion reste ouvert, l'état ne bouge plus.
 */
export const ALLOWED_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  SOUMISE: ['PLANIFIEE', 'A_CHIFFRER', 'REFUSEE'],
  A_CHIFFRER: ['PLANIFIEE', 'REFUSEE'],
  PLANIFIEE: ['EN_COURS'],
  EN_COURS: ['LIVREE'],
  LIVREE: ['VALIDEE', 'EN_COURS'],
  VALIDEE: [],
  REFUSEE: [],
}

export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export interface FlowActor {
  id: string
  name: string
  email: string
}

export function actorFromRequest(user: { id: string; name?: string; email: string }): FlowActor {
  return { id: user.id, name: user.name || user.email, email: user.email }
}

/**
 * Verrou par prédicat d'état : deux transitions concurrentes deviennent
 * mutuellement exclusives, y compris entre processus. Même mécanique que
 * lockProposalForSignature. Renvoie null quand l'état courant a changé.
 */
export async function transitionChangeRequest({
  id,
  from,
  to,
  actor,
  note = '',
  set = {},
}: {
  id: string
  from: ChangeRequestStatus
  to: ChangeRequestStatus
  actor: FlowActor
  note?: string
  set?: Record<string, unknown>
}): Promise<IChangeRequest | null> {
  return ChangeRequest.findOneAndUpdate(
    { _id: id, status: from },
    {
      $set: { status: to, ...set },
      $push: { statusHistory: { status: to, at: new Date(), byUserId: actor.id, byName: actor.name, note } },
    },
    { new: true },
  )
}

/**
 * Trace de référence : elle fonctionne aussi pour les demandes sans projet,
 * là où ActivityLog exige un projet. Jamais bloquante.
 */
export function auditChangeRequest({
  action,
  actor,
  changeRequest,
  extra = {},
}: {
  action: AuditAction
  actor: FlowActor
  changeRequest: Pick<IChangeRequest, '_id' | 'project'>
  extra?: Record<string, unknown>
}): void {
  AuditLog.create({
    userId: actor.id,
    email: actor.email,
    action,
    metadata: {
      changeRequestId: String(changeRequest._id),
      projectId: changeRequest.project ? String(changeRequest.project) : null,
      ...extra,
    },
  }).catch(() => {})
}

/** Le fil d'activité projet n'existe que pour une demande rattachée. */
export function logChangeRequestActivity({
  changeRequest,
  action,
  actor,
  summary,
}: {
  changeRequest: Pick<IChangeRequest, '_id' | 'project'>
  action: Extract<ActivityAction, `CHANGE_REQUEST_${string}`>
  actor: FlowActor
  summary: string
}): void {
  if (!changeRequest.project) return
  logActivity({
    project: changeRequest.project,
    action,
    actor: actor.id,
    summary,
    metadata: { changeRequestId: String(changeRequest._id) },
  }).catch(() => {})
}

/**
 * Hook de signature : la demande liée à un devis signé devient PLANIFIEE.
 * Le prédicat `status: 'A_CHIFFRER'` rend l'appel idempotent et sans course ;
 * un devis sans demande liée est un no-op silencieux.
 */
export async function promoteChangeRequestOnSignature(
  proposal: { _id: unknown },
  user: { id: string; name?: string; email: string },
): Promise<IChangeRequest | null> {
  const actor = actorFromRequest(user)
  const promoted = await ChangeRequest.findOneAndUpdate(
    { quoteProposal: proposal._id, status: 'A_CHIFFRER' },
    {
      $set: { status: 'PLANIFIEE' },
      $push: {
        statusHistory: {
          status: 'PLANIFIEE',
          at: new Date(),
          byUserId: actor.id,
          byName: actor.name,
          note: 'Devis signé',
        },
      },
    },
    { new: true },
  )
  if (!promoted) return null

  auditChangeRequest({
    action: 'CHANGE_REQUEST_PLANNED',
    actor,
    changeRequest: promoted,
    extra: { proposalId: String(proposal._id), from: 'A_CHIFFRER', to: 'PLANIFIEE' },
  })
  logChangeRequestActivity({
    changeRequest: promoted,
    action: 'CHANGE_REQUEST_STATUS_CHANGED',
    actor,
    summary: `Demande « ${promoted.title} » planifiée après signature du devis`,
  })
  await notifySuperAdmins({
    type: 'CHANGE_REQUEST_PLANNED',
    title: `Demande planifiée : ${promoted.title}`,
    message: `${actor.name} a signé le devis lié`,
    link: `/admin/demandes-clients/${promoted._id}`,
    metadata: { changeRequestId: String(promoted._id) },
  }).catch(() => {})

  return promoted
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-flow.test.ts
```

Attendu : 8 tests passés.

- [ ] **Step 5 : Typecheck**

```bash
npm --prefix backend run typecheck
```

Attendu : aucune sortie.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/lib/changeRequestFlow.ts backend/src/__tests__/change-request-flow.test.ts
git commit -m "feat(demandes): machine à états et promotion sur signature de devis"
```

---

### Task 5 : Routeur client `/api/client/change-requests`

Nouveau préfixe `/api/client/*` : les routes client existantes vivent sous `/api/projects` parce qu'elles sont scopées projet ; une ressource scopée **compte** justifie ce préfixe dédié.

**Files:**
- Create: `backend/src/routes/client/changeRequests.ts`
- Modify: `backend/src/index.ts` (bloc des routes client, autour de `app.use('/api/projects', clientQuoteRoutes)`)
- Test: `backend/src/__tests__/change-request-client.test.ts`

**Interfaces:**
- Consumes : `transitionChangeRequest`, `actorFromRequest`, `auditChangeRequest`, `logChangeRequestActivity` (Task 4) ; `ChangeRequest` (Task 3) ; `getProjectAccess` (`lib/projectAccess.js`) ; `notifySuperAdmins` (`lib/notifyHelpers.js`) ; `syncUploadToNextcloud` (Task 1) ; `requireRole` (export **default** de `middleware/role.js`).
- Produces : `export default router` monté sur `/api/client/change-requests`. Formes de réponse consommées par le frontend (Task 8) : `GET /` → `{ changeRequests: ClientChangeRequestSummary[] }` ; `GET /:id` → `{ changeRequest: ClientChangeRequestDetail }` ; `POST /` → 201 `{ changeRequest }` ; les routes d'action renvoient `{ changeRequest }`.

- [ ] **Step 1 : Écrire le test — cycle de vie et validations**

Créer `backend/src/__tests__/change-request-client.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientChangeRequestRoutes from '../routes/client/changeRequests.js'
import ChangeRequest from '../models/ChangeRequest.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'

let app: Express
let ownerId: string
let collaboratorId: string
let outsiderId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function seedRequest(overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: ownerId,
    title: 'Nouvelle page « Ateliers »',
    description: 'Présenter le calendrier des ateliers.',
    createdBy: ownerId,
    createdByName: 'Owner',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/client/change-requests', clientChangeRequestRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, collaborator, outsider] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Collab', email: 'collab@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
  ])
  ownerId = String(owner._id)
  collaboratorId = String(collaborator._id)
  outsiderId = String(outsider._id)
  const project = await Project.create({ name: 'Refonte du site', client: owner._id })
  projectId = String(project._id)
  await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'EDITOR', createdBy: owner._id })
  await User.create({ name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true })
})

describe('création d’une demande', () => {
  it('crée une demande hors projet et notifie les super admins', async () => {
    const response = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Mettre à jour les horaires')
      .field('description', 'Nous ouvrons désormais le lundi.')
      .field('priority', 'HAUTE')
      .expect(201)

    expect(response.body.changeRequest.status).toBe('SOUMISE')
    expect(response.body.changeRequest.project).toBeNull()
    expect(response.body.changeRequest.priority).toBe('HAUTE')
    expect(response.body.changeRequest.statusHistory).toHaveLength(1)
    expect(response.body.changeRequest.statusHistory[0].status).toBe('SOUMISE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_CREATED' })).toBe(1)
  })

  it('rattache la demande au compte propriétaire quand un collaborateur la crée', async () => {
    const response = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(collaboratorId))
      .field('title', 'Corriger le menu mobile')
      .field('description', 'Le menu se replie mal sur iPhone.')
      .field('projectId', projectId)
      .expect(201)

    expect(String(response.body.changeRequest.client)).toBe(ownerId)
    expect(String(response.body.changeRequest.createdBy)).toBe(collaboratorId)
    expect(String(response.body.changeRequest.project)).toBe(projectId)
  })

  it('exige un titre et une description', async () => {
    const cookie = await cookieFor(ownerId)
    await request(app).post('/api/client/change-requests').set('Cookie', cookie).field('description', 'x').expect(400)
    await request(app).post('/api/client/change-requests').set('Cookie', cookie).field('title', 'x').expect(400)
  })

  it('refuse une URL de page qui n’est pas http(s)', async () => {
    await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Corriger la page tarifs')
      .field('description', 'Trois formules au lieu des tarifs à la ligne.')
      .field('pageUrl', 'javascript:alert(1)')
      .expect(400)
  })

  it('renvoie 404 pour un projet auquel l’utilisateur n’a pas accès', async () => {
    await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(outsiderId))
      .field('title', 'Intrusion')
      .field('description', 'Tentative.')
      .field('projectId', projectId)
      .expect(404)
  })

  it('exige une session CLIENT', async () => {
    await request(app).get('/api/client/change-requests').expect(401)
  })
})

describe('visibilité', () => {
  it('liste les demandes du compte et filtre par statut', async () => {
    await seedRequest({ title: 'Active' })
    await seedRequest({ title: 'Terminée', status: 'VALIDEE' })

    const all = await request(app)
      .get('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(all.body.changeRequests).toHaveLength(2)

    const filtered = await request(app)
      .get('/api/client/change-requests?status=VALIDEE')
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(filtered.body.changeRequests).toHaveLength(1)
    expect(filtered.body.changeRequests[0].title).toBe('Terminée')
  })

  it('masque à un autre client la liste, le détail et interdit toute action', async () => {
    const created = await seedRequest()
    const cookie = await cookieFor(outsiderId)

    const list = await request(app).get('/api/client/change-requests').set('Cookie', cookie).expect(200)
    expect(list.body.changeRequests).toHaveLength(0)

    const detail = await request(app).get(`/api/client/change-requests/${created._id}`).set('Cookie', cookie).expect(404)
    expect(detail.body.error).toBeDefined()

    await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', cookie)
      .field('message', 'Bonjour')
      .expect(404)
  })

  it('montre au collaborateur ses propres demandes, pas celles du compte qu’il n’a pas créées', async () => {
    const byOwner = await seedRequest({ title: 'Créée par le compte' })
    const byCollaborator = await seedRequest({
      title: 'Créée par le collaborateur',
      project: projectId,
      createdBy: collaboratorId,
      createdByName: 'Collab',
    })
    const cookie = await cookieFor(collaboratorId)

    const list = await request(app).get('/api/client/change-requests').set('Cookie', cookie).expect(200)
    expect(list.body.changeRequests.map((r: { title: string }) => r.title)).toEqual(['Créée par le collaborateur'])

    await request(app).get(`/api/client/change-requests/${byCollaborator._id}`).set('Cookie', cookie).expect(200)
    await request(app).get(`/api/client/change-requests/${byOwner._id}`).set('Cookie', cookie).expect(404)
  })
})

describe('fil de discussion et actions client', () => {
  it('ajoute une réponse sans changer le statut, même sur un état terminal', async () => {
    const created = await seedRequest({ status: 'REFUSEE', refusalReason: 'Hors périmètre' })

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(ownerId))
      .field('message', 'Merci pour l’explication.')
      .expect(200)

    expect(response.body.changeRequest.replies).toHaveLength(1)
    expect(response.body.changeRequest.replies[0].message).toBe('Merci pour l’explication.')
    expect(response.body.changeRequest.status).toBe('REFUSEE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY' })).toBe(1)
  })

  it('refuse une réponse vide', async () => {
    const created = await seedRequest()
    await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(ownerId))
      .field('message', '   ')
      .expect(400)
  })

  it('valide une livraison — compte uniquement', async () => {
    const created = await seedRequest({ status: 'LIVREE', project: projectId, deliveredAt: new Date() })

    await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(collaboratorId))
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('OWNER_REQUIRED'))

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.changeRequest.status).toBe('VALIDEE')
    expect(response.body.changeRequest.validatedAt).not.toBeNull()
  })

  it('refuse de valider hors du statut LIVREE', async () => {
    const created = await seedRequest({ status: 'EN_COURS' })
    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(409)

    expect(response.body.code).toBe('INVALID_TRANSITION')
  })

  it('demande une correction : LIVREE → EN_COURS avec commentaire au fil et à l’historique', async () => {
    const created = await seedRequest({ status: 'LIVREE', deliveredAt: new Date() })

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/request-correction`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: 'Le bouton renvoie vers la mauvaise page.' })
      .expect(200)

    expect(response.body.changeRequest.status).toBe('EN_COURS')
    expect(response.body.changeRequest.replies).toHaveLength(1)
    const history = response.body.changeRequest.statusHistory
    expect(history[history.length - 1].note).toBe('Le bouton renvoie vers la mauvaise page.')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY' })).toBe(1)
  })

  it('refuse une demande de correction sans commentaire', async () => {
    const created = await seedRequest({ status: 'LIVREE' })
    await request(app)
      .post(`/api/client/change-requests/${created._id}/request-correction`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: '  ' })
      .expect(400)
  })
})

describe('pièces jointes', () => {
  it('persiste les fichiers et ne les sert qu’au demandeur', async () => {
    const created = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Galerie photos')
      .field('description', 'Ajouter une galerie sur l’accueil.')
      .attach('files', Buffer.from('contenu'), 'plan de page.png')
      .expect(201)

    const attachment = created.body.changeRequest.attachments[0]
    expect(attachment.originalName).toBe('plan de page.png')
    // safeName : les espaces deviennent des underscores.
    expect(attachment.filename).toMatch(/^\d+-plan_de_page\.png$/)
    expect(fs.existsSync(path.resolve('uploads/change-requests', attachment.filename))).toBe(true)

    await request(app)
      .get(`/api/client/change-requests/files/${attachment.filename}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    await request(app)
      .get(`/api/client/change-requests/files/${attachment.filename}`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('refuse un nom de fichier qui sort du répertoire', async () => {
    await request(app)
      .get('/api/client/change-requests/files/..%2F..%2Fpackage.json')
      .set('Cookie', await cookieFor(ownerId))
      .expect((res) => expect([403, 404]).toContain(res.status))
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-client.test.ts
```

Attendu : ÉCHEC — `Cannot find module '../routes/client/changeRequests.js'`.

- [ ] **Step 3 : Écrire le routeur client**

Créer `backend/src/routes/client/changeRequests.ts` :

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import requireRole from '../../middleware/role.js'
import ChangeRequest, { type IChangeRequest } from '../../models/ChangeRequest.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import User from '../../models/User.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import {
  actorFromRequest,
  auditChangeRequest,
  logChangeRequestActivity,
  transitionChangeRequest,
} from '../../lib/changeRequestFlow.js'

const router = express.Router()

router.use(auth)
router.use(requireRole('CLIENT'))

const uploadsDir = path.resolve('uploads/change-requests')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

/** Statuts de devis exploitables par le client (mêmes que client/quotes.ts). */
const CLIENT_VISIBLE_PROPOSAL_STATUSES = ['SENT', 'SIGNED', 'EXPIRED']

/**
 * Une demande est visible du compte propriétaire et de son auteur. Le
 * collaborateur ne voit donc pas tout le compte, seulement ce qu'il a soumis.
 */
function visibilityFilter(userId: string): Record<string, unknown> {
  return { $or: [{ client: userId }, { createdBy: userId }] }
}

function attachmentsFrom(req: Request) {
  const files = (req.files as Express.Multer.File[]) || []
  return {
    files,
    attachments: files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    })),
  }
}

/** 404 et non 403 : ne jamais révéler l'existence d'une demande. */
async function loadVisible(req: Request, res: Response): Promise<IChangeRequest | null> {
  const found = await ChangeRequest.findOne({ _id: req.params.id, ...visibilityFilter(req.user!.id) })
  if (!found) {
    res.status(404).json({ error: 'Demande non trouvée' })
    return null
  }
  return found
}

/** Le devis lié n'est exposé que lorsqu'il est consultable côté client. */
async function linkedProposalOf(changeRequest: IChangeRequest) {
  if (!changeRequest.quoteProposal || !changeRequest.project) return null
  const proposal = await QuoteProposal.findById(changeRequest.quoteProposal).select('status title').lean()
  if (!proposal || !CLIENT_VISIBLE_PROPOSAL_STATUSES.includes(proposal.status)) return null
  return {
    proposalId: String(proposal._id),
    projectId: String(changeRequest.project),
    status: proposal.status,
    title: proposal.title,
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = visibilityFilter(req.user!.id)
    if (req.query.status) filter.status = req.query.status
    const found = await ChangeRequest.find(filter).sort({ createdAt: -1 }).populate('project', 'name')

    const changeRequests = []
    for (const changeRequest of found) {
      changeRequests.push({
        ...changeRequest.toObject(),
        replyCount: changeRequest.replies.length,
        linkedProposal: await linkedProposalOf(changeRequest),
      })
    }
    return res.json({ changeRequests })
  } catch (err) {
    return next(err)
  }
})

// Déclarée avant `/:id` : sinon « files » serait capturé comme identifiant.
router.get('/files/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = req.params.filename as string
    const owned = await ChangeRequest.exists({
      ...visibilityFilter(req.user!.id),
      $and: [
        {
          $or: [
            { attachments: { $elemMatch: { filename } } },
            { 'replies.attachments': { $elemMatch: { filename } } },
          ],
        },
      ],
    })
    if (!owned) return res.status(404).json({ error: 'Fichier introuvable' })

    const filePath = path.resolve(uploadsDir, filename)
    if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
    return res.sendFile(filePath)
  } catch (err) {
    return next(err)
  }
})

router.post('/', upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = String(req.body.title ?? '').trim()
    const description = String(req.body.description ?? '').trim()
    if (!title) return res.status(400).json({ error: 'Titre requis' })
    if (!description) return res.status(400).json({ error: 'Description requise' })

    const pageUrl = String(req.body.pageUrl ?? '').trim()
    if (pageUrl && !/^https?:\/\/\S+$/i.test(pageUrl)) {
      return res.status(400).json({ error: 'URL de page invalide' })
    }

    const priority = ['BASSE', 'NORMALE', 'HAUTE'].includes(req.body.priority) ? req.body.priority : 'NORMALE'

    // Sur projet, la demande appartient au COMPTE propriétaire : un
    // collaborateur soumet ainsi pour le compte de son client.
    let project: string | null = null
    let client = req.user!.id
    if (req.body.projectId) {
      const access = await getProjectAccess(String(req.body.projectId), req.user!.id)
      if (!access) return res.status(404).json({ error: 'Projet non trouvé' })
      project = String(access.project._id)
      client = String(access.project.client)
    }

    const actor = actorFromRequest(req.user!)
    const { files, attachments } = attachmentsFrom(req)

    const created = await ChangeRequest.create({
      client,
      project,
      title,
      description,
      pageUrl,
      priority,
      createdBy: actor.id,
      createdByName: actor.name,
      attachments,
      statusHistory: [{ status: 'SOUMISE', at: new Date(), byUserId: actor.id, byName: actor.name, note: '' }],
    })

    files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(created._id)))

    auditChangeRequest({ action: 'CHANGE_REQUEST_CREATED', actor, changeRequest: created })
    logChangeRequestActivity({
      changeRequest: created,
      action: 'CHANGE_REQUEST_CREATED',
      actor,
      summary: `Demande de changement « ${created.title} » soumise`,
    })
    notifySuperAdmins({
      type: 'CHANGE_REQUEST_CREATED',
      title: `Nouvelle demande : ${created.title}`,
      message: `${actor.name} a soumis une demande de changement`,
      link: `/admin/demandes-clients/${created._id}`,
      metadata: { changeRequestId: String(created._id) },
    }).catch(() => {})

    return res.status(201).json({ changeRequest: created.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    await changeRequest.populate('project', 'name')
    const authorIds = [...new Set(changeRequest.replies.map((reply) => String(reply.authorId)))]
    const authors = await User.find({ _id: { $in: authorIds } }).select('_id avatarUrl')
    const avatarMap: Record<string, string> = {}
    authors.forEach((author) => {
      avatarMap[String(author._id)] = author.avatarUrl || ''
    })

    const payload = changeRequest.toObject() as unknown as Record<string, unknown>
    payload.replies = changeRequest.replies.map((reply) => {
      const raw = reply as unknown as { toObject?: () => Record<string, unknown> }
      return {
        ...(typeof raw.toObject === 'function' ? raw.toObject() : reply),
        authorAvatarUrl: avatarMap[String(reply.authorId)] || '',
      }
    })
    payload.linkedProposal = await linkedProposalOf(changeRequest)

    return res.json({ changeRequest: payload })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/reply', upload.array('files', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = String(req.body.message ?? '').trim()
    if (!message) return res.status(400).json({ error: 'Message requis' })

    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    const actor = actorFromRequest(req.user!)
    const { files, attachments } = attachmentsFrom(req)

    // Répondre ne change jamais le statut : le fil reste ouvert même sur un
    // état terminal (question après refus, remerciement après validation).
    changeRequest.replies.push({
      authorId: actor.id as unknown as IChangeRequest['client'],
      authorName: actor.name,
      message,
      attachments,
      createdAt: new Date(),
    })
    await changeRequest.save()

    files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(changeRequest._id)))
    notifySuperAdmins({
      type: 'CHANGE_REQUEST_REPLY',
      title: `Réponse client : ${changeRequest.title}`,
      message: `${actor.name} a répondu sur une demande`,
      link: `/admin/demandes-clients/${changeRequest._id}`,
      metadata: { changeRequestId: String(changeRequest._id) },
    }).catch(() => {})

    return res.json({ changeRequest: changeRequest.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return

    // Valider clôt l'engagement : réservé au compte, comme signer un devis.
    if (String(changeRequest.client) !== req.user!.id) {
      return res.status(403).json({ error: 'Seul le titulaire du compte peut valider', code: 'OWNER_REQUIRED' })
    }
    if (changeRequest.status !== 'LIVREE') {
      return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
    }

    const actor = actorFromRequest(req.user!)
    const updated = await transitionChangeRequest({
      id: String(changeRequest._id),
      from: 'LIVREE',
      to: 'VALIDEE',
      actor,
      set: { validatedAt: new Date() },
    })
    if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

    auditChangeRequest({
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      changeRequest: updated,
      extra: { from: 'LIVREE', to: 'VALIDEE' },
    })
    logChangeRequestActivity({
      changeRequest: updated,
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      summary: `Demande « ${updated.title} » validée par le client`,
    })
    return res.json({ changeRequest: updated.toObject() })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/request-correction', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comment = String(req.body.comment ?? '').trim()
    if (!comment) return res.status(400).json({ error: 'Commentaire requis' })

    const changeRequest = await loadVisible(req, res)
    if (!changeRequest) return
    if (changeRequest.status !== 'LIVREE') {
      return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
    }

    const actor = actorFromRequest(req.user!)
    const updated = await transitionChangeRequest({
      id: String(changeRequest._id),
      from: 'LIVREE',
      to: 'EN_COURS',
      actor,
      note: comment,
    })
    if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

    // Le commentaire vit dans le fil ET dans l'historique : l'un se lit dans
    // la conversation, l'autre dans la frise.
    updated.replies.push({
      authorId: actor.id as unknown as IChangeRequest['client'],
      authorName: actor.name,
      message: comment,
      attachments: [],
      createdAt: new Date(),
    })
    await updated.save()

    auditChangeRequest({
      action: 'CHANGE_REQUEST_STATUS_CHANGED',
      actor,
      changeRequest: updated,
      extra: { from: 'LIVREE', to: 'EN_COURS', reason: 'correction' },
    })
    notifySuperAdmins({
      type: 'CHANGE_REQUEST_REPLY',
      title: `Correction demandée : ${updated.title}`,
      message: `${actor.name} demande une correction`,
      link: `/admin/demandes-clients/${updated._id}`,
      metadata: { changeRequestId: String(updated._id) },
    }).catch(() => {})

    return res.json({ changeRequest: updated.toObject() })
  } catch (err) {
    return next(err)
  }
})

export default router
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-client.test.ts
```

Attendu : 15 tests passés.

- [ ] **Step 5 : Monter le routeur dans l'application**

Dans `backend/src/index.ts`, ajouter l'import auprès des autres imports de routes client :

```ts
import clientChangeRequestRoutes from './routes/client/changeRequests.js'
```

Puis, juste après `app.use('/api/projects', clientQuoteRoutes)` :

```ts
// Ressource scopée compte (et non projet) : préfixe dédié /api/client.
app.use('/api/client/change-requests', clientChangeRequestRoutes)
```

- [ ] **Step 6 : Typecheck**

```bash
npm --prefix backend run typecheck
```

Attendu : aucune sortie.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/routes/client/changeRequests.ts backend/src/index.ts backend/src/__tests__/change-request-client.test.ts
git commit -m "feat(demandes): routeur client des demandes de changement"
```

---

### Task 6 : Routeur admin `/api/admin/change-requests`

**Files:**
- Create: `backend/src/routes/admin/changeRequests.ts`
- Modify: `backend/src/index.ts` (auprès de `app.use('/api/admin/tickets', adminTicketRoutes)`)
- Test: `backend/src/__tests__/change-request-admin.test.ts`

**Interfaces:**
- Consumes : Task 3 (`ChangeRequest`), Task 4 (flow), Task 2 (`PERMISSIONS.VIEW_CHANGE_REQUESTS`, `PERMISSIONS.MANAGE_CHANGE_REQUESTS`), `requireAdmin`/`requirePermission` (`middleware/role.js`), `QuoteProposal`, `Project`, `notifyUsers`.
- Produces : `export default router` monté sur `/api/admin/change-requests`. Réponses : `GET /` → `{ changeRequests }` ; `GET /stats` → `{ aTraiter: number, enCours: number }` ; `GET /:id` → `{ changeRequest }` ; `POST /:id/qualify-quote` → `{ changeRequest, proposal }` ; les autres actions → `{ changeRequest }`.

- [ ] **Step 1 : Écrire le test**

Créer `backend/src/__tests__/change-request-admin.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminChangeRequestRoutes from '../routes/admin/changeRequests.js'
import ChangeRequest from '../models/ChangeRequest.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Notification from '../models/Notification.js'
import AuditLog from '../models/AuditLog.js'
import User from '../models/User.js'
import Project from '../models/Project.js'

let app: Express
let adminId: string
let viewerId: string
let clientId: string
let otherClientId: string
let projectId: string
let otherProjectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function seedRequest(overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: clientId,
    title: 'Module de réservation en ligne',
    description: 'Réserver un créneau d’atelier avec acompte.',
    createdBy: clientId,
    createdByName: 'Claire Corbel',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/change-requests', adminChangeRequestRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, viewer, client, otherClient] = await User.create([
    { name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'VIEWER' },
    { name: 'Claire Corbel', email: 'claire@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Novane', email: 'novane@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  viewerId = String(viewer._id)
  clientId = String(client._id)
  otherClientId = String(otherClient._id)
  projectId = String((await Project.create({ name: 'Refonte du site', client: client._id }))._id)
  otherProjectId = String((await Project.create({ name: 'Plateforme', client: otherClient._id }))._id)
})

describe('file admin', () => {
  it('liste toutes les demandes et filtre par statut, client et projet', async () => {
    await seedRequest({ title: 'À qualifier' })
    await seedRequest({ title: 'Sur projet', project: projectId, status: 'EN_COURS' })
    await seedRequest({ title: 'Autre compte', client: otherClientId, createdBy: otherClientId })
    const cookie = await cookieFor(adminId)

    const all = await request(app).get('/api/admin/change-requests').set('Cookie', cookie).expect(200)
    expect(all.body.changeRequests).toHaveLength(3)

    const byStatus = await request(app)
      .get('/api/admin/change-requests?status=EN_COURS')
      .set('Cookie', cookie)
      .expect(200)
    expect(byStatus.body.changeRequests).toHaveLength(1)

    const byClient = await request(app)
      .get(`/api/admin/change-requests?client=${otherClientId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byClient.body.changeRequests[0].title).toBe('Autre compte')

    const byProject = await request(app)
      .get(`/api/admin/change-requests?project=${projectId}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(byProject.body.changeRequests[0].title).toBe('Sur projet')
  })

  it('compte les demandes à traiter et en cours pour le badge sidebar', async () => {
    await seedRequest()
    await seedRequest({ status: 'PLANIFIEE' })
    await seedRequest({ status: 'LIVREE' })
    await seedRequest({ status: 'VALIDEE' })

    const response = await request(app)
      .get('/api/admin/change-requests/stats')
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body).toEqual({ aTraiter: 1, enCours: 2 })
  })
})

describe('qualification', () => {
  it('inclut une demande : SOUMISE → PLANIFIEE avec qualification INCLUSE', async () => {
    const created = await seedRequest({ project: projectId })

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-include`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.changeRequest.status).toBe('PLANIFIEE')
    expect(response.body.changeRequest.qualification).toBe('INCLUSE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUALIFIED' })).toBe(1)
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_QUALIFIED' })).toBe(1)
  })

  it('crée un devis DRAFT prérempli et lie la demande', async () => {
    const created = await seedRequest({ project: projectId })

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ expiresAt: '2026-09-30T00:00:00.000Z' })
      .expect(200)

    expect(response.body.changeRequest.status).toBe('A_CHIFFRER')
    expect(response.body.changeRequest.qualification).toBe('A_CHIFFRER')
    expect(response.body.proposal.status).toBe('DRAFT')
    expect(response.body.proposal.title).toBe('Module de réservation en ligne')
    expect(response.body.proposal.intro).toBe('Réserver un créneau d’atelier avec acompte.')
    expect(String(response.body.proposal.project)).toBe(projectId)
    expect(String(response.body.proposal.client)).toBe(clientId)
    expect(String(response.body.changeRequest.quoteProposal)).toBe(String(response.body.proposal._id))
  })

  it('pose le projet fourni sur une demande qui n’en avait pas', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ projectId })
      .expect(200)

    expect(String(response.body.changeRequest.project)).toBe(projectId)
  })

  it('exige un projet pour chiffrer une demande hors projet', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({})
      .expect(400)

    expect(response.body.code).toBe('PROJECT_REQUIRED_FOR_QUOTE')
    expect(await QuoteProposal.countDocuments()).toBe(0)
  })

  it('refuse un projet appartenant à un autre compte', async () => {
    const created = await seedRequest()

    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(adminId))
      .send({ projectId: otherProjectId })
      .expect(422)
  })

  it('refuse avec motif obligatoire, depuis SOUMISE comme depuis A_CHIFFRER', async () => {
    const cookie = await cookieFor(adminId)
    const soumise = await seedRequest()
    const aChiffrer = await seedRequest({ status: 'A_CHIFFRER', qualification: 'A_CHIFFRER' })

    await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: '   ' })
      .expect(400)

    const first = await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Hors périmètre de la maintenance' })
      .expect(200)
    expect(first.body.changeRequest.status).toBe('REFUSEE')
    expect(first.body.changeRequest.refusalReason).toBe('Hors périmètre de la maintenance')

    const second = await request(app)
      .post(`/api/admin/change-requests/${aChiffrer._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Devis expiré' })
      .expect(200)
    expect(second.body.changeRequest.status).toBe('REFUSEE')
  })
})

describe('transitions admin', () => {
  it('démarre puis livre une demande planifiée', async () => {
    const cookie = await cookieFor(adminId)
    const created = await seedRequest({ status: 'PLANIFIEE', project: projectId })

    const started = await request(app)
      .post(`/api/admin/change-requests/${created._id}/start`)
      .set('Cookie', cookie)
      .expect(200)
    expect(started.body.changeRequest.status).toBe('EN_COURS')
    // Le client n'est pas notifié au démarrage (décision de la spec).
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_DELIVERED' })).toBe(0)

    const delivered = await request(app)
      .post(`/api/admin/change-requests/${created._id}/deliver`)
      .set('Cookie', cookie)
      .expect(200)
    expect(delivered.body.changeRequest.status).toBe('LIVREE')
    expect(delivered.body.changeRequest.deliveredAt).not.toBeNull()
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_DELIVERED' })).toBe(1)
  })

  it('rejette une transition hors cycle en 409', async () => {
    const cookie = await cookieFor(adminId)
    const soumise = await seedRequest()
    const validee = await seedRequest({ status: 'VALIDEE' })

    const deliverTooEarly = await request(app)
      .post(`/api/admin/change-requests/${soumise._id}/deliver`)
      .set('Cookie', cookie)
      .expect(409)
    expect(deliverTooEarly.body.code).toBe('INVALID_TRANSITION')

    await request(app).post(`/api/admin/change-requests/${validee._id}/start`).set('Cookie', cookie).expect(409)
    await request(app)
      .post(`/api/admin/change-requests/${validee._id}/refuse`)
      .set('Cookie', cookie)
      .send({ reason: 'Trop tard' })
      .expect(409)
  })

  it('répond dans le fil et notifie le compte et l’auteur', async () => {
    const created = await seedRequest()

    const response = await request(app)
      .post(`/api/admin/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(adminId))
      .field('message', 'Nous vous préparons un devis.')
      .expect(200)

    expect(response.body.changeRequest.replies).toHaveLength(1)
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY', recipient: clientId })).toBe(1)
  })
})

describe('RBAC', () => {
  it('refuse la file à un admin sans view_change_requests', async () => {
    await User.findByIdAndUpdate(viewerId, { deniedPermissions: ['view_change_requests'] })
    await request(app)
      .get('/api/admin/change-requests')
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)
  })

  it('refuse les actions à un admin sans manage_change_requests', async () => {
    const created = await seedRequest()
    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-include`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)
  })

  it('refuse qualify-quote à un admin sans manage_billing', async () => {
    const created = await seedRequest({ project: projectId })
    await User.findByIdAndUpdate(viewerId, {
      grantedPermissions: ['view_change_requests', 'manage_change_requests'],
    })
    await request(app)
      .post(`/api/admin/change-requests/${created._id}/qualify-quote`)
      .set('Cookie', await cookieFor(viewerId))
      .send({})
      .expect(403)
  })

  it('refuse un client sur les routes admin', async () => {
    await request(app)
      .get('/api/admin/change-requests')
      .set('Cookie', await cookieFor(clientId))
      .expect(403)
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-admin.test.ts
```

Attendu : ÉCHEC — `Cannot find module '../routes/admin/changeRequests.js'`.

- [ ] **Step 3 : Écrire le routeur admin**

Créer `backend/src/routes/admin/changeRequests.ts` :

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import ChangeRequest, { type IChangeRequest } from '../../models/ChangeRequest.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import {
  actorFromRequest,
  auditChangeRequest,
  logChangeRequestActivity,
  transitionChangeRequest,
  type ChangeRequestStatus,
  type FlowActor,
} from '../../lib/changeRequestFlow.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const uploadsDir = path.resolve('uploads/change-requests')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const ACTIVE_STATUSES: ChangeRequestStatus[] = ['PLANIFIEE', 'EN_COURS', 'LIVREE']

async function loadOr404(req: Request, res: Response): Promise<IChangeRequest | null> {
  const found = await ChangeRequest.findById(req.params.id)
  if (!found) {
    res.status(404).json({ error: 'Demande non trouvée' })
    return null
  }
  return found
}

/** Le client et l'auteur sont notifiés ensemble ; notifyUsers déduplique. */
function notifyRequesters(
  changeRequest: IChangeRequest,
  actor: FlowActor,
  params: { type: 'CHANGE_REQUEST_QUALIFIED' | 'CHANGE_REQUEST_DELIVERED' | 'CHANGE_REQUEST_REPLY'; title: string; message: string },
): void {
  notifyUsers([changeRequest.client, changeRequest.createdBy], {
    type: params.type,
    title: params.title,
    message: params.message,
    link: `/espace-client/demandes/${changeRequest._id}`,
    metadata: { changeRequestId: String(changeRequest._id) },
    excludeUserId: actor.id,
  }).catch(() => {})
}

router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {}
      if (req.query.status) filter.status = req.query.status
      if (req.query.client) filter.client = req.query.client
      if (req.query.project) filter.project = req.query.project

      const changeRequests = await ChangeRequest.find(filter)
        .sort({ createdAt: -1 })
        .populate('client', 'name companyName avatarUrl')
        .populate('project', 'name')
        .lean()

      return res.json({
        changeRequests: changeRequests.map((changeRequest) => ({
          ...changeRequest,
          replyCount: changeRequest.replies?.length ?? 0,
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/stats',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [aTraiter, enCours] = await Promise.all([
        ChangeRequest.countDocuments({ status: 'SOUMISE' }),
        ChangeRequest.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
      ])
      return res.json({ aTraiter, enCours })
    } catch (err) {
      return next(err)
    }
  },
)

// Avant `/:id` : sinon « files » serait capturé comme identifiant.
router.get(
  '/files/:filename',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filename = req.params.filename as string
      const owned = await ChangeRequest.exists({
        $or: [
          { attachments: { $elemMatch: { filename } } },
          { 'replies.attachments': { $elemMatch: { filename } } },
        ],
      })
      if (!owned) return res.status(404).json({ error: 'Fichier introuvable' })

      const filePath = path.resolve(uploadsDir, filename)
      if (!filePath.startsWith(uploadsDir)) return res.status(403).json({ error: 'Access denied' })
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' })
      return res.sendFile(filePath)
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      await changeRequest.populate([
        { path: 'client', select: 'name companyName avatarUrl email' },
        { path: 'project', select: 'name' },
        { path: 'quoteProposal', select: 'status title expiresAt' },
      ])

      const authorIds = [...new Set(changeRequest.replies.map((reply) => String(reply.authorId)))]
      const authors = await User.find({ _id: { $in: authorIds } }).select('_id avatarUrl')
      const avatarMap: Record<string, string> = {}
      authors.forEach((author) => {
        avatarMap[String(author._id)] = author.avatarUrl || ''
      })

      const payload = changeRequest.toObject() as unknown as Record<string, unknown>
      payload.replies = changeRequest.replies.map((reply) => {
        const raw = reply as unknown as { toObject?: () => Record<string, unknown> }
        return {
          ...(typeof raw.toObject === 'function' ? raw.toObject() : reply),
          authorAvatarUrl: avatarMap[String(reply.authorId)] || '',
        }
      })

      return res.json({ changeRequest: payload })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/reply',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  upload.array('files', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = String(req.body.message ?? '').trim()
      if (!message) return res.status(400).json({ error: 'Message requis' })

      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const files = (req.files as Express.Multer.File[]) || []
      changeRequest.replies.push({
        authorId: actor.id as unknown as IChangeRequest['client'],
        authorName: actor.name,
        message,
        attachments: files.map((file) => ({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })),
        createdAt: new Date(),
      })
      await changeRequest.save()

      files.forEach((file) => syncUploadToNextcloud(file, 'demandes-client', String(changeRequest._id)))
      notifyRequesters(changeRequest, actor, {
        type: 'CHANGE_REQUEST_REPLY',
        title: `Réponse de Venio : ${changeRequest.title}`,
        message: `${actor.name} a répondu à votre demande`,
      })

      return res.json({ changeRequest: changeRequest.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/qualify-include',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      // « Incluse » n'est pas un statut : la demande part directement en PLANIFIEE.
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'SOUMISE',
        to: 'PLANIFIEE',
        actor,
        note: 'Incluse dans le contrat de maintenance',
        set: { qualification: 'INCLUSE' },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        changeRequest: updated,
        extra: { qualification: 'INCLUSE', from: 'SOUMISE', to: 'PLANIFIEE' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » incluse dans la maintenance`,
      })
      notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Demande prise en charge : ${updated.title}`,
        message: 'Votre demande est incluse dans votre contrat et planifiée.',
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/qualify-quote',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  // La route crée un document de facturation : deux permissions chaînées.
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return
      if (changeRequest.status !== 'SOUMISE') {
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      // QuoteProposal.project est requis : une demande hors projet doit s'en
      // voir attribuer un avant tout chiffrage.
      const targetProjectId = changeRequest.project ? String(changeRequest.project) : String(req.body.projectId ?? '')
      if (!targetProjectId) {
        return res
          .status(400)
          .json({ error: 'Un projet est requis pour créer un devis', code: 'PROJECT_REQUIRED_FOR_QUOTE' })
      }
      const project = await Project.findById(targetProjectId).select('client').lean()
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })
      if (String(project.client) !== String(changeRequest.client)) {
        return res.status(422).json({ error: 'Ce projet appartient à un autre compte', code: 'PROJECT_CLIENT_MISMATCH' })
      }

      const actor = actorFromRequest(req.user!)
      const proposal = await QuoteProposal.create({
        project: targetProjectId,
        client: changeRequest.client,
        createdBy: actor.id,
        title: changeRequest.title,
        intro: changeRequest.description,
        status: 'DRAFT',
        expiresAt: req.body.expiresAt ? new Date(String(req.body.expiresAt)) : null,
      })

      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'SOUMISE',
        to: 'A_CHIFFRER',
        actor,
        note: 'Devis à établir',
        set: { qualification: 'A_CHIFFRER', quoteProposal: proposal._id, project: targetProjectId },
      })
      if (!updated) {
        // Course perdue : le devis créé ne doit pas rester orphelin.
        await QuoteProposal.findByIdAndDelete(proposal._id)
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      auditChangeRequest({
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        changeRequest: updated,
        extra: { qualification: 'A_CHIFFRER', proposalId: String(proposal._id), from: 'SOUMISE', to: 'A_CHIFFRER' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » à chiffrer — devis créé`,
      })
      notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Devis en préparation : ${updated.title}`,
        message: 'Cette évolution sort du périmètre de la maintenance : un devis vous sera transmis.',
      })

      return res.json({ changeRequest: updated.toObject(), proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/refuse',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = String(req.body.reason ?? '').trim()
      if (!reason) return res.status(400).json({ error: 'Motif de refus requis' })

      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return
      // Refusable depuis SOUMISE et depuis A_CHIFFRER (devis expiré, annulé,
      // décliné) — sans quoi la demande resterait bloquée.
      const from = changeRequest.status
      if (from !== 'SOUMISE' && from !== 'A_CHIFFRER') {
        return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })
      }

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from,
        to: 'REFUSEE',
        actor,
        note: reason,
        set: { refusalReason: reason },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_REFUSED',
        actor,
        changeRequest: updated,
        extra: { from, to: 'REFUSEE', reason },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_QUALIFIED',
        actor,
        summary: `Demande « ${updated.title} » refusée : ${reason}`,
      })
      notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_QUALIFIED',
        title: `Demande refusée : ${updated.title}`,
        message: reason,
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/start',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'PLANIFIEE',
        to: 'EN_COURS',
        actor,
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      // Pas de notification client ici : il est prévenu à la qualification,
      // au devis et à la livraison.
      auditChangeRequest({
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        changeRequest: updated,
        extra: { from: 'PLANIFIEE', to: 'EN_COURS' },
      })
      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/deliver',
  requirePermission(PERMISSIONS.MANAGE_CHANGE_REQUESTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const changeRequest = await loadOr404(req, res)
      if (!changeRequest) return

      const actor = actorFromRequest(req.user!)
      const updated = await transitionChangeRequest({
        id: String(changeRequest._id),
        from: 'EN_COURS',
        to: 'LIVREE',
        actor,
        set: { deliveredAt: new Date() },
      })
      if (!updated) return res.status(409).json({ error: 'Transition impossible', code: 'INVALID_TRANSITION' })

      auditChangeRequest({
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        changeRequest: updated,
        extra: { from: 'EN_COURS', to: 'LIVREE' },
      })
      logChangeRequestActivity({
        changeRequest: updated,
        action: 'CHANGE_REQUEST_STATUS_CHANGED',
        actor,
        summary: `Demande « ${updated.title} » livrée`,
      })
      notifyRequesters(updated, actor, {
        type: 'CHANGE_REQUEST_DELIVERED',
        title: `Demande livrée : ${updated.title}`,
        message: 'Merci de confirmer la mise en ligne depuis votre espace client.',
      })

      return res.json({ changeRequest: updated.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-admin.test.ts
```

Attendu : 13 tests passés.

- [ ] **Step 5 : Monter le routeur**

Dans `backend/src/index.ts`, ajouter l'import auprès des autres routeurs admin :

```ts
import adminChangeRequestRoutes from './routes/admin/changeRequests.js'
```

Puis, juste après `app.use('/api/admin/tickets', adminTicketRoutes)` :

```ts
app.use('/api/admin/change-requests', adminChangeRequestRoutes)
```

- [ ] **Step 6 : Typecheck**

```bash
npm --prefix backend run typecheck
```

Attendu : aucune sortie.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/routes/admin/changeRequests.ts backend/src/index.ts backend/src/__tests__/change-request-admin.test.ts
git commit -m "feat(demandes): file admin, qualification et transitions"
```

---

### Task 7 : Hooks devis — signature et envoi

Le hook de signature est le cœur du chantier : il est **best-effort** et ne peut jamais faire échouer une signature. Il s'insère **après** l'acquisition du verrou (la proposition est juridiquement `SIGNED`) et **avant** `buildBillingDocumentForProposal` — ainsi un échec de génération de PDF (rattrapable via `rebuild-document`) ne laisse pas la demande bloquée en `A_CHIFFRER`.

**Files:**
- Modify: `backend/src/routes/client/quotes.ts:262-268` (bloc `if (!locked) { … }` du handler `POST /:projectId/proposals/:id/sign`)
- Modify: `backend/src/routes/admin/quoteProposals.ts:137-155` (handler `POST /:id/send`)
- Test: `backend/src/__tests__/change-request-signature-hook.test.ts`

**Interfaces:**
- Consumes : `promoteChangeRequestOnSignature` (Task 4), `ChangeRequest` (Task 3), `notifyUsers`.
- Produces : rien de nouveau — effets de bord observables uniquement.

- [ ] **Step 1 : Écrire le test d'intégration**

Créer `backend/src/__tests__/change-request-signature-hook.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import adminQuoteRoutes from '../routes/admin/quoteProposals.js'
import ChangeRequest from '../models/ChangeRequest.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import { promoteChangeRequestOnSignature } from '../lib/changeRequestFlow.js'

// vi.spyOn ne fonctionne pas sur un namespace de module ESM : on remplace le
// module en gardant l'implémentation réelle par défaut, et on ne force le rejet
// que dans le test qui l'exige.
vi.mock('../lib/changeRequestFlow.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/changeRequestFlow.js')>('../lib/changeRequestFlow.js')
  return { ...actual, promoteChangeRequestOnSignature: vi.fn(actual.promoteChangeRequestOnSignature) }
})

let app: Express
let adminId: string
let ownerId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createProposal(overrides: Record<string, unknown> = {}) {
  return QuoteProposal.create({
    project: projectId,
    client: ownerId,
    createdBy: ownerId,
    title: 'Module de réservation',
    status: 'SENT',
    lines: [{ description: 'Développement', quantity: 1, unitPrice: 1240, taxRate: 20, isOptional: false, order: 0 }],
    ...overrides,
  })
}

async function createLinkedRequest(proposalId: unknown, overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: ownerId,
    project: projectId,
    title: 'Module de réservation en ligne',
    description: 'Réserver un créneau avec acompte.',
    createdBy: ownerId,
    createdByName: 'Owner',
    status: 'A_CHIFFRER',
    qualification: 'A_CHIFFRER',
    quoteProposal: proposalId,
    ...overrides,
  })
}

const CONSENT = { signerName: 'Claire Corbel', consent: true }

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientQuoteRoutes)
  app.use('/api/admin/quote-proposals', adminQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  // clearAllMocks (et non resetAllMocks) : l'implémentation réelle du mock est conservée.
  vi.clearAllMocks()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, admin] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true },
  ])
  ownerId = String(owner._id)
  adminId = String(admin._id)
  projectId = String((await Project.create({ name: 'Refonte du site', client: owner._id }))._id)
})

describe('signature → PLANIFIEE', () => {
  it('planifie la demande liée et notifie les super admins', async () => {
    const proposal = await createProposal()
    const changeRequest = await createLinkedRequest(proposal._id)

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    // Le hook est asynchrone et détaché de la réponse.
    await vi.waitFor(async () => {
      expect((await ChangeRequest.findById(changeRequest._id))!.status).toBe('PLANIFIEE')
    })
    const promoted = await ChangeRequest.findById(changeRequest._id)
    expect(promoted!.statusHistory.at(-1)!.status).toBe('PLANIFIEE')
    expect(promoted!.statusHistory.at(-1)!.note).toBe('Devis signé')
    await vi.waitFor(async () => {
      expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    })
  })

  it('signe sans effet parasite quand aucune demande n’est liée', async () => {
    const proposal = await createProposal()

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(0)
  })

  it('laisse une demande refusée intacte', async () => {
    const proposal = await createProposal()
    const changeRequest = await createLinkedRequest(proposal._id, {
      status: 'REFUSEE',
      refusalReason: 'Devis expiré',
    })

    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect((await ChangeRequest.findById(changeRequest._id))!.status).toBe('REFUSEE')
  })

  it('ne fait pas échouer la signature si le hook lève', async () => {
    const proposal = await createProposal()
    await createLinkedRequest(proposal._id)
    vi.mocked(promoteChangeRequestOnSignature).mockRejectedValueOnce(new Error('mongo down'))

    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(response.body.billingDocument.number).toMatch(/^DEV-/)
    expect((await QuoteProposal.findById(proposal._id))!.status).toBe('SIGNED')
  })
})

describe('envoi du devis lié', () => {
  it('notifie le client quand le devis d’une demande passe en SENT', async () => {
    const proposal = await createProposal({ status: 'DRAFT' })
    await createLinkedRequest(proposal._id)

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/send`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    await vi.waitFor(async () => {
      expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUOTE_SENT', recipient: ownerId })).toBe(1)
    })
    const notification = await Notification.findOne({ type: 'CHANGE_REQUEST_QUOTE_SENT' })
    expect(notification!.link).toBe(`/espace-client/projets/${projectId}/propositions/${proposal._id}`)
  })

  it('n’émet rien pour un devis sans demande liée', async () => {
    const proposal = await createProposal({ status: 'DRAFT' })

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/send`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_QUOTE_SENT' })).toBe(0)
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npm --prefix backend test -- change-request-signature-hook.test.ts
```

Attendu : ÉCHEC — la demande reste `A_CHIFFRER` et aucune notification n'est créée.

- [ ] **Step 3 : Greffer le hook de signature**

Dans `backend/src/routes/client/quotes.ts`, ajouter l'import auprès des autres imports de lib :

```ts
import { promoteChangeRequestOnSignature } from '../../lib/changeRequestFlow.js'
```

Puis, dans le handler `POST /:projectId/proposals/:id/sign`, insérer **immédiatement après** le bloc `if (!locked)` et **avant** `const billingDocument = await buildBillingDocumentForProposal(locked)` :

```ts
      // Une demande de changement adossée à ce devis passe en PLANIFIEE dès la
      // signature. Best-effort et placé avant la génération du document : un
      // échec de PDF (rattrapable via rebuild-document) ne doit pas laisser la
      // demande bloquée en A_CHIFFRER.
      promoteChangeRequestOnSignature(locked, req.user!).catch(() => {})
```

- [ ] **Step 4 : Greffer le hook d'envoi**

Dans `backend/src/routes/admin/quoteProposals.ts`, ajouter les imports :

```ts
import ChangeRequest from '../../models/ChangeRequest.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
```

Puis, dans le handler `POST /:id/send`, après `await proposal.save()` et avant le `return res.json(...)` :

```ts
      // Le client suit sa demande depuis l'espace client : on l'y ramène avec
      // un lien direct vers le devis. Best-effort.
      ChangeRequest.findOne({ quoteProposal: proposal._id })
        .then((changeRequest) => {
          if (!changeRequest) return
          return notifyUsers([changeRequest.client, changeRequest.createdBy], {
            type: 'CHANGE_REQUEST_QUOTE_SENT',
            title: `Devis à signer : ${changeRequest.title}`,
            message: 'Votre devis est disponible dans votre espace client.',
            link: `/espace-client/projets/${proposal.project}/propositions/${proposal._id}`,
            metadata: { changeRequestId: String(changeRequest._id), proposalId: String(proposal._id) },
          })
        })
        .catch(() => {})
```

- [ ] **Step 5 : Lancer le test, vérifier qu'il passe**

```bash
npm --prefix backend test -- change-request-signature-hook.test.ts
```

Attendu : 6 tests passés.

- [ ] **Step 6 : Vérifier la non-régression des devis**

```bash
npm --prefix backend test -- quote-proposal
```

Attendu : les quatre fichiers `quote-proposal-*.test.ts` restent verts.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/routes/client/quotes.ts backend/src/routes/admin/quoteProposals.ts backend/src/__tests__/change-request-signature-hook.test.ts
git commit -m "feat(demandes): planifier la demande à la signature du devis lié"
```

---

### Task 8 : Types et couche service frontend

**Files:**
- Create: `src/types/changeRequest.types.ts`
- Create: `src/services/changeRequests.ts`

**Interfaces:**
- Consumes : `apiFetch`, `apiUpload` (`src/lib/api.ts`), formes de réponse des Tasks 5 et 6.
- Produces (utilisés par les Tasks 9 à 11) :
  - Types `ChangeRequestStatus`, `ChangeRequestPriority`, `ChangeRequestFile`, `ChangeRequestReply`, `ChangeRequestStatusEntry`, `LinkedProposal`, `ClientChangeRequest`, `AdminChangeRequest`, `ChangeRequestStats`, `NewChangeRequestInput`.
  - Fonctions client : `listChangeRequests(status?)`, `getChangeRequest(id)`, `createChangeRequest(input)`, `replyToChangeRequest(id, message, files)`, `validateChangeRequest(id)`, `requestChangeRequestCorrection(id, comment)`, `clientFileUrl(filename)`.
  - Fonctions admin : `listAdminChangeRequests(filters)`, `getAdminChangeRequestStats()`, `getAdminChangeRequest(id)`, `replyAsAdmin(id, message, files)`, `qualifyInclude(id)`, `qualifyQuote(id, payload)`, `refuseChangeRequest(id, reason)`, `startChangeRequest(id)`, `deliverChangeRequest(id)`, `adminFileUrl(filename)`, `sendLinkedProposal(proposalId)`.

- [ ] **Step 1 : Écrire les types**

Créer `src/types/changeRequest.types.ts` :

```ts
export type ChangeRequestStatus =
  | 'SOUMISE'
  | 'A_CHIFFRER'
  | 'PLANIFIEE'
  | 'EN_COURS'
  | 'LIVREE'
  | 'VALIDEE'
  | 'REFUSEE'

export type ChangeRequestPriority = 'BASSE' | 'NORMALE' | 'HAUTE'
export type ChangeRequestQualification = 'INCLUSE' | 'A_CHIFFRER' | null

export interface ChangeRequestFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface ChangeRequestReply {
  _id: string
  authorId: string
  authorName: string
  authorAvatarUrl?: string
  message: string
  attachments?: ChangeRequestFile[]
  createdAt: string
}

export interface ChangeRequestStatusEntry {
  status: ChangeRequestStatus
  at: string
  byUserId: string
  byName: string
  note: string
}

/** Devis lié, exposé au client seulement quand il est consultable. */
export interface LinkedProposal {
  proposalId: string
  projectId: string
  status: 'SENT' | 'SIGNED' | 'EXPIRED'
  title: string
}

interface ChangeRequestBase {
  _id: string
  title: string
  description: string
  pageUrl: string
  priority: ChangeRequestPriority
  status: ChangeRequestStatus
  qualification: ChangeRequestQualification
  refusalReason: string
  createdByName: string
  attachments?: ChangeRequestFile[]
  replies: ChangeRequestReply[]
  statusHistory: ChangeRequestStatusEntry[]
  deliveredAt: string | null
  validatedAt: string | null
  createdAt: string
  updatedAt: string
  replyCount?: number
}

export interface ClientChangeRequest extends ChangeRequestBase {
  client: string
  createdBy: string
  project: { _id: string; name: string } | null
  linkedProposal?: LinkedProposal | null
}

export interface AdminChangeRequest extends ChangeRequestBase {
  client: { _id: string; name: string; companyName?: string; avatarUrl?: string; email?: string }
  createdBy: string
  project: { _id: string; name: string } | null
  quoteProposal: { _id: string; status: string; title: string; expiresAt: string | null } | null
}

export interface ChangeRequestStats {
  aTraiter: number
  enCours: number
}

export interface NewChangeRequestInput {
  title: string
  description: string
  pageUrl?: string
  projectId?: string
  priority?: ChangeRequestPriority
  files?: File[]
}
```

- [ ] **Step 2 : Écrire le service**

Créer `src/services/changeRequests.ts` :

```ts
import { apiFetch, apiUpload } from '../lib/api'
import type {
  AdminChangeRequest,
  ChangeRequestStats,
  ClientChangeRequest,
  NewChangeRequestInput,
} from '../types/changeRequest.types'

const CLIENT_BASE = '/api/client/change-requests'
const ADMIN_BASE = '/api/admin/change-requests'

// ─── Espace client ──────────────────────────────────────────────────────────

export function listChangeRequests(status?: string): Promise<{ changeRequests: ClientChangeRequest[] }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiFetch(`${CLIENT_BASE}${query}`)
}

export function getChangeRequest(id: string): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}`)
}

export function createChangeRequest(input: NewChangeRequestInput): Promise<{ changeRequest: ClientChangeRequest }> {
  const formData = new FormData()
  formData.append('title', input.title)
  formData.append('description', input.description)
  if (input.pageUrl) formData.append('pageUrl', input.pageUrl)
  if (input.projectId) formData.append('projectId', input.projectId)
  if (input.priority) formData.append('priority', input.priority)
  ;(input.files ?? []).forEach((file) => formData.append('files', file))
  return apiUpload(CLIENT_BASE, formData)
}

export function replyToChangeRequest(
  id: string,
  message: string,
  files: File[] = [],
): Promise<{ changeRequest: ClientChangeRequest }> {
  const formData = new FormData()
  formData.append('message', message)
  files.forEach((file) => formData.append('files', file))
  return apiUpload(`${CLIENT_BASE}/${id}/reply`, formData)
}

export function validateChangeRequest(id: string): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}/validate`, { method: 'POST' })
}

export function requestChangeRequestCorrection(
  id: string,
  comment: string,
): Promise<{ changeRequest: ClientChangeRequest }> {
  return apiFetch(`${CLIENT_BASE}/${id}/request-correction`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  })
}

export function clientFileUrl(filename: string): string {
  return `${CLIENT_BASE}/files/${encodeURIComponent(filename)}`
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export function listAdminChangeRequests(filters: {
  status?: string
  client?: string
  project?: string
}): Promise<{ changeRequests: AdminChangeRequest[] }> {
  const params = new URLSearchParams()
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.client && filters.client !== 'all') params.set('client', filters.client)
  if (filters.project && filters.project !== 'all') params.set('project', filters.project)
  const query = params.toString()
  return apiFetch(`${ADMIN_BASE}${query ? `?${query}` : ''}`)
}

export function getAdminChangeRequestStats(): Promise<ChangeRequestStats> {
  return apiFetch(`${ADMIN_BASE}/stats`)
}

export function getAdminChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}`)
}

export function replyAsAdmin(
  id: string,
  message: string,
  files: File[] = [],
): Promise<{ changeRequest: AdminChangeRequest }> {
  const formData = new FormData()
  formData.append('message', message)
  files.forEach((file) => formData.append('files', file))
  return apiUpload(`${ADMIN_BASE}/${id}/reply`, formData)
}

export function qualifyInclude(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/qualify-include`, { method: 'POST' })
}

export function qualifyQuote(
  id: string,
  payload: { projectId?: string; expiresAt?: string },
): Promise<{ changeRequest: AdminChangeRequest; proposal: { _id: string; status: string } }> {
  return apiFetch(`${ADMIN_BASE}/${id}/qualify-quote`, { method: 'POST', body: JSON.stringify(payload) })
}

export function refuseChangeRequest(id: string, reason: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/refuse`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function startChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/start`, { method: 'POST' })
}

export function deliverChangeRequest(id: string): Promise<{ changeRequest: AdminChangeRequest }> {
  return apiFetch(`${ADMIN_BASE}/${id}/deliver`, { method: 'POST' })
}

export function adminFileUrl(filename: string): string {
  return `${ADMIN_BASE}/files/${encodeURIComponent(filename)}`
}

/** Route de devis existante, réutilisée depuis le détail d'une demande. */
export function sendLinkedProposal(proposalId: string): Promise<{ proposal: { status: string } }> {
  return apiFetch(`/api/admin/quote-proposals/${proposalId}/send`, { method: 'POST' })
}
```

- [ ] **Step 3 : Typecheck**

```bash
npm run typecheck
```

Attendu : aucune sortie.

- [ ] **Step 4 : Commit**

```bash
git add src/types/changeRequest.types.ts src/services/changeRequests.ts
git commit -m "feat(demandes): types et couche service frontend"
```

---

### Task 9 : UI client — liste, formulaire, détail

Trois pages plus la navigation. Classes existantes uniquement : `portal-container`, `portal-card`, `portal-input`, `portal-badge`, `portal-list`, `client-dashboard-*`, `client-project-card-badge` + `client-status-*` (définies dans `src/pages/espace-client/ClientPortal.css`, importées par chaque page comme le fait `QuoteProposal.tsx`). Le reste est en style inline, comme le `Dashboard.tsx` existant.

**Files:**
- Create: `src/pages/espace-client/changeRequestStatus.ts` (config partagée par les trois pages et le dashboard)
- Create: `src/pages/espace-client/ChangeRequests.tsx`
- Create: `src/pages/espace-client/ChangeRequestNew.tsx`
- Create: `src/pages/espace-client/ChangeRequestDetail.tsx`
- Create: `src/pages/espace-client/ChangeRequestNew.test.tsx`
- Modify: `src/components/ClientSidebar.tsx:17-27` (`NAV_ITEMS`) et l'import lucide
- Modify: `src/App.tsx` (imports `lazy` + bloc `/espace-client`, l. 199-216)

**Interfaces:**
- Consumes : Task 8 (types + service), `useAuth` (`src/context/AuthContext`), `apiFetch` pour `GET /api/projects`.
- Produces (consommés par la Task 10) :
  - `export const CLIENT_STATUS_CONFIG: Record<ChangeRequestStatus, { label: string; className: string }>`
  - `export const ACTIVE_CLIENT_STATUSES: ChangeRequestStatus[]` (statuts non terminaux)
  - `export function formatChangeRequestDate(iso: string): string`

- [ ] **Step 1 : Écrire le test du formulaire**

Créer `src/pages/espace-client/ChangeRequestNew.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as changeRequests from '../../services/changeRequests'
import * as api from '../../lib/api'
import ChangeRequestNew from './ChangeRequestNew'

vi.mock('../../services/changeRequests')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/demandes/nouvelle']}>
      <Routes>
        <Route path="/espace-client/demandes/nouvelle" element={<ChangeRequestNew />} />
        <Route path="/espace-client/demandes/:id" element={<p>Détail de la demande</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.apiFetch).mockResolvedValue({ projects: [{ _id: 'p1', name: 'Refonte du site' }] })
  vi.mocked(changeRequests.createChangeRequest).mockResolvedValue({
    changeRequest: { _id: 'cr1' },
  } as unknown as Awaited<ReturnType<typeof changeRequests.createChangeRequest>>)
})

describe('formulaire de nouvelle demande', () => {
  it('n’envoie rien tant que le titre et la description sont vides', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /envoyer la demande/i }))

    expect(changeRequests.createChangeRequest).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/titre/i)
  })

  it('propose les projets du compte et soumet la demande, puis redirige vers le détail', async () => {
    renderPage()
    expect(await screen.findByRole('option', { name: 'Refonte du site' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/titre/i), { target: { value: 'Nouvelle page « Ateliers »' } })
    fireEvent.change(screen.getByLabelText(/décrivez/i), { target: { value: 'Présenter le calendrier.' } })
    fireEvent.change(screen.getByLabelText(/projet/i), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText(/priorité/i), { target: { value: 'HAUTE' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }))

    await waitFor(() => {
      expect(changeRequests.createChangeRequest).toHaveBeenCalledWith({
        title: 'Nouvelle page « Ateliers »',
        description: 'Présenter le calendrier.',
        pageUrl: '',
        projectId: 'p1',
        priority: 'HAUTE',
        files: [],
      })
    })
    expect(await screen.findByText('Détail de la demande')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/pages/espace-client/ChangeRequestNew.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./ChangeRequestNew"`.

- [ ] **Step 3 : Écrire la configuration de statut partagée**

Créer `src/pages/espace-client/changeRequestStatus.ts` :

```ts
import type { ChangeRequestStatus } from '../../types/changeRequest.types'

/**
 * Libellés côté client : ils décrivent ce que le client doit comprendre, pas
 * l'état interne. « A_CHIFFRER » se lit donc « Devis en préparation ».
 */
export const CLIENT_STATUS_CONFIG: Record<ChangeRequestStatus, { label: string; className: string }> = {
  SOUMISE: { label: 'Soumise', className: 'client-status-pending' },
  A_CHIFFRER: { label: 'Devis en préparation', className: 'client-status-pending' },
  PLANIFIEE: { label: 'Planifiée', className: 'client-status-active' },
  EN_COURS: { label: 'En cours', className: 'client-status-active' },
  LIVREE: { label: 'À confirmer', className: 'client-status-pending' },
  VALIDEE: { label: 'Validée', className: 'client-status-done' },
  REFUSEE: { label: 'Refusée', className: 'client-status-cancelled' },
}

export const PRIORITY_LABELS: Record<string, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
}

/** Statuts non terminaux : ceux qui vivent encore. */
export const ACTIVE_CLIENT_STATUSES: ChangeRequestStatus[] = [
  'SOUMISE',
  'A_CHIFFRER',
  'PLANIFIEE',
  'EN_COURS',
  'LIVREE',
]

/** Regroupements de la planche « Demandes — liste client ». */
export const CLIENT_STATUS_GROUPS: { key: string; label: string; statuses: ChangeRequestStatus[] | null }[] = [
  { key: 'all', label: 'Toutes', statuses: null },
  { key: 'processing', label: 'En traitement', statuses: ['SOUMISE', 'A_CHIFFRER', 'PLANIFIEE', 'EN_COURS'] },
  { key: 'action', label: 'Votre action attendue', statuses: ['LIVREE'] },
  { key: 'done', label: 'Terminées', statuses: ['VALIDEE', 'REFUSEE'] },
]

export function formatChangeRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatChangeRequestDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- [ ] **Step 4 : Écrire le formulaire**

Créer `src/pages/espace-client/ChangeRequestNew.tsx` :

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createChangeRequest } from '../../services/changeRequests'
import type { ChangeRequestPriority } from '../../types/changeRequest.types'
import './ClientPortal.css'

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 50

interface ProjectOption {
  _id: string
  name: string
}

const ChangeRequestNew = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<ChangeRequestPriority>('NORMALE')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiFetch<{ projects: ProjectOption[] }>('/api/projects')
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!title.trim()) return setError('Un titre est nécessaire pour identifier votre demande.')
    if (!description.trim()) return setError('Décrivez votre demande pour que nous puissions la qualifier.')
    if (files.length > MAX_FILES) return setError(`${MAX_FILES} fichiers au maximum.`)

    setSubmitting(true)
    try {
      const { changeRequest } = await createChangeRequest({
        title: title.trim(),
        description: description.trim(),
        pageUrl: pageUrl.trim(),
        projectId: projectId || undefined,
        priority,
        files,
      })
      navigate(`/espace-client/demandes/${changeRequest._id}`)
    } catch (err) {
      setError((err as Error).message || 'Envoi impossible')
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-container">
      <Link to="/espace-client/demandes" className="portal-link">
        ← Vos demandes
      </Link>
      <h1 style={{ marginTop: 16 }}>Nouvelle demande</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 640 }}>
        Une retouche, une évolution ? Décrivez-la : nous la qualifions et vous indiquons si elle entre dans votre
        contrat de maintenance ou si elle fait l’objet d’un devis.
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--mono-danger, #ff5c5c)' }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="portal-card" style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Titre de la demande *</span>
          <input
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex. Corriger le formulaire de contact"
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Décrivez votre demande *</span>
          <textarea
            className="portal-input"
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ce que vous souhaitez obtenir, et pourquoi."
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Page concernée</span>
          <input
            className="portal-input"
            type="url"
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder="https://votre-site.fr/la-page"
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Projet</span>
          <select className="portal-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Aucun projet / site en maintenance</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Priorité</span>
          <select
            className="portal-input"
            value={priority}
            onChange={(event) => setPriority(event.target.value as ChangeRequestPriority)}
          >
            <option value="BASSE">Basse</option>
            <option value="NORMALE">Normale</option>
            <option value="HAUTE">Haute</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>
            Pièces jointes — {MAX_FILES} fichiers max, {MAX_FILE_SIZE_MB} Mo chacun
          </span>
          <input
            className="portal-input"
            type="file"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          {files.length > 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {files.map((file) => file.name).join(' · ')}
            </span>
          )}
        </label>

        <button type="submit" className="portal-badge" disabled={submitting} style={{ padding: '12px 20px' }}>
          {submitting ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>
    </div>
  )
}

export default ChangeRequestNew
```

- [ ] **Step 5 : Lancer le test, vérifier qu'il passe**

```bash
npx vitest run src/pages/espace-client/ChangeRequestNew.test.tsx
```

Attendu : 2 tests passés.

- [ ] **Step 6 : Écrire la liste**

Créer `src/pages/espace-client/ChangeRequests.tsx` :

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listChangeRequests } from '../../services/changeRequests'
import type { ClientChangeRequest } from '../../types/changeRequest.types'
import {
  CLIENT_STATUS_CONFIG,
  CLIENT_STATUS_GROUPS,
  PRIORITY_LABELS,
  formatChangeRequestDate,
} from './changeRequestStatus'
import './ClientPortal.css'

const ClientChangeRequests = () => {
  const [changeRequests, setChangeRequests] = useState<ClientChangeRequest[]>([])
  const [group, setGroup] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listChangeRequests()
      .then((data) => setChangeRequests(data.changeRequests || []))
      .catch((err: Error) => setError(err.message || 'Chargement impossible'))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const entry of CLIENT_STATUS_GROUPS) {
      result[entry.key] = entry.statuses
        ? changeRequests.filter((request) => entry.statuses!.includes(request.status)).length
        : changeRequests.length
    }
    return result
  }, [changeRequests])

  const visible = useMemo(() => {
    const entry = CLIENT_STATUS_GROUPS.find((candidate) => candidate.key === group)
    if (!entry?.statuses) return changeRequests
    return changeRequests.filter((request) => entry.statuses!.includes(request.status))
  }, [changeRequests, group])

  return (
    <div className="portal-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
            Espace client
          </span>
          <h1 style={{ margin: '6px 0 0' }}>Vos demandes</h1>
        </div>
        <Link to="/espace-client/demandes/nouvelle" className="portal-badge" style={{ padding: '10px 18px' }}>
          + Nouvelle demande
        </Link>
      </div>

      {error && <p role="alert">{error}</p>}
      {loading && <div className="portal-spinner" />}

      {!loading && changeRequests.length === 0 && (
        <div className="client-dashboard-empty" style={{ marginTop: 32 }}>
          <div className="client-dashboard-empty-icon">✳</div>
          <h3>Aucune demande pour le moment</h3>
          <p>
            Une retouche, une évolution ? Décrivez-la, nous la qualifions sous 48 h ouvrées.
          </p>
        </div>
      )}

      {!loading && changeRequests.length > 0 && (
        <>
          <nav aria-label="Filtrer par état" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0' }}>
            {CLIENT_STATUS_GROUPS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="portal-badge"
                aria-pressed={group === entry.key}
                onClick={() => setGroup(entry.key)}
                style={{ padding: '8px 14px', opacity: group === entry.key ? 1 : 0.6 }}
              >
                {entry.label} · {counts[entry.key] ?? 0}
              </button>
            ))}
          </nav>

          <div className="portal-list">
            {visible.map((request) => {
              const status = CLIENT_STATUS_CONFIG[request.status]
              return (
                <Link
                  key={request._id}
                  to={`/espace-client/demandes/${request._id}`}
                  className="portal-card"
                  style={{ display: 'flex', gap: 16, alignItems: 'center', textDecoration: 'none' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{request.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {request.project ? request.project.name : 'Sans projet'} · soumise le{' '}
                      {formatChangeRequestDate(request.createdAt)}
                      {request.replyCount ? ` · ${request.replyCount} message(s)` : ''}
                    </div>
                  </div>
                  <span className="portal-badge">{PRIORITY_LABELS[request.priority]}</span>
                  <span className={`client-project-card-badge ${status.className}`}>{status.label}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 32, maxWidth: 720 }}>
        Une demande incluse dans votre maintenance est traitée sans frais. Les évolutions hors périmètre font l’objet
        d’un devis que vous signez en ligne avant tout démarrage.
      </p>
    </div>
  )
}

export default ClientChangeRequests
```

- [ ] **Step 7 : Écrire le détail**

Créer `src/pages/espace-client/ChangeRequestDetail.tsx` :

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/UserAvatar'
import {
  clientFileUrl,
  getChangeRequest,
  replyToChangeRequest,
  requestChangeRequestCorrection,
  validateChangeRequest,
} from '../../services/changeRequests'
import type { ClientChangeRequest } from '../../types/changeRequest.types'
import {
  CLIENT_STATUS_CONFIG,
  PRIORITY_LABELS,
  formatChangeRequestDate,
  formatChangeRequestDateTime,
} from './changeRequestStatus'
import './ClientPortal.css'

/** Frise de suivi : « Qualification » agrège l'arbitrage incluse / à chiffrer. */
const STEPS = [
  { key: 'SOUMISE', label: 'Soumise' },
  { key: 'QUALIFICATION', label: 'Qualification' },
  { key: 'PLANIFIEE', label: 'Planifiée' },
  { key: 'EN_COURS', label: 'En cours' },
  { key: 'LIVREE', label: 'Livrée' },
  { key: 'VALIDEE', label: 'Validée' },
] as const

const STEP_ORDER: Record<string, number> = {
  SOUMISE: 0,
  A_CHIFFRER: 1,
  PLANIFIEE: 2,
  EN_COURS: 3,
  LIVREE: 4,
  VALIDEE: 5,
}

const ClientChangeRequestDetail = () => {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [changeRequest, setChangeRequest] = useState<ClientChangeRequest | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [correction, setCorrection] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getChangeRequest(id)
      .then((data) => setChangeRequest(data.changeRequest))
      .catch((err: Error) => setError(err.message || 'Demande indisponible'))
  }, [id])

  useEffect(load, [load])

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    try {
      await replyToChangeRequest(id, message.trim(), files)
      setMessage('')
      setFiles([])
      load()
    } catch (err) {
      setError((err as Error).message || 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: () => Promise<{ changeRequest: ClientChangeRequest }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      setChangeRequest(result.changeRequest)
      load()
    } catch (err) {
      setError((err as Error).message || 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  if (error && !changeRequest)
    return (
      <div className="portal-container">
        <p role="alert">{error}</p>
      </div>
    )
  if (!changeRequest)
    return (
      <div className="portal-container">
        <div className="portal-spinner" />
      </div>
    )

  const status = CLIENT_STATUS_CONFIG[changeRequest.status]
  const currentStep = STEP_ORDER[changeRequest.status] ?? 0
  // Le compte peut valider ; un collaborateur invité, non.
  const isAccountOwner = user?._id === changeRequest.client
  const qualificationLabel =
    changeRequest.qualification === 'INCLUSE'
      ? 'Incluse dans votre contrat'
      : changeRequest.qualification === 'A_CHIFFRER'
        ? 'Devis lié'
        : ''

  return (
    <div className="portal-container">
      <Link to="/espace-client/demandes" className="portal-link">
        ← Vos demandes
      </Link>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>{changeRequest.title}</h1>
        <span className={`client-project-card-badge ${status.className}`}>{status.label}</span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Soumise le {formatChangeRequestDate(changeRequest.createdAt)} par {changeRequest.createdByName}
      </p>

      {error && <p role="alert">{error}</p>}

      {changeRequest.status === 'REFUSEE' ? (
        <div className="portal-card" role="status" style={{ borderColor: 'var(--mono-danger-border, #ff5c5c)' }}>
          <strong>Demande refusée</strong>
          <p style={{ margin: '8px 0 0' }}>{changeRequest.refusalReason}</p>
        </div>
      ) : (
        <ol className="portal-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, listStyle: 'none', margin: '24px 0', padding: 20 }}>
          {STEPS.map((step, index) => {
            const done = index <= currentStep
            const entry = changeRequest.statusHistory.find((history) => history.status === step.key)
            return (
              <li key={step.key} style={{ flex: '1 1 120px', opacity: done ? 1 : 0.45 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{step.label}</div>
                {step.key === 'QUALIFICATION' && qualificationLabel && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{qualificationLabel}</div>
                )}
                {entry && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {formatChangeRequestDate(entry.at)}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{changeRequest.description}</p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span>
            <strong>Projet</strong> — {changeRequest.project ? changeRequest.project.name : 'Sans projet'}
          </span>
          <span>
            <strong>Priorité</strong> — {PRIORITY_LABELS[changeRequest.priority]}
          </span>
          {changeRequest.pageUrl && (
            <span>
              <strong>Page concernée</strong> —{' '}
              <a className="portal-link" href={changeRequest.pageUrl} target="_blank" rel="noopener noreferrer">
                {changeRequest.pageUrl}
              </a>
            </span>
          )}
        </div>
        {(changeRequest.attachments ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {changeRequest.attachments!.map((file) => (
              <a key={file.filename} className="portal-link" href={clientFileUrl(file.filename)} target="_blank" rel="noopener noreferrer">
                {file.originalName}
              </a>
            ))}
          </div>
        )}
      </div>

      {changeRequest.linkedProposal && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <strong>Devis lié — {changeRequest.linkedProposal.status === 'SIGNED' ? 'signé' : 'à signer'}</strong>
          <p style={{ margin: '8px 0' }}>{changeRequest.linkedProposal.title}</p>
          <Link
            className="portal-link"
            to={`/espace-client/projets/${changeRequest.linkedProposal.projectId}/propositions/${changeRequest.linkedProposal.proposalId}`}
          >
            Voir le devis
          </Link>
        </div>
      )}

      {changeRequest.status === 'LIVREE' && (
        <div className="portal-card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <strong>Cette demande est livrée</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isAccountOwner && (
              <button
                type="button"
                className="portal-badge"
                disabled={busy}
                style={{ padding: '10px 18px' }}
                onClick={() => runAction(() => validateChangeRequest(id))}
              >
                Valider la livraison
              </button>
            )}
            <button
              type="button"
              className="portal-badge"
              style={{ padding: '10px 18px' }}
              onClick={() => setShowCorrection((previous) => !previous)}
            >
              Demander une correction
            </button>
          </div>
          {showCorrection && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="correction-comment">Que faut-il corriger ?</label>
              <textarea
                id="correction-comment"
                className="portal-input"
                rows={3}
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !correction.trim()}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  runAction(() => requestChangeRequestCorrection(id, correction.trim())).then(() => {
                    setCorrection('')
                    setShowCorrection(false)
                  })
                }
              >
                Envoyer la correction
              </button>
            </div>
          )}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Fil de la demande</h2>
        <div className="portal-list">
          {changeRequest.replies.map((reply) => (
            <div key={reply._id} className="portal-card" style={{ display: 'flex', gap: 12 }}>
              <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={32} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {reply.authorName} · {formatChangeRequestDateTime(reply.createdAt)}
                </div>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                {(reply.attachments ?? []).map((file) => (
                  <a key={file.filename} className="portal-link" href={clientFileUrl(file.filename)} target="_blank" rel="noopener noreferrer">
                    {file.originalName}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleReply} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 720 }}>
          <label htmlFor="reply-message">Écrire un message</label>
          <textarea
            id="reply-message"
            className="portal-input"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <input
            className="portal-input"
            type="file"
            multiple
            aria-label="Pièces jointes du message"
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          <button type="submit" className="portal-badge" disabled={busy} style={{ padding: '10px 18px', justifySelf: 'start' }}>
            Envoyer
          </button>
        </form>
      </section>
    </div>
  )
}

export default ClientChangeRequestDetail
```

- [ ] **Step 8 : Ajouter l'entrée de navigation client**

Dans `src/components/ClientSidebar.tsx`, ajouter `MessageSquarePlus` à l'import lucide, puis insérer dans `NAV_ITEMS` après l'entrée « Mes projets » :

```ts
  {
    to: '/espace-client/demandes',
    label: 'Demandes',
    icon: MessageSquarePlus,
    activePrefixes: ['/espace-client/demandes'],
  },
```

- [ ] **Step 9 : Déclarer les routes**

Dans `src/App.tsx`, auprès des autres imports `lazy` de l'espace client :

```tsx
const ClientChangeRequests = lazy(() => import('./pages/espace-client/ChangeRequests'))
const ClientChangeRequestNew = lazy(() => import('./pages/espace-client/ChangeRequestNew'))
const ClientChangeRequestDetail = lazy(() => import('./pages/espace-client/ChangeRequestDetail'))
```

Puis, dans le bloc `/espace-client` (après `<Route path="profil" … />`) :

La route `demandes/nouvelle` doit être déclarée **avant** `demandes/:id`, sinon « nouvelle » serait capturé comme identifiant :

```tsx
                  <Route path="demandes" element={<ClientChangeRequests />} />
                  <Route path="demandes/nouvelle" element={<ClientChangeRequestNew />} />
                  <Route path="demandes/:id" element={<ClientChangeRequestDetail />} />
```

- [ ] **Step 10 : Vérifier typecheck et tests front**

```bash
npm run typecheck && npx vitest run src/pages/espace-client
```

Attendu : typecheck sans sortie, tous les tests de `src/pages/espace-client` verts.

- [ ] **Step 11 : Commit**

```bash
git add src/pages/espace-client/changeRequestStatus.ts src/pages/espace-client/ChangeRequests.tsx src/pages/espace-client/ChangeRequestNew.tsx src/pages/espace-client/ChangeRequestDetail.tsx src/pages/espace-client/ChangeRequestNew.test.tsx src/components/ClientSidebar.tsx src/App.tsx
git commit -m "feat(demandes): espace client — liste, formulaire et détail"
```

---

### Task 10 : Dashboard client — section « Vos demandes en cours »

**Files:**
- Modify: `src/pages/espace-client/Dashboard.tsx` (`Promise.all` du `useEffect`, l. 38-45 ; insertion de la section entre `client-dashboard-stats` et `client-dashboard-projects`)
- Create: `src/pages/espace-client/Dashboard.test.tsx`

**Interfaces:**
- Consumes : `listChangeRequests` (Task 8), `CLIENT_STATUS_CONFIG` / `ACTIVE_CLIENT_STATUSES` / `formatChangeRequestDate` (Task 9).
- Produces : rien.

- [ ] **Step 1 : Écrire le test**

Créer `src/pages/espace-client/Dashboard.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../lib/api'
import * as changeRequests from '../../services/changeRequests'
import ClientDashboard from './Dashboard'

vi.mock('../../services/changeRequests')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Claire Corbel', role: 'CLIENT' } }),
}))

function makeRequest(overrides: Record<string, unknown>) {
  return {
    _id: 'cr1',
    title: 'Module de réservation',
    description: '',
    pageUrl: '',
    priority: 'NORMALE',
    status: 'EN_COURS',
    qualification: null,
    refusalReason: '',
    client: 'u1',
    createdBy: 'u1',
    createdByName: 'Claire Corbel',
    project: null,
    replies: [],
    statusHistory: [],
    deliveredAt: null,
    validatedAt: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    updatedAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(api.apiFetch).mockImplementation((path: string) => {
    if (path === '/api/projects') return Promise.resolve({ projects: [] })
    return Promise.resolve({ progress: {} })
  })
})

describe('section « Vos demandes en cours »', () => {
  it('liste jusqu’à trois demandes actives', async () => {
    vi.mocked(changeRequests.listChangeRequests).mockResolvedValue({
      changeRequests: [
        makeRequest({ _id: 'a', title: 'Demande A' }),
        makeRequest({ _id: 'b', title: 'Demande B', status: 'LIVREE' }),
        makeRequest({ _id: 'c', title: 'Demande C', status: 'SOUMISE' }),
        makeRequest({ _id: 'd', title: 'Demande D', status: 'PLANIFIEE' }),
        makeRequest({ _id: 'e', title: 'Demande terminée', status: 'VALIDEE' }),
      ],
    } as unknown as Awaited<ReturnType<typeof changeRequests.listChangeRequests>>)

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Vos demandes en cours')).toBeInTheDocument()
    expect(screen.getByText('Demande A')).toBeInTheDocument()
    expect(screen.getByText('Demande C')).toBeInTheDocument()
    expect(screen.queryByText('Demande D')).not.toBeInTheDocument()
    expect(screen.queryByText('Demande terminée')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /toutes vos demandes/i })).toHaveAttribute(
      'href',
      '/espace-client/demandes',
    )
  })

  it('masque la section quand le compte n’a aucune demande', async () => {
    vi.mocked(changeRequests.listChangeRequests).mockResolvedValue({ changeRequests: [] })

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText('Vos demandes en cours')).not.toBeInTheDocument()
  })

  it('n’empêche pas le rendu si l’appel échoue', async () => {
    vi.mocked(changeRequests.listChangeRequests).mockRejectedValue(new Error('boom'))

    render(
      <MemoryRouter>
        <ClientDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Mes projets')).toBeInTheDocument())
    expect(screen.queryByText('Vos demandes en cours')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/pages/espace-client/Dashboard.test.tsx
```

Attendu : ÉCHEC — « Vos demandes en cours » introuvable.

- [ ] **Step 3 : Charger les demandes dans le dashboard**

Dans `src/pages/espace-client/Dashboard.tsx`, ajouter les imports :

```tsx
import { listChangeRequests } from '../../services/changeRequests'
import type { ClientChangeRequest } from '../../types/changeRequest.types'
import { ACTIVE_CLIENT_STATUSES, CLIENT_STATUS_CONFIG, formatChangeRequestDate } from './changeRequestStatus'
```

Ajouter le state auprès des autres :

```tsx
  const [changeRequests, setChangeRequests] = useState<ClientChangeRequest[]>([])
```

Puis étendre le `Promise.all` du `useEffect` — l'échec de cet appel ne doit jamais casser le dashboard, comme `task-progress-all` :

```tsx
        const [projectsData, progressData, changeRequestsData] = await Promise.all([
          apiFetch<{ projects: Project[] }>('/api/projects'),
          apiFetch<{ progress: TaskProgressMap }>('/api/projects/task-progress-all').catch(() => ({ progress: {} })),
          listChangeRequests().catch(() => ({ changeRequests: [] })),
        ])
        setProjects(projectsData.projects || [])
        setTaskProgress(progressData.progress || {})
        setChangeRequests(changeRequestsData.changeRequests || [])
```

- [ ] **Step 4 : Insérer la section**

Toujours dans `Dashboard.tsx`, calculer les demandes actives auprès des autres dérivés (`activeProjects`, …) :

```tsx
  const openChangeRequests = changeRequests.filter((request) => ACTIVE_CLIENT_STATUSES.includes(request.status))
```

Puis insérer, entre la `<div className="client-dashboard-stats">…</div>` et la `<section className="client-dashboard-projects">` :

```tsx
          {changeRequests.length > 0 && (
            <section className="client-dashboard-projects">
              <div className="client-dashboard-section-header">
                <h2 className="client-dashboard-section-title">Vos demandes en cours</h2>
                <p className="client-dashboard-section-subtitle">
                  Retouches et évolutions en cours de traitement chez Venio
                </p>
              </div>

              <div className="portal-list">
                {openChangeRequests.slice(0, 3).map((request) => {
                  const status = CLIENT_STATUS_CONFIG[request.status]
                  return (
                    <Link
                      key={request._id}
                      to={`/espace-client/demandes/${request._id}`}
                      className="portal-card"
                      style={{ display: 'flex', gap: 16, alignItems: 'center', textDecoration: 'none' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{request.title}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {formatChangeRequestDate(request.createdAt)}
                        </div>
                      </div>
                      <span className={`client-project-card-badge ${status.className}`}>{status.label}</span>
                    </Link>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Link to="/espace-client/demandes" className="portal-link">
                  Toutes vos demandes →
                </Link>
                <Link to="/espace-client/demandes/nouvelle" className="portal-badge" style={{ padding: '8px 14px' }}>
                  + Nouvelle demande
                </Link>
              </div>
            </section>
          )}
```

- [ ] **Step 5 : Lancer le test, vérifier qu'il passe**

```bash
npx vitest run src/pages/espace-client/Dashboard.test.tsx
```

Attendu : 3 tests passés.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/espace-client/Dashboard.tsx src/pages/espace-client/Dashboard.test.tsx
git commit -m "feat(demandes): section « Vos demandes en cours » au dashboard client"
```

---

### Task 11 : UI admin — file, détail, badge sidebar

**Files:**
- Create: `src/pages/admin/change-requests/types.ts`
- Create: `src/pages/admin/change-requests/ChangeRequestFilters.tsx`
- Create: `src/pages/admin/change-requests/index.tsx`
- Create: `src/pages/admin/change-requests/ChangeRequestDetail.tsx`
- Create: `src/components/AdminSidebar.changeRequests.test.tsx`
- Modify: `src/components/AdminSidebar.tsx` (state + polling + rendu du badge, à côté de `pendingDecisionsCount`)
- Modify: `src/App.tsx` (2 routes admin)

**Interfaces:**
- Consumes : Task 8 (service admin), Task 2 (`PERMISSIONS.VIEW_CHANGE_REQUESTS`, entrée nav), `useConfirm` (`src/hooks/useConfirm`), `useAuth`, `hasPermission` (`src/lib/permissions`).
- Produces : `ADMIN_STATUS_CONFIG`, `ADMIN_PRIORITY_CONFIG`, `formatAdminDate` dans `src/pages/admin/change-requests/types.ts`.

- [ ] **Step 1 : Écrire le test de la sidebar**

Créer `src/components/AdminSidebar.changeRequests.test.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminSidebar from './AdminSidebar'
import * as api from '../lib/api'

const currentUser = { value: { _id: 'a1', name: 'Raphael', email: 'admin@example.test', role: 'SUPER_ADMIN', permissions: [] } }

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: currentUser.value, logout: vi.fn() }) }))
vi.mock('../context/MessagingContext', () => ({ useMessaging: () => ({ conversations: [] }) }))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

function mockStats(aTraiter: number) {
  vi.mocked(api.apiFetch).mockImplementation((path: string) => {
    if (path === '/api/admin/change-requests/stats') return Promise.resolve({ aTraiter, enCours: 0 })
    return Promise.resolve({ decisions: [] })
  })
}

afterEach(() => {
  vi.clearAllMocks()
  currentUser.value = { _id: 'a1', name: 'Raphael', email: 'admin@example.test', role: 'SUPER_ADMIN', permissions: [] }
})

describe('entrée « Demandes clients » de la sidebar admin', () => {
  it('affiche le compteur des demandes à qualifier', async () => {
    mockStats(4)
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Demandes clients')).toBeInTheDocument()
    expect(await screen.findByLabelText('4 demandes à qualifier')).toHaveTextContent('4')
  })

  it('masque le badge quand il n’y a rien à qualifier', async () => {
    mockStats(0)
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    await screen.findByText('Demandes clients')
    await waitFor(() => expect(screen.queryByLabelText(/demandes? à qualifier/)).not.toBeInTheDocument())
  })

  it('masque l’entrée à un rôle sans view_change_requests', async () => {
    mockStats(4)
    currentUser.value = {
      _id: 'r1',
      name: 'RH',
      email: 'rh@example.test',
      role: 'RH',
      permissions: [],
    } as unknown as typeof currentUser.value
    render(
      <MemoryRouter>
        <AdminSidebar collapsed={false} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText('Demandes clients')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run src/components/AdminSidebar.changeRequests.test.tsx
```

Attendu : ÉCHEC sur le badge (`4 demandes à qualifier` introuvable) — l'entrée de nav existe déjà depuis la Task 2.

- [ ] **Step 3 : Ajouter le compteur à la sidebar**

Dans `src/components/AdminSidebar.tsx`, ajouter l'import `hasPermission` :

```tsx
import { hasPermission } from '../lib/permissions'
```

Ajouter le state auprès de `pendingDecisionsCount` :

```tsx
  const [changeRequestsToQualify, setChangeRequestsToQualify] = useState(0)
```

Ajouter l'effet de polling après celui des décisions — même cadence 60 s :

```tsx
  useEffect(() => {
    if (!hasPermission(user, 'view_change_requests')) {
      setChangeRequestsToQualify(0)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const stats = await apiFetch<{ aTraiter: number }>('/api/admin/change-requests/stats')
        if (!cancelled) setChangeRequestsToQualify(stats?.aTraiter ?? 0)
      } catch {
        // silencieux
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])
```

Puis, dans le rendu de `NavLink`, après le bloc `item.to === '/admin/decisions'` :

```tsx
                      {item.to === '/admin/demandes-clients' && changeRequestsToQualify > 0 && (
                        <span
                          className="admin-sb-badge"
                          aria-label={`${changeRequestsToQualify} demande${changeRequestsToQualify > 1 ? 's' : ''} à qualifier`}
                        >
                          {changeRequestsToQualify > 99 ? '99+' : changeRequestsToQualify}
                        </span>
                      )}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

```bash
npx vitest run src/components/AdminSidebar.changeRequests.test.tsx
```

Attendu : 3 tests passés.

- [ ] **Step 5 : Écrire la configuration admin**

Créer `src/pages/admin/change-requests/types.ts` :

```ts
import type { ChangeRequestStatus } from '../../../types/changeRequest.types'

/** Libellés admin : ils décrivent l'action attendue côté Venio. */
export const ADMIN_STATUS_CONFIG: Record<ChangeRequestStatus, { label: string; color: string }> = {
  SOUMISE: { label: 'À qualifier', color: '#f59e0b' },
  A_CHIFFRER: { label: 'Devis à envoyer', color: '#8b5cf6' },
  PLANIFIEE: { label: 'Planifiée', color: '#0ea5e9' },
  EN_COURS: { label: 'En cours', color: '#0ea5e9' },
  LIVREE: { label: 'Livrée · à confirmer', color: '#f59e0b' },
  VALIDEE: { label: 'Validée', color: '#22c55e' },
  REFUSEE: { label: 'Refusée', color: '#64748b' },
}

export const ADMIN_PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  BASSE: { label: 'Basse', color: '#64748b' },
  NORMALE: { label: 'Normale', color: '#0ea5e9' },
  HAUTE: { label: 'Haute', color: '#f59e0b' },
}

export const ADMIN_STATUS_ORDER: ChangeRequestStatus[] = [
  'SOUMISE',
  'A_CHIFFRER',
  'PLANIFIEE',
  'EN_COURS',
  'LIVREE',
  'VALIDEE',
  'REFUSEE',
]

export function formatAdminDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatAdminDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
```

- [ ] **Step 6 : Écrire les filtres**

Créer `src/pages/admin/change-requests/ChangeRequestFilters.tsx` :

```tsx
import type { AdminChangeRequest } from '../../../types/changeRequest.types'
import { ADMIN_STATUS_CONFIG, ADMIN_STATUS_ORDER } from './types'

interface ChangeRequestFiltersProps {
  status: string
  client: string
  project: string
  changeRequests: AdminChangeRequest[]
  onChange: (next: { status?: string; client?: string; project?: string }) => void
}

/**
 * Les options de client et de projet sont dérivées des demandes chargées : pas
 * d'appel supplémentaire, et aucune option qui ne mènerait à zéro résultat.
 */
const ChangeRequestFilters = ({ status, client, project, changeRequests, onChange }: ChangeRequestFiltersProps) => {
  const clients = new Map<string, string>()
  const projects = new Map<string, string>()
  for (const request of changeRequests) {
    if (request.client?._id) clients.set(request.client._id, request.client.companyName || request.client.name)
    if (request.project?._id) projects.set(request.project._id, request.project.name)
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0 24px' }}>
      <select
        className="portal-input"
        aria-label="Filtrer par statut"
        value={status}
        onChange={(event) => onChange({ status: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les statuts</option>
        {ADMIN_STATUS_ORDER.map((value) => (
          <option key={value} value={value}>
            {ADMIN_STATUS_CONFIG[value].label}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label="Filtrer par client"
        value={client}
        onChange={(event) => onChange({ client: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les clients</option>
        {[...clients.entries()].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label="Filtrer par projet"
        value={project}
        onChange={(event) => onChange({ project: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les projets</option>
        {[...projects.entries()].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ChangeRequestFilters
```

- [ ] **Step 7 : Écrire la file admin**

Créer `src/pages/admin/change-requests/index.tsx` :

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '../../../components/UserAvatar'
import { getAdminChangeRequestStats, listAdminChangeRequests } from '../../../services/changeRequests'
import type { AdminChangeRequest, ChangeRequestStats } from '../../../types/changeRequest.types'
import ChangeRequestFilters from './ChangeRequestFilters'
import { ADMIN_PRIORITY_CONFIG, ADMIN_STATUS_CONFIG, formatAdminDate } from './types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const AdminChangeRequestList = () => {
  const [changeRequests, setChangeRequests] = useState<AdminChangeRequest[]>([])
  const [allRequests, setAllRequests] = useState<AdminChangeRequest[]>([])
  const [stats, setStats] = useState<ChangeRequestStats>({ aTraiter: 0, enCours: 0 })
  const [filters, setFilters] = useState({ status: 'all', client: 'all', project: 'all' })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [filtered, everything, statsData] = await Promise.all([
        listAdminChangeRequests(filters),
        listAdminChangeRequests({}),
        getAdminChangeRequestStats().catch(() => ({ aTraiter: 0, enCours: 0 })),
      ])
      setChangeRequests(filtered.changeRequests || [])
      // Les options de filtre restent stables même quand un filtre est actif.
      setAllRequests(everything.changeRequests || [])
      setStats(statsData)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="portal-container">
      <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
        Relation client
      </span>
      <h1 style={{ margin: '6px 0 16px' }}>Demandes clients</h1>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="portal-card" style={{ minWidth: 160 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.aTraiter}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>à qualifier</div>
        </div>
        <div className="portal-card" style={{ minWidth: 160 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{stats.enCours}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>en traitement</div>
        </div>
      </div>

      <ChangeRequestFilters
        status={filters.status}
        client={filters.client}
        project={filters.project}
        changeRequests={allRequests}
        onChange={(next) => setFilters((previous) => ({ ...previous, ...next }))}
      />

      {loading && <div className="portal-spinner" />}

      {!loading && changeRequests.length === 0 && <p>Aucune demande ne correspond à ces filtres.</p>}

      {!loading && changeRequests.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '10px 12px' }}>Demande</th>
              <th style={{ padding: '10px 12px' }}>Client</th>
              <th style={{ padding: '10px 12px' }}>Priorité</th>
              <th style={{ padding: '10px 12px' }}>Statut</th>
              <th style={{ padding: '10px 12px' }}>Reçue</th>
            </tr>
          </thead>
          <tbody>
            {changeRequests.map((request) => {
              const status = ADMIN_STATUS_CONFIG[request.status]
              const priority = ADMIN_PRIORITY_CONFIG[request.priority]
              return (
                <tr key={request._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px' }}>
                    <Link to={`/admin/demandes-clients/${request._id}`} style={{ fontWeight: 700 }}>
                      {request.title}
                    </Link>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      {request.project ? request.project.name : 'Sans projet'}
                      {request.quoteProposal ? ' · devis lié' : ''}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <UserAvatar name={request.client?.name || '?'} avatarUrl={request.client?.avatarUrl} size={24} />
                      {request.client?.companyName || request.client?.name}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: priority?.color }}>{priority?.label}</td>
                  <td style={{ padding: '12px', color: status.color }}>{status.label}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{formatAdminDate(request.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default AdminChangeRequestList
```

- [ ] **Step 8 : Écrire le détail admin**

Créer `src/pages/admin/change-requests/ChangeRequestDetail.tsx` :

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { hasPermission } from '../../../lib/permissions'
import { apiFetch } from '../../../lib/api'
import UserAvatar from '../../../components/UserAvatar'
import {
  adminFileUrl,
  deliverChangeRequest,
  getAdminChangeRequest,
  qualifyInclude,
  qualifyQuote,
  refuseChangeRequest,
  replyAsAdmin,
  sendLinkedProposal,
  startChangeRequest,
} from '../../../services/changeRequests'
import type { AdminChangeRequest } from '../../../types/changeRequest.types'
import { ADMIN_PRIORITY_CONFIG, ADMIN_STATUS_CONFIG, formatAdminDate, formatAdminDateTime } from './types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

interface ProjectOption {
  _id: string
  name: string
}

const AdminChangeRequestDetail = () => {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const canManage = hasPermission(user, 'manage_change_requests')
  const canBill = hasPermission(user, 'manage_billing')

  const [changeRequest, setChangeRequest] = useState<AdminChangeRequest | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteProjectId, setQuoteProjectId] = useState('')
  const [quoteExpiresAt, setQuoteExpiresAt] = useState('')
  const [showRefusal, setShowRefusal] = useState(false)
  const [refusalReason, setRefusalReason] = useState('')

  const load = useCallback(() => {
    getAdminChangeRequest(id)
      .then((data) => {
        setChangeRequest(data.changeRequest)
        setQuoteProjectId(data.changeRequest.project?._id || '')
      })
      .catch((err: Error) => setError(err.message || 'Demande indisponible'))
  }, [id])

  useEffect(load, [load])

  // Liste des projets du compte, nécessaire quand la demande n'a pas de projet.
  useEffect(() => {
    if (!changeRequest?.client?._id) return
    // La route admin filtre par `clientId` (et non `client`).
    apiFetch<{ projects: ProjectOption[] }>(`/api/admin/projects?clientId=${changeRequest.client._id}`)
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [changeRequest?.client?._id])

  const run = async (action: () => Promise<{ changeRequest: AdminChangeRequest }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      setChangeRequest(result.changeRequest)
      load()
    } catch (err) {
      setError((err as Error).message || 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    await run(async () => {
      const result = await replyAsAdmin(id, message.trim(), files)
      setMessage('')
      setFiles([])
      return result
    })
  }

  if (error && !changeRequest)
    return (
      <div className="portal-container">
        <p role="alert">{error}</p>
      </div>
    )
  if (!changeRequest)
    return (
      <div className="portal-container">
        <div className="portal-spinner" />
      </div>
    )

  const status = ADMIN_STATUS_CONFIG[changeRequest.status]

  return (
    <div className="portal-container">
      {/* useConfirm renvoie un ÉLÉMENT JSX (ou null), pas un composant. */}
      {ConfirmDialog}
      <Link to="/admin/demandes-clients" className="portal-link">
        ← Demandes clients
      </Link>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{changeRequest.title}</h1>
        <span className="portal-badge" style={{ color: status.color }}>
          {status.label}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        {changeRequest.client?.companyName || changeRequest.client?.name} ·{' '}
        {changeRequest.project ? changeRequest.project.name : 'Sans projet'} · priorité{' '}
        {ADMIN_PRIORITY_CONFIG[changeRequest.priority]?.label} · reçue le {formatAdminDate(changeRequest.createdAt)}
      </p>

      {error && <p role="alert">{error}</p>}

      <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{changeRequest.description}</p>
        {changeRequest.pageUrl && (
          <a className="portal-link" href={changeRequest.pageUrl} target="_blank" rel="noopener noreferrer">
            {changeRequest.pageUrl}
          </a>
        )}
        {(changeRequest.attachments ?? []).map((file) => (
          <a key={file.filename} className="portal-link" href={adminFileUrl(file.filename)} target="_blank" rel="noopener noreferrer">
            {file.originalName}
          </a>
        ))}
      </div>

      <ol className="portal-card" style={{ listStyle: 'none', display: 'grid', gap: 6, margin: '16px 0', padding: 20 }}>
        {changeRequest.statusHistory.map((entry, index) => (
          <li key={`${entry.status}-${index}`} style={{ fontSize: '0.8rem' }}>
            <strong>{ADMIN_STATUS_CONFIG[entry.status]?.label ?? entry.status}</strong> ·{' '}
            {formatAdminDateTime(entry.at)} · {entry.byName}
            {entry.note ? ` — ${entry.note}` : ''}
          </li>
        ))}
      </ol>

      {changeRequest.status === 'SOUMISE' && canManage && (
        <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
          <strong>Qualifier la demande</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Inclure cette demande ?',
                  message: 'Elle passera directement en « Planifiée », sans devis.',
                })
                if (ok) run(() => qualifyInclude(id))
              }}
            >
              Incluse dans la maintenance
            </button>
            {canBill && (
              <button
                type="button"
                className="portal-badge"
                style={{ padding: '10px 18px' }}
                onClick={() => setShowQuoteForm((previous) => !previous)}
              >
                À chiffrer — créer le devis
              </button>
            )}
            <button
              type="button"
              className="portal-badge"
              style={{ padding: '10px 18px' }}
              onClick={() => setShowRefusal((previous) => !previous)}
            >
              Refuser avec motif
            </button>
          </div>

          {showQuoteForm && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="quote-project">Projet du devis</label>
              <select
                id="quote-project"
                className="portal-input"
                value={quoteProjectId}
                onChange={(event) => setQuoteProjectId(event.target.value)}
              >
                <option value="">Sélectionner un projet</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <label htmlFor="quote-expires">Valable jusqu’au (optionnel)</label>
              <input
                id="quote-expires"
                className="portal-input"
                type="date"
                value={quoteExpiresAt}
                onChange={(event) => setQuoteExpiresAt(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !quoteProjectId}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  run(async () => {
                    const result = await qualifyQuote(id, {
                      projectId: quoteProjectId,
                      expiresAt: quoteExpiresAt ? new Date(quoteExpiresAt).toISOString() : undefined,
                    })
                    setShowQuoteForm(false)
                    return result
                  })
                }
              >
                Créer le devis prérempli
              </button>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>
                À la signature du client, la demande passera automatiquement en « Planifiée ».
              </p>
            </div>
          )}

          {showRefusal && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="refusal-reason">Motif du refus</label>
              <textarea
                id="refusal-reason"
                className="portal-input"
                rows={3}
                value={refusalReason}
                onChange={(event) => setRefusalReason(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !refusalReason.trim()}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  run(async () => {
                    const result = await refuseChangeRequest(id, refusalReason.trim())
                    setShowRefusal(false)
                    setRefusalReason('')
                    return result
                  })
                }
              >
                Refuser la demande
              </button>
            </div>
          )}
        </div>
      )}

      {changeRequest.status === 'A_CHIFFRER' && canManage && (
        <div className="portal-card" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <strong>Devis lié — {changeRequest.quoteProposal?.status ?? 'inconnu'}</strong>
          {changeRequest.project && (
            <Link className="portal-link" to={`/admin/projets/${changeRequest.project._id}`}>
              Ouvrir le projet {changeRequest.project.name}
            </Link>
          )}
          {canBill && changeRequest.quoteProposal?.status === 'DRAFT' && (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px', justifySelf: 'start' }}
              onClick={async () => {
                setBusy(true)
                try {
                  await sendLinkedProposal(changeRequest.quoteProposal!._id)
                  load()
                } catch (err) {
                  setError((err as Error).message || 'Envoi impossible')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Envoyer au client
            </button>
          )}
          <button
            type="button"
            className="portal-badge"
            style={{ padding: '10px 18px', justifySelf: 'start' }}
            onClick={() => setShowRefusal((previous) => !previous)}
          >
            Refuser (devis expiré ou décliné)
          </button>
          {showRefusal && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="refusal-reason-quote">Motif du refus</label>
              <textarea
                id="refusal-reason-quote"
                className="portal-input"
                rows={3}
                value={refusalReason}
                onChange={(event) => setRefusalReason(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !refusalReason.trim()}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  run(async () => {
                    const result = await refuseChangeRequest(id, refusalReason.trim())
                    setShowRefusal(false)
                    setRefusalReason('')
                    return result
                  })
                }
              >
                Refuser la demande
              </button>
            </div>
          )}
        </div>
      )}

      {canManage && (changeRequest.status === 'PLANIFIEE' || changeRequest.status === 'EN_COURS') && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          {changeRequest.status === 'PLANIFIEE' ? (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={() => run(() => startChangeRequest(id))}
            >
              Démarrer
            </button>
          ) : (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={() => run(() => deliverChangeRequest(id))}
            >
              Marquer livrée
            </button>
          )}
        </div>
      )}

      {changeRequest.status === 'LIVREE' && (
        <p className="portal-card" role="status" style={{ marginTop: 16 }}>
          En attente de validation client.
        </p>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>Fil de la demande</h2>
        <div className="portal-list">
          {changeRequest.replies.map((reply) => (
            <div key={reply._id} className="portal-card" style={{ display: 'flex', gap: 12 }}>
              <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={32} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {reply.authorName} · {formatAdminDateTime(reply.createdAt)}
                </div>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                {(reply.attachments ?? []).map((file) => (
                  <a key={file.filename} className="portal-link" href={adminFileUrl(file.filename)} target="_blank" rel="noopener noreferrer">
                    {file.originalName}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {canManage && (
          <form onSubmit={handleReply} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 720 }}>
            <label htmlFor="admin-reply">Répondre au client</label>
            <textarea
              id="admin-reply"
              className="portal-input"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <input
              className="portal-input"
              type="file"
              multiple
              aria-label="Pièces jointes de la réponse"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
            />
            <button type="submit" className="portal-badge" disabled={busy} style={{ padding: '10px 18px', justifySelf: 'start' }}>
              Envoyer
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default AdminChangeRequestDetail
```

- [ ] **Step 9 : Déclarer les routes admin**

Dans `src/App.tsx`, auprès des autres imports `lazy` admin :

```tsx
const AdminChangeRequests = lazy(() => import('./pages/admin/change-requests'))
const AdminChangeRequestDetail = lazy(() => import('./pages/admin/change-requests/ChangeRequestDetail'))
```

Puis, dans le bloc `/admin`, à côté de la route `tickets` :

```tsx
                  <Route
                    path="demandes-clients"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_CHANGE_REQUESTS} redirectTo="/admin">
                        <AdminChangeRequests />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="demandes-clients/:id"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_CHANGE_REQUESTS} redirectTo="/admin">
                        <AdminChangeRequestDetail />
                      </RequirePermission>
                    }
                  />
```

- [ ] **Step 10 : Vérifier**

```bash
npm run typecheck && npx vitest run src/components/AdminSidebar.changeRequests.test.tsx
```

Attendu : typecheck sans sortie, 3 tests passés.

- [ ] **Step 11 : Commit**

```bash
git add src/pages/admin/change-requests src/components/AdminSidebar.tsx src/components/AdminSidebar.changeRequests.test.tsx src/App.tsx
git commit -m "feat(demandes): file admin, page de qualification et badge sidebar"
```

---

### Task 12 : Vérification de bout en bout

Aucune ligne de code produite ici : uniquement des commandes et leurs sorties attendues. Ne déclarer le chantier terminé qu'après avoir vu chaque sortie.

**Files:** aucun (sauf correctifs révélés par la vérification).

- [ ] **Step 1 : Suite backend complète**

```bash
npm --prefix backend test
```

Attendu : 0 test en échec. Les six fichiers `change-request-*.test.ts` sont présents dans la sortie, ainsi que `rbac-matrix.test.ts` et les quatre `quote-proposal-*.test.ts`.

- [ ] **Step 2 : Suite frontend complète**

```bash
npm run test:frontend
```

Attendu : 0 test en échec, dont `ChangeRequestNew.test.tsx`, `Dashboard.test.tsx`, `AdminSidebar.changeRequests.test.tsx` et l'`AdminSidebar.test.tsx` existant.

- [ ] **Step 3 : Typechecks**

```bash
npm run typecheck:all
```

Attendu : aucune sortie (exit 0).

- [ ] **Step 4 : Lint**

```bash
npm run lint && npm --prefix backend run lint
```

Attendu : aucune erreur. Corriger les avertissements introduits par ce chantier uniquement.

- [ ] **Step 5 : Revue de couverture de la spec**

Relire `docs/superpowers/specs/2026-08-26-demandes-changement-design.md` section par section et vérifier point par point :
- chaque ligne du tableau des transitions a une route et un test ;
- chaque ligne du tableau des notifications a un appel et un destinataire conformes ;
- les trois écarts assumés sont bien assumés (pas de champ `reference`, pas de priorité `URGENTE`, `AuditLog` étendu alors que la spec le disait souple).

- [ ] **Step 6 : Invoquer superpowers:verification-before-completion**

Suivre le skill et ne rien annoncer comme terminé sans la sortie de commande correspondante.

- [ ] **Step 7 : Commit final s'il reste des correctifs**

```bash
git add -A
git commit -m "test(demandes): vérification de bout en bout"
```
