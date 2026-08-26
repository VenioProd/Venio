# Pipeline d'étapes de production + validations client — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque projet un pipeline d'étapes ordonnées (`ProjectPhase`), visibles par le client sous forme de timeline, avec des jalons que le client valide nominativement ou pour lesquels il demande des retouches, le verrouillage des transitions étant appliqué côté backend.

**Architecture:** Nouveau modèle Mongoose `ProjectPhase` (document séparé référençant `Project`, pattern `ProjectSection`). Une lib `backend/src/lib/projectPhases.ts` centralise la règle de verrouillage et le tableau des transitions — unique source de vérité partagée entre le sous-router admin (`backend/src/routes/admin/projects/phases.ts`) et le router client (`backend/src/routes/client/projectPhases.ts`). Côté frontend, une timeline dans l'onglet « Avancement » de l'espace client et un onglet « Étapes » dans le détail projet admin.

**Tech Stack:** TypeScript ESM (imports avec extension `.js`), Express 5, Mongoose 8, Vitest + supertest + mongodb-memory-server côté backend ; React 18 + Vitest/jsdom + @testing-library/react côté frontend.

**Spec de référence :** [docs/superpowers/specs/2026-08-26-pipeline-etapes-design.md](../specs/2026-08-26-pipeline-etapes-design.md) — elle fait foi en cas de doute.

## Global Constraints

- **Langue** : tout le code utilisateur (libellés UI, `summary` d'activité, titres/messages de notification, messages d'erreur API) est en **français correct et accentué**. Les commentaires de code suivent la densité du fichier voisin.
- **Enums métier** : français majuscules (`A_VENIR`, `EN_COURS`, `EN_ATTENTE_VALIDATION`, `TERMINEE`) — convention existante du dépôt.
- **Imports backend** : ESM Node, extension `.js` obligatoire même pour du TypeScript (`import Project from '../../../models/Project.js'`).
- **Codes d'erreur API** (valeurs exactes, jamais reformulées) : `PHASE_LOCKED`, `VALIDATION_NOT_REQUIRED`, `CLIENT_VALIDATION_REQUIRED`, `VALIDATED_PHASE_IMMUTABLE`, `INVALID_TRANSITION`, `OWNER_REQUIRED`, `COMMENT_REQUIRED`, `INVALID_LINKED_ITEMS`, `INVALID_PHASE_LIST`, `REVISION_ALREADY_RESOLVED`. Format de réponse : `{ error, code }`.
- **Permissions** (valeurs exactes) : `view_phases`, `manage_phases`. Clés : `VIEW_PHASES`, `MANAGE_PHASES`.
- **Types de notification** (valeurs exactes) : `PHASE_VALIDATION_REQUESTED`, `PHASE_VALIDATED`, `PHASE_REVISION_REQUESTED`.
- **Actions d'activité** (valeurs exactes) : `PHASE_CREATED`, `PHASE_UPDATED`, `PHASE_DELETED`, `PHASE_STATUS_CHANGED`, `PHASE_VALIDATION_REQUESTED`, `PHASE_VALIDATED`, `PHASE_REVISION_REQUESTED`, `PHASE_REVISION_RESOLVED`.
- **Libellés de statut UI** : `A_VENIR` → « À venir », `EN_COURS` → « En cours », `EN_ATTENTE_VALIDATION` → « En attente de votre validation » (client) / « En attente de validation client » (admin), `TERMINEE` → « Terminée ».
- **Onglets** : client `?tab=progress` (« Avancement »), admin `?tab=phases` (« Étapes »).
- **Style portail** : thème MONOLITHE (`src/styles/monolithe-portal.css`) — angles droits (jamais de `border-radius` neuf), aucune ombre, police Archivo, accent sky `#0ea5e9`. Le nouveau CSS réutilise les tokens (`var(--bg-card)`, `var(--border-color)`, `var(--primary)`, `var(--text-muted)`).
- **Hors périmètre absolu** : demandes de changement, coffre documentaire, emails transactionnels, routes agent pour les étapes, réouverture d'un jalon validé.
- **Commandes de vérification** : `cd backend && npm run typecheck && npm test` ; à la racine `npm run typecheck && npm test`.

---

### Task 1: Enums, types partagés et modèle `ProjectPhase`

**Files:**
- Modify: `backend/src/types/enums.ts` (bloc `// ─── Project ───`)
- Modify: `backend/src/types/models/project.ts`
- Create: `backend/src/models/ProjectPhase.ts`
- Test: `backend/src/models/ProjectPhase.test.ts`

**Interfaces:**
- Consumes: rien (première tâche).
- Produits pour les tâches suivantes :
  - `PhaseStatus = 'A_VENIR' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'TERMINEE'` (`backend/src/types/enums.ts`)
  - `IPhaseValidation { validatedBy: Types.ObjectId | null; validatedByName: string; validatedAt: Date | null; comment: string }`
  - `IPhaseRevisionRequest { _id: Types.ObjectId; requestedBy: Types.ObjectId; requestedByName: string; comment: string; createdAt: Date; resolvedAt: Date | null; resolvedBy: Types.ObjectId | null }`
  - `IProjectPhase extends Document { project; title; description; order; dueAt; status; requiresClientValidation; linkedItems; validation; revisionRequests; createdBy; createdAt; updatedAt }`
  - `export default mongoose.model<IProjectPhase>('ProjectPhase', projectPhaseSchema)` dans `backend/src/models/ProjectPhase.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/models/ProjectPhase.test.ts` :

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../__tests__/helpers/mongoTestEnv.js'
import ProjectPhase from './ProjectPhase.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

const baseFields = () => ({
  project: new mongoose.Types.ObjectId(),
  title: 'Maquettes',
  createdBy: new mongoose.Types.ObjectId(),
})

describe('ProjectPhase', () => {
  it('applique les valeurs par défaut du pipeline', async () => {
    const phase = await ProjectPhase.create(baseFields())

    expect(phase.status).toBe('A_VENIR')
    expect(phase.order).toBe(0)
    expect(phase.description).toBe('')
    expect(phase.dueAt).toBeNull()
    expect(phase.requiresClientValidation).toBe(false)
    expect(phase.linkedItems).toHaveLength(0)
    expect(phase.revisionRequests).toHaveLength(0)
    expect(phase.validation.validatedAt).toBeNull()
    expect(phase.validation.validatedBy).toBeNull()
    expect(phase.validation.validatedByName).toBe('')
    expect(phase.validation.comment).toBe('')
  })

  it('refuse un statut hors enum', async () => {
    await expect(ProjectPhase.create({ ...baseFields(), status: 'BROUILLON' })).rejects.toThrow()
  })

  it('exige project, title et createdBy', async () => {
    await expect(ProjectPhase.create({ title: 'Orpheline' })).rejects.toThrow()
  })

  it('stocke une validation nominative horodatée', async () => {
    const validator = new mongoose.Types.ObjectId()
    const validatedAt = new Date('2026-08-20T10:00:00.000Z')
    const phase = await ProjectPhase.create({
      ...baseFields(),
      status: 'TERMINEE',
      validation: { validatedBy: validator, validatedByName: 'Claire Corbel', validatedAt, comment: 'Parfait' },
    })

    const reloaded = await ProjectPhase.findById(phase._id)
    expect(String(reloaded!.validation.validatedBy)).toBe(String(validator))
    expect(reloaded!.validation.validatedByName).toBe('Claire Corbel')
    expect(reloaded!.validation.validatedAt!.toISOString()).toBe(validatedAt.toISOString())
    expect(reloaded!.validation.comment).toBe('Parfait')
  })

  it('empile des demandes de retouches identifiées et horodatées', async () => {
    const author = new mongoose.Types.ObjectId()
    const phase = await ProjectPhase.create(baseFields())
    phase.revisionRequests.push({
      requestedBy: author,
      requestedByName: 'Claire Corbel',
      comment: 'Le header est trop dense',
    } as never)
    await phase.save()

    const reloaded = await ProjectPhase.findById(phase._id)
    expect(reloaded!.revisionRequests).toHaveLength(1)
    const revision = reloaded!.revisionRequests[0]
    expect(revision._id).toBeDefined()
    expect(revision.comment).toBe('Le header est trop dense')
    expect(revision.requestedByName).toBe('Claire Corbel')
    expect(revision.createdAt).toBeInstanceOf(Date)
    expect(revision.resolvedAt).toBeNull()
    expect(revision.resolvedBy).toBeNull()
  })

  it('exige un commentaire sur une demande de retouches', async () => {
    const phase = await ProjectPhase.create(baseFields())
    phase.revisionRequests.push({ requestedBy: new mongoose.Types.ObjectId(), requestedByName: 'X' } as never)
    await expect(phase.save()).rejects.toThrow()
  })

  it('indexe le tri par projet et ordre', () => {
    const indexes = ProjectPhase.schema.indexes()
    expect(indexes.some(([fields]) => fields.project === 1 && fields.order === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/models/ProjectPhase.test.ts
```

Attendu : ÉCHEC — `Cannot find module './ProjectPhase.js'`.

- [ ] **Step 3: Ajouter l'enum `PhaseStatus`**

Dans `backend/src/types/enums.ts`, juste après la ligne `export type ProjectMemberRole = 'VIEWER' | 'EDITOR'` :

```ts
export type PhaseStatus = 'A_VENIR' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'TERMINEE'
```

- [ ] **Step 4: Ajouter les interfaces dans `backend/src/types/models/project.ts`**

Étendre l'import d'enums en tête de fichier pour inclure `PhaseStatus` :

```ts
import type {
  ProjectStatus,
  ProjectPriority,
  BillingStatus,
  ItemType,
  ItemStatus,
  ProjectMemberRole,
  PhaseStatus,
} from '../enums.js'
```

Puis ajouter, après le bloc `// ─── ProjectSection ───` :

```ts
// ─── ProjectPhase ───
export interface IPhaseValidation {
  validatedBy: Types.ObjectId | null
  validatedByName: string
  validatedAt: Date | null
  comment: string
}

export interface IPhaseRevisionRequest {
  _id: Types.ObjectId
  requestedBy: Types.ObjectId
  requestedByName: string
  comment: string
  createdAt: Date
  resolvedAt: Date | null
  resolvedBy: Types.ObjectId | null
}

export interface IProjectPhase extends Document {
  project: Types.ObjectId
  title: string
  description: string
  order: number
  dueAt: Date | null
  status: PhaseStatus
  requiresClientValidation: boolean
  linkedItems: Types.ObjectId[]
  validation: IPhaseValidation
  revisionRequests: IPhaseRevisionRequest[]
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
```

> `backend/src/types/models/index.ts` ré-exporte déjà `./project.js` en bloc — rien à y ajouter. Vérifier avec `grep -n "project.js" backend/src/types/models/index.ts` ; si l'export est nominatif, y ajouter `IProjectPhase`, `IPhaseValidation`, `IPhaseRevisionRequest`.

- [ ] **Step 5: Créer le modèle**

Créer `backend/src/models/ProjectPhase.ts` :

```ts
import mongoose from 'mongoose'
import type { IProjectPhase } from '../types/models/index.js'

// Même esprit que le signatureSchema de QuoteProposal : l'identité du valideur
// est dénormalisée dans le document pour rester lisible même si le compte change.
const validationSchema = new mongoose.Schema(
  {
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validatedByName: { type: String, default: '' },
    validatedAt: { type: Date, default: null },
    comment: { type: String, default: '' },
  },
  { _id: false },
)

const revisionRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, default: '' },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
)

const projectPhaseSchema = new mongoose.Schema<IProjectPhase>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    dueAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['A_VENIR', 'EN_COURS', 'EN_ATTENTE_VALIDATION', 'TERMINEE'],
      default: 'A_VENIR',
    },
    requiresClientValidation: { type: Boolean, default: false },
    linkedItems: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProjectItem' }], default: [] },
    validation: { type: validationSchema, default: () => ({}) },
    revisionRequests: { type: [revisionRequestSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

// Tri du pipeline : toutes les lectures trient par ordre croissant sur un projet.
projectPhaseSchema.index({ project: 1, order: 1 })

export default mongoose.model<IProjectPhase>('ProjectPhase', projectPhaseSchema)
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/models/ProjectPhase.test.ts
```

Attendu : PASS (6 tests).

- [ ] **Step 7: Typecheck puis commit**

```bash
cd backend && npm run typecheck
```

```bash
git add backend/src/types/enums.ts backend/src/types/models/project.ts backend/src/models/ProjectPhase.ts backend/src/models/ProjectPhase.test.ts && git commit -m "feat(phases): modèle ProjectPhase et types du pipeline d'étapes"
```

---

### Task 2: Synchroniser les enums Notification et ActivityLog

**Files:**
- Modify: `backend/src/types/enums.ts` (`ActivityAction`, `NotificationType`)
- Modify: `backend/src/models/Notification.ts` (enum du schéma)
- Modify: `backend/src/models/ActivityLog.ts` (enum du schéma)
- Modify: `backend/src/models/NotificationPreferences.ts` (`NOTIFICATION_TYPES`)
- Modify: `src/services/notificationPreferences.ts` (type `NotificationType` + `NOTIFICATION_TYPE_LABELS`)
- Test: `backend/src/__tests__/phase-notification-types.test.ts`

**Interfaces:**
- Consumes: rien de la Task 1.
- Produit : les trois types `PHASE_VALIDATION_REQUESTED`, `PHASE_VALIDATED`, `PHASE_REVISION_REQUESTED` utilisables par `createNotification` (Tasks 6 et 7) et les huit actions `PHASE_*` utilisables par `logActivity` (Tasks 5, 6, 7).

> **Friction connue n°1 de la spec** : l'enum du modèle `Notification` n'accepte qu'une douzaine de types alors que l'union `NotificationType` en compte ~50. Un type absent de l'enum fait échouer la création en silence (avalée par les `.catch`). Le test ci-dessous verrouille la synchro pour les trois nouveaux types. La resynchronisation complète de l'enum reste hors périmètre.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/phase-notification-types.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Notification from '../models/Notification.js'
import ActivityLog from '../models/ActivityLog.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import { createNotification } from '../lib/notifications.js'

const PHASE_NOTIFICATION_TYPES = [
  'PHASE_VALIDATION_REQUESTED',
  'PHASE_VALIDATED',
  'PHASE_REVISION_REQUESTED',
] as const

const PHASE_ACTIVITY_ACTIONS = [
  'PHASE_CREATED',
  'PHASE_UPDATED',
  'PHASE_DELETED',
  'PHASE_STATUS_CHANGED',
  'PHASE_VALIDATION_REQUESTED',
  'PHASE_VALIDATED',
  'PHASE_REVISION_REQUESTED',
  'PHASE_REVISION_RESOLVED',
] as const

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('synchronisation des enums de notification', () => {
  it('déclare les types d’étape dans l’enum du modèle Notification', () => {
    const enumValues = Notification.schema.path('type').options.enum as string[]
    for (const type of PHASE_NOTIFICATION_TYPES) {
      expect(enumValues, `${type} doit figurer dans l’enum du modèle Notification`).toContain(type)
    }
  })

  it('expose les types d’étape dans les préférences de notification', () => {
    for (const type of PHASE_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPES).toContain(type)
    }
  })

  it('persiste réellement une notification de chaque type d’étape', async () => {
    const recipient = new mongoose.Types.ObjectId()
    for (const type of PHASE_NOTIFICATION_TYPES) {
      await createNotification({ recipient, type, title: `Test ${type}` })
    }

    const stored = await Notification.find({ recipient }).select('type').lean()
    expect(stored.map((n) => n.type).sort()).toEqual([...PHASE_NOTIFICATION_TYPES].sort())
  })
})

describe('synchronisation des actions d’activité', () => {
  it('déclare les actions d’étape dans l’enum du modèle ActivityLog', () => {
    const enumValues = ActivityLog.schema.path('action').options.enum as string[]
    for (const action of PHASE_ACTIVITY_ACTIONS) {
      expect(enumValues, `${action} doit figurer dans l’enum du modèle ActivityLog`).toContain(action)
    }
  })

  it('persiste réellement chaque action d’étape', async () => {
    const project = new mongoose.Types.ObjectId()
    const actor = new mongoose.Types.ObjectId()
    for (const action of PHASE_ACTIVITY_ACTIONS) {
      await ActivityLog.create({ project, action, actor, summary: `Test ${action}` })
    }
    expect(await ActivityLog.countDocuments({ project })).toBe(PHASE_ACTIVITY_ACTIONS.length)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/phase-notification-types.test.ts
```

Attendu : ÉCHEC — `PHASE_VALIDATION_REQUESTED doit figurer dans l'enum du modèle Notification`.

- [ ] **Step 3: Étendre les unions de `backend/src/types/enums.ts`**

À la fin de `ActivityAction` (après `| 'BILLING_CREATED'`) :

```ts
  // Étapes de production (pipeline projet)
  | 'PHASE_CREATED'
  | 'PHASE_UPDATED'
  | 'PHASE_DELETED'
  | 'PHASE_STATUS_CHANGED'
  | 'PHASE_VALIDATION_REQUESTED'
  | 'PHASE_VALIDATED'
  | 'PHASE_REVISION_REQUESTED'
  | 'PHASE_REVISION_RESOLVED'
```

À la fin de `NotificationType` (après `| 'BRIEF_STATUS_CHANGED'`) :

```ts
  // Étapes de production (pipeline projet)
  | 'PHASE_VALIDATION_REQUESTED'
  | 'PHASE_VALIDATED'
  | 'PHASE_REVISION_REQUESTED'
```

- [ ] **Step 4: Étendre les enums des modèles**

Dans `backend/src/models/Notification.ts`, ajouter à la fin du tableau `enum` (après `'SENSITIVE_ACTION_EXECUTED',`) :

```ts
        'PHASE_VALIDATION_REQUESTED',
        'PHASE_VALIDATED',
        'PHASE_REVISION_REQUESTED',
```

Dans `backend/src/models/ActivityLog.ts`, ajouter à la fin du tableau `enum` (après `'BILLING_CREATED',`) :

```ts
        'PHASE_CREATED',
        'PHASE_UPDATED',
        'PHASE_DELETED',
        'PHASE_STATUS_CHANGED',
        'PHASE_VALIDATION_REQUESTED',
        'PHASE_VALIDATED',
        'PHASE_REVISION_REQUESTED',
        'PHASE_REVISION_RESOLVED',
```

- [ ] **Step 5: Étendre les préférences backend**

Dans `backend/src/models/NotificationPreferences.ts`, compléter `NOTIFICATION_TYPES` (après `'INTERNAL_MESSAGE',`) :

```ts
  'PHASE_VALIDATION_REQUESTED',
  'PHASE_VALIDATED',
  'PHASE_REVISION_REQUESTED',
```

- [ ] **Step 6: Étendre les préférences frontend**

Dans `src/services/notificationPreferences.ts`, compléter le type puis les libellés :

```ts
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'PROJECT_UPDATE'
  | 'DOCUMENT_ADDED'
  | 'TICKET_CREATED'
  | 'TICKET_REPLY'
  | 'INTERNAL_MESSAGE'
  | 'PHASE_VALIDATION_REQUESTED'
  | 'PHASE_VALIDATED'
  | 'PHASE_REVISION_REQUESTED'
```

Et dans `NOTIFICATION_TYPE_LABELS`, après l'entrée `INTERNAL_MESSAGE` :

```ts
  PHASE_VALIDATION_REQUESTED: {
    label: 'Validation d’étape attendue',
    description: 'Une étape de production attend ta validation.',
  },
  PHASE_VALIDATED: {
    label: 'Étape validée',
    description: 'Un client a validé une étape de production.',
  },
  PHASE_REVISION_REQUESTED: {
    label: 'Retouches demandées',
    description: 'Un client a demandé des retouches sur une étape.',
  },
```

- [ ] **Step 7: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/__tests__/phase-notification-types.test.ts
```

Attendu : PASS (4 tests).

- [ ] **Step 8: Vérifier la non-régression des suites voisines puis commit**

```bash
cd backend && npm run typecheck && npx vitest run src/__tests__/notifications-dedup.test.ts src/__tests__/activityLog.test.ts
```

```bash
git add backend/src/types/enums.ts backend/src/models/Notification.ts backend/src/models/ActivityLog.ts backend/src/models/NotificationPreferences.ts backend/src/__tests__/phase-notification-types.test.ts src/services/notificationPreferences.ts && git commit -m "feat(phases): types de notification et actions d'activité des étapes"
```

---

### Task 3: Permissions RBAC `view_phases` / `manage_phases`

**Files:**
- Modify: `rbac-matrix.json` (`permissions` + `rolePermissions`)
- Modify: `backend/src/lib/permissions.ts` (`PERMISSIONS` + `ROLE_PERMISSIONS`)
- Modify: `backend/src/types/enums.ts` (type `Permission`)
- Modify: `src/lib/__tests__/permissions-sync.test.ts` (listes canoniques : 30 → 32 permissions)
- Test: `backend/src/__tests__/rbac-matrix.test.ts` (existant, doit rester vert)

**Interfaces:**
- Consumes: rien.
- Produit : `PERMISSIONS.VIEW_PHASES` (`'view_phases'`) et `PERMISSIONS.MANAGE_PHASES` (`'manage_phases'`), importables côté backend depuis `backend/src/lib/permissions.ts` (Tasks 5, 6) et côté frontend depuis `src/lib/permissions.ts` (Tasks 10, 11).
- Attribution miroir de `view_content` / `edit_content` : `view_phases` → SUPER_ADMIN, ADMIN, MANAGER, RH, COMMERCIAL, VIEWER, STAGIAIRE ; `manage_phases` → SUPER_ADMIN, ADMIN, MANAGER.

> **Friction non listée dans la spec** : `src/lib/__tests__/permissions-sync.test.ts` fige une liste canonique en dur et assert `has exactly 30 permissions`. Elle doit être mise à jour dans la même tâche, sinon le front casse.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `backend/src/__tests__/rbac-matrix.test.ts`, dans le `describe('RBAC matrix / API enforcement', ...)` existant :

```ts
  it('déclare les permissions du pipeline d’étapes avec la même portée que le contenu projet', () => {
    expect(matrix.permissions.VIEW_PHASES).toBe('view_phases')
    expect(matrix.permissions.MANAGE_PHASES).toBe('manage_phases')
    expect(PERMISSIONS.VIEW_PHASES).toBe('view_phases')
    expect(PERMISSIONS.MANAGE_PHASES).toBe('manage_phases')

    for (const role of matrix.roles.all) {
      const permissions = new Set(getPermissionsForRole(role as UserRole))
      expect(permissions.has('view_phases'), `${role} / view_phases`).toBe(
        new Set(matrix.rolePermissions[role]).has('view_content'),
      )
      expect(permissions.has('manage_phases'), `${role} / manage_phases`).toBe(
        new Set(matrix.rolePermissions[role]).has('edit_content'),
      )
    }
  })
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/rbac-matrix.test.ts
```

Attendu : ÉCHEC — `expected undefined to be 'view_phases'`.

- [ ] **Step 3: Étendre `rbac-matrix.json`**

Dans l'objet `permissions`, ajouter après `"EDIT_CONTENT": "edit_content",` :

```json
    "VIEW_PHASES": "view_phases",
    "MANAGE_PHASES": "manage_phases",
```

Dans `rolePermissions`, ajouter `"view_phases"` aux rôles qui ont déjà `"view_content"` (SUPER_ADMIN, ADMIN, MANAGER, RH, COMMERCIAL, VIEWER, STAGIAIRE) et `"manage_phases"` à ceux qui ont `"edit_content"` (SUPER_ADMIN, ADMIN, MANAGER). Vérifier ensuite :

```bash
python3 -c "
import json
m = json.load(open('rbac-matrix.json'))
for r, v in m['rolePermissions'].items():
    assert ('view_phases' in v) == ('view_content' in v), r
    assert ('manage_phases' in v) == ('edit_content' in v), r
print('matrice cohérente')
"
```

- [ ] **Step 4: Étendre le type `Permission` et le backend**

Dans `backend/src/types/enums.ts`, après `| 'edit_content'` :

```ts
  | 'view_phases'
  | 'manage_phases'
```

Dans `backend/src/lib/permissions.ts`, dans `PERMISSIONS`, après `EDIT_CONTENT: 'edit_content',` :

```ts
  VIEW_PHASES: 'view_phases',
  MANAGE_PHASES: 'manage_phases',
```

Puis, dans `ROLE_PERMISSIONS`, ajouter `PERMISSIONS.VIEW_PHASES,` juste après chaque `PERMISSIONS.VIEW_CONTENT,` (ADMIN, MANAGER, RH, VIEWER, COMMERCIAL, STAGIAIRE — SUPER_ADMIN hérite de `Object.values(PERMISSIONS)`) et `PERMISSIONS.MANAGE_PHASES,` juste après chaque `PERMISSIONS.EDIT_CONTENT,` (ADMIN, MANAGER).

- [ ] **Step 5: Mettre à jour le test de synchro frontend**

Dans `src/lib/__tests__/permissions-sync.test.ts` : ajouter `'view_phases',` et `'manage_phases',` après `'edit_content',` dans `CANONICAL_VALUES`, ajouter `'VIEW_PHASES',` et `'MANAGE_PHASES',` après `'EDIT_CONTENT',` dans `CANONICAL_KEYS`, et remplacer les deux assertions `expect(frontValues.length).toBe(30)` / `expect(backendValues.length).toBe(30)` par `32` (le libellé des `it` devient `has exactly 32 permissions`).

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/__tests__/rbac-matrix.test.ts src/__tests__/permissions.test.ts
```

```bash
npx vitest run src/lib/__tests__/permissions-sync.test.ts src/lib/__tests__/permissions.test.ts
```

Attendu : PASS des deux côtés.

- [ ] **Step 7: Commit**

```bash
git add rbac-matrix.json backend/src/lib/permissions.ts backend/src/types/enums.ts backend/src/__tests__/rbac-matrix.test.ts src/lib/__tests__/permissions-sync.test.ts && git commit -m "feat(phases): permissions view_phases et manage_phases"
```

---

### Task 4: Lib de transitions et de verrouillage `projectPhases.ts`

**Files:**
- Create: `backend/src/lib/projectPhases.ts`
- Test: `backend/src/lib/projectPhases.test.ts`

**Interfaces:**
- Consumes: `IProjectPhase`, `PhaseStatus` (Task 1).
- Produit (signatures exactes utilisées par les Tasks 5, 6, 7) :

```ts
export type PhaseAdminAction = 'start' | 'request-validation' | 'complete' | 'cancel-validation-request' | 'revert'
export interface PhaseRefusal { status: number; body: { error: string; code: string; blockingPhase?: { _id: string; title: string } } }
export type TransitionOutcome = { ok: true; nextStatus: PhaseStatus } | { ok: false; refusal: PhaseRefusal }

export function isPhaseValidated(phase: Pick<IProjectPhase, 'validation'>): boolean
export const PHASE_STATUS_LABELS: Record<PhaseStatus, string>
export function resolveAdminTransition(phase: IProjectPhase, action: PhaseAdminAction, blockingPhase: IProjectPhase | null): TransitionOutcome
export async function findBlockingPhase(projectId: string | Types.ObjectId, order: number): Promise<IProjectPhase | null>
export async function phaseAdminRecipients(project: IProject): Promise<string[]>
```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/lib/projectPhases.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { isPhaseValidated, PHASE_STATUS_LABELS, resolveAdminTransition } from './projectPhases.js'
import type { IProjectPhase } from '../types/models/index.js'

function phase(overrides: Partial<IProjectPhase> = {}): IProjectPhase {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'Maquettes',
    status: 'A_VENIR',
    order: 1,
    requiresClientValidation: false,
    validation: { validatedBy: null, validatedByName: '', validatedAt: null, comment: '' },
    ...overrides,
  } as unknown as IProjectPhase
}

const blocker = phase({ title: 'Cadrage', order: 0, requiresClientValidation: true })

describe('isPhaseValidated', () => {
  it('ne considère validée qu’une étape horodatée', () => {
    expect(isPhaseValidated(phase())).toBe(false)
    expect(
      isPhaseValidated(
        phase({ validation: { validatedBy: null, validatedByName: 'X', validatedAt: new Date(), comment: '' } }),
      ),
    ).toBe(true)
  })
})

describe('resolveAdminTransition — start', () => {
  it('démarre une étape à venir sans jalon bloquant', () => {
    expect(resolveAdminTransition(phase(), 'start', null)).toEqual({ ok: true, nextStatus: 'EN_COURS' })
  })

  it('refuse 409 PHASE_LOCKED en nommant l’étape bloquante', () => {
    const outcome = resolveAdminTransition(phase(), 'start', blocker)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.refusal.status).toBe(409)
    expect(outcome.refusal.body.code).toBe('PHASE_LOCKED')
    expect(outcome.refusal.body.blockingPhase).toEqual({ _id: String(blocker._id), title: 'Cadrage' })
  })

  it('refuse 409 INVALID_TRANSITION depuis un autre statut', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'start', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('resolveAdminTransition — request-validation', () => {
  it('met en attente une étape en cours à validation client', () => {
    const p = phase({ status: 'EN_COURS', requiresClientValidation: true })
    expect(resolveAdminTransition(p, 'request-validation', null)).toEqual({
      ok: true,
      nextStatus: 'EN_ATTENTE_VALIDATION',
    })
  })

  it('refuse 409 VALIDATION_NOT_REQUIRED si l’étape n’est pas un jalon client', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'request-validation', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'VALIDATION_NOT_REQUIRED' } } })
  })
})

describe('resolveAdminTransition — complete', () => {
  it('termine une étape en cours sans validation client', () => {
    expect(resolveAdminTransition(phase({ status: 'EN_COURS' }), 'complete', null)).toEqual({
      ok: true,
      nextStatus: 'TERMINEE',
    })
  })

  it('refuse 409 CLIENT_VALIDATION_REQUIRED sur un jalon client', () => {
    const p = phase({ status: 'EN_COURS', requiresClientValidation: true })
    const outcome = resolveAdminTransition(p, 'complete', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'CLIENT_VALIDATION_REQUIRED' } } })
  })
})

describe('resolveAdminTransition — cancel-validation-request', () => {
  it('ramène en cours une étape en attente', () => {
    expect(resolveAdminTransition(phase({ status: 'EN_ATTENTE_VALIDATION' }), 'cancel-validation-request', null)).toEqual(
      { ok: true, nextStatus: 'EN_COURS' },
    )
  })

  it('refuse 409 INVALID_TRANSITION hors attente de validation', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'cancel-validation-request', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('resolveAdminTransition — revert', () => {
  it('ramène une étape en cours à venir', () => {
    expect(resolveAdminTransition(phase({ status: 'EN_COURS' }), 'revert', null)).toEqual({
      ok: true,
      nextStatus: 'A_VENIR',
    })
  })

  it('rouvre une étape terminée non validée', () => {
    expect(resolveAdminTransition(phase({ status: 'TERMINEE' }), 'revert', null)).toEqual({
      ok: true,
      nextStatus: 'EN_COURS',
    })
  })

  it('refuse 409 VALIDATED_PHASE_IMMUTABLE sur une étape validée', () => {
    const p = phase({
      status: 'TERMINEE',
      validation: { validatedBy: null, validatedByName: 'Claire', validatedAt: new Date(), comment: '' },
    })
    const outcome = resolveAdminTransition(p, 'revert', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'VALIDATED_PHASE_IMMUTABLE' } } })
  })

  it('refuse 409 INVALID_TRANSITION depuis A_VENIR', () => {
    const outcome = resolveAdminTransition(phase(), 'revert', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('PHASE_STATUS_LABELS', () => {
  it('couvre les quatre statuts en français', () => {
    expect(PHASE_STATUS_LABELS).toEqual({
      A_VENIR: 'À venir',
      EN_COURS: 'En cours',
      EN_ATTENTE_VALIDATION: 'En attente de validation client',
      TERMINEE: 'Terminée',
    })
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/lib/projectPhases.test.ts
```

Attendu : ÉCHEC — `Cannot find module './projectPhases.js'`.

- [ ] **Step 3: Écrire la lib**

Créer `backend/src/lib/projectPhases.ts` :

```ts
import type { Types } from 'mongoose'
import ProjectPhase from '../models/ProjectPhase.js'
import User from '../models/User.js'
import type { IProject, IProjectPhase } from '../types/models/index.js'
import type { PhaseStatus } from '../types/enums.js'

export type PhaseAdminAction =
  | 'start'
  | 'request-validation'
  | 'complete'
  | 'cancel-validation-request'
  | 'revert'

export interface PhaseRefusal {
  status: number
  body: { error: string; code: string; blockingPhase?: { _id: string; title: string } }
}

export type TransitionOutcome = { ok: true; nextStatus: PhaseStatus } | { ok: false; refusal: PhaseRefusal }

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de validation client',
  TERMINEE: 'Terminée',
}

/** Une étape n'est validée que si le client l'a horodatée. */
export function isPhaseValidated(phase: Pick<IProjectPhase, 'validation'>): boolean {
  return Boolean(phase.validation?.validatedAt)
}

function refuse(status: number, error: string, code: string): TransitionOutcome {
  return { ok: false, refusal: { status, body: { error, code } } }
}

const invalidTransition = (): TransitionOutcome =>
  refuse(409, 'Cette transition n’est pas autorisée pour cette étape', 'INVALID_TRANSITION')

/**
 * Unique source de vérité du tableau des transitions admin. `blockingPhase` est
 * résolu par l'appelant via findBlockingPhase() : la fonction reste pure et
 * donc testable sans base.
 */
export function resolveAdminTransition(
  phase: IProjectPhase,
  action: PhaseAdminAction,
  blockingPhase: IProjectPhase | null,
): TransitionOutcome {
  switch (action) {
    case 'start': {
      if (phase.status !== 'A_VENIR') return invalidTransition()
      if (blockingPhase) {
        return {
          ok: false,
          refusal: {
            status: 409,
            body: {
              error: `L’étape « ${blockingPhase.title} » doit d’abord être validée par le client`,
              code: 'PHASE_LOCKED',
              blockingPhase: { _id: String(blockingPhase._id), title: blockingPhase.title },
            },
          },
        }
      }
      return { ok: true, nextStatus: 'EN_COURS' }
    }
    case 'request-validation': {
      if (phase.status !== 'EN_COURS') return invalidTransition()
      if (!phase.requiresClientValidation) {
        return refuse(409, 'Cette étape ne requiert pas de validation client', 'VALIDATION_NOT_REQUIRED')
      }
      return { ok: true, nextStatus: 'EN_ATTENTE_VALIDATION' }
    }
    case 'complete': {
      if (phase.status !== 'EN_COURS') return invalidTransition()
      if (phase.requiresClientValidation) {
        return refuse(
          409,
          'Cette étape doit être validée par le client avant d’être terminée',
          'CLIENT_VALIDATION_REQUIRED',
        )
      }
      return { ok: true, nextStatus: 'TERMINEE' }
    }
    case 'cancel-validation-request': {
      if (phase.status !== 'EN_ATTENTE_VALIDATION') return invalidTransition()
      return { ok: true, nextStatus: 'EN_COURS' }
    }
    case 'revert': {
      if (phase.status === 'EN_COURS') return { ok: true, nextStatus: 'A_VENIR' }
      if (phase.status === 'TERMINEE') {
        if (isPhaseValidated(phase)) {
          return refuse(409, 'Une étape validée par le client ne peut plus être modifiée', 'VALIDATED_PHASE_IMMUTABLE')
        }
        return { ok: true, nextStatus: 'EN_COURS' }
      }
      return invalidTransition()
    }
    default:
      return invalidTransition()
  }
}

/**
 * Règle de verrouillage : toute étape précédente exigeant une validation client
 * doit être validée. La règle porte sur *toutes* les étapes d'ordre inférieur,
 * ce qui la rend robuste au réordonnancement.
 */
export async function findBlockingPhase(
  projectId: string | Types.ObjectId,
  order: number,
): Promise<IProjectPhase | null> {
  return ProjectPhase.findOne({
    project: projectId,
    order: { $lt: order },
    requiresClientValidation: true,
    $or: [{ 'validation.validatedAt': null }, { 'validation.validatedAt': { $exists: false } }],
  }).sort({ order: 1 })
}

/**
 * Destinataires internes d'un événement d'étape : le responsable du projet
 * (s'il existe) et tous les SUPER_ADMIN actifs. notifyUsers() déduplique.
 */
export async function phaseAdminRecipients(project: IProject): Promise<string[]> {
  const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  const recipients = superAdmins.map((admin) => String(admin._id))
  if (project.assignedTo) recipients.unshift(String(project.assignedTo))
  return recipients
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/lib/projectPhases.test.ts
```

Attendu : PASS (13 tests).

- [ ] **Step 5: Typecheck puis commit**

```bash
cd backend && npm run typecheck
```

```bash
git add backend/src/lib/projectPhases.ts backend/src/lib/projectPhases.test.ts && git commit -m "feat(phases): lib de transitions et règle de verrouillage"
```

---

### Task 5: Sous-router admin — lecture, CRUD et réordonnancement

**Files:**
- Create: `backend/src/routes/admin/projects/phases.ts`
- Modify: `backend/src/routes/admin/projects/index.ts`
- Test: `backend/src/__tests__/project-phases-admin.test.ts`

**Interfaces:**
- Consumes: `ProjectPhase` (Task 1), `isPhaseValidated` (Task 4), `PERMISSIONS.VIEW_PHASES` / `PERMISSIONS.MANAGE_PHASES` (Task 3).
- Produit : le router `phasesRouter` monté sous `/api/admin/projects`, exposant `GET /:projectId/phases`, `POST /:projectId/phases`, `PATCH /:projectId/phases/reorder`, `PATCH /:projectId/phases/:phaseId`, `DELETE /:projectId/phases/:phaseId`. Toutes les réponses de mutation renvoient `{ phase }` (ou `{ phases }` pour reorder, `{ message }` pour DELETE).
- Produit également le helper interne `loadPhase(req, res)` réutilisé par la Task 6 dans le même fichier.

> **Piège Express** : déclarer `PATCH /:projectId/phases/reorder` **avant** `PATCH /:projectId/phases/:phaseId`, sinon `reorder` est capturé comme un `phaseId`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/project-phases-admin.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'

let app: Express
let adminId: string
let commercialId: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createPhase(overrides: Record<string, unknown> = {}) {
  return ProjectPhase.create({ project: projectId, title: 'Cadrage', createdBy: adminId, ...overrides })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, commercial, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Commercial', email: 'commercial@example.test', passwordHash, role: 'COMMERCIAL' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  commercialId = String(commercial._id)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('lecture des étapes', () => {
  it('liste les étapes triées par ordre avec leurs livrables peuplés', async () => {
    const item = await ProjectItem.create({
      project: projectId,
      type: 'MAQUETTE',
      title: 'Maquettes desktop',
      createdBy: adminId,
    })
    await createPhase({ title: 'Développement', order: 1 })
    await createPhase({ title: 'Cadrage', order: 0, linkedItems: [item._id] })

    const response = await request(app)
      .get(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['Cadrage', 'Développement'])
    expect(response.body.phases[0].linkedItems[0].title).toBe('Maquettes desktop')
  })

  it('renvoie 404 sur un projet inconnu', async () => {
    await request(app)
      .get('/api/admin/projects/64b7f0000000000000000000/phases')
      .set('Cookie', await cookieFor(adminId))
      .expect(404)
  })

  it('refuse 403 la création à un rôle sans manage_phases', async () => {
    await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(commercialId))
      .send({ title: 'Cadrage' })
      .expect(403)
  })
})

describe('création d’une étape', () => {
  it('crée une étape A_VENIR avec un ordre auto-incrémenté', async () => {
    const cookie = await cookieFor(adminId)
    const first = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', cookie)
      .send({ title: 'Cadrage', requiresClientValidation: true })
      .expect(201)
    const second = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', cookie)
      .send({ title: 'Maquettes' })
      .expect(201)

    expect(first.body.phase.status).toBe('A_VENIR')
    expect(first.body.phase.order).toBe(0)
    expect(first.body.phase.requiresClientValidation).toBe(true)
    expect(second.body.phase.order).toBe(1)
  })

  it('refuse 400 sans titre', async () => {
    await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .send({ description: 'sans titre' })
      .expect(400)
  })

  it('refuse 422 INVALID_LINKED_ITEMS un livrable d’un autre projet', async () => {
    const otherProject = await Project.create({ name: 'Autre', client: clientId })
    const foreignItem = await ProjectItem.create({
      project: otherProject._id,
      type: 'LIVRABLE',
      title: 'Étranger',
      createdBy: adminId,
    })

    const response = await request(app)
      .post(`/api/admin/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage', linkedItems: [String(foreignItem._id)] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_LINKED_ITEMS')
  })
})

describe('modification et suppression', () => {
  it('modifie les champs éditables', async () => {
    const phase = await createPhase()
    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage détaillé', description: 'Ateliers', requiresClientValidation: true })
      .expect(200)

    expect(response.body.phase.title).toBe('Cadrage détaillé')
    expect(response.body.phase.description).toBe('Ateliers')
    expect(response.body.phase.requiresClientValidation).toBe(true)
  })

  it('ignore un statut envoyé par PATCH', async () => {
    const phase = await createPhase()
    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ status: 'TERMINEE' })
      .expect(200)

    expect((await ProjectPhase.findById(phase._id))!.status).toBe('A_VENIR')
  })

  it('fige le contenu d’une étape validée mais laisse passer l’ordre', async () => {
    const phase = await createPhase({
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const cookie = await cookieFor(adminId)

    const refused = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', cookie)
      .send({ title: 'Réécriture' })
      .expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')

    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase._id}`)
      .set('Cookie', cookie)
      .send({ order: 3 })
      .expect(200)
    expect((await ProjectPhase.findById(phase._id))!.order).toBe(3)
  })

  it('supprime une étape non validée et refuse 409 une étape validée', async () => {
    const cookie = await cookieFor(adminId)
    const plain = await createPhase()
    await request(app)
      .delete(`/api/admin/projects/${projectId}/phases/${plain._id}`)
      .set('Cookie', cookie)
      .expect(200)
    expect(await ProjectPhase.countDocuments({ _id: plain._id })).toBe(0)

    const validated = await createPhase({
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const refused = await request(app)
      .delete(`/api/admin/projects/${projectId}/phases/${validated._id}`)
      .set('Cookie', cookie)
      .expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')
  })
})

describe('réordonnancement', () => {
  it('réécrit les ordres selon la liste fournie', async () => {
    const a = await createPhase({ title: 'A', order: 0 })
    const b = await createPhase({ title: 'B', order: 1 })
    const c = await createPhase({ title: 'C', order: 2 })

    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/reorder`)
      .set('Cookie', await cookieFor(adminId))
      .send({ phaseIds: [String(c._id), String(a._id), String(b._id)] })
      .expect(200)

    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['C', 'A', 'B'])
    expect(response.body.phases.map((p: { order: number }) => p.order)).toEqual([0, 1, 2])
  })

  it('refuse 422 INVALID_PHASE_LIST une liste incomplète', async () => {
    const a = await createPhase({ title: 'A', order: 0 })
    await createPhase({ title: 'B', order: 1 })

    const response = await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/reorder`)
      .set('Cookie', await cookieFor(adminId))
      .send({ phaseIds: [String(a._id)] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_PHASE_LIST')
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/project-phases-admin.test.ts
```

Attendu : ÉCHEC — les routes `/phases` répondent 404 (elles n'existent pas).

- [ ] **Step 3: Créer le sous-router avec le CRUD**

Créer `backend/src/routes/admin/projects/phases.ts` :

```ts
import express, { Request, Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import Project from '../../../models/Project.js'
import ProjectItem from '../../../models/ProjectItem.js'
import ProjectPhase from '../../../models/ProjectPhase.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { logActivity } from '../../../lib/activityLog.js'
import { isPhaseValidated } from '../../../lib/projectPhases.js'
import logger from '../../../lib/logger.js'
import type { IProjectPhase } from '../../../types/models/index.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const ADMIN_ITEM_SELECT = 'title type status isVisible'
const IMMUTABLE_FIELDS = ['title', 'description', 'dueAt', 'requiresClientValidation', 'linkedItems'] as const

function populatePhase(phase: IProjectPhase) {
  return phase.populate([
    { path: 'linkedItems', select: ADMIN_ITEM_SELECT },
    { path: 'validation.validatedBy', select: 'name email' },
    { path: 'revisionRequests.requestedBy', select: 'name email' },
  ])
}

/** Charge le projet puis l'étape ; répond 404 et retourne null si l'un manque. */
async function loadPhase(req: Request, res: Response): Promise<IProjectPhase | null> {
  const { projectId, phaseId } = req.params
  const project = await Project.findById(projectId)
  if (!project) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  const phase = await ProjectPhase.findOne({ _id: phaseId, project: projectId })
  if (!phase) {
    res.status(404).json({ error: 'Étape non trouvée' })
    return null
  }
  return phase
}

/** Vérifie que chaque livrable lié appartient bien au projet. */
async function normalizeLinkedItems(projectId: string, linkedItems: unknown): Promise<string[] | null> {
  if (!Array.isArray(linkedItems)) return []
  const ids = linkedItems.map(String)
  if (ids.some((id) => !mongoose.isValidObjectId(id))) return null
  const owned = await ProjectItem.countDocuments({ _id: { $in: ids }, project: projectId })
  if (owned !== new Set(ids).size) return null
  return ids
}

// GET /api/admin/projects/:projectId/phases
router.get('/:projectId/phases', requirePermission(PERMISSIONS.VIEW_PHASES), async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.projectId)
    if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

    const phases = await ProjectPhase.find({ project: req.params.projectId })
      .sort({ order: 1 })
      .populate('linkedItems', ADMIN_ITEM_SELECT)
      .populate('validation.validatedBy', 'name email')
      .populate('revisionRequests.requestedBy', 'name email')

    res.json({ phases })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/projects/:projectId/phases
router.post('/:projectId/phases', requirePermission(PERMISSIONS.MANAGE_PHASES), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { title, description, dueAt, requiresClientValidation, linkedItems, order } = req.body || {}

    const project = await Project.findById(projectId)
    if (!project) return res.status(404).json({ error: 'Projet non trouvé' })
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Le titre de l’étape est requis' })
    }

    const normalizedItems = await normalizeLinkedItems(projectId, linkedItems)
    if (normalizedItems === null) {
      return res.status(422).json({ error: 'Livrables liés invalides', code: 'INVALID_LINKED_ITEMS' })
    }

    let phaseOrder = order
    if (phaseOrder === undefined) {
      const last = await ProjectPhase.findOne({ project: projectId }).sort({ order: -1 })
      phaseOrder = last ? last.order + 1 : 0
    }

    const phase = await ProjectPhase.create({
      project: projectId,
      title: title.trim(),
      description: description || '',
      order: phaseOrder,
      dueAt: dueAt ? new Date(dueAt) : null,
      requiresClientValidation: Boolean(requiresClientValidation),
      linkedItems: normalizedItems,
      createdBy: req.user!.id,
    })

    await logActivity({
      project: projectId,
      action: 'PHASE_CREATED',
      actor: req.user!.id,
      summary: `Étape « ${phase.title} » créée`,
      metadata: { phaseId: String(phase._id) },
    })

    await populatePhase(phase)
    res.status(201).json({ phase })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/projects/:projectId/phases/reorder
// ⚠️ Doit précéder PATCH /:projectId/phases/:phaseId, sinon Express capture "reorder" comme phaseId.
router.patch(
  '/:projectId/phases/reorder',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { phaseIds } = req.body || {}

      const project = await Project.findById(projectId)
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

      const existing = await ProjectPhase.find({ project: projectId }).select('_id')
      const existingIds = existing.map((phase) => String(phase._id))
      const submitted = Array.isArray(phaseIds) ? phaseIds.map(String) : []

      const sameCardinality = submitted.length === existingIds.length && new Set(submitted).size === submitted.length
      const sameSet = sameCardinality && submitted.every((id) => existingIds.includes(id))
      if (!sameSet) {
        return res
          .status(422)
          .json({ error: 'La liste doit contenir exactement les étapes du projet', code: 'INVALID_PHASE_LIST' })
      }

      await Promise.all(
        submitted.map((id, index) => ProjectPhase.updateOne({ _id: id, project: projectId }, { $set: { order: index } })),
      )

      const phases = await ProjectPhase.find({ project: projectId })
        .sort({ order: 1 })
        .populate('linkedItems', ADMIN_ITEM_SELECT)
        .populate('validation.validatedBy', 'name email')
        .populate('revisionRequests.requestedBy', 'name email')

      await logActivity({
        project: projectId,
        action: 'PHASE_UPDATED',
        actor: req.user!.id,
        summary: 'Étapes du projet réordonnées',
        metadata: { phaseIds: submitted },
      })

      res.json({ phases })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

// PATCH /api/admin/projects/:projectId/phases/:phaseId
router.patch(
  '/:projectId/phases/:phaseId',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      const { title, description, dueAt, requiresClientValidation, linkedItems, order } = req.body || {}

      // Une étape validée atteste un accord daté : seul son ordre d'affichage reste mobile.
      if (isPhaseValidated(phase) && IMMUTABLE_FIELDS.some((field) => req.body?.[field] !== undefined)) {
        return res
          .status(409)
          .json({ error: 'Une étape validée par le client ne peut plus être modifiée', code: 'VALIDATED_PHASE_IMMUTABLE' })
      }

      if (linkedItems !== undefined) {
        const normalizedItems = await normalizeLinkedItems(req.params.projectId, linkedItems)
        if (normalizedItems === null) {
          return res.status(422).json({ error: 'Livrables liés invalides', code: 'INVALID_LINKED_ITEMS' })
        }
        phase.linkedItems = normalizedItems as unknown as typeof phase.linkedItems
      }
      if (title !== undefined) phase.title = String(title)
      if (description !== undefined) phase.description = String(description)
      if (dueAt !== undefined) phase.dueAt = dueAt ? new Date(dueAt) : null
      if (requiresClientValidation !== undefined) phase.requiresClientValidation = Boolean(requiresClientValidation)
      if (order !== undefined) phase.order = Number(order)
      // `status` et `validation` ne sont jamais modifiables par cette route.

      await phase.save()

      await logActivity({
        project: req.params.projectId,
        action: 'PHASE_UPDATED',
        actor: req.user!.id,
        summary: `Étape « ${phase.title} » modifiée`,
        metadata: { phaseId: String(phase._id) },
      })

      await populatePhase(phase)
      res.json({ phase })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

// DELETE /api/admin/projects/:projectId/phases/:phaseId
router.delete(
  '/:projectId/phases/:phaseId',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      if (isPhaseValidated(phase)) {
        return res
          .status(409)
          .json({ error: 'Une étape validée par le client ne peut pas être supprimée', code: 'VALIDATED_PHASE_IMMUTABLE' })
      }

      const title = phase.title
      await phase.deleteOne()

      await logActivity({
        project: req.params.projectId,
        action: 'PHASE_DELETED',
        actor: req.user!.id,
        summary: `Étape « ${title} » supprimée`,
        metadata: { phaseId: req.params.phaseId },
      })

      res.json({ message: 'Étape supprimée' })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

export { loadPhase, populatePhase }
export default router
```

- [ ] **Step 4: Monter le router**

Dans `backend/src/routes/admin/projects/index.ts`, ajouter l'import après `import sectionsRouter from './sections.js'` :

```ts
import phasesRouter from './phases.js'
```

puis le montage après `router.use(sectionsRouter)` :

```ts
router.use(phasesRouter)
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/__tests__/project-phases-admin.test.ts
```

Attendu : PASS (11 tests).

- [ ] **Step 6: Typecheck puis commit**

```bash
cd backend && npm run typecheck
```

```bash
git add backend/src/routes/admin/projects/phases.ts backend/src/routes/admin/projects/index.ts backend/src/__tests__/project-phases-admin.test.ts && git commit -m "feat(phases): routes admin CRUD et réordonnancement des étapes"
```

---

### Task 6: Sous-router admin — transitions verrouillées et résolution des retouches

**Files:**
- Modify: `backend/src/routes/admin/projects/phases.ts` (ajout des routes de transition)
- Test: `backend/src/__tests__/project-phases-transitions.test.ts`

**Interfaces:**
- Consumes: `loadPhase`, `populatePhase` (Task 5, même fichier), `resolveAdminTransition`, `findBlockingPhase`, `PHASE_STATUS_LABELS`, `phaseAdminRecipients` (Task 4), `createNotification` (`backend/src/lib/notifications.ts`).
- Produit : `POST /:projectId/phases/:phaseId/start`, `.../request-validation`, `.../complete`, `.../cancel-validation-request`, `.../revert`, `POST /:projectId/phases/:phaseId/revisions/:revisionId/resolve`. Toutes renvoient `{ phase }`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/project-phases-transitions.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express
let adminId: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

const post = async (path: string) =>
  request(app).post(`/api/admin/projects/${projectId}/phases${path}`).set('Cookie', await cookieFor(adminId))

async function createPhase(overrides: Record<string, unknown> = {}) {
  return ProjectPhase.create({ project: projectId, title: 'Cadrage', createdBy: adminId, ...overrides })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('verrouillage du démarrage', () => {
  it('refuse 409 PHASE_LOCKED tant que le jalon précédent n’est pas validé, puis accepte', async () => {
    const jalon = await createPhase({ title: 'Maquettes', order: 0, requiresClientValidation: true })
    const suivante = await createPhase({ title: 'Développement', order: 1 })

    const refused = await (await post(`/${suivante._id}/start`)).expect(409)
    expect(refused.body.code).toBe('PHASE_LOCKED')
    expect(refused.body.blockingPhase).toEqual({ _id: String(jalon._id), title: 'Maquettes' })

    jalon.status = 'TERMINEE'
    jalon.validation.validatedByName = 'Claire Corbel'
    jalon.validation.validatedAt = new Date()
    await jalon.save()

    const accepted = await (await post(`/${suivante._id}/start`)).expect(200)
    expect(accepted.body.phase.status).toBe('EN_COURS')
  })

  it('regarde toutes les étapes précédentes, pas seulement l’immédiate', async () => {
    await createPhase({ title: 'Cadrage', order: 0, requiresClientValidation: true })
    await createPhase({ title: 'Ateliers', order: 1, status: 'TERMINEE' })
    const derniere = await createPhase({ title: 'Développement', order: 2 })

    const refused = await (await post(`/${derniere._id}/start`)).expect(409)
    expect(refused.body.blockingPhase.title).toBe('Cadrage')
  })

  it('journalise le changement de statut', async () => {
    const phase = await createPhase()
    await (await post(`/${phase._id}/start`)).expect(200)

    const log = await ActivityLog.findOne({ project: projectId, action: 'PHASE_STATUS_CHANGED' })
    expect(log).not.toBeNull()
    expect(log!.summary).toContain('Cadrage')
    expect(log!.metadata).toMatchObject({ from: 'A_VENIR', to: 'EN_COURS' })
  })
})

describe('demande de validation client', () => {
  it('passe l’étape en attente et notifie le client propriétaire', async () => {
    const phase = await createPhase({ status: 'EN_COURS', requiresClientValidation: true })

    const response = await (await post(`/${phase._id}/request-validation`)).expect(200)
    expect(response.body.phase.status).toBe('EN_ATTENTE_VALIDATION')

    const notification = await Notification.findOne({ recipient: clientId, type: 'PHASE_VALIDATION_REQUESTED' })
    expect(notification).not.toBeNull()
    expect(notification!.link).toBe(`/espace-client/projets/${projectId}?tab=progress`)
    expect(notification!.metadata).toMatchObject({ projectId, phaseId: String(phase._id) })
  })

  it('refuse 409 VALIDATION_NOT_REQUIRED hors jalon client', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await (await post(`/${phase._id}/request-validation`)).expect(409)
    expect(response.body.code).toBe('VALIDATION_NOT_REQUIRED')
  })
})

describe('fin d’étape et retours arrière', () => {
  it('termine une étape sans validation client', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await (await post(`/${phase._id}/complete`)).expect(200)
    expect(response.body.phase.status).toBe('TERMINEE')
  })

  it('refuse 409 CLIENT_VALIDATION_REQUIRED de court-circuiter un jalon client', async () => {
    const phase = await createPhase({ status: 'EN_COURS', requiresClientValidation: true })
    const response = await (await post(`/${phase._id}/complete`)).expect(409)
    expect(response.body.code).toBe('CLIENT_VALIDATION_REQUIRED')
  })

  it('annule une demande de validation', async () => {
    const phase = await createPhase({ status: 'EN_ATTENTE_VALIDATION', requiresClientValidation: true })
    const response = await (await post(`/${phase._id}/cancel-validation-request`)).expect(200)
    expect(response.body.phase.status).toBe('EN_COURS')
    expect(response.body.phase.revisionRequests).toHaveLength(0)
  })

  it('rouvre une étape terminée non validée mais refuse 409 une étape validée', async () => {
    const libre = await createPhase({ title: 'Recette', status: 'TERMINEE' })
    const reverted = await (await post(`/${libre._id}/revert`)).expect(200)
    expect(reverted.body.phase.status).toBe('EN_COURS')

    const validee = await createPhase({
      title: 'Maquettes',
      status: 'TERMINEE',
      validation: { validatedByName: 'Claire', validatedAt: new Date() },
    })
    const refused = await (await post(`/${validee._id}/revert`)).expect(409)
    expect(refused.body.code).toBe('VALIDATED_PHASE_IMMUTABLE')
  })

  it('refuse 409 INVALID_TRANSITION une transition non listée', async () => {
    const phase = await createPhase({ status: 'A_VENIR' })
    const response = await (await post(`/${phase._id}/complete`)).expect(409)
    expect(response.body.code).toBe('INVALID_TRANSITION')
  })
})

describe('résolution des demandes de retouches', () => {
  it('horodate la résolution puis refuse 409 la seconde', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    phase.revisionRequests.push({
      requestedBy: clientId,
      requestedByName: 'Claire Corbel',
      comment: 'Header trop dense',
    } as never)
    await phase.save()
    const revisionId = String(phase.revisionRequests[0]._id)

    const response = await (await post(`/${phase._id}/revisions/${revisionId}/resolve`)).expect(200)
    expect(response.body.phase.revisionRequests[0].resolvedAt).not.toBeNull()

    const stored = await ProjectPhase.findById(phase._id)
    expect(String(stored!.revisionRequests[0].resolvedBy)).toBe(adminId)

    const again = await (await post(`/${phase._id}/revisions/${revisionId}/resolve`)).expect(409)
    expect(again.body.code).toBe('REVISION_ALREADY_RESOLVED')
  })

  it('renvoie 404 sur une demande inconnue', async () => {
    const phase = await createPhase()
    await (await post(`/${phase._id}/revisions/64b7f0000000000000000000/resolve`)).expect(404)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/project-phases-transitions.test.ts
```

Attendu : ÉCHEC — 404 sur `/start` (route absente).

- [ ] **Step 3: Ajouter les imports nécessaires**

Dans `backend/src/routes/admin/projects/phases.ts`, compléter les imports :

```ts
import { createNotification } from '../../../lib/notifications.js'
import {
  findBlockingPhase,
  isPhaseValidated,
  PHASE_STATUS_LABELS,
  resolveAdminTransition,
  type PhaseAdminAction,
} from '../../../lib/projectPhases.js'
```

(l'import existant de `isPhaseValidated` est remplacé par ce bloc — ne pas le déclarer deux fois).

- [ ] **Step 4: Ajouter les routes de transition**

Dans le même fichier, **avant** `export { loadPhase, populatePhase }`, insérer :

```ts
/**
 * Fabrique les cinq routes de transition admin : elles partagent la même
 * mécanique (charger, arbitrer via la lib, écrire, journaliser) et ne diffèrent
 * que par l'action et ses effets de bord.
 */
function registerTransition(action: PhaseAdminAction) {
  router.post(
    `/:projectId/phases/:phaseId/${action}`,
    requirePermission(PERMISSIONS.MANAGE_PHASES),
    async (req: Request, res: Response) => {
      try {
        const phase = await loadPhase(req, res)
        if (!phase) return

        const blockingPhase = action === 'start' ? await findBlockingPhase(req.params.projectId, phase.order) : null
        const outcome = resolveAdminTransition(phase, action, blockingPhase)
        if (!outcome.ok) {
          return res.status(outcome.refusal.status).json(outcome.refusal.body)
        }

        const previousStatus = phase.status
        phase.status = outcome.nextStatus
        await phase.save()

        if (action === 'request-validation') {
          const project = await Project.findById(req.params.projectId).select('name client')
          if (project?.client) {
            await createNotification({
              recipient: project.client,
              type: 'PHASE_VALIDATION_REQUESTED',
              title: `Validation attendue — ${project.name}`,
              message: `L’étape « ${phase.title} » attend votre validation.`,
              link: `/espace-client/projets/${req.params.projectId}?tab=progress`,
              metadata: { projectId: String(req.params.projectId), phaseId: String(phase._id) },
            }).catch(() => null)
          }
          await logActivity({
            project: req.params.projectId,
            action: 'PHASE_VALIDATION_REQUESTED',
            actor: req.user!.id,
            summary: `Validation client demandée pour l’étape « ${phase.title} »`,
            metadata: { phaseId: String(phase._id), from: previousStatus, to: phase.status },
          })
        } else {
          await logActivity({
            project: req.params.projectId,
            action: 'PHASE_STATUS_CHANGED',
            actor: req.user!.id,
            summary: `Étape « ${phase.title} » : ${PHASE_STATUS_LABELS[previousStatus]} → ${PHASE_STATUS_LABELS[phase.status]}`,
            metadata: { phaseId: String(phase._id), from: previousStatus, to: phase.status },
          })
        }

        await populatePhase(phase)
        res.json({ phase })
      } catch (err) {
        logger.error(err)
        res.status(500).json({ error: 'Erreur serveur' })
      }
    },
  )
}

for (const action of ['start', 'request-validation', 'complete', 'cancel-validation-request', 'revert'] as const) {
  registerTransition(action)
}

// POST /api/admin/projects/:projectId/phases/:phaseId/revisions/:revisionId/resolve
router.post(
  '/:projectId/phases/:phaseId/revisions/:revisionId/resolve',
  requirePermission(PERMISSIONS.MANAGE_PHASES),
  async (req: Request, res: Response) => {
    try {
      const phase = await loadPhase(req, res)
      if (!phase) return

      const revision = phase.revisionRequests.find((entry) => String(entry._id) === req.params.revisionId)
      if (!revision) return res.status(404).json({ error: 'Demande de retouches non trouvée' })
      if (revision.resolvedAt) {
        return res
          .status(409)
          .json({ error: 'Cette demande de retouches est déjà traitée', code: 'REVISION_ALREADY_RESOLVED' })
      }

      revision.resolvedAt = new Date()
      revision.resolvedBy = req.user!.id as unknown as typeof revision.resolvedBy
      await phase.save()

      await logActivity({
        project: req.params.projectId,
        action: 'PHASE_REVISION_RESOLVED',
        actor: req.user!.id,
        summary: `Demande de retouches traitée sur l’étape « ${phase.title} »`,
        metadata: { phaseId: String(phase._id), revisionId: req.params.revisionId },
      })

      await populatePhase(phase)
      res.json({ phase })
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)
```

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/__tests__/project-phases-transitions.test.ts src/__tests__/project-phases-admin.test.ts
```

Attendu : PASS (11 + 11 tests).

- [ ] **Step 6: Typecheck puis commit**

```bash
cd backend && npm run typecheck
```

```bash
git add backend/src/routes/admin/projects/phases.ts backend/src/__tests__/project-phases-transitions.test.ts && git commit -m "feat(phases): transitions admin verrouillées et résolution des retouches"
```

---

### Task 7: Router client — lecture, validation nominative et demandes de retouches

**Files:**
- Create: `backend/src/routes/client/projectPhases.ts`
- Modify: `backend/src/index.ts` (montage sous `/api/projects`)
- Modify: `backend/src/routes/projects.ts` (`clientVisibleActions`)
- Test: `backend/src/__tests__/project-phases-client.test.ts`

**Interfaces:**
- Consumes: `ProjectPhase` (Task 1), `getProjectAccess` (`backend/src/lib/projectAccess.ts`), `phaseAdminRecipients` (Task 4), `notifyUsers` (`backend/src/lib/notifyHelpers.ts`), `logActivity`.
- Produit : `GET /api/projects/:projectId/phases`, `POST /api/projects/:projectId/phases/:phaseId/validate`, `POST /api/projects/:projectId/phases/:phaseId/revisions`. Les deux mutations renvoient `{ phase }` sanitisée, comme le GET.
- Contrat de sanitisation consommé par la Task 9 : chaque étape renvoyée au client contient `_id`, `title`, `description`, `order`, `dueAt`, `status`, `requiresClientValidation`, `linkedItems[]` (visibles uniquement, sans `file.storagePath`), `validation { validatedByName, validatedAt, comment }`, `revisionRequests[] { _id, requestedByName, comment, createdAt, resolvedAt }`. Ni `createdBy`, ni `validation.validatedBy`, ni `revisionRequests[].requestedBy`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/project-phases-client.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientPhaseRoutes from '../routes/client/projectPhases.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express
let ownerId: string
let editorId: string
let viewerId: string
let outsiderId: string
let adminId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createPhase(overrides: Record<string, unknown> = {}) {
  return ProjectPhase.create({
    project: projectId,
    title: 'Maquettes',
    createdBy: adminId,
    requiresClientValidation: true,
    status: 'EN_ATTENTE_VALIDATION',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientPhaseRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, editor, viewer, outsider, admin] = await User.create([
    { name: 'Claire Corbel', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Éditeur', email: 'editor@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Lecteur', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Étranger', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
  ])
  ownerId = String(owner._id)
  editorId = String(editor._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  adminId = String(admin._id)
  const project = await Project.create({ name: 'Site', client: owner._id, assignedTo: admin._id })
  projectId = String(project._id)
  await ProjectMember.create([
    { project: project._id, user: editor._id, role: 'EDITOR', createdBy: owner._id },
    { project: project._id, user: viewer._id, role: 'VIEWER', createdBy: owner._id },
  ])
})

describe('lecture des étapes côté client', () => {
  it('trie par ordre et masque les données internes', async () => {
    const visible = await ProjectItem.create({
      project: projectId,
      type: 'MAQUETTE',
      title: 'Maquettes desktop',
      createdBy: adminId,
      file: { originalName: 'maq.pdf', storagePath: '/srv/uploads/maq.pdf', mimeType: 'application/pdf', size: 10 },
    })
    const hidden = await ProjectItem.create({
      project: projectId,
      type: 'NOTE',
      title: 'Note interne',
      createdBy: adminId,
      isVisible: false,
    })
    await createPhase({ title: 'Développement', order: 1, status: 'A_VENIR' })
    const phase = await createPhase({ order: 0, linkedItems: [visible._id, hidden._id] })
    phase.revisionRequests.push({
      requestedBy: ownerId,
      requestedByName: 'Claire Corbel',
      comment: 'Header trop dense',
    } as never)
    await phase.save()

    const response = await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)

    const [first] = response.body.phases
    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['Maquettes', 'Développement'])
    expect(first.createdBy).toBeUndefined()
    expect(first.linkedItems).toHaveLength(1)
    expect(first.linkedItems[0].title).toBe('Maquettes desktop')
    expect(first.linkedItems[0].file?.storagePath).toBeUndefined()
    expect(first.revisionRequests[0].comment).toBe('Header trop dense')
    expect(first.revisionRequests[0].requestedByName).toBe('Claire Corbel')
    expect(first.revisionRequests[0].requestedBy).toBeUndefined()
  })

  it('renvoie 404 à un client sans accès au projet', async () => {
    await createPhase()
    await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('renvoie 403 à un compte non client', async () => {
    await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .expect(403)
  })
})

describe('validation nominative', () => {
  it('horodate la validation du propriétaire, termine l’étape et notifie les admins', async () => {
    const phase = await createPhase()

    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: 'Parfait' })
      .expect(200)

    expect(response.body.phase.status).toBe('TERMINEE')
    expect(response.body.phase.validation.validatedByName).toBe('Claire Corbel')
    expect(response.body.phase.validation.validatedAt).not.toBeNull()
    expect(response.body.phase.validation.comment).toBe('Parfait')
    expect(response.body.phase.validation.validatedBy).toBeUndefined()

    const stored = await ProjectPhase.findById(phase._id)
    expect(String(stored!.validation.validatedBy)).toBe(ownerId)

    const notifications = await Notification.find({ type: 'PHASE_VALIDATED' })
    expect(notifications).toHaveLength(1)
    expect(String(notifications[0].recipient)).toBe(adminId)
    expect(notifications[0].link).toBe(`/admin/projets/${projectId}?tab=phases`)

    const log = await ActivityLog.findOne({ project: projectId, action: 'PHASE_VALIDATED' })
    expect(log!.summary).toContain('Claire Corbel')
  })

  it('refuse 403 OWNER_REQUIRED un EDITOR et un VIEWER', async () => {
    const phase = await createPhase()
    for (const userId of [editorId, viewerId]) {
      const response = await request(app)
        .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
        .set('Cookie', await cookieFor(userId))
        .expect(403)
      expect(response.body.code).toBe('OWNER_REQUIRED')
    }
  })

  it('refuse 409 INVALID_TRANSITION hors attente de validation', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(409)
    expect(response.body.code).toBe('INVALID_TRANSITION')
  })
})

describe('demandes de retouches', () => {
  it('exige un commentaire non vide', async () => {
    const phase = await createPhase()
    for (const body of [{}, { comment: '   ' }]) {
      const response = await request(app)
        .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
        .set('Cookie', await cookieFor(ownerId))
        .send(body)
        .expect(422)
      expect(response.body.code).toBe('COMMENT_REQUIRED')
    }
  })

  it('enregistre la demande, repasse l’étape en cours et notifie les admins', async () => {
    const phase = await createPhase()

    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
      .set('Cookie', await cookieFor(editorId))
      .send({ comment: 'Le header est trop dense' })
      .expect(200)

    expect(response.body.phase.status).toBe('EN_COURS')
    expect(response.body.phase.revisionRequests).toHaveLength(1)
    expect(response.body.phase.revisionRequests[0].requestedByName).toBe('Éditeur')
    expect(response.body.phase.revisionRequests[0].resolvedAt).toBeNull()

    const notification = await Notification.findOne({ type: 'PHASE_REVISION_REQUESTED' })
    expect(notification).not.toBeNull()
    expect(await ActivityLog.countDocuments({ project: projectId, action: 'PHASE_REVISION_REQUESTED' })).toBe(1)
  })

  it('refuse 403 un VIEWER', async () => {
    const phase = await createPhase()
    await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
      .set('Cookie', await cookieFor(viewerId))
      .send({ comment: 'Trop dense' })
      .expect(403)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/project-phases-client.test.ts
```

Attendu : ÉCHEC — `Cannot find module '../routes/client/projectPhases.js'`.

- [ ] **Step 3: Créer le router client**

Créer `backend/src/routes/client/projectPhases.ts` :

```ts
import express, { Request, Response } from 'express'
import auth from '../../middleware/auth.js'
import Project from '../../models/Project.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import { getProjectAccess, type ProjectAccess } from '../../lib/projectAccess.js'
import { logActivity } from '../../lib/activityLog.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
import { phaseAdminRecipients } from '../../lib/projectPhases.js'
import logger from '../../lib/logger.js'
import type { IProjectPhase } from '../../types/models/index.js'

const router = express.Router()

router.use(auth)

// Les livrables liés servent à décider : le client a besoin du descriptif, pas du chemin disque.
const CLIENT_ITEM_SELECT = 'title type status isVisible isDownloadable description url content file'

/**
 * Réduit une étape à ce que le client a le droit de voir : identités internes
 * masquées, chemins de stockage retirés (pattern projectContent.ts).
 */
function sanitizePhase(phase: IProjectPhase): Record<string, unknown> {
  const raw = phase.toObject() as Record<string, any>
  delete raw.createdBy
  if (raw.validation) delete raw.validation.validatedBy
  raw.revisionRequests = (raw.revisionRequests || []).map((revision: Record<string, unknown>) => ({
    _id: revision._id,
    requestedByName: revision.requestedByName,
    comment: revision.comment,
    createdAt: revision.createdAt,
    resolvedAt: revision.resolvedAt,
  }))
  raw.linkedItems = (raw.linkedItems || []).map((item: Record<string, any>) => {
    if (item?.file?.storagePath) item.file.storagePath = undefined
    return item
  })
  return raw
}

/**
 * Charge l'étape SANS populate pour toute mutation : un populate avec `match`
 * retire du tableau les livrables non visibles, et un save() dans cet état les
 * effacerait définitivement de linkedItems.
 */
function findPhaseForUpdate(projectId: string, phaseId: string) {
  return ProjectPhase.findOne({ _id: phaseId, project: projectId })
}

/** Recharge l'étape avec ses livrables visibles, pour la réponse. */
function findPhasePopulated(projectId: string, phaseId: string) {
  return ProjectPhase.findOne({ _id: phaseId, project: projectId }).populate({
    path: 'linkedItems',
    match: { isVisible: true },
    select: CLIENT_ITEM_SELECT,
  })
}

/** Garde-fou commun : compte CLIENT + accès au projet, sinon 403/404. */
async function loadAccess(req: Request, res: Response): Promise<ProjectAccess | null> {
  if (req.user!.role !== 'CLIENT') {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const access = await getProjectAccess(req.params.projectId, req.user!.id)
  if (!access) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  return access
}

// GET /api/projects/:projectId/phases
router.get('/:projectId/phases', async (req: Request, res: Response) => {
  try {
    const access = await loadAccess(req, res)
    if (!access) return

    const phases = await ProjectPhase.find({ project: req.params.projectId })
      .sort({ order: 1 })
      .populate({ path: 'linkedItems', match: { isVisible: true }, select: CLIENT_ITEM_SELECT })

    res.json({ phases: phases.map(sanitizePhase) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/projects/:projectId/phases/:phaseId/validate
router.post('/:projectId/phases/:phaseId/validate', async (req: Request, res: Response) => {
  try {
    const access = await loadAccess(req, res)
    if (!access) return
    // Valider engage le client : réservé au propriétaire (pattern quotes.ts).
    if (access.role !== 'OWNER') {
      return res
        .status(403)
        .json({ error: 'Seul le propriétaire du projet peut valider une étape', code: 'OWNER_REQUIRED' })
    }

    const phase = await findPhaseForUpdate(req.params.projectId, req.params.phaseId)
    if (!phase) return res.status(404).json({ error: 'Étape non trouvée' })
    if (phase.status !== 'EN_ATTENTE_VALIDATION') {
      return res.status(409).json({ error: 'Cette étape n’attend pas de validation', code: 'INVALID_TRANSITION' })
    }

    phase.validation = {
      validatedBy: req.user!.id,
      validatedByName: req.user!.name || '',
      validatedAt: new Date(),
      comment: typeof req.body?.comment === 'string' ? req.body.comment.trim() : '',
    } as unknown as typeof phase.validation
    phase.status = 'TERMINEE'
    await phase.save()

    const project = access.project
    await notifyUsers(await phaseAdminRecipients(project), {
      type: 'PHASE_VALIDATED',
      title: `Étape validée — ${project.name}`,
      message: `${req.user!.name} a validé l’étape « ${phase.title} ».`,
      link: `/admin/projets/${req.params.projectId}?tab=phases`,
      metadata: { projectId: String(req.params.projectId), phaseId: String(phase._id) },
    }).catch(() => null)

    await logActivity({
      project: req.params.projectId,
      action: 'PHASE_VALIDATED',
      actor: req.user!.id,
      summary: `Étape « ${phase.title} » validée par ${req.user!.name}`,
      metadata: { phaseId: String(phase._id), from: 'EN_ATTENTE_VALIDATION', to: 'TERMINEE' },
    })

    const updated = await findPhasePopulated(req.params.projectId, req.params.phaseId)
    res.json({ phase: sanitizePhase(updated!) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/projects/:projectId/phases/:phaseId/revisions
router.post('/:projectId/phases/:phaseId/revisions', async (req: Request, res: Response) => {
  try {
    const access = await loadAccess(req, res)
    if (!access) return
    if (access.role === 'VIEWER') {
      return res.status(403).json({ error: 'Accès en lecture seule' })
    }

    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''
    if (!comment) {
      return res
        .status(422)
        .json({ error: 'Un commentaire est requis pour demander des retouches', code: 'COMMENT_REQUIRED' })
    }

    const phase = await findPhaseForUpdate(req.params.projectId, req.params.phaseId)
    if (!phase) return res.status(404).json({ error: 'Étape non trouvée' })
    if (phase.status !== 'EN_ATTENTE_VALIDATION') {
      return res.status(409).json({ error: 'Cette étape n’attend pas de validation', code: 'INVALID_TRANSITION' })
    }

    phase.revisionRequests.push({
      requestedBy: req.user!.id,
      requestedByName: req.user!.name || '',
      comment,
      createdAt: new Date(),
    } as never)
    phase.status = 'EN_COURS'
    await phase.save()

    const project = access.project
    await notifyUsers(await phaseAdminRecipients(project), {
      type: 'PHASE_REVISION_REQUESTED',
      title: `Retouches demandées — ${project.name}`,
      message: `${req.user!.name} a demandé des retouches sur l’étape « ${phase.title} ».`,
      link: `/admin/projets/${req.params.projectId}?tab=phases`,
      metadata: { projectId: String(req.params.projectId), phaseId: String(phase._id) },
    }).catch(() => null)

    await logActivity({
      project: req.params.projectId,
      action: 'PHASE_REVISION_REQUESTED',
      actor: req.user!.id,
      summary: `Retouches demandées sur l’étape « ${phase.title} » par ${req.user!.name}`,
      metadata: { phaseId: String(phase._id), from: 'EN_ATTENTE_VALIDATION', to: 'EN_COURS' },
    })

    const updated = await findPhasePopulated(req.params.projectId, req.params.phaseId)
    res.json({ phase: sanitizePhase(updated!) })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
```

> `req.user!.name` est bien alimenté : `authenticateSession` (`backend/src/lib/session.ts:120`) recharge `name` depuis la base à chaque requête, donc le nom dénormalisé dans `validation.validatedByName` est à jour au moment de la validation.

- [ ] **Step 4: Monter le router**

Dans `backend/src/index.ts`, ajouter l'import à côté de `clientProjectContentRoutes` :

```ts
import clientProjectPhaseRoutes from './routes/client/projectPhases.js'
```

et le montage juste après `app.use('/api/projects', clientProjectContentRoutes)` :

```ts
app.use('/api/projects', clientProjectPhaseRoutes)
```

- [ ] **Step 5: Ouvrir le fil d'activité client aux étapes**

Dans `backend/src/routes/projects.ts`, compléter `clientVisibleActions` :

```ts
    const clientVisibleActions = [
      'STATUS_CHANGED',
      'UPDATE_POSTED',
      'DOCUMENT_UPLOADED',
      'ITEM_CREATED',
      'TASK_CREATED',
      'TASK_MOVED',
      'PHASE_STATUS_CHANGED',
      'PHASE_VALIDATED',
      'PHASE_REVISION_REQUESTED',
    ]
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/__tests__/project-phases-client.test.ts
```

Attendu : PASS (9 tests).

- [ ] **Step 7: Typecheck, non-régression du portail client puis commit**

```bash
cd backend && npm run typecheck && npx vitest run src/__tests__/client-portal-access.test.ts src/__tests__/project-collaboration.test.ts
```

```bash
git add backend/src/routes/client/projectPhases.ts backend/src/index.ts backend/src/routes/projects.ts backend/src/__tests__/project-phases-client.test.ts && git commit -m "feat(phases): routes client de validation et de demande de retouches"
```

---

### Task 8: `defaultPhases` sur les templates et instanciation à la création de projet

**Files:**
- Modify: `backend/src/types/models/project.ts` (`ITemplatePhase`, `IProjectTemplate.defaultPhases`)
- Modify: `backend/src/models/ProjectTemplate.ts`
- Modify: `backend/src/routes/admin/templates.ts` (POST + PATCH)
- Modify: `backend/src/routes/agent/templates.ts` (POST + PATCH, miroir du champ)
- Modify: `backend/src/routes/admin/projects/core.ts` (`templateId` sur `POST /`)
- Modify: `src/types/template.types.ts` (`TemplatePhase`, `defaultPhases`)
- Modify: `src/pages/admin/project-form/index.tsx` (`selectedTemplateId` → payload)
- Test: `backend/src/__tests__/project-phases-template.test.ts`

**Interfaces:**
- Consumes: `ProjectPhase` (Task 1).
- Produit : `ITemplatePhase { title: string; description: string; requiresClientValidation: boolean }` et le champ `defaultPhases: ITemplatePhase[]` sur `ProjectTemplate` ; le champ optionnel `templateId` accepté par `POST /api/admin/projects`.

> **Friction connue n°2 de la spec** : aujourd'hui aucune instanciation serveur n'existe depuis un template (le formulaire ne fait que pré-remplir ; `defaultSections`/`defaultTasks` restent non instanciés — comportement inchangé ici). Seules les `defaultPhases` sont instanciées, via le `templateId` transmis explicitement.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/project-phases-template.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import adminTemplateRoutes from '../routes/admin/templates.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectTemplate from '../models/ProjectTemplate.js'

let app: Express
let adminId: string
let clientId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', adminProjectRoutes)
  app.use('/api/admin/templates', adminTemplateRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT', status: 'ACTIF' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
})

async function createTemplate() {
  return ProjectTemplate.create({
    name: 'Site vitrine',
    defaultPhases: [
      { title: 'Cadrage', description: 'Ateliers', requiresClientValidation: false },
      { title: 'Maquettes', requiresClientValidation: true },
      { title: 'Développement' },
    ],
    createdBy: adminId,
  })
}

describe('champ defaultPhases des templates', () => {
  it('accepte et filtre les étapes par défaut à la création', async () => {
    const response = await request(app)
      .post('/api/admin/templates')
      .set('Cookie', await cookieFor(adminId))
      .send({
        name: 'Site vitrine',
        defaultPhases: [
          { title: 'Cadrage' },
          { description: 'sans titre — doit être filtrée' },
          { title: 'Maquettes', requiresClientValidation: true },
        ],
      })
      .expect(201)

    expect(response.body.template.defaultPhases).toHaveLength(2)
    expect(response.body.template.defaultPhases[1]).toMatchObject({
      title: 'Maquettes',
      requiresClientValidation: true,
    })
  })

  it('met à jour les étapes par défaut', async () => {
    const template = await createTemplate()
    const response = await request(app)
      .patch(`/api/admin/templates/${template._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ defaultPhases: [{ title: 'Recette', requiresClientValidation: true }] })
      .expect(200)

    expect(response.body.template.defaultPhases).toHaveLength(1)
    expect(response.body.template.defaultPhases[0].title).toBe('Recette')
  })
})

describe('instanciation du pipeline à la création de projet', () => {
  it('crée une étape A_VENIR par entrée du template, dans l’ordre', async () => {
    const template = await createTemplate()

    const response = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site Corbel', templateId: String(template._id) })
      .expect(201)

    const phases = await ProjectPhase.find({ project: response.body.project._id }).sort({ order: 1 })
    expect(phases.map((p) => p.title)).toEqual(['Cadrage', 'Maquettes', 'Développement'])
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2])
    expect(phases.map((p) => p.status)).toEqual(['A_VENIR', 'A_VENIR', 'A_VENIR'])
    expect(phases.map((p) => p.requiresClientValidation)).toEqual([false, true, false])
    expect(phases[0].description).toBe('Ateliers')
    expect(phases[0].dueAt).toBeNull()
    expect(phases[0].linkedItems).toHaveLength(0)
    expect(String(phases[0].createdBy)).toBe(adminId)
  })

  it('refuse 400 un templateId inconnu sans créer de projet', async () => {
    await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site fantôme', templateId: '64b7f0000000000000000000' })
      .expect(400)

    expect(await Project.countDocuments({ name: 'Site fantôme' })).toBe(0)
  })

  it('ne crée aucune étape sans templateId', async () => {
    const response = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site nu' })
      .expect(201)

    expect(await ProjectPhase.countDocuments({ project: response.body.project._id })).toBe(0)
  })

  it('laisse les étapes instanciées librement modifiables (aucun couplage au template)', async () => {
    const template = await createTemplate()
    const created = await request(app)
      .post('/api/admin/projects')
      .set('Cookie', await cookieFor(adminId))
      .send({ clientId, name: 'Site Corbel', templateId: String(template._id) })
      .expect(201)
    const projectId = created.body.project._id
    const phase = await ProjectPhase.findOne({ project: projectId, order: 0 })

    await request(app)
      .patch(`/api/admin/projects/${projectId}/phases/${phase!._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Cadrage renommé' })
      .expect(200)
    await request(app)
      .delete(`/api/admin/projects/${projectId}/phases/${phase!._id}`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(await ProjectPhase.countDocuments({ project: projectId })).toBe(2)
    const untouched = await ProjectTemplate.findById(template._id)
    expect(untouched!.defaultPhases).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/project-phases-template.test.ts
```

Attendu : ÉCHEC — `expect(received).toHaveLength(2)` sur `defaultPhases` `undefined`.

- [ ] **Step 3: Étendre les types et le modèle de template**

Dans `backend/src/types/models/project.ts`, après `ITemplateTask` :

```ts
export interface ITemplatePhase {
  title: string
  description: string
  requiresClientValidation: boolean
}
```

et dans `IProjectTemplate`, après `defaultTasks: ITemplateTask[]` :

```ts
  defaultPhases: ITemplatePhase[]
```

Dans `backend/src/models/ProjectTemplate.ts`, après le bloc `defaultTasks` :

```ts
    defaultPhases: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        requiresClientValidation: { type: Boolean, default: false },
      },
    ],
```

- [ ] **Step 4: Accepter `defaultPhases` sur les routes de template**

Dans `backend/src/routes/admin/templates.ts` :
- POST : ajouter `defaultPhases` à la déstructuration du body puis, après la ligne `defaultTasks: ...` de `ProjectTemplate.create`, ajouter
  ```ts
        defaultPhases: Array.isArray(defaultPhases) ? defaultPhases.filter((p: any) => p.title) : [],
  ```
- PATCH : ajouter `defaultPhases` à la déstructuration puis, après la ligne `if (defaultTasks !== undefined) ...`, ajouter
  ```ts
      if (defaultPhases !== undefined) update.defaultPhases = Array.isArray(defaultPhases) ? defaultPhases.filter((p: any) => p.title) : []
  ```

Dans `backend/src/routes/agent/templates.ts` (miroir strict, aucune autre route agent ajoutée) :
- validateurs : ajouter `body('defaultPhases').optional().isArray(),` sous `body('defaultTasks').optional().isArray(),`
- POST : ajouter `defaultPhases: Array.isArray(req.body.defaultPhases) ? req.body.defaultPhases : [],`
- PATCH : ajouter
  ```ts
      if (Array.isArray(req.body.defaultPhases)) {
        tpl.defaultPhases = req.body.defaultPhases as unknown as typeof tpl.defaultPhases
      }
  ```

- [ ] **Step 5: Instancier le pipeline dans `POST /api/admin/projects`**

Dans `backend/src/routes/admin/projects/core.ts`, ajouter les imports :

```ts
import ProjectTemplate from '../../../models/ProjectTemplate.js'
import ProjectPhase from '../../../models/ProjectPhase.js'
```

Dans le handler `router.post('/', ...)`, remplacer la déstructuration et insérer la résolution du template **avant** `Project.create` :

```ts
      const { clientId, name, description, status, templateId } = req.body || {}
```

puis, juste après le contrôle `client.status` (donc avant `normalizeOptions`) :

```ts
      // La résolution précède la création : un templateId invalide ne doit
      // jamais laisser derrière lui un projet à moitié instancié.
      let template = null
      if (templateId) {
        template = await ProjectTemplate.findById(templateId).catch(() => null)
        if (!template) {
          return res.status(400).json({ error: 'Template non trouvé' })
        }
      }
```

et, juste après `const project = await Project.create({...})` (avant le `logActivity`) :

```ts
      if (template) {
        const defaultPhases = Array.isArray(template.defaultPhases) ? template.defaultPhases : []
        await ProjectPhase.insertMany(
          defaultPhases.map((phase, index) => ({
            project: project._id,
            title: phase.title,
            description: phase.description || '',
            order: index,
            dueAt: null,
            status: 'A_VENIR',
            requiresClientValidation: Boolean(phase.requiresClientValidation),
            linkedItems: [],
            createdBy: req.user!.id,
          })),
        )
      }
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

```bash
cd backend && npx vitest run src/__tests__/project-phases-template.test.ts
```

Attendu : PASS (6 tests).

- [ ] **Step 7: Transmettre `templateId` depuis le formulaire admin**

Dans `src/types/template.types.ts`, ajouter le type puis le champ :

```ts
export interface TemplatePhase {
  title: string
  description: string
  requiresClientValidation: boolean
}
```

et dans `ProjectTemplate`, après `defaultTasks: TemplateTask[]` :

```ts
  defaultPhases: TemplatePhase[]
```

Dans `src/pages/admin/project-form/index.tsx` :
- déclarer l'état à côté de `tagInput` :
  ```ts
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  ```
- mémoriser l'id dans `applyTemplate`, en tête de fonction, sans toucher au reste du pré-remplissage existant :
  ```ts
  const applyTemplate = (templateId: string) => {
    const t = templates.find((tpl) => tpl._id === templateId)
    if (!t) return
    setSelectedTemplateId(templateId)
  ```
- ajouter le champ au `payload` de `handleSubmit`, après `isArchived: form.isArchived,` :
  ```ts
        ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
  ```

- [ ] **Step 8: Vérifier le frontend puis commit**

```bash
npm run typecheck
```

```bash
cd backend && npm run typecheck && npx vitest run src/__tests__/agent-projects-integration.test.ts src/__tests__/agent-openapi-sync.test.ts
```

```bash
git add backend/src/types/models/project.ts backend/src/models/ProjectTemplate.ts backend/src/routes/admin/templates.ts backend/src/routes/agent/templates.ts backend/src/routes/admin/projects/core.ts backend/src/__tests__/project-phases-template.test.ts src/types/template.types.ts src/pages/admin/project-form/index.tsx && git commit -m "feat(phases): defaultPhases des templates et instanciation à la création de projet"
```

---

### Task 9: Types frontend et timeline de l'espace client

**Files:**
- Modify: `src/types/project.types.ts`
- Create: `src/pages/espace-client/ClientProjectPhases.tsx`
- Modify: `src/pages/espace-client/ProjectDetail.tsx` (chargement + onglet `progress` + libellés d'activité)
- Modify: `src/pages/espace-client/ClientPortal.css` (styles de la timeline)
- Test: `src/test/clientProjectPhases.test.tsx`

**Interfaces:**
- Consumes: le contrat de sanitisation du GET client (Task 7), `ItemCard` (`src/components/ItemCard.tsx`), `useConfirm` (`src/hooks/useConfirm.tsx`).
- Produit (types réutilisés par les Tasks 10 et 11) :

```ts
export type PhaseStatus = 'A_VENIR' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'TERMINEE'
export interface PhaseLinkedItem extends Partial<ProjectItem> { _id: string; title: string; type: string }
export interface PhaseValidation { validatedByName: string; validatedAt: string | null; comment: string }
export interface PhaseRevisionRequest { _id: string; requestedByName: string; comment: string; createdAt: string; resolvedAt: string | null }
export interface ProjectPhase { _id: string; title: string; description?: string; order: number; dueAt: string | null; status: PhaseStatus; requiresClientValidation: boolean; linkedItems: PhaseLinkedItem[]; validation: PhaseValidation; revisionRequests: PhaseRevisionRequest[] }
```

- Produit le composant `ClientProjectPhases` avec les props :

```ts
interface ClientProjectPhasesProps {
  phases: ProjectPhase[]
  accessRole: ProjectAccessRole
  onDownloadItem: (itemId: string, fileName: string) => void
  onValidate: (phaseId: string, comment: string) => Promise<void>
  onRequestRevision: (phaseId: string, comment: string) => Promise<void>
}
```

> **Écart maquette / spec assumé** : la planche « Projet — Étapes & validation » affiche le badge « Votre validation est attendue » ; la spec impose « En attente de votre validation ». La spec fait foi. Le reste de la planche est repris : marqueurs carrés sur ligne verticale, numérotation `n · Titre` en majuscules, mention de déblocage sur les étapes à venir bloquées.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/test/clientProjectPhases.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClientProjectPhases from '../pages/espace-client/ClientProjectPhases'
import type { ProjectPhase } from '../types/project.types'

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Maquettes',
  description: 'Les 5 pages sont prêtes.',
  order: 0,
  dueAt: null,
  status: 'EN_ATTENTE_VALIDATION',
  requiresClientValidation: true,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

function renderTimeline(phases: ProjectPhase[], accessRole: 'OWNER' | 'EDITOR' | 'VIEWER' = 'OWNER') {
  const onValidate = vi.fn().mockResolvedValue(undefined)
  const onRequestRevision = vi.fn().mockResolvedValue(undefined)
  render(
    <ClientProjectPhases
      phases={phases}
      accessRole={accessRole}
      onDownloadItem={vi.fn()}
      onValidate={onValidate}
      onRequestRevision={onRequestRevision}
    />,
  )
  return { onValidate, onRequestRevision }
}

describe('ClientProjectPhases', () => {
  it('affiche un état vide sans étape', () => {
    renderTimeline([])
    expect(screen.getByText('Le déroulé du projet apparaîtra ici.')).toBeInTheDocument()
  })

  it('affiche les libellés de statut et la mention de validation', () => {
    renderTimeline([
      phase({
        _id: 'p1',
        title: 'Cadrage',
        status: 'TERMINEE',
        validation: { validatedByName: 'Claire Corbel', validatedAt: '2026-08-12T14:32:00.000Z', comment: '' },
      }),
      phase({ _id: 'p2', title: 'Maquettes' }),
      phase({ _id: 'p3', title: 'Développement', status: 'A_VENIR', requiresClientValidation: false }),
    ])

    expect(screen.getByText('Terminée')).toBeInTheDocument()
    expect(screen.getByText('En attente de votre validation')).toBeInTheDocument()
    expect(screen.getByText('À venir')).toBeInTheDocument()
    expect(screen.getByText(/Validée par Claire Corbel le 12 août 2026/)).toBeInTheDocument()
  })

  it('signale qu’une étape à venir est bloquée par un jalon client non validé', () => {
    renderTimeline([
      phase({ _id: 'p1', title: 'Maquettes' }),
      phase({ _id: 'p2', title: 'Développement', order: 1, status: 'A_VENIR', requiresClientValidation: false }),
    ])
    expect(screen.getByText('Se débloque à la validation de « Maquettes »')).toBeInTheDocument()
  })

  it('valide l’étape après confirmation pour le propriétaire', async () => {
    const user = userEvent.setup()
    const { onValidate } = renderTimeline([phase()])

    await user.type(screen.getByPlaceholderText('Votre commentaire (obligatoire pour des retouches)'), 'Parfait')
    await user.click(screen.getByRole('button', { name: 'Valider cette étape' }))
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => expect(onValidate).toHaveBeenCalledWith('phase-1', 'Parfait'))
  })

  it('n’autorise les retouches qu’avec un commentaire', async () => {
    const user = userEvent.setup()
    const { onRequestRevision } = renderTimeline([phase()])

    const button = screen.getByRole('button', { name: 'Demander des retouches' })
    expect(button).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Votre commentaire (obligatoire pour des retouches)'), 'Header trop dense')
    expect(button).toBeEnabled()
    await user.click(button)

    await waitFor(() => expect(onRequestRevision).toHaveBeenCalledWith('phase-1', 'Header trop dense'))
  })

  it('limite un EDITOR aux retouches et un VIEWER à la lecture', () => {
    const { unmount } = render(
      <ClientProjectPhases
        phases={[phase()]}
        accessRole="EDITOR"
        onDownloadItem={vi.fn()}
        onValidate={vi.fn()}
        onRequestRevision={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Valider cette étape' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander des retouches' })).toBeInTheDocument()
    expect(screen.getByText('En attente de validation par le propriétaire du projet')).toBeInTheDocument()
    unmount()

    renderTimeline([phase()], 'VIEWER')
    expect(screen.queryByRole('button', { name: 'Valider cette étape' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander des retouches' })).not.toBeInTheDocument()
    expect(screen.getByText('En attente de validation par le propriétaire du projet')).toBeInTheDocument()
  })

  it('affiche les demandes de retouches non résolues', () => {
    renderTimeline([
      phase({
        status: 'EN_COURS',
        revisionRequests: [
          { _id: 'r1', requestedByName: 'Claire Corbel', comment: 'Header trop dense', createdAt: '2026-08-20T09:00:00.000Z', resolvedAt: null },
          { _id: 'r2', requestedByName: 'Claire Corbel', comment: 'Déjà traitée', createdAt: '2026-08-18T09:00:00.000Z', resolvedAt: '2026-08-19T09:00:00.000Z' },
        ],
      }),
    ])

    expect(screen.getByText('Header trop dense')).toBeInTheDocument()
    expect(screen.queryByText('Déjà traitée')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
npx vitest run src/test/clientProjectPhases.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "../pages/espace-client/ClientProjectPhases"`.

- [ ] **Step 3: Ajouter les types frontend**

Dans `src/types/project.types.ts`, ajouter après `export type ProjectAccessRole = ...` :

```ts
export type PhaseStatus = 'A_VENIR' | 'EN_COURS' | 'EN_ATTENTE_VALIDATION' | 'TERMINEE'
```

et à la fin du fichier :

```ts
/** Livrable lié à une étape : peuplé partiellement selon l'appelant (admin ou client). */
export interface PhaseLinkedItem extends Partial<ProjectItem> {
  _id: string
  title: string
  type: string
}

export interface PhaseValidation {
  validatedByName: string
  validatedAt: string | null
  comment: string
}

export interface PhaseRevisionRequest {
  _id: string
  requestedByName: string
  comment: string
  createdAt: string
  resolvedAt: string | null
}

export interface ProjectPhase {
  _id: string
  title: string
  description?: string
  order: number
  dueAt: string | null
  status: PhaseStatus
  requiresClientValidation: boolean
  linkedItems: PhaseLinkedItem[]
  validation: PhaseValidation
  revisionRequests: PhaseRevisionRequest[]
}
```

- [ ] **Step 4: Écrire le composant timeline**

Créer `src/pages/espace-client/ClientProjectPhases.tsx` :

```tsx
import React, { useState } from 'react'
import ItemCard from '../../components/ItemCard'
import { useConfirm } from '../../hooks/useConfirm'
import type { PhaseStatus, ProjectAccessRole, ProjectItem, ProjectPhase } from '../../types/project.types'

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de votre validation',
  TERMINEE: 'Terminée',
}

const PHASE_STATUS_MODIFIERS: Record<PhaseStatus, string> = {
  A_VENIR: 'is-todo',
  EN_COURS: 'is-current',
  EN_ATTENTE_VALIDATION: 'is-waiting',
  TERMINEE: 'is-done',
}

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

interface ClientProjectPhasesProps {
  phases: ProjectPhase[]
  accessRole: ProjectAccessRole
  onDownloadItem: (itemId: string, fileName: string) => void
  onValidate: (phaseId: string, comment: string) => Promise<void>
  onRequestRevision: (phaseId: string, comment: string) => Promise<void>
}

const ClientProjectPhases: React.FC<ClientProjectPhasesProps> = ({
  phases,
  accessRole,
  onDownloadItem,
  onValidate,
  onRequestRevision,
}) => {
  const [comments, setComments] = useState<Record<string, string>>({})
  const [pendingPhaseId, setPendingPhaseId] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  if (phases.length === 0) {
    return (
      <div className="client-phases">
        <h2 className="client-progress-section-title">Étapes du projet</h2>
        <p className="client-phases-empty">Le déroulé du projet apparaîtra ici.</p>
      </div>
    )
  }

  const setComment = (phaseId: string, value: string) => {
    setComments((prev) => ({ ...prev, [phaseId]: value }))
  }

  // Le backend reste seul juge du verrouillage ; cette lecture n'est qu'un
  // repère visuel calculé sur les étapes déjà chargées.
  const blockingPhaseFor = (phase: ProjectPhase): ProjectPhase | undefined =>
    phases.find(
      (candidate) =>
        candidate.order < phase.order && candidate.requiresClientValidation && !candidate.validation.validatedAt,
    )

  const handleValidate = async (phase: ProjectPhase) => {
    const confirmed = await confirm({
      title: 'Valider cette étape',
      message: `Confirmez-vous la validation de l’étape « ${phase.title} » ? Elle est horodatée et enregistrée à votre nom.`,
      confirmLabel: 'Valider',
      variant: 'info',
    })
    if (!confirmed) return
    setPendingPhaseId(phase._id)
    try {
      await onValidate(phase._id, (comments[phase._id] || '').trim())
      setComment(phase._id, '')
    } finally {
      setPendingPhaseId(null)
    }
  }

  const handleRevision = async (phase: ProjectPhase) => {
    const comment = (comments[phase._id] || '').trim()
    if (!comment) return
    setPendingPhaseId(phase._id)
    try {
      await onRequestRevision(phase._id, comment)
      setComment(phase._id, '')
    } finally {
      setPendingPhaseId(null)
    }
  }

  return (
    <div className="client-phases">
      <h2 className="client-progress-section-title">Étapes du projet</h2>

      {phases.map((phase, index) => {
        const isWaiting = phase.status === 'EN_ATTENTE_VALIDATION'
        const blocking = phase.status === 'A_VENIR' ? blockingPhaseFor(phase) : undefined
        const openRevisions = phase.revisionRequests.filter((revision) => !revision.resolvedAt)
        const busy = pendingPhaseId === phase._id
        const comment = comments[phase._id] || ''

        return (
          <div key={phase._id} className="client-phase-row">
            <div className="client-phase-marker">
              <span className={`client-phase-dot ${PHASE_STATUS_MODIFIERS[phase.status]}`} />
              {index < phases.length - 1 && <span className="client-phase-line" />}
            </div>

            <div className={`client-phase-body ${isWaiting ? 'client-phase-card' : ''}`}>
              <div className="client-phase-head">
                <span className="client-phase-title">
                  {index + 1} · {phase.title}
                </span>
                <span className={`client-phase-badge ${PHASE_STATUS_MODIFIERS[phase.status]}`}>
                  {PHASE_STATUS_LABELS[phase.status]}
                </span>
                {phase.validation.validatedAt && (
                  <span className="client-phase-meta">
                    Validée par {phase.validation.validatedByName} le {formatDate(phase.validation.validatedAt)}
                  </span>
                )}
                {phase.dueAt && !phase.validation.validatedAt && (
                  <span className="client-phase-meta">Prévue le {formatDate(phase.dueAt)}</span>
                )}
              </div>

              {phase.description && <p className="client-phase-description">{phase.description}</p>}

              {phase.validation.validatedAt && phase.validation.comment && (
                <p className="client-phase-description">« {phase.validation.comment} »</p>
              )}

              {blocking && (
                <span className="client-phase-locked">Se débloque à la validation de « {blocking.title} »</span>
              )}

              {isWaiting && phase.linkedItems.length > 0 && (
                <div className="client-phase-items">
                  {phase.linkedItems.map((item) => (
                    <ItemCard key={item._id} item={item as ProjectItem} onDownload={onDownloadItem} />
                  ))}
                </div>
              )}

              {isWaiting && accessRole === 'OWNER' && (
                <div className="client-phase-actions">
                  <textarea
                    className="client-phase-comment"
                    placeholder="Votre commentaire (obligatoire pour des retouches)"
                    value={comment}
                    onChange={(event) => setComment(phase._id, event.target.value)}
                    rows={3}
                  />
                  <div className="client-phase-buttons">
                    <button className="client-phase-button" onClick={() => handleValidate(phase)} disabled={busy}>
                      Valider cette étape
                    </button>
                    <button
                      className="client-phase-button client-phase-button-ghost"
                      onClick={() => handleRevision(phase)}
                      disabled={busy || !comment.trim()}
                    >
                      Demander des retouches
                    </button>
                  </div>
                </div>
              )}

              {isWaiting && accessRole !== 'OWNER' && (
                <div className="client-phase-actions">
                  <span className="client-phase-meta">En attente de validation par le propriétaire du projet</span>
                  {accessRole === 'EDITOR' && (
                    <>
                      <textarea
                        className="client-phase-comment"
                        placeholder="Votre commentaire (obligatoire pour des retouches)"
                        value={comment}
                        onChange={(event) => setComment(phase._id, event.target.value)}
                        rows={3}
                      />
                      <div className="client-phase-buttons">
                        <button
                          className="client-phase-button client-phase-button-ghost"
                          onClick={() => handleRevision(phase)}
                          disabled={busy || !comment.trim()}
                        >
                          Demander des retouches
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {openRevisions.length > 0 && (
                <div className="client-phase-revisions">
                  {openRevisions.map((revision) => (
                    <div key={revision._id} className="client-phase-revision">
                      <span className="client-phase-meta">
                        Retouches demandées par {revision.requestedByName} le {formatDate(revision.createdAt)}
                      </span>
                      <p className="client-phase-description">{revision.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {ConfirmDialog}
    </div>
  )
}

export default ClientProjectPhases
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

```bash
npx vitest run src/test/clientProjectPhases.test.tsx
```

Attendu : PASS (7 tests).

- [ ] **Step 6: Brancher la timeline dans l'onglet « Avancement »**

Dans `src/pages/espace-client/ProjectDetail.tsx` :

1. Imports (après `import ItemCard from '../../components/ItemCard'`) :

```tsx
import ClientProjectPhases from './ClientProjectPhases'
```

et compléter l'import de types avec `ProjectPhase`.

2. État, à côté de `const [items, setItems] = useState<ProjectItem[]>([])` :

```tsx
  const [phases, setPhases] = useState<ProjectPhase[]>([])
```

3. Chargement : ajouter l'appel au `Promise.all` du `useEffect` (échec toléré comme `task-progress`) :

```tsx
          apiFetch<{ phases: ProjectPhase[] }>(`/api/projects/${id}/phases`).catch(() => ({ phases: [] })),
```

en l'ajoutant comme dernier élément du tableau et en complétant la déstructuration :

```tsx
        const [projectData, sectionsData, itemsData, progressData, activityData, phasesData] = await Promise.all([
```

puis, à côté des autres `set...` :

```tsx
        setPhases(phasesData.phases || [])
```

4. Rechargement + actions, après `downloadItem` :

```tsx
  const reloadPhases = useCallback(async () => {
    const data = await apiFetch<{ phases: ProjectPhase[] }>(`/api/projects/${id}/phases`)
    setPhases(data.phases || [])
  }, [id])

  const validatePhase = async (phaseId: string, comment: string) => {
    setError('')
    try {
      await apiFetch(`/api/projects/${id}/phases/${phaseId}/validate`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      })
      await reloadPhases()
    } catch (err: unknown) {
      setError((err as Error).message || 'Validation impossible')
    }
  }

  const requestPhaseRevision = async (phaseId: string, comment: string) => {
    setError('')
    try {
      await apiFetch(`/api/projects/${id}/phases/${phaseId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      })
      await reloadPhases()
    } catch (err: unknown) {
      setError((err as Error).message || 'Demande de retouches impossible')
    }
  }
```

5. Rendu : dans `{activeTab === 'progress' && (`, insérer la timeline **en tête** du bloc, juste après `<div className="client-project-content">` et avant `{/* Project Info */}` :

```tsx
          <ClientProjectPhases
            phases={phases}
            accessRole={accessRole}
            onDownloadItem={downloadItem}
            onValidate={validatePhase}
            onRequestRevision={requestPhaseRevision}
          />
```

Les blocs « Informations du projet », « Avancement des tâches » et « Activité récente » restent inchangés en dessous.

6. Fil d'activité : compléter `getActivityLabel` et `getActivityIcon` :

```tsx
      PHASE_STATUS_CHANGED: 'Étape mise à jour',
      PHASE_VALIDATED: 'Étape validée',
      PHASE_REVISION_REQUESTED: 'Retouches demandées',
```

```tsx
      PHASE_STATUS_CHANGED: '🚩',
      PHASE_VALIDATED: '✔️',
      PHASE_REVISION_REQUESTED: '✍️',
```

- [ ] **Step 7: Ajouter les styles MONOLITHE**

À la fin de `src/pages/espace-client/ClientPortal.css` (avant l'éventuel bloc `@media` final, sinon en toute fin de fichier) :

```css
/* ── Timeline des étapes de production (thème MONOLITHE : angles droits, sans ombre) ── */
.client-phases {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 32px;
  margin-bottom: 24px;
}

.client-phases-empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}

.client-phase-row {
  display: flex;
  gap: 14px;
}

.client-phase-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex: 0 0 16px;
}

.client-phase-dot {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
}

.client-phase-dot.is-done {
  background: #22c55e;
}

.client-phase-dot.is-waiting {
  background: #f59e0b;
}

.client-phase-dot.is-current {
  background: var(--primary);
}

.client-phase-dot.is-todo {
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.client-phase-line {
  width: 2px;
  flex: 1;
  min-height: 18px;
  background: var(--border-color);
}

.client-phase-body {
  flex: 1;
  padding: 0 4px 20px;
}

.client-phase-card {
  background: var(--bg-secondary);
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 18px 20px;
  margin-bottom: 20px;
}

.client-phase-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.client-phase-title {
  font-size: 0.86rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-primary);
}

.client-phase-badge {
  padding: 3px 9px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

.client-phase-badge.is-done {
  background: rgba(34, 197, 94, 0.13);
  color: #22c55e;
}

.client-phase-badge.is-waiting {
  background: rgba(245, 158, 11, 0.13);
  color: #f59e0b;
}

.client-phase-badge.is-current {
  background: var(--accent-medium);
  color: var(--primary-light);
}

.client-phase-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.client-phase-locked {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.client-phase-description {
  margin: 10px 0 0;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.client-phase-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
}

.client-phase-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.client-phase-comment {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.8rem;
  padding: 10px 12px;
  resize: vertical;
}

.client-phase-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.client-phase-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--primary-fg);
  font-family: inherit;
  font-weight: 800;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.client-phase-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.client-phase-button-ghost {
  background: transparent;
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.4);
}

.client-phase-revisions {
  margin-top: 14px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

- [ ] **Step 8: Vérifier le rendu réel dans le navigateur**

Démarrer la preview (`preview_start` sur l'entrée de `.claude/launch.json`, ou la créer si absente), ouvrir `/espace-client/projets/<id>?tab=progress` sur un projet de démo disposant d'étapes, puis :
- `read_console_messages` : aucune erreur ;
- `computer {action: "screenshot"}` : timeline lisible, angles droits, badge orange sur l'étape en attente ;
- `resize_window` preset `mobile` : la timeline ne provoque pas de scroll horizontal.

- [ ] **Step 9: Typecheck, suite frontend puis commit**

```bash
npm run typecheck && npx vitest run src/test/clientProjectPhases.test.tsx src/test/clientProjectChat.test.tsx
```

```bash
git add src/types/project.types.ts src/pages/espace-client/ClientProjectPhases.tsx src/pages/espace-client/ProjectDetail.tsx src/pages/espace-client/ClientPortal.css src/test/clientProjectPhases.test.tsx && git commit -m "feat(phases): timeline des étapes et validation dans l'espace client"
```

---

### Task 10: Hook admin `useProjectPhases`

**Files:**
- Create: `src/pages/admin/project-detail/hooks/useProjectPhases.ts`
- Test: `src/pages/admin/project-detail/hooks/useProjectPhases.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` / `ApiError` (`src/lib/api.ts`), types `ProjectPhase`, `PhaseStatus` (Task 9), endpoints admin (Tasks 5 et 6).
- Produit (consommé par la Task 11) :

```ts
export type PhaseForm = { title: string; description: string; dueAt: string; requiresClientValidation: boolean; linkedItems: string[] }
export type PhaseTransition = 'start' | 'request-validation' | 'complete' | 'cancel-validation-request' | 'revert'

export function useProjectPhases(options: {
  projectId?: string
  canViewPhases: boolean
  canManagePhases: boolean
  confirm: (options: { message: string; title?: string }) => Promise<boolean>
  ensurePermission: (allowed: boolean, message: string) => boolean
  setError: (error: string) => void
}): {
  phases: ProjectPhase[]
  phaseForm: PhaseForm
  setPhaseForm: (form: PhaseForm) => void
  editingPhaseId: string | null
  loadPhases: () => Promise<void>
  startEditPhase: (phase: ProjectPhase) => void
  cancelEditPhase: () => void
  handleSubmitPhase: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleDeletePhase: (phaseId: string) => Promise<void>
  handleTransition: (phaseId: string, transition: PhaseTransition) => Promise<void>
  handleMovePhase: (phaseId: string, direction: -1 | 1) => Promise<void>
  handleResolveRevision: (phaseId: string, revisionId: string) => Promise<void>
}
```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/pages/admin/project-detail/hooks/useProjectPhases.test.tsx` :

```tsx
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from '../../../../lib/api'
import { useProjectPhases } from './useProjectPhases'
import type { ProjectPhase } from '../../../../types/project.types'

vi.mock('../../../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/api')>('../../../../lib/api')
  return { ...actual, apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }
})

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Cadrage',
  description: '',
  order: 0,
  dueAt: null,
  status: 'A_VENIR',
  requiresClientValidation: false,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

describe('useProjectPhases', () => {
  const confirm = vi.fn()
  const ensurePermission = vi.fn()
  const setError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ensurePermission.mockReturnValue(true)
    confirm.mockResolvedValue(true)
    vi.mocked(apiFetch).mockResolvedValue({ phases: [] })
  })

  function renderPhasesHook(canManagePhases = true) {
    return renderHook(() =>
      useProjectPhases({
        projectId: 'project-1',
        canViewPhases: true,
        canManagePhases,
        confirm,
        ensurePermission,
        setError,
      }),
    )
  }

  it('charge les étapes du projet', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ phases: [phase()] })
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.loadPhases()
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases')
    expect(result.current.phases).toHaveLength(1)
  })

  it('crée une étape puis réinitialise le formulaire', async () => {
    const { result } = renderPhasesHook()
    act(() => {
      result.current.setPhaseForm({
        title: 'Maquettes',
        description: 'Cinq pages',
        dueAt: '2026-09-30',
        requiresClientValidation: true,
        linkedItems: ['item-1'],
      })
    })

    await act(async () => {
      await result.current.handleSubmitPhase({ preventDefault: vi.fn() } as never)
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Maquettes',
        description: 'Cinq pages',
        dueAt: '2026-09-30',
        requiresClientValidation: true,
        linkedItems: ['item-1'],
      }),
    })
    expect(result.current.phaseForm.title).toBe('')
    expect(result.current.phaseForm.requiresClientValidation).toBe(false)
  })

  it('bascule en édition et envoie un PATCH sur l’étape sélectionnée', async () => {
    const { result } = renderPhasesHook()
    act(() => {
      result.current.startEditPhase(phase({ _id: 'phase-9', title: 'Recette', dueAt: '2026-09-30T00:00:00.000Z' }))
    })
    expect(result.current.editingPhaseId).toBe('phase-9')
    expect(result.current.phaseForm.title).toBe('Recette')
    expect(result.current.phaseForm.dueAt).toBe('2026-09-30')

    await act(async () => {
      await result.current.handleSubmitPhase({ preventDefault: vi.fn() } as never)
    })

    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/phase-9')
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: 'PATCH' })
    expect(result.current.editingPhaseId).toBeNull()
  })

  it('appelle l’endpoint de transition correspondant', async () => {
    const { result } = renderPhasesHook()
    await act(async () => {
      await result.current.handleTransition('phase-1', 'request-validation')
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/phases/phase-1/request-validation', {
      method: 'POST',
    })
  })

  it('affiche l’étape bloquante sur un 409 PHASE_LOCKED', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(
      new ApiError(409, 'Étape verrouillée', { code: 'PHASE_LOCKED', blockingPhase: { _id: 'p0', title: 'Maquettes' } }),
    )
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.handleTransition('phase-1', 'start')
    })

    expect(setError).toHaveBeenCalledWith(
      'Impossible de démarrer cette étape : « Maquettes » doit d’abord être validée par le client.',
    )
  })

  it('réordonne en envoyant la liste complète des ids', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      phases: [phase({ _id: 'a', order: 0 }), phase({ _id: 'b', order: 1 }), phase({ _id: 'c', order: 2 })],
    })
    const { result } = renderPhasesHook()
    await act(async () => {
      await result.current.loadPhases()
    })
    vi.mocked(apiFetch).mockClear()
    vi.mocked(apiFetch).mockResolvedValue({ phases: [] })

    await act(async () => {
      await result.current.handleMovePhase('c', -1)
    })

    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/reorder')
    expect(JSON.parse((vi.mocked(apiFetch).mock.calls[0][1] as { body: string }).body)).toEqual({
      phaseIds: ['a', 'c', 'b'],
    })
  })

  it('supprime après confirmation et résout une demande de retouches', async () => {
    const { result } = renderPhasesHook()

    await act(async () => {
      await result.current.handleDeletePhase('phase-1')
    })
    expect(confirm).toHaveBeenCalled()
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/api/admin/projects/project-1/phases/phase-1')
    expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    vi.mocked(apiFetch).mockClear()
    await act(async () => {
      await result.current.handleResolveRevision('phase-1', 'rev-1')
    })
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe(
      '/api/admin/projects/project-1/phases/phase-1/revisions/rev-1/resolve',
    )
  })

  it('bloque les mutations sans la permission manage_phases', async () => {
    ensurePermission.mockReturnValue(false)
    const { result } = renderPhasesHook(false)

    await act(async () => {
      await result.current.handleTransition('phase-1', 'start')
    })

    expect(apiFetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
npx vitest run src/pages/admin/project-detail/hooks/useProjectPhases.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./useProjectPhases"`.

- [ ] **Step 3: Écrire le hook**

Créer `src/pages/admin/project-detail/hooks/useProjectPhases.ts` :

```ts
import { useCallback, useState, type FormEvent } from 'react'
import { apiFetch, ApiError } from '../../../../lib/api'
import type { ProjectPhase } from '../../../../types/project.types'

export type PhaseTransition =
  | 'start'
  | 'request-validation'
  | 'complete'
  | 'cancel-validation-request'
  | 'revert'

export interface PhaseForm {
  title: string
  description: string
  dueAt: string
  requiresClientValidation: boolean
  linkedItems: string[]
}

const initialPhaseForm: PhaseForm = {
  title: '',
  description: '',
  dueAt: '',
  requiresClientValidation: false,
  linkedItems: [],
}

const TRANSITION_ERRORS: Record<PhaseTransition, string> = {
  start: 'Erreur au démarrage de l’étape',
  'request-validation': 'Erreur à la demande de validation',
  complete: 'Erreur à la clôture de l’étape',
  'cancel-validation-request': 'Erreur à l’annulation de la demande',
  revert: 'Erreur à la réouverture de l’étape',
}

interface UseProjectPhasesOptions {
  projectId?: string
  canViewPhases: boolean
  canManagePhases: boolean
  confirm: (options: { message: string; title?: string }) => Promise<boolean>
  ensurePermission: (allowed: boolean, message: string) => boolean
  setError: (error: string) => void
}

export function useProjectPhases({
  projectId,
  canViewPhases,
  canManagePhases,
  confirm,
  ensurePermission,
  setError,
}: UseProjectPhasesOptions) {
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [phaseForm, setPhaseForm] = useState<PhaseForm>(initialPhaseForm)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)

  const loadPhases = useCallback(async () => {
    if (!projectId || !canViewPhases) return
    try {
      const data = await apiFetch<{ phases?: ProjectPhase[] }>(`/api/admin/projects/${projectId}/phases`)
      setPhases(data.phases || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement des étapes')
    }
  }, [projectId, canViewPhases, setError])

  /** Les refus métier du backend portent un code : on les traduit pour l'admin. */
  const reportError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      const payload = (err.payload || {}) as { code?: string; blockingPhase?: { title?: string } }
      if (payload.code === 'PHASE_LOCKED' && payload.blockingPhase?.title) {
        setError(
          `Impossible de démarrer cette étape : « ${payload.blockingPhase.title} » doit d’abord être validée par le client.`,
        )
        return
      }
    }
    setError((err as Error).message || fallback)
  }

  const startEditPhase = (phase: ProjectPhase) => {
    setEditingPhaseId(phase._id)
    setPhaseForm({
      title: phase.title,
      description: phase.description || '',
      dueAt: phase.dueAt ? phase.dueAt.slice(0, 10) : '',
      requiresClientValidation: phase.requiresClientValidation,
      linkedItems: phase.linkedItems.map((item) => item._id),
    })
  }

  const cancelEditPhase = () => {
    setEditingPhaseId(null)
    setPhaseForm(initialPhaseForm)
  }

  const handleSubmitPhase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    try {
      const path = editingPhaseId
        ? `/api/admin/projects/${projectId}/phases/${editingPhaseId}`
        : `/api/admin/projects/${projectId}/phases`
      await apiFetch(path, {
        method: editingPhaseId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: phaseForm.title,
          description: phaseForm.description,
          dueAt: phaseForm.dueAt || null,
          requiresClientValidation: phaseForm.requiresClientValidation,
          linkedItems: phaseForm.linkedItems,
        }),
      })
      cancelEditPhase()
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur enregistrement de l’étape')
    }
  }

  const handleDeletePhase = async (phaseId: string) => {
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    if (!(await confirm({ message: 'Supprimer cette étape ?', title: 'Suppression' }))) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}`, { method: 'DELETE' })
      if (editingPhaseId === phaseId) cancelEditPhase()
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur suppression de l’étape')
    }
  }

  const handleTransition = async (phaseId: string, transition: PhaseTransition) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/${transition}`, { method: 'POST' })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, TRANSITION_ERRORS[transition])
    }
  }

  const handleMovePhase = async (phaseId: string, direction: -1 | 1) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    const index = phases.findIndex((phase) => phase._id === phaseId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= phases.length) return

    const phaseIds = phases.map((phase) => phase._id)
    ;[phaseIds[index], phaseIds[target]] = [phaseIds[target], phaseIds[index]]

    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ phaseIds }),
      })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur réordonnancement des étapes')
    }
  }

  const handleResolveRevision = async (phaseId: string, revisionId: string) => {
    setError('')
    if (!ensurePermission(canManagePhases, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/phases/${phaseId}/revisions/${revisionId}/resolve`, {
        method: 'POST',
      })
      await loadPhases()
    } catch (err: unknown) {
      reportError(err, 'Erreur traitement de la demande de retouches')
    }
  }

  return {
    phases,
    phaseForm,
    setPhaseForm,
    editingPhaseId,
    loadPhases,
    startEditPhase,
    cancelEditPhase,
    handleSubmitPhase,
    handleDeletePhase,
    handleTransition,
    handleMovePhase,
    handleResolveRevision,
  }
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

```bash
npx vitest run src/pages/admin/project-detail/hooks/useProjectPhases.test.tsx
```

Attendu : PASS (8 tests).

- [ ] **Step 5: Typecheck puis commit**

```bash
npm run typecheck
```

```bash
git add src/pages/admin/project-detail/hooks/useProjectPhases.ts src/pages/admin/project-detail/hooks/useProjectPhases.test.tsx && git commit -m "feat(phases): hook admin de pilotage des étapes"
```

---

### Task 11: Onglet admin « Étapes »

**Files:**
- Create: `src/pages/admin/project-detail/ProjectPhasesTab.tsx`
- Modify: `src/pages/admin/project-detail/index.tsx` (onglet + câblage du hook)
- Modify: `src/pages/espace-client/ClientPortal.css` (deux classes admin réutilisant les styles de timeline)
- Test: `src/test/adminProjectPhasesTab.test.tsx`

**Interfaces:**
- Consumes: `useProjectPhases` (Task 10), types `ProjectPhase` / `PhaseStatus` (Task 9), `PERMISSIONS.VIEW_PHASES` / `MANAGE_PHASES` via `hasPermission` (`src/lib/permissions.ts`, Task 3).
- Produit le composant :

```ts
interface ProjectPhasesTabProps {
  phases: ProjectPhase[]
  items: ProjectItem[]
  phaseForm: PhaseForm
  setPhaseForm: (form: PhaseForm) => void
  editingPhaseId: string | null
  canManagePhases: boolean
  onSubmitPhase: (event: FormEvent<HTMLFormElement>) => void
  onStartEdit: (phase: ProjectPhase) => void
  onCancelEdit: () => void
  onDeletePhase: (phaseId: string) => void
  onTransition: (phaseId: string, transition: PhaseTransition) => void
  onMovePhase: (phaseId: string, direction: -1 | 1) => void
  onResolveRevision: (phaseId: string, revisionId: string) => void
}
```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/test/adminProjectPhasesTab.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectPhasesTab from '../pages/admin/project-detail/ProjectPhasesTab'
import type { ProjectItem, ProjectPhase } from '../types/project.types'

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Maquettes',
  description: '',
  order: 0,
  dueAt: null,
  status: 'EN_COURS',
  requiresClientValidation: true,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

const items: ProjectItem[] = [
  { _id: 'item-1', type: 'MAQUETTE', title: 'Maquettes desktop', isVisible: true, isDownloadable: true },
  { _id: 'item-2', type: 'NOTE', title: 'Note interne', isVisible: false, isDownloadable: false },
]

function renderTab(phases: ProjectPhase[], canManagePhases = true) {
  const handlers = {
    onSubmitPhase: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
    onStartEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onDeletePhase: vi.fn(),
    onTransition: vi.fn(),
    onMovePhase: vi.fn(),
    onResolveRevision: vi.fn(),
  }
  render(
    <ProjectPhasesTab
      phases={phases}
      items={items}
      phaseForm={{ title: '', description: '', dueAt: '', requiresClientValidation: false, linkedItems: [] }}
      setPhaseForm={vi.fn()}
      editingPhaseId={null}
      canManagePhases={canManagePhases}
      {...handlers}
    />,
  )
  return handlers
}

describe('ProjectPhasesTab', () => {
  it('propose les transitions correspondant au statut', async () => {
    const user = userEvent.setup()
    const { onTransition } = renderTab([phase()])

    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Demander la validation client' }))
    expect(onTransition).toHaveBeenCalledWith('phase-1', 'request-validation')
  })

  it('propose Démarrer sur une étape à venir et Annuler la demande en attente', async () => {
    const user = userEvent.setup()
    const { onTransition } = renderTab([
      phase({ _id: 'p1', title: 'Cadrage', status: 'A_VENIR' }),
      phase({ _id: 'p2', title: 'Maquettes', order: 1, status: 'EN_ATTENTE_VALIDATION' }),
    ])

    await user.click(screen.getByRole('button', { name: 'Démarrer' }))
    expect(onTransition).toHaveBeenCalledWith('p1', 'start')

    await user.click(screen.getByRole('button', { name: 'Annuler la demande' }))
    expect(onTransition).toHaveBeenCalledWith('p2', 'cancel-validation-request')
  })

  it('affiche la mention de validation et fige les actions d’édition', () => {
    renderTab([
      phase({
        status: 'TERMINEE',
        validation: { validatedByName: 'Claire Corbel', validatedAt: '2026-08-12T14:32:00.000Z', comment: '' },
      }),
    ])

    expect(screen.getByText(/Validée par Claire Corbel le 12 août 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Rouvrir' })).not.toBeInTheDocument()
  })

  it('réordonne via les boutons monter/descendre', async () => {
    const user = userEvent.setup()
    const { onMovePhase } = renderTab([
      phase({ _id: 'p1', title: 'Cadrage' }),
      phase({ _id: 'p2', title: 'Maquettes', order: 1 }),
    ])

    await user.click(screen.getAllByRole('button', { name: 'Descendre' })[0])
    expect(onMovePhase).toHaveBeenCalledWith('p1', 1)
    await user.click(screen.getAllByRole('button', { name: 'Monter' })[1])
    expect(onMovePhase).toHaveBeenCalledWith('p2', -1)
  })

  it('liste les demandes de retouches ouvertes avec leur bouton de traitement', async () => {
    const user = userEvent.setup()
    const { onResolveRevision } = renderTab([
      phase({
        revisionRequests: [
          { _id: 'rev-1', requestedByName: 'Claire Corbel', comment: 'Header trop dense', createdAt: '2026-08-20T09:00:00.000Z', resolvedAt: null },
        ],
      }),
    ])

    expect(screen.getByText('Header trop dense')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marquer traitée' }))
    expect(onResolveRevision).toHaveBeenCalledWith('phase-1', 'rev-1')
  })

  it('avertit quand un livrable lié est masqué au client', () => {
    renderTab([
      phase({ linkedItems: [{ _id: 'item-2', title: 'Note interne', type: 'NOTE', isVisible: false }] }),
    ])
    // Deux occurrences attendues : la liste des livrables liés de l'étape et le
    // sélecteur du formulaire, qui listent tous deux l'item masqué.
    expect(screen.getAllByText(/Masqué au client/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Note interne/).length).toBeGreaterThanOrEqual(1)
  })

  it('masque le formulaire et les actions sans manage_phases', () => {
    renderTab([phase()], false)
    expect(screen.queryByLabelText('Titre de l’étape')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander la validation client' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
npx vitest run src/test/adminProjectPhasesTab.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "../pages/admin/project-detail/ProjectPhasesTab"`.

- [ ] **Step 3: Écrire le composant**

Créer `src/pages/admin/project-detail/ProjectPhasesTab.tsx` :

```tsx
import React, { type FormEvent } from 'react'
import type { PhaseStatus, ProjectItem, ProjectPhase } from '../../../types/project.types'
import type { PhaseForm, PhaseTransition } from './hooks/useProjectPhases'

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de validation client',
  TERMINEE: 'Terminée',
}

const PHASE_STATUS_MODIFIERS: Record<PhaseStatus, string> = {
  A_VENIR: 'is-todo',
  EN_COURS: 'is-current',
  EN_ATTENTE_VALIDATION: 'is-waiting',
  TERMINEE: 'is-done',
}

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Transitions proposées par statut — miroir exact du tableau backend. */
function transitionsFor(phase: ProjectPhase): Array<{ label: string; transition: PhaseTransition }> {
  switch (phase.status) {
    case 'A_VENIR':
      return [{ label: 'Démarrer', transition: 'start' }]
    case 'EN_COURS':
      return phase.requiresClientValidation
        ? [
            { label: 'Demander la validation client', transition: 'request-validation' },
            { label: 'Remettre à venir', transition: 'revert' },
          ]
        : [
            { label: 'Marquer terminée', transition: 'complete' },
            { label: 'Remettre à venir', transition: 'revert' },
          ]
    case 'EN_ATTENTE_VALIDATION':
      return [{ label: 'Annuler la demande', transition: 'cancel-validation-request' }]
    case 'TERMINEE':
      // Une étape validée par le client ne se rouvre pas (hors périmètre assumé).
      return phase.validation.validatedAt ? [] : [{ label: 'Rouvrir', transition: 'revert' }]
    default:
      return []
  }
}

interface ProjectPhasesTabProps {
  phases: ProjectPhase[]
  items: ProjectItem[]
  phaseForm: PhaseForm
  setPhaseForm: (form: PhaseForm) => void
  editingPhaseId: string | null
  canManagePhases: boolean
  onSubmitPhase: (event: FormEvent<HTMLFormElement>) => void
  onStartEdit: (phase: ProjectPhase) => void
  onCancelEdit: () => void
  onDeletePhase: (phaseId: string) => void
  onTransition: (phaseId: string, transition: PhaseTransition) => void
  onMovePhase: (phaseId: string, direction: -1 | 1) => void
  onResolveRevision: (phaseId: string, revisionId: string) => void
}

const ProjectPhasesTab: React.FC<ProjectPhasesTabProps> = ({
  phases,
  items,
  phaseForm,
  setPhaseForm,
  editingPhaseId,
  canManagePhases,
  onSubmitPhase,
  onStartEdit,
  onCancelEdit,
  onDeletePhase,
  onTransition,
  onMovePhase,
  onResolveRevision,
}) => {
  const toggleLinkedItem = (itemId: string) => {
    const next = phaseForm.linkedItems.includes(itemId)
      ? phaseForm.linkedItems.filter((id) => id !== itemId)
      : [...phaseForm.linkedItems, itemId]
    setPhaseForm({ ...phaseForm, linkedItems: next })
  }

  return (
    <div className="admin-form-section" style={{ marginTop: 24 }}>
      <h2>Étapes de production</h2>

      {phases.length === 0 && <p className="client-phases-empty">Aucune étape pour ce projet.</p>}

      {phases.map((phase, index) => {
        const validated = Boolean(phase.validation.validatedAt)
        const openRevisions = phase.revisionRequests.filter((revision) => !revision.resolvedAt)

        return (
          <div key={phase._id} className="admin-phase-row">
            <div className="client-phase-head">
              <span className="client-phase-title">
                {index + 1} · {phase.title}
              </span>
              <span className={`client-phase-badge ${PHASE_STATUS_MODIFIERS[phase.status]}`}>
                {PHASE_STATUS_LABELS[phase.status]}
              </span>
              {phase.requiresClientValidation && (
                <span className="client-phase-badge">Validation client requise</span>
              )}
              {phase.dueAt && <span className="client-phase-meta">Échéance : {formatDate(phase.dueAt)}</span>}
              {validated && (
                <span className="client-phase-meta">
                  Validée par {phase.validation.validatedByName} le {formatDate(phase.validation.validatedAt as string)}
                </span>
              )}
              {openRevisions.length > 0 && (
                <span className="client-phase-badge is-waiting">
                  {openRevisions.length} retouche{openRevisions.length > 1 ? 's' : ''} en attente
                </span>
              )}
            </div>

            {phase.description && <p className="client-phase-description">{phase.description}</p>}

            {phase.linkedItems.length > 0 && (
              <ul className="admin-phase-items">
                {phase.linkedItems.map((item) => (
                  <li key={item._id} className="client-phase-meta">
                    {item.title}
                    {item.isVisible === false && <strong> — Masqué au client</strong>}
                  </li>
                ))}
              </ul>
            )}

            {canManagePhases && (
              <div className="client-phase-buttons" style={{ marginTop: 12 }}>
                {transitionsFor(phase).map((action) => (
                  <button
                    key={action.transition}
                    type="button"
                    className="client-phase-button"
                    onClick={() => onTransition(phase._id, action.transition)}
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onMovePhase(phase._id, -1)}
                  disabled={index === 0}
                >
                  Monter
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onMovePhase(phase._id, 1)}
                  disabled={index === phases.length - 1}
                >
                  Descendre
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onStartEdit(phase)}
                  disabled={validated}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="client-phase-button client-phase-button-ghost"
                  onClick={() => onDeletePhase(phase._id)}
                  disabled={validated}
                >
                  Supprimer
                </button>
              </div>
            )}

            {openRevisions.length > 0 && (
              <div className="client-phase-revisions">
                {openRevisions.map((revision) => (
                  <div key={revision._id} className="client-phase-revision">
                    <span className="client-phase-meta">
                      {revision.requestedByName} · {formatDate(revision.createdAt)}
                    </span>
                    <p className="client-phase-description">{revision.comment}</p>
                    {canManagePhases && (
                      <button
                        type="button"
                        className="client-phase-button client-phase-button-ghost"
                        onClick={() => onResolveRevision(phase._id, revision._id)}
                      >
                        Marquer traitée
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {canManagePhases && (
        <form onSubmit={onSubmitPhase} className="admin-phase-form">
          <h3>{editingPhaseId ? 'Modifier l’étape' : 'Ajouter une étape'}</h3>
          <label htmlFor="phase-title">Titre de l’étape</label>
          <input
            id="phase-title"
            className="portal-input"
            value={phaseForm.title}
            onChange={(event) => setPhaseForm({ ...phaseForm, title: event.target.value })}
            required
          />

          <label htmlFor="phase-description">Description</label>
          <textarea
            id="phase-description"
            className="portal-input"
            rows={3}
            value={phaseForm.description}
            onChange={(event) => setPhaseForm({ ...phaseForm, description: event.target.value })}
          />

          <label htmlFor="phase-due">Échéance indicative</label>
          <input
            id="phase-due"
            type="date"
            className="portal-input"
            value={phaseForm.dueAt}
            onChange={(event) => setPhaseForm({ ...phaseForm, dueAt: event.target.value })}
          />

          <label>
            <input
              type="checkbox"
              checked={phaseForm.requiresClientValidation}
              onChange={(event) =>
                setPhaseForm({ ...phaseForm, requiresClientValidation: event.target.checked })
              }
            />{' '}
            Validation client requise
          </label>

          <fieldset className="admin-phase-items-picker">
            <legend>Livrables liés</legend>
            {items.length === 0 && <span className="client-phase-meta">Aucun livrable dans ce projet.</span>}
            {items.map((item) => (
              <label key={item._id} className="client-phase-meta">
                <input
                  type="checkbox"
                  checked={phaseForm.linkedItems.includes(item._id)}
                  onChange={() => toggleLinkedItem(item._id)}
                />{' '}
                {item.title}
                {!item.isVisible && <strong> — Masqué au client</strong>}
              </label>
            ))}
          </fieldset>

          <div className="client-phase-buttons">
            <button type="submit" className="client-phase-button">
              {editingPhaseId ? 'Enregistrer' : 'Ajouter l’étape'}
            </button>
            {editingPhaseId && (
              <button type="button" className="client-phase-button client-phase-button-ghost" onClick={onCancelEdit}>
                Annuler
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

export default ProjectPhasesTab
```

- [ ] **Step 4: Ajouter les deux classes admin manquantes**

À la fin de `src/pages/espace-client/ClientPortal.css` (fichier également importé par le détail projet admin) :

```css
.admin-phase-row {
  border-bottom: 1px solid var(--border-color);
  padding: 16px 0;
}

.admin-phase-items,
.admin-phase-items-picker {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-phase-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 24px;
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

```bash
npx vitest run src/test/adminProjectPhasesTab.test.tsx
```

Attendu : PASS (7 tests).

- [ ] **Step 6: Câbler l'onglet dans le détail projet admin**

Dans `src/pages/admin/project-detail/index.tsx` :

1. Imports :

```tsx
import ProjectPhasesTab from './ProjectPhasesTab'
import { useProjectPhases } from './hooks/useProjectPhases'
```

et compléter l'import de types avec `ProjectPhase` si nécessaire (le hook expose déjà les types).

2. Permissions, à côté de `const canViewContent = ...` :

```tsx
  const canViewPhases = hasPermission(user, PERMISSIONS.VIEW_PHASES)
  const canManagePhases = hasPermission(user, PERMISSIONS.MANAGE_PHASES)
```

3. Instanciation du hook, à côté de `const projectContent = useProjectContent({...})` :

```tsx
  const projectPhases = useProjectPhases({
    projectId: id,
    canViewPhases,
    canManagePhases,
    confirm,
    ensurePermission,
    setError,
  })
```

4. Chargement initial : ajouter à la fin de la fonction `load()` (après `setBillingDocuments(...)`) :

```tsx
      await projectPhases.loadPhases()
```

5. Onglet : insérer le bouton après celui de « Contenu du projet » :

```tsx
        {canViewPhases && (
          <button
            className={`admin-tab ${activeTab === 'phases' ? 'active' : ''}`}
            onClick={() => setActiveTab('phases')}
          >
            Étapes
          </button>
        )}
```

6. Rendu : insérer après le bloc `{activeTab === 'content' && id && (...)}` :

```tsx
      {activeTab === 'phases' && id && canViewPhases && (
        <ProjectPhasesTab
          phases={projectPhases.phases}
          items={items}
          phaseForm={projectPhases.phaseForm}
          setPhaseForm={projectPhases.setPhaseForm}
          editingPhaseId={projectPhases.editingPhaseId}
          canManagePhases={canManagePhases}
          onSubmitPhase={projectPhases.handleSubmitPhase}
          onStartEdit={projectPhases.startEditPhase}
          onCancelEdit={projectPhases.cancelEditPhase}
          onDeletePhase={projectPhases.handleDeletePhase}
          onTransition={projectPhases.handleTransition}
          onMovePhase={projectPhases.handleMovePhase}
          onResolveRevision={projectPhases.handleResolveRevision}
        />
      )}
```

- [ ] **Step 7: Vérifier le rendu réel dans le navigateur**

Ouvrir `/admin/projets/<id>?tab=phases` dans la preview :
- `read_page` : l'onglet « Étapes » est présent et actif ;
- créer une étape, la démarrer, tenter de démarrer l'étape suivante bloquée → le message d'erreur nomme l'étape bloquante ;
- `read_console_messages` : aucune erreur ;
- `computer {action: "screenshot"}` pour la preuve visuelle.

- [ ] **Step 8: Typecheck, suite frontend puis commit**

```bash
npm run typecheck && npx vitest run src/test/adminProjectPhasesTab.test.tsx src/pages/admin/project-detail/hooks/useProjectContent.test.tsx
```

```bash
git add src/pages/admin/project-detail/ProjectPhasesTab.tsx src/pages/admin/project-detail/index.tsx src/pages/espace-client/ClientPortal.css src/test/adminProjectPhasesTab.test.tsx && git commit -m "feat(phases): onglet admin de pilotage des étapes"
```

---

### Task 12: Vérification de bout en bout

**Files:** aucun fichier de production modifié — cette tâche ne produit qu'un rapport de vérification et, le cas échéant, les correctifs des régressions trouvées.

**Interfaces:**
- Consumes: l'intégralité des tâches 1 à 11.
- Produit : la preuve d'exécution exigée par `superpowers:verification-before-completion` avant toute déclaration de complétude.

- [ ] **Step 1: Suite backend complète**

```bash
cd backend && npm run typecheck && npm test
```

Attendu : `tsc --noEmit` silencieux, suite vitest entièrement verte (aucun `failed`).

- [ ] **Step 2: Suite frontend complète**

```bash
npm run typecheck && npm test
```

Attendu : `tsc --noEmit` silencieux, suite vitest entièrement verte.

- [ ] **Step 3: Lint des fichiers touchés**

```bash
cd backend && npm run lint
```

```bash
npm run lint
```

Attendu : aucune erreur nouvelle (comparer au besoin avec `git stash`/`main` si le dépôt a des avertissements préexistants).

- [ ] **Step 4: Relire la spec point par point**

Rouvrir `docs/superpowers/specs/2026-08-26-pipeline-etapes-design.md` et cocher : modèle de données, tableau des transitions, immutabilité, tous les endpoints admin et client, notifications (3 types × 4 endroits), RBAC, `clientVisibleActions`, UI client, UI admin, les cinq familles de tests attendus. Consigner tout écart assumé.

- [ ] **Step 5: Vérifier que le périmètre n'a pas débordé**

```bash
git diff --stat main...HEAD
```

Attendu : aucun fichier appartenant aux chantiers « demandes de changement » ou « coffre documentaire » (`docs/superpowers/specs/2026-08-26-demandes-changement-design.md` et `…-coffre-documentaire-design.md` restent sans implémentation associée).

- [ ] **Step 6: Invoquer `superpowers:verification-before-completion`**

Suivre le skill et ne déclarer la complétude qu'avec les sorties de commandes à l'appui.

---

## Notes d'implémentation transverses

- **Ordre d'exécution** : les tâches sont séquentielles. 1 → 2 → 3 sont indépendantes entre elles mais toutes trois prérequises pour 4→8. 9, 10, 11 dépendent de 3 (permissions) et 5/6/7 (contrats d'API).
- **Écarts assumés vis-à-vis de la spec**, à signaler en revue :
  1. Introduction de `backend/src/lib/projectPhases.ts` (non nommé dans la spec) pour garder la règle de verrouillage et le tableau des transitions en un seul endroit testable, partagé par les routers admin et client.
  2. Extraction de la timeline client dans `src/pages/espace-client/ClientProjectPhases.tsx` plutôt que d'alourdir `ProjectDetail.tsx` (déjà 677 lignes) — cohérent avec le découpage par onglet côté admin.
  3. Libellé du badge client : « En attente de votre validation » (spec) et non « Votre validation est attendue » (maquette).
  4. Mise à jour de `src/lib/__tests__/permissions-sync.test.ts` (30 → 32 permissions), friction non listée dans la spec mais bloquante.
- **Correspondance de noms entre couches** : `PhaseAdminAction` (backend, `backend/src/lib/projectPhases.ts`) et `PhaseTransition` (frontend, `useProjectPhases.ts`) portent exactement les mêmes cinq valeurs (`start`, `request-validation`, `complete`, `cancel-validation-request`, `revert`), qui sont aussi les segments d'URL des endpoints. Toute évolution doit toucher les trois.
- **Piège Mongoose** : ne jamais appeler `save()` sur un document dont `linkedItems` a été peuplé avec `match` — les items filtrés seraient effacés du tableau. Les routes client mutent un document non peuplé puis rechargent pour la réponse (Task 7).
