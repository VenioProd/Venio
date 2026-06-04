# Mon Espace — Tableau de bord personnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque utilisateur back-office un tableau de bord personnel « Mon Espace » (bento modulaire, 15 widgets) avec ses tâches, notes, post-it, notebook, idées et widgets de pilotage, chaque utilisateur ne voyant que ses propres données.

**Architecture:** 3 nouveaux modèles Mongoose owner-scoped (`WorkspaceLayout`, `PersonalTask`, `WorkspaceNote`) exposés via un routeur Express `/api/admin/workspace/*` (auth + requireAdmin, scoping systématique par `req.user.id`). Côté front, une page React `MonEspace` rend une grille bento (drag HTML5 natif + presets de taille) dont la disposition est persistée par utilisateur ; les 15 widgets sont implémentés via 9 composants paramétrés (DRY).

**Tech Stack:** Express 5 + Mongoose 8 (backend), Vitest + supertest + mongodb-memory-server (tests back), React 18 + Vite + react-router (front), `apiFetch` maison, `lucide-react` pour les icônes, `NoteEditor` (education) réutilisé pour le markdown.

---

## Conventions du codebase (à respecter)

- **Routes** : `import express, { Request, Response, NextFunction } from 'express'`, puis `router.use(auth); router.use(requireAdmin)`. Imports de modèles avec extension `.js`. ID utilisateur via `req.user!.id`.
- **`requireAdmin`** (`middleware/role.js`) autorise déjà tous les rôles back-office (`ADMIN_ROLES` = SUPER_ADMIN, ADMIN, MANAGER, RH, COMMERCIAL, COMPTABLE, VIEWER, STAGIAIRE). Aucune nouvelle permission requise.
- **Modèles** : `new mongoose.Schema<IXxx>({...}, { timestamps: true })`, interface dans `backend/src/types/models/<name>.ts`, ré-exportée par `backend/src/types/models/index.ts`.
- **Tests back** : `backend/src/__tests__/<name>.test.ts`, mock de `auth.js` + `role.js`, helpers `setupMongo/teardownMongo/clearDb` depuis `./helpers/mongoTestEnv.js`, app Express montée à la main.
- **Front** : `apiFetch<T>(path, { method, body: JSON.stringify(obj) })`. Page lazy-loaded dans `src/App.tsx`. Nav dans `src/components/AdminSidebar.tsx`.

## Refinement DRY des widgets (15 widgets → 9 composants)

Le spec liste 15 widgets ; pour rester DRY on les implémente via 9 composants paramétrés :

| Composant | Widgets couverts |
|---|---|
| `TaskListWidget` (prop `mode`) | Tâches à faire, Tâches en cours, En retard |
| `WeekWidget` | Cette semaine / échéances |
| `NoteCollectionWidget` (prop `noteType`) | Notes, Notebook brouillons, Boîte à idées |
| `PostItWall` | Mur de post-it |
| `KpiWidget` | KPIs selon le rôle |
| `PinnedWidget` | Épinglés |
| `ActivityWidget` | Activité & mentions |
| `ShortcutsWidget` | Raccourcis rapides |
| `ClockWidget`, `PomodoroWidget`, `GoalWidget` | Horloge, Pomodoro, Objectif/citation |

## File Structure

**Backend (créés)**
- `backend/src/types/models/workspace.ts` — interfaces `IWorkspaceLayout`, `IPersonalTask`, `IWorkspaceNote`.
- `backend/src/models/WorkspaceLayout.ts`, `PersonalTask.ts`, `WorkspaceNote.ts`.
- `backend/src/services/workspaceKpis.ts` — calcul des KPIs par rôle.
- `backend/src/routes/admin/workspace.ts` — routeur `/api/admin/workspace/*`.
- Tests : `backend/src/__tests__/workspace-models.test.ts`, `workspace-routes.test.ts`, `workspace-kpis.test.ts`.

**Backend (modifiés)**
- `backend/src/types/models/index.ts` — `export * from './workspace.js'`.
- `backend/src/index.ts` — import + `app.use('/api/admin/workspace', adminWorkspaceRoutes)`.

**Frontend (créés)**
- `src/types/workspace.types.ts` — types partagés front.
- `src/services/workspace.ts` — wrappers `apiFetch` typés.
- `src/pages/admin/mon-espace/index.tsx` — page + persistance layout + mode personnaliser.
- `src/pages/admin/mon-espace/BentoGrid.tsx` — moteur de grille (drag natif + presets).
- `src/pages/admin/mon-espace/widgets/*.tsx` — 9 composants de widgets + `registry.ts`.
- `src/pages/admin/mon-espace/MonEspace.css`.
- Tests : `src/test/monEspace.test.tsx`, `src/test/bentoGrid.test.tsx`.

**Frontend (modifiés)**
- `src/App.tsx` — `index` → `MonEspace` ; nouvelle route `dashboard` → `DashboardByRole` ; `mon-espace` → `MonEspace`.
- `src/components/AdminSidebar.tsx` — item « Mon espace » (home) + item « Vue business ».

---

# PHASE 1 — Backend (modèles, service KPIs, routes)

### Task 1: Interfaces TypeScript des modèles

**Files:**
- Create: `backend/src/types/models/workspace.ts`
- Modify: `backend/src/types/models/index.ts`

- [ ] **Step 1: Créer le fichier d'interfaces**

```typescript
// backend/src/types/models/workspace.ts
import type { Document, Types } from 'mongoose'

export type PersonalTaskStatus = 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
export type PersonalTaskPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type WorkspaceNoteType = 'NOTE' | 'POSTIT' | 'DRAFT' | 'IDEA'
export type WorkspaceNoteStatus = 'NEW' | 'CONVERTED'

export interface IWorkspaceWidget {
  key: string
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
}

export interface IWorkspaceShortcut {
  label: string
  link: string
  icon?: string
}

export interface IWorkspaceLayout extends Document {
  userId: Types.ObjectId
  widgets: IWorkspaceWidget[]
  shortcuts: IWorkspaceShortcut[]
  dailyGoal: { text: string; date: Date } | null
  createdAt: Date
  updatedAt: Date
}

export interface IPersonalTask extends Document {
  userId: Types.ObjectId
  title: string
  description: string
  status: PersonalTaskStatus
  priority: PersonalTaskPriority
  dueDate: Date | null
  order: number
  isArchived: boolean
  sourceIdeaId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

export interface IWorkspaceNote extends Document {
  userId: Types.ObjectId
  type: WorkspaceNoteType
  title: string
  content: string
  color: string
  pinned: boolean
  status: WorkspaceNoteStatus
  order: number
  tags: string[]
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Ré-exporter depuis l'index**

Ajouter à la fin de `backend/src/types/models/index.ts` :

```typescript
export * from './workspace.js'
```

- [ ] **Step 3: Vérifier la compilation des types**

Run: `npm --prefix backend run typecheck`
Expected: PASS (aucune erreur liée à workspace).

- [ ] **Step 4: Commit**

```bash
git add backend/src/types/models/workspace.ts backend/src/types/models/index.ts
git commit -m "feat(workspace): interfaces TS des modèles Mon Espace"
```

---

### Task 2: Modèles Mongoose + test

**Files:**
- Create: `backend/src/models/WorkspaceLayout.ts`, `backend/src/models/PersonalTask.ts`, `backend/src/models/WorkspaceNote.ts`
- Test: `backend/src/__tests__/workspace-models.test.ts`

- [ ] **Step 1: Écrire le test des modèles**

```typescript
// backend/src/__tests__/workspace-models.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import WorkspaceLayout from '../models/WorkspaceLayout.js'
import PersonalTask from '../models/PersonalTask.js'
import WorkspaceNote from '../models/WorkspaceNote.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

const userId = () => new mongoose.Types.ObjectId()

describe('WorkspaceLayout', () => {
  it('applique les valeurs par défaut', async () => {
    const doc = await WorkspaceLayout.create({ userId: userId() })
    expect(doc.widgets).toEqual([])
    expect(doc.shortcuts).toEqual([])
    expect(doc.dailyGoal).toBeNull()
  })
  it('impose unicité par userId', async () => {
    const uid = userId()
    await WorkspaceLayout.create({ userId: uid })
    await expect(WorkspaceLayout.create({ userId: uid })).rejects.toThrow()
  })
})

describe('PersonalTask', () => {
  it('défaut status=A_FAIRE, priority=NORMALE', async () => {
    const doc = await PersonalTask.create({ userId: userId(), title: 'Test' })
    expect(doc.status).toBe('A_FAIRE')
    expect(doc.priority).toBe('NORMALE')
    expect(doc.isArchived).toBe(false)
  })
  it('refuse un status invalide', async () => {
    await expect(
      PersonalTask.create({ userId: userId(), title: 'X', status: 'NOPE' as never })
    ).rejects.toThrow()
  })
})

describe('WorkspaceNote', () => {
  it('crée une note de chaque type', async () => {
    const uid = userId()
    for (const type of ['NOTE', 'POSTIT', 'DRAFT', 'IDEA'] as const) {
      const doc = await WorkspaceNote.create({ userId: uid, type })
      expect(doc.type).toBe(type)
      expect(doc.status).toBe('NEW')
    }
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu — modèles absents)**

Run: `npm --prefix backend test -- workspace-models`
Expected: FAIL (Cannot find module '../models/WorkspaceLayout.js').

- [ ] **Step 3: Écrire `WorkspaceLayout.ts`**

```typescript
// backend/src/models/WorkspaceLayout.ts
import mongoose from 'mongoose'
import type { IWorkspaceLayout } from '../types/models/index.js'

const widgetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 4 },
    h: { type: Number, default: 4 },
  },
  { _id: false }
)

const shortcutSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    link: { type: String, required: true },
    icon: { type: String, default: '' },
  },
  { _id: false }
)

const workspaceLayoutSchema = new mongoose.Schema<IWorkspaceLayout>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    widgets: { type: [widgetSchema], default: [] },
    shortcuts: { type: [shortcutSchema], default: [] },
    dailyGoal: {
      type: new mongoose.Schema(
        { text: { type: String, default: '' }, date: { type: Date, default: Date.now } },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
)

export default mongoose.model<IWorkspaceLayout>('WorkspaceLayout', workspaceLayoutSchema)
```

- [ ] **Step 4: Écrire `PersonalTask.ts`**

```typescript
// backend/src/models/PersonalTask.ts
import mongoose from 'mongoose'
import type { IPersonalTask } from '../types/models/index.js'

const personalTaskSchema = new mongoose.Schema<IPersonalTask>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['A_FAIRE', 'EN_COURS', 'TERMINE'], default: 'A_FAIRE' },
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'], default: 'NORMALE' },
    dueDate: { type: Date, default: null },
    order: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
    sourceIdeaId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceNote', default: null },
  },
  { timestamps: true }
)

personalTaskSchema.index({ userId: 1, status: 1 })

export default mongoose.model<IPersonalTask>('PersonalTask', personalTaskSchema)
```

- [ ] **Step 5: Écrire `WorkspaceNote.ts`**

```typescript
// backend/src/models/WorkspaceNote.ts
import mongoose from 'mongoose'
import type { IWorkspaceNote } from '../types/models/index.js'

const workspaceNoteSchema = new mongoose.Schema<IWorkspaceNote>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['NOTE', 'POSTIT', 'DRAFT', 'IDEA'], required: true, index: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    color: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ['NEW', 'CONVERTED'], default: 'NEW' },
    order: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
)

workspaceNoteSchema.index({ userId: 1, type: 1 })

export default mongoose.model<IWorkspaceNote>('WorkspaceNote', workspaceNoteSchema)
```

- [ ] **Step 6: Lancer le test (succès attendu)**

Run: `npm --prefix backend test -- workspace-models`
Expected: PASS (tous les cas verts).

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/WorkspaceLayout.ts backend/src/models/PersonalTask.ts backend/src/models/WorkspaceNote.ts backend/src/__tests__/workspace-models.test.ts
git commit -m "feat(workspace): modèles WorkspaceLayout, PersonalTask, WorkspaceNote"
```

---

### Task 3: Service KPIs par rôle + test

**Files:**
- Create: `backend/src/services/workspaceKpis.ts`
- Test: `backend/src/__tests__/workspace-kpis.test.ts`

- [ ] **Step 1: Écrire le test du service**

```typescript
// backend/src/__tests__/workspace-kpis.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { computeRoleKpis } from '../services/workspaceKpis.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('computeRoleKpis', () => {
  it('retourne un tableau (label, value, link) pour COMMERCIAL', async () => {
    const kpis = await computeRoleKpis(new mongoose.Types.ObjectId().toString(), 'COMMERCIAL')
    expect(Array.isArray(kpis)).toBe(true)
    for (const k of kpis) {
      expect(k).toHaveProperty('label')
      expect(k).toHaveProperty('value')
      expect(k).toHaveProperty('link')
      expect(typeof k.value).toBe('number')
    }
  })
  it('retourne un tableau pour chaque rôle back-office sans planter', async () => {
    const roles = ['ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE', 'SUPER_ADMIN'] as const
    for (const role of roles) {
      const kpis = await computeRoleKpis(new mongoose.Types.ObjectId().toString(), role)
      expect(Array.isArray(kpis)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm --prefix backend test -- workspace-kpis`
Expected: FAIL (Cannot find module '../services/workspaceKpis.js').

- [ ] **Step 3: Écrire le service**

```typescript
// backend/src/services/workspaceKpis.ts
import Lead from '../models/Lead.js'
import Sequence from '../models/Sequence.js'
import Intern from '../models/Intern.js'
import ActivityReport from '../models/ActivityReport.js'
import AccountingEntry from '../models/AccountingEntry.js'
import VatDeclaration from '../models/VatDeclaration.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'

export interface RoleKpi {
  label: string
  value: number
  link: string
}

/**
 * Calcule les KPIs personnels pertinents selon le rôle.
 * Chaque count est défensif (try/catch implicite via Promise) : un modèle vide
 * renvoie 0, jamais d'exception qui casserait le dashboard.
 */
export async function computeRoleKpis(userId: string, role: string): Promise<RoleKpi[]> {
  const safe = async (p: Promise<number>): Promise<number> => {
    try {
      return await p
    } catch {
      return 0
    }
  }

  switch (role) {
    case 'COMMERCIAL':
      return [
        { label: 'Leads chauds', value: await safe(Lead.countDocuments({ leadTemperature: 'CHAUD' })), link: '/admin/crm' },
        { label: 'Séquences actives', value: await safe(Sequence.countDocuments({ isActive: true })), link: '/admin/crm' },
      ]
    case 'RH':
      return [
        { label: 'Stagiaires actifs', value: await safe(Intern.countDocuments({ status: 'ACTIF' })), link: '/admin/stagiaires' },
        { label: 'Rapports en attente', value: await safe(ActivityReport.countDocuments({ status: 'EN_ATTENTE' })), link: '/admin/mes-rapports' },
      ]
    case 'COMPTABLE':
      return [
        { label: 'Écritures à valider', value: await safe(AccountingEntry.countDocuments({ status: 'BROUILLON' })), link: '/admin/comptabilite' },
        { label: 'Déclarations TVA', value: await safe(VatDeclaration.countDocuments({ status: { $ne: 'DEPOSEE' } })), link: '/admin/comptabilite' },
      ]
    case 'STAGIAIRE':
      return [
        { label: 'Mes tâches', value: await safe(Task.countDocuments({ assignee: userId, status: { $ne: 'TERMINE' } })), link: '/admin/mon-espace' },
        { label: 'Mes rapports', value: await safe(ActivityReport.countDocuments({ author: userId })), link: '/admin/mes-rapports' },
      ]
    case 'MANAGER':
    case 'ADMIN':
    case 'SUPER_ADMIN':
    case 'VIEWER':
    default:
      return [
        { label: 'Projets actifs', value: await safe(Project.countDocuments({ status: { $in: ['EN_COURS', 'ACTIF'] } })), link: '/admin/gestion' },
        { label: 'Tâches en cours', value: await safe(Task.countDocuments({ status: 'EN_COURS' })), link: '/admin/gestion' },
      ]
  }
}
```

> **Note d'implémentation** : avant d'écrire ce service, vérifier les noms de champs réels avec `grep -n "status\|leadTemperature\|isActive" backend/src/models/{Lead,Sequence,Intern,ActivityReport,AccountingEntry,VatDeclaration}.ts`. Si un champ diffère (ex. `AccountingEntry` n'a pas `status: 'BROUILLON'`), ajuster le filtre ; le `safe()` garantit déjà 0 en cas de champ absent, mais le filtre doit viser le bon concept métier.

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm --prefix backend test -- workspace-kpis`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/workspaceKpis.ts backend/src/__tests__/workspace-kpis.test.ts
git commit -m "feat(workspace): service KPIs par rôle"
```

---

### Task 4: Routes workspace + test (layout, tasks, notes, convert, overview)

**Files:**
- Create: `backend/src/routes/admin/workspace.ts`
- Test: `backend/src/__tests__/workspace-routes.test.ts`

- [ ] **Step 1: Écrire le test des routes (avec owner-scoping)**

```typescript
// backend/src/__tests__/workspace-routes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

const TEST_USER_ID = new mongoose.Types.ObjectId().toString()
const OTHER_USER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: TEST_USER_ID, role: 'COMMERCIAL' }
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express
let WorkspaceNote: typeof import('../models/WorkspaceNote.js').default
let PersonalTask: typeof import('../models/PersonalTask.js').default

beforeAll(async () => {
  await setupMongo()
  const { default: routes } = await import('../routes/admin/workspace.js')
  WorkspaceNote = (await import('../models/WorkspaceNote.js')).default
  PersonalTask = (await import('../models/PersonalTask.js')).default
  app = express()
  app.use(express.json())
  app.use('/api/admin/workspace', routes)
})
afterAll(teardownMongo)
beforeEach(clearDb)

describe('layout', () => {
  it('GET /layout crée et renvoie un layout par défaut', async () => {
    const res = await request(app).get('/api/admin/workspace/layout').expect(200)
    expect(res.body).toHaveProperty('widgets')
    expect(Array.isArray(res.body.widgets)).toBe(true)
  })
  it('PUT /layout persiste les widgets', async () => {
    const widgets = [{ key: 'todo', enabled: true, x: 0, y: 0, w: 6, h: 4 }]
    const res = await request(app).put('/api/admin/workspace/layout').send({ widgets }).expect(200)
    expect(res.body.widgets).toHaveLength(1)
    expect(res.body.widgets[0].key).toBe('todo')
  })
})

describe('tasks', () => {
  it('POST puis GET ne renvoie que mes tâches', async () => {
    await request(app).post('/api/admin/workspace/tasks').send({ title: 'Mienne' }).expect(201)
    await PersonalTask.create({ userId: OTHER_USER_ID, title: 'Autre' })
    const res = await request(app).get('/api/admin/workspace/tasks').expect(200)
    const titles = res.body.map((t: { title: string }) => t.title)
    expect(titles).toContain('Mienne')
    expect(titles).not.toContain('Autre')
  })
  it('PATCH refuse la tâche d’un autre user (404)', async () => {
    const other = await PersonalTask.create({ userId: OTHER_USER_ID, title: 'Autre' })
    await request(app).patch(`/api/admin/workspace/tasks/${other._id}`).send({ status: 'TERMINE' }).expect(404)
  })
})

describe('notes', () => {
  it('CRUD note owner-scopé', async () => {
    const created = await request(app).post('/api/admin/workspace/notes').send({ type: 'NOTE', title: 'N1' }).expect(201)
    const id = created.body._id
    await request(app).get('/api/admin/workspace/notes?type=NOTE').expect(200).then((r) => {
      expect(r.body.map((n: { _id: string }) => n._id)).toContain(id)
    })
    await request(app).delete(`/api/admin/workspace/notes/${id}`).expect(200)
  })
  it('convert idée → PersonalTask', async () => {
    const idea = await WorkspaceNote.create({ userId: TEST_USER_ID, type: 'IDEA', title: 'Idée géniale' })
    const res = await request(app).post(`/api/admin/workspace/notes/${idea._id}/convert`).expect(201)
    expect(res.body.title).toBe('Idée géniale')
    const reloaded = await WorkspaceNote.findById(idea._id)
    expect(reloaded?.status).toBe('CONVERTED')
  })
})

describe('overview', () => {
  it('GET /overview renvoie kpis, overdue, week, pinned, activity', async () => {
    const res = await request(app).get('/api/admin/workspace/overview').expect(200)
    expect(res.body).toHaveProperty('kpis')
    expect(res.body).toHaveProperty('overdue')
    expect(res.body).toHaveProperty('week')
    expect(res.body).toHaveProperty('pinned')
    expect(res.body).toHaveProperty('activity')
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm --prefix backend test -- workspace-routes`
Expected: FAIL (Cannot find module '../routes/admin/workspace.js').

- [ ] **Step 3: Écrire le routeur**

```typescript
// backend/src/routes/admin/workspace.ts
import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import WorkspaceLayout from '../../models/WorkspaceLayout.js'
import PersonalTask from '../../models/PersonalTask.js'
import WorkspaceNote from '../../models/WorkspaceNote.js'
import Task from '../../models/Task.js'
import InboxPin from '../../models/InboxPin.js'
import Notification from '../../models/Notification.js'
import { computeRoleKpis } from '../../services/workspaceKpis.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// ─── Layout ───────────────────────────────────────────────────────────────
router.get('/layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    let layout = await WorkspaceLayout.findOne({ userId })
    if (!layout) layout = await WorkspaceLayout.create({ userId })
    res.json(layout)
  } catch (e) {
    next(e)
  }
})

router.put('/layout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { widgets, shortcuts, dailyGoal } = req.body
    const update: Record<string, unknown> = {}
    if (widgets !== undefined) update.widgets = widgets
    if (shortcuts !== undefined) update.shortcuts = shortcuts
    if (dailyGoal !== undefined) update.dailyGoal = dailyGoal
    const layout = await WorkspaceLayout.findOneAndUpdate(
      { userId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.json(layout)
  } catch (e) {
    next(e)
  }
})

// ─── Personal tasks (+ tâches projet assignées) ─────────────────────────────
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const status = req.query.status as string | undefined
    const personalFilter: Record<string, unknown> = { userId, isArchived: false }
    if (status) personalFilter.status = status
    const personal = await PersonalTask.find(personalFilter).sort({ order: 1, createdAt: -1 }).lean()

    const projectFilter: Record<string, unknown> = { assignee: userId }
    if (status) projectFilter.status = status
    const projectTasks = await Task.find(projectFilter)
      .sort({ dueDate: 1 })
      .limit(50)
      .populate('project', 'name')
      .lean()

    const merged = [
      ...personal.map((t) => ({ ...t, source: 'PERSONAL' as const })),
      ...projectTasks.map((t) => ({ ...t, source: 'PROJECT' as const })),
    ]
    res.json(merged)
  } catch (e) {
    next(e)
  }
})

router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { title, description, status, priority, dueDate, order } = req.body
    if (!title || !String(title).trim()) {
      res.status(400).json({ error: 'Titre requis' })
      return
    }
    const task = await PersonalTask.create({ userId, title, description, status, priority, dueDate, order })
    res.status(201).json(task)
  } catch (e) {
    next(e)
  }
})

router.patch('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'order', 'isArchived']
    const update: Record<string, unknown> = {}
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k]
    const task = await PersonalTask.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true })
    if (!task) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json(task)
  } catch (e) {
    next(e)
  }
})

router.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const r = await PersonalTask.findOneAndDelete({ _id: req.params.id, userId })
    if (!r) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// ─── Notes (NOTE | POSTIT | DRAFT | IDEA) ───────────────────────────────────
router.get('/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const filter: Record<string, unknown> = { userId }
    if (req.query.type) filter.type = req.query.type
    const notes = await WorkspaceNote.find(filter).sort({ pinned: -1, order: 1, updatedAt: -1 }).lean()
    res.json(notes)
  } catch (e) {
    next(e)
  }
})

router.post('/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const { type, title, content, color, pinned, order, tags } = req.body
    if (!['NOTE', 'POSTIT', 'DRAFT', 'IDEA'].includes(type)) {
      res.status(400).json({ error: 'Type invalide' })
      return
    }
    const note = await WorkspaceNote.create({ userId, type, title, content, color, pinned, order, tags })
    res.status(201).json(note)
  } catch (e) {
    next(e)
  }
})

router.patch('/notes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const allowed = ['title', 'content', 'color', 'pinned', 'order', 'tags', 'status']
    const update: Record<string, unknown> = {}
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k]
    const note = await WorkspaceNote.findOneAndUpdate({ _id: req.params.id, userId }, { $set: update }, { new: true })
    if (!note) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json(note)
  } catch (e) {
    next(e)
  }
})

router.delete('/notes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const r = await WorkspaceNote.findOneAndDelete({ _id: req.params.id, userId })
    if (!r) {
      res.status(404).json({ error: 'Introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

router.post('/notes/:id/convert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const idea = await WorkspaceNote.findOne({ _id: req.params.id, userId, type: 'IDEA' })
    if (!idea) {
      res.status(404).json({ error: 'Idée introuvable' })
      return
    }
    const task = await PersonalTask.create({
      userId,
      title: idea.title || idea.content.slice(0, 80) || 'Idée',
      description: idea.content,
      sourceIdeaId: idea._id,
    })
    idea.status = 'CONVERTED'
    await idea.save()
    res.status(201).json(task)
  } catch (e) {
    next(e)
  }
})

// ─── Overview (agrégat 1 appel) ─────────────────────────────────────────────
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const role = req.user!.role
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [kpis, overdue, week, pinned, activity] = await Promise.all([
      computeRoleKpis(userId, role),
      Task.find({ assignee: userId, status: { $ne: 'TERMINE' }, dueDate: { $lt: now, $ne: null } })
        .sort({ dueDate: 1 }).limit(10).populate('project', 'name').lean(),
      Task.find({ assignee: userId, status: { $ne: 'TERMINE' }, dueDate: { $gte: now, $lte: weekEnd } })
        .sort({ dueDate: 1 }).limit(20).populate('project', 'name').lean(),
      InboxPin.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ])

    res.json({ kpis, overdue, week, pinned, activity })
  } catch (e) {
    next(e)
  }
})

export default router
```

> **Note** : `req.user!.role` doit exister sur le type `req.user`. Vérifier dans `backend/src/types/` que le payload auth expose `role` (utilisé déjà par `dashboard.ts` via `requireAdmin`). Sinon, recharger le rôle via `User.findById(userId).select('role')`.

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm --prefix backend test -- workspace-routes`
Expected: PASS (layout, tasks owner-scoping, notes CRUD, convert, overview).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/workspace.ts backend/src/__tests__/workspace-routes.test.ts
git commit -m "feat(workspace): routes /api/admin/workspace (layout, tasks, notes, overview)"
```

---

### Task 5: Monter le routeur dans l'app

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Importer le routeur**

Près des autres imports `adminXxxRoutes` (vers la ligne 35) :

```typescript
import adminWorkspaceRoutes from './routes/admin/workspace.js'
```

- [ ] **Step 2: Monter la route**

Près des `app.use('/api/admin/...')` (vers la ligne 254, après `adminDashboardRoutes`) :

```typescript
app.use('/api/admin/workspace', adminWorkspaceRoutes)
```

- [ ] **Step 3: Vérifier typecheck + suite back**

Run: `npm --prefix backend run typecheck && npm --prefix backend test -- workspace`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(workspace): montage du routeur /api/admin/workspace"
```

---

# PHASE 2 — Frontend : types, service, grille bento, page, routing

### Task 6: Types & service front

**Files:**
- Create: `src/types/workspace.types.ts`, `src/services/workspace.ts`

- [ ] **Step 1: Écrire les types front**

```typescript
// src/types/workspace.types.ts
export type PersonalTaskStatus = 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
export type WorkspaceNoteType = 'NOTE' | 'POSTIT' | 'DRAFT' | 'IDEA'

export interface WidgetConfig {
  key: string
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
}

export interface Shortcut { label: string; link: string; icon?: string }

export interface WorkspaceLayout {
  widgets: WidgetConfig[]
  shortcuts: Shortcut[]
  dailyGoal: { text: string; date: string } | null
}

export interface PersonalTask {
  _id: string
  title: string
  description?: string
  status: PersonalTaskStatus
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  dueDate?: string | null
  order: number
  source?: 'PERSONAL' | 'PROJECT'
  project?: { _id: string; name: string }
}

export interface WorkspaceNote {
  _id: string
  type: WorkspaceNoteType
  title: string
  content: string
  color?: string
  pinned?: boolean
  status?: 'NEW' | 'CONVERTED'
  order: number
  tags?: string[]
  updatedAt?: string
}

export interface RoleKpi { label: string; value: number; link: string }

export interface WorkspaceOverview {
  kpis: RoleKpi[]
  overdue: PersonalTask[]
  week: PersonalTask[]
  pinned: { _id: string; title: string; link: string; color?: string }[]
  activity: { _id: string; title: string; message: string; link: string; createdAt: string }[]
}
```

- [ ] **Step 2: Écrire le service `apiFetch`**

```typescript
// src/services/workspace.ts
import { apiFetch } from '../lib/api'
import type {
  WorkspaceLayout,
  PersonalTask,
  WorkspaceNote,
  WorkspaceNoteType,
  WorkspaceOverview,
  PersonalTaskStatus,
} from '../types/workspace.types'

const BASE = '/api/admin/workspace'

export const getLayout = () => apiFetch<WorkspaceLayout>(`${BASE}/layout`)
export const saveLayout = (layout: Partial<WorkspaceLayout>) =>
  apiFetch<WorkspaceLayout>(`${BASE}/layout`, { method: 'PUT', body: JSON.stringify(layout) })

export const getTasks = (status?: PersonalTaskStatus) =>
  apiFetch<PersonalTask[]>(`${BASE}/tasks${status ? `?status=${status}` : ''}`)
export const createTask = (data: Partial<PersonalTask>) =>
  apiFetch<PersonalTask>(`${BASE}/tasks`, { method: 'POST', body: JSON.stringify(data) })
export const updateTask = (id: string, data: Partial<PersonalTask>) =>
  apiFetch<PersonalTask>(`${BASE}/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteTask = (id: string) =>
  apiFetch<{ ok: boolean }>(`${BASE}/tasks/${id}`, { method: 'DELETE' })

export const getNotes = (type: WorkspaceNoteType) =>
  apiFetch<WorkspaceNote[]>(`${BASE}/notes?type=${type}`)
export const createNote = (data: Partial<WorkspaceNote>) =>
  apiFetch<WorkspaceNote>(`${BASE}/notes`, { method: 'POST', body: JSON.stringify(data) })
export const updateNote = (id: string, data: Partial<WorkspaceNote>) =>
  apiFetch<WorkspaceNote>(`${BASE}/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteNote = (id: string) =>
  apiFetch<{ ok: boolean }>(`${BASE}/notes/${id}`, { method: 'DELETE' })
export const convertIdea = (id: string) =>
  apiFetch<PersonalTask>(`${BASE}/notes/${id}/convert`, { method: 'POST' })

export const getOverview = () => apiFetch<WorkspaceOverview>(`${BASE}/overview`)
```

- [ ] **Step 3: Vérifier typecheck front**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/workspace.types.ts src/services/workspace.ts
git commit -m "feat(mon-espace): types et service API front"
```

---

### Task 7: Moteur de grille BentoGrid + CSS

**Files:**
- Create: `src/pages/admin/mon-espace/BentoGrid.tsx`, `src/pages/admin/mon-espace/MonEspace.css`
- Test: `src/test/bentoGrid.test.tsx`

Presets de taille : `S = {w:3,h:3}`, `M = {w:4,h:4}`, `L = {w:6,h:5}` sur une grille 12 colonnes. En mode édition : drag natif pour réordonner, cycle S→M→L au clic sur le bouton taille.

- [ ] **Step 1: Écrire le test de la grille**

```tsx
// src/test/bentoGrid.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BentoGrid from '../pages/admin/mon-espace/BentoGrid'
import type { WidgetConfig } from '../types/workspace.types'

const widgets: WidgetConfig[] = [
  { key: 'a', enabled: true, x: 0, y: 0, w: 4, h: 4 },
  { key: 'b', enabled: true, x: 4, y: 0, w: 4, h: 4 },
  { key: 'c', enabled: false, x: 0, y: 4, w: 4, h: 4 },
]

describe('BentoGrid', () => {
  it('rend uniquement les widgets activés', () => {
    render(
      <BentoGrid
        widgets={widgets}
        editing={false}
        onChange={() => {}}
        renderWidget={(key) => <div data-testid={`w-${key}`}>{key}</div>}
      />
    )
    expect(screen.getByTestId('w-a')).toBeInTheDocument()
    expect(screen.getByTestId('w-b')).toBeInTheDocument()
    expect(screen.queryByTestId('w-c')).not.toBeInTheDocument()
  })

  it('en mode édition, le bouton taille fait évoluer w/h et appelle onChange', () => {
    const onChange = vi.fn()
    render(
      <BentoGrid
        widgets={widgets}
        editing={true}
        onChange={onChange}
        renderWidget={(key) => <div>{key}</div>}
      />
    )
    fireEvent.click(screen.getAllByLabelText('Changer la taille')[0])
    expect(onChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- bentoGrid`
Expected: FAIL (Cannot find module BentoGrid).

- [ ] **Step 3: Écrire `BentoGrid.tsx`**

```tsx
// src/pages/admin/mon-espace/BentoGrid.tsx
import React, { useState } from 'react'
import { Maximize2, X, GripVertical } from 'lucide-react'
import type { WidgetConfig } from '../../../types/workspace.types'

const SIZES = [
  { w: 3, h: 3 },
  { w: 4, h: 4 },
  { w: 6, h: 5 },
]

function nextSize(w: number, h: number): { w: number; h: number } {
  const idx = SIZES.findIndex((s) => s.w === w && s.h === h)
  return SIZES[(idx + 1) % SIZES.length] ?? SIZES[1]!
}

interface BentoGridProps {
  widgets: WidgetConfig[]
  editing: boolean
  onChange: (widgets: WidgetConfig[]) => void
  renderWidget: (key: string) => React.ReactNode
}

export default function BentoGrid({ widgets, editing, onChange, renderWidget }: BentoGridProps) {
  const [dragKey, setDragKey] = useState<string | null>(null)

  const visible = widgets.filter((w) => w.enabled)

  const handleDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return
    const ordered = [...widgets]
    const from = ordered.findIndex((w) => w.key === dragKey)
    const to = ordered.findIndex((w) => w.key === targetKey)
    if (from < 0 || to < 0) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved!)
    onChange(ordered)
    setDragKey(null)
  }

  const cycleSize = (key: string) => {
    onChange(widgets.map((w) => (w.key === key ? { ...w, ...nextSize(w.w, w.h) } : w)))
  }

  const disable = (key: string) => {
    onChange(widgets.map((w) => (w.key === key ? { ...w, enabled: false } : w)))
  }

  return (
    <div className="bento-grid">
      {visible.map((w) => (
        <div
          key={w.key}
          className={`bento-tile bento-w-${w.w} bento-h-${w.h}${editing ? ' bento-editing' : ''}`}
          draggable={editing}
          onDragStart={() => editing && setDragKey(w.key)}
          onDragOver={(e) => editing && e.preventDefault()}
          onDrop={() => editing && handleDrop(w.key)}
        >
          {editing && (
            <div className="bento-tile__bar">
              <GripVertical size={14} className="bento-tile__grip" />
              <div className="bento-tile__actions">
                <button aria-label="Changer la taille" onClick={() => cycleSize(w.key)}>
                  <Maximize2 size={14} />
                </button>
                <button aria-label="Masquer le widget" onClick={() => disable(w.key)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          <div className="bento-tile__body">{renderWidget(w.key)}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Écrire `MonEspace.css`** (extrait clé — grille 12 colonnes + spans + look dark glassmorphism cohérent avec `AdminPortal.css`)

```css
/* src/pages/admin/mon-espace/MonEspace.css */
.mon-espace { padding: 24px; }
.mon-espace__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.mon-espace__hello {
  font-size: 22px; font-weight: 700;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: 72px;
  gap: 16px;
}
.bento-tile {
  background: rgba(20, 22, 28, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.bento-tile.bento-editing { border-color: rgba(var(--primary-rgb), 0.5); cursor: grab; }
.bento-tile__bar { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: rgba(var(--primary-rgb), 0.12); }
.bento-tile__actions button { background: transparent; border: none; color: #cbd5e1; cursor: pointer; padding: 2px; }
.bento-tile__body { flex: 1; padding: 14px; overflow: auto; }

/* Spans de largeur */
.bento-w-3 { grid-column: span 3; } .bento-w-4 { grid-column: span 4; } .bento-w-6 { grid-column: span 6; }
/* Spans de hauteur (grid-auto-rows = 72px) */
.bento-h-3 { grid-row: span 3; } .bento-h-4 { grid-row: span 4; } .bento-h-5 { grid-row: span 5; }

@media (max-width: 900px) {
  .bento-grid { grid-template-columns: 1fr; }
  .bento-tile[class*='bento-w-'] { grid-column: span 1; }
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- bentoGrid`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/mon-espace/BentoGrid.tsx src/pages/admin/mon-espace/MonEspace.css src/test/bentoGrid.test.tsx
git commit -m "feat(mon-espace): moteur de grille bento (drag natif + presets S/M/L)"
```

---

### Task 8: Page MonEspace + registry de widgets + persistance

**Files:**
- Create: `src/pages/admin/mon-espace/index.tsx`, `src/pages/admin/mon-espace/widgets/registry.ts`
- Test: `src/test/monEspace.test.tsx`

Le registry mappe `key` → `{ label, defaultSize, component }`. La page charge le layout (ou applique un défaut « tous activés »), rend la grille, et persiste via `saveLayout` au toggle/déplacement/redimensionnement.

- [ ] **Step 1: Écrire le registry (placeholder d'abord, complété en Phase 3)**

```typescript
// src/pages/admin/mon-espace/widgets/registry.ts
import type { ComponentType } from 'react'

export interface WidgetDef {
  key: string
  label: string
  default: { w: number; h: number }
  component: ComponentType
}

// La liste complète des composants est branchée en Phase 3 (Task 14).
// Ici on définit l'ordre et les métadonnées de chaque widget.
export const WIDGET_KEYS = [
  'todo', 'doing', 'overdue', 'week',
  'notes', 'postit', 'notebook', 'ideas',
  'kpis', 'pinned', 'activity', 'shortcuts',
  'clock', 'pomodoro', 'goal',
] as const

export type WidgetKey = (typeof WIDGET_KEYS)[number]

export const WIDGET_LABELS: Record<WidgetKey, string> = {
  todo: 'Tâches à faire', doing: 'Tâches en cours', overdue: 'En retard', week: 'Cette semaine',
  notes: 'Notes', postit: 'Post-it', notebook: 'Notebook', ideas: 'Idées',
  kpis: 'Mes chiffres', pinned: 'Épinglés', activity: 'Activité', shortcuts: 'Raccourcis',
  clock: 'Horloge', pomodoro: 'Focus', goal: 'Objectif du jour',
}

export const DEFAULT_SIZE: Record<WidgetKey, { w: number; h: number }> = {
  todo: { w: 4, h: 5 }, doing: { w: 4, h: 5 }, overdue: { w: 4, h: 4 }, week: { w: 6, h: 4 },
  notes: { w: 4, h: 5 }, postit: { w: 6, h: 4 }, notebook: { w: 6, h: 5 }, ideas: { w: 4, h: 4 },
  kpis: { w: 6, h: 3 }, pinned: { w: 3, h: 4 }, activity: { w: 4, h: 4 }, shortcuts: { w: 3, h: 3 },
  clock: { w: 3, h: 3 }, pomodoro: { w: 3, h: 3 }, goal: { w: 6, h: 3 },
}

export function defaultLayoutWidgets() {
  return WIDGET_KEYS.map((key, i) => ({
    key, enabled: true, x: (i * 4) % 12, y: Math.floor(i / 3) * 4, ...DEFAULT_SIZE[key],
  }))
}
```

- [ ] **Step 2: Écrire le test de la page**

```tsx
// src/test/monEspace.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/workspace', () => ({
  getLayout: vi.fn().mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null }),
  saveLayout: vi.fn().mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null }),
  getOverview: vi.fn().mockResolvedValue({ kpis: [], overdue: [], week: [], pinned: [], activity: [] }),
  getTasks: vi.fn().mockResolvedValue([]),
  getNotes: vi.fn().mockResolvedValue([]),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Raphaël', role: 'COMMERCIAL' } }),
}))

import MonEspace from '../pages/admin/mon-espace/index'

beforeEach(() => vi.clearAllMocks())

describe('MonEspace', () => {
  it('affiche la salutation et applique un layout par défaut quand vide', async () => {
    render(<MemoryRouter><MonEspace /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Raphaël/)).toBeInTheDocument())
    // Le bouton Personnaliser est présent
    expect(screen.getByRole('button', { name: /Personnaliser/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- monEspace`
Expected: FAIL (Cannot find module index).

- [ ] **Step 4: Écrire `index.tsx`**

```tsx
// src/pages/admin/mon-espace/index.tsx
import React, { useEffect, useState, useCallback } from 'react'
import { Settings, Check } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import BentoGrid from './BentoGrid'
import { renderWidget } from './widgets'
import { WIDGET_KEYS, WIDGET_LABELS, DEFAULT_SIZE, defaultLayoutWidgets, type WidgetKey } from './widgets/registry'
import { getLayout, saveLayout } from '../../../services/workspace'
import type { WidgetConfig } from '../../../types/workspace.types'
import './MonEspace.css'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function MonEspace() {
  const { user } = useAuth()
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getLayout()
      .then((layout) => {
        if (cancelled) return
        setWidgets(layout.widgets.length ? layout.widgets : defaultLayoutWidgets())
      })
      .catch(() => setWidgets(defaultLayoutWidgets()))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  const persist = useCallback((next: WidgetConfig[]) => {
    setWidgets(next)
    saveLayout({ widgets: next }).catch(() => {})
  }, [])

  const enableWidget = (key: WidgetKey) => {
    persist(widgets.map((w) => (w.key === key ? { ...w, enabled: true } : w)))
  }

  const disabledKeys = WIDGET_KEYS.filter((k) => !widgets.find((w) => w.key === k && w.enabled))

  if (loading) return <div className="mon-espace"><p className="subtitle">Chargement…</p></div>

  return (
    <div className="mon-espace">
      <div className="mon-espace__header">
        <h1 className="mon-espace__hello">{greeting()} {user?.name} 👋</h1>
        <button className="btn-secondary" onClick={() => setEditing((e) => !e)}>
          {editing ? <><Check size={16} /> Terminer</> : <><Settings size={16} /> Personnaliser</>}
        </button>
      </div>

      {editing && disabledKeys.length > 0 && (
        <div className="mon-espace__drawer">
          <span className="label">Ajouter un widget :</span>
          {disabledKeys.map((k) => (
            <button key={k} className="chip" onClick={() => enableWidget(k)}>+ {WIDGET_LABELS[k]}</button>
          ))}
        </div>
      )}

      <BentoGrid
        widgets={widgets}
        editing={editing}
        onChange={persist}
        renderWidget={(key) => renderWidget(key as WidgetKey)}
      />
    </div>
  )
}
```

> **Note** : `renderWidget` provient de `./widgets/index.ts`, créé en Phase 3 (Task 14). Pour faire passer ce test dès maintenant, créer un stub minimal `src/pages/admin/mon-espace/widgets/index.tsx` : `export function renderWidget(key: string){ return <div data-widget={key} /> }`. Il sera remplacé par le vrai registry en Task 14.

- [ ] **Step 5: Créer le stub `widgets/index.tsx`**

```tsx
// src/pages/admin/mon-espace/widgets/index.tsx (stub — remplacé en Task 14)
import React from 'react'
import type { WidgetKey } from './registry'
export function renderWidget(key: WidgetKey) {
  return <div data-widget={key}>{key}</div>
}
```

- [ ] **Step 6: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- monEspace`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/mon-espace/index.tsx src/pages/admin/mon-espace/widgets/registry.ts src/pages/admin/mon-espace/widgets/index.tsx src/test/monEspace.test.tsx
git commit -m "feat(mon-espace): page, registry de widgets et persistance du layout"
```

---

### Task 9: Routing + navigation

**Files:**
- Modify: `src/App.tsx`, `src/components/AdminSidebar.tsx`

- [ ] **Step 1: Déclarer le lazy import dans `App.tsx`** (près de la ligne 59)

```tsx
const MonEspace = lazy(() => import('./pages/admin/mon-espace'))
```

- [ ] **Step 2: Faire de MonEspace l'accueil + garder la vue business**

Dans `App.tsx`, remplacer la route index et la route `mon-espace` existantes :

```tsx
<Route index element={<MonEspace />} />
<Route path="dashboard" element={<DashboardByRole />} />
<Route path="mon-espace" element={<MonEspace />} />
```

(`DashboardByRole` existe déjà : il rend `SuperAdminDashboard` ou `AdminDashboard` selon le rôle — on ne le modifie pas, on le déplace simplement de l'index vers `/admin/dashboard`.)

- [ ] **Step 3: Mettre à jour la nav `AdminSidebar.tsx`** (section « Principal », vers la ligne 62)

Remplacer la première entrée et ajouter la vue business :

```tsx
{ to: '/admin', label: 'Mon espace', icon: LayoutDashboard, end: true },
{ to: '/admin/dashboard', label: 'Vue business', icon: BarChart3 },
```

> Importer `BarChart3` depuis `lucide-react` en haut du fichier s'il n'y est pas déjà.

- [ ] **Step 4: Vérifier build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS (bundle généré, aucune erreur TS).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/AdminSidebar.tsx
git commit -m "feat(mon-espace): Mon Espace en page d'accueil + Vue business en nav"
```

---

# PHASE 3 — Widgets (9 composants pour 15 widgets)

> Tous les widgets vivent dans `src/pages/admin/mon-espace/widgets/`. Chaque widget charge ses propres données (sauf horloge/pomodoro/goal). Style : héritent du fond de tuile ; titres via `.widget-title`.

### Task 10: TaskListWidget (todo / doing / overdue)

**Files:**
- Create: `src/pages/admin/mon-espace/widgets/TaskListWidget.tsx`
- Test: `src/test/taskListWidget.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
// src/test/taskListWidget.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getTasks = vi.fn()
const createTask = vi.fn()
const updateTask = vi.fn()
vi.mock('../services/workspace', () => ({ getTasks: (...a: unknown[]) => getTasks(...a), createTask: (...a: unknown[]) => createTask(...a), updateTask: (...a: unknown[]) => updateTask(...a) }))

import TaskListWidget from '../pages/admin/mon-espace/widgets/TaskListWidget'

beforeEach(() => {
  vi.clearAllMocks()
  getTasks.mockResolvedValue([
    { _id: '1', title: 'Tâche perso', status: 'A_FAIRE', priority: 'NORMALE', order: 0, source: 'PERSONAL' },
    { _id: '2', title: 'Tâche projet', status: 'A_FAIRE', priority: 'HAUTE', order: 0, source: 'PROJECT', project: { _id: 'p', name: 'Projet X' } },
  ])
})

describe('TaskListWidget mode=todo', () => {
  it('liste les tâches à faire (perso + projet)', async () => {
    render(<MemoryRouter><TaskListWidget mode="todo" /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Tâche perso')).toBeInTheDocument())
    expect(screen.getByText('Tâche projet')).toBeInTheDocument()
  })
  it('création rapide d’un todo perso', async () => {
    createTask.mockResolvedValue({ _id: '3', title: 'Nouveau', status: 'A_FAIRE', priority: 'NORMALE', order: 0, source: 'PERSONAL' })
    render(<MemoryRouter><TaskListWidget mode="todo" /></MemoryRouter>)
    await waitFor(() => screen.getByPlaceholderText(/Ajouter/i))
    const input = screen.getByPlaceholderText(/Ajouter/i)
    fireEvent.change(input, { target: { value: 'Nouveau' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouveau' })))
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- taskListWidget`
Expected: FAIL.

- [ ] **Step 3: Écrire le composant**

```tsx
// src/pages/admin/mon-espace/widgets/TaskListWidget.tsx
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getTasks, createTask, updateTask } from '../../../../services/workspace'
import type { PersonalTask, PersonalTaskStatus } from '../../../../types/workspace.types'

type Mode = 'todo' | 'doing' | 'overdue'

const MODE_STATUS: Record<Mode, PersonalTaskStatus | undefined> = {
  todo: 'A_FAIRE',
  doing: 'EN_COURS',
  overdue: undefined,
}
const MODE_TITLE: Record<Mode, string> = { todo: 'Tâches à faire', doing: 'En cours', overdue: 'En retard' }

export default function TaskListWidget({ mode }: { mode: Mode }) {
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [draft, setDraft] = useState('')

  const load = () => {
    getTasks(MODE_STATUS[mode]).then((all) => {
      const filtered =
        mode === 'overdue'
          ? all.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'TERMINE')
          : all
      setTasks(filtered)
    }).catch(() => {})
  }
  useEffect(load, [mode])

  const add = async () => {
    if (!draft.trim()) return
    const created = await createTask({ title: draft.trim(), status: MODE_STATUS[mode] ?? 'A_FAIRE' })
    setTasks((t) => [{ ...created, source: 'PERSONAL' }, ...t])
    setDraft('')
  }

  const advance = async (task: PersonalTask) => {
    if (task.source === 'PROJECT') return
    const next: PersonalTaskStatus = task.status === 'A_FAIRE' ? 'EN_COURS' : 'TERMINE'
    await updateTask(task._id, { status: next })
    load()
  }

  return (
    <div className="widget">
      <div className="widget-title">
        {mode === 'overdue' ? <AlertTriangle size={15} /> : null} {MODE_TITLE[mode]}
        <span className="widget-count">{tasks.length}</span>
      </div>

      {mode !== 'overdue' && (
        <input
          className="widget-input"
          placeholder="Ajouter une tâche…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      )}

      <ul className="widget-list">
        {tasks.map((t) => (
          <li key={t._id} className={`widget-task widget-task--${t.priority.toLowerCase()}`}>
            <button className="widget-task__check" onClick={() => advance(t)} aria-label="Avancer">
              {t.status === 'EN_COURS' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <span className="widget-task__title">{t.title}</span>
            {t.source === 'PROJECT' && t.project && (
              <Link to={`/admin/gestion`} className="widget-task__tag">{t.project.name}</Link>
            )}
          </li>
        ))}
        {tasks.length === 0 && <li className="widget-empty">Rien ici 🎉</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- taskListWidget`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/mon-espace/widgets/TaskListWidget.tsx src/test/taskListWidget.test.tsx
git commit -m "feat(mon-espace): widget liste de tâches (todo/doing/overdue)"
```

---

### Task 11: NoteCollectionWidget (notes / notebook / ideas) + PostItWall

**Files:**
- Create: `src/pages/admin/mon-espace/widgets/NoteCollectionWidget.tsx`, `src/pages/admin/mon-espace/widgets/PostItWall.tsx`
- Test: `src/test/noteWidgets.test.tsx`

> **Écart assumé vs spec §8** : le spec prévoyait de réutiliser `NoteEditor` (education) pour un markdown riche. La v1 implémente une édition **inline simple** (titre + suppression + épinglage/conversion) — plus rapide, suffisante pour le tableau de bord. L'intégration de `NoteEditor` (édition markdown plein écran d'une note) est une amélioration v2 explicitement reportée, pas oubliée.

- [ ] **Step 1: Écrire le test**

```tsx
// src/test/noteWidgets.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const getNotes = vi.fn()
const createNote = vi.fn()
const updateNote = vi.fn()
const deleteNote = vi.fn()
const convertIdea = vi.fn()
vi.mock('../services/workspace', () => ({
  getNotes: (...a: unknown[]) => getNotes(...a),
  createNote: (...a: unknown[]) => createNote(...a),
  updateNote: (...a: unknown[]) => updateNote(...a),
  deleteNote: (...a: unknown[]) => deleteNote(...a),
  convertIdea: (...a: unknown[]) => convertIdea(...a),
}))

import NoteCollectionWidget from '../pages/admin/mon-espace/widgets/NoteCollectionWidget'
import PostItWall from '../pages/admin/mon-espace/widgets/PostItWall'

beforeEach(() => { vi.clearAllMocks(); getNotes.mockResolvedValue([]) })

describe('NoteCollectionWidget', () => {
  it('charge les notes du bon type', async () => {
    getNotes.mockResolvedValue([{ _id: 'n1', type: 'NOTE', title: 'Ma note', content: 'x', order: 0 }])
    render(<NoteCollectionWidget noteType="NOTE" />)
    await waitFor(() => expect(getNotes).toHaveBeenCalledWith('NOTE'))
    expect(screen.getByText('Ma note')).toBeInTheDocument()
  })
  it('IDEA : bouton convertir appelle convertIdea', async () => {
    getNotes.mockResolvedValue([{ _id: 'i1', type: 'IDEA', title: 'Idée', content: '', order: 0, status: 'NEW' }])
    convertIdea.mockResolvedValue({ _id: 't1' })
    render(<NoteCollectionWidget noteType="IDEA" />)
    await waitFor(() => screen.getByText('Idée'))
    fireEvent.click(screen.getByLabelText('Convertir en tâche'))
    await waitFor(() => expect(convertIdea).toHaveBeenCalledWith('i1'))
  })
})

describe('PostItWall', () => {
  it('affiche les post-it', async () => {
    getNotes.mockResolvedValue([{ _id: 'p1', type: 'POSTIT', title: '', content: 'Rappel', color: '#fde68a', order: 0 }])
    render(<PostItWall />)
    await waitFor(() => expect(screen.getByText('Rappel')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- noteWidgets`
Expected: FAIL.

- [ ] **Step 3: Écrire `NoteCollectionWidget.tsx`**

```tsx
// src/pages/admin/mon-espace/widgets/NoteCollectionWidget.tsx
import React, { useEffect, useState } from 'react'
import { Plus, Trash2, ArrowRightCircle, Pin } from 'lucide-react'
import { getNotes, createNote, updateNote, deleteNote, convertIdea } from '../../../../services/workspace'
import type { WorkspaceNote, WorkspaceNoteType } from '../../../../types/workspace.types'

const TITLES: Record<Exclude<WorkspaceNoteType, 'POSTIT'>, string> = {
  NOTE: 'Notes', DRAFT: 'Notebook de brouillons', IDEA: 'Boîte à idées',
}
const PLACEHOLDER: Record<Exclude<WorkspaceNoteType, 'POSTIT'>, string> = {
  NOTE: 'Nouvelle note…', DRAFT: 'Jeter une idée en vrac…', IDEA: 'Une idée à creuser…',
}

export default function NoteCollectionWidget({ noteType }: { noteType: Exclude<WorkspaceNoteType, 'POSTIT'> }) {
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [draft, setDraft] = useState('')

  const load = () => { getNotes(noteType).then(setNotes).catch(() => {}) }
  useEffect(load, [noteType])

  const add = async () => {
    if (!draft.trim()) return
    const created = await createNote({ type: noteType, title: draft.trim(), content: '' })
    setNotes((n) => [created, ...n]); setDraft('')
  }
  const remove = async (id: string) => { await deleteNote(id); setNotes((n) => n.filter((x) => x._id !== id)) }
  const convert = async (id: string) => { await convertIdea(id); load() }
  const togglePin = async (note: WorkspaceNote) => { await updateNote(note._id, { pinned: !note.pinned }); load() }

  return (
    <div className="widget">
      <div className="widget-title">{TITLES[noteType]}<span className="widget-count">{notes.length}</span></div>
      <div className="widget-add">
        <input className="widget-input" placeholder={PLACEHOLDER[noteType]} value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="widget-add__btn" onClick={add} aria-label="Ajouter"><Plus size={16} /></button>
      </div>
      <ul className="widget-list">
        {notes.map((n) => (
          <li key={n._id} className={`widget-note${n.status === 'CONVERTED' ? ' widget-note--done' : ''}`}>
            <span className="widget-note__title">{n.title || n.content.slice(0, 60)}</span>
            <span className="widget-note__actions">
              {noteType === 'NOTE' && (
                <button onClick={() => togglePin(n)} aria-label="Épingler"><Pin size={14} className={n.pinned ? 'pinned' : ''} /></button>
              )}
              {noteType === 'IDEA' && n.status !== 'CONVERTED' && (
                <button onClick={() => convert(n._id)} aria-label="Convertir en tâche"><ArrowRightCircle size={14} /></button>
              )}
              <button onClick={() => remove(n._id)} aria-label="Supprimer"><Trash2 size={14} /></button>
            </span>
          </li>
        ))}
        {notes.length === 0 && <li className="widget-empty">Vide pour l'instant</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Écrire `PostItWall.tsx`**

```tsx
// src/pages/admin/mon-espace/widgets/PostItWall.tsx
import React, { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getNotes, createNote, updateNote, deleteNote } from '../../../../services/workspace'
import type { WorkspaceNote } from '../../../../types/workspace.types'

const COLORS = ['#fde68a', '#fbcfe8', '#bbf7d0', '#bfdbfe', '#ddd6fe']

export default function PostItWall() {
  const [notes, setNotes] = useState<WorkspaceNote[]>([])

  const load = () => { getNotes('POSTIT').then(setNotes).catch(() => {}) }
  useEffect(load, [])

  const add = async () => {
    const color = COLORS[notes.length % COLORS.length]
    const created = await createNote({ type: 'POSTIT', content: 'Nouveau pense-bête', color })
    setNotes((n) => [...n, created])
  }
  const edit = async (id: string, content: string) => { await updateNote(id, { content }) }
  const remove = async (id: string) => { await deleteNote(id); setNotes((n) => n.filter((x) => x._id !== id)) }

  return (
    <div className="widget">
      <div className="widget-title">Mur de post-it<button className="widget-add__btn" onClick={add} aria-label="Ajouter un post-it"><Plus size={16} /></button></div>
      <div className="postit-wall">
        {notes.map((n) => (
          <div key={n._id} className="postit" style={{ background: n.color || COLORS[0] }}>
            <button className="postit__close" onClick={() => remove(n._id)} aria-label="Supprimer"><X size={12} /></button>
            <textarea defaultValue={n.content} onBlur={(e) => edit(n._id, e.target.value)} />
          </div>
        ))}
        {notes.length === 0 && <p className="widget-empty">Aucun post-it</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- noteWidgets`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/mon-espace/widgets/NoteCollectionWidget.tsx src/pages/admin/mon-espace/widgets/PostItWall.tsx src/test/noteWidgets.test.tsx
git commit -m "feat(mon-espace): widgets notes/notebook/idées + mur de post-it"
```

---

### Task 12: Widgets de pilotage (KpiWidget, PinnedWidget, ActivityWidget, WeekWidget)

**Files:**
- Create: `src/pages/admin/mon-espace/widgets/OverviewWidgets.tsx` (4 composants partageant l'appel `getOverview`)
- Test: `src/test/overviewWidgets.test.tsx`

> Ces 4 widgets consomment le même `getOverview()`. Pour éviter 4 appels réseau, un petit contexte React `OverviewProvider` mémoïse l'appel et les 4 composants lisent depuis le contexte.

- [ ] **Step 1: Écrire le test**

```tsx
// src/test/overviewWidgets.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getOverview = vi.fn()
vi.mock('../services/workspace', () => ({ getOverview: (...a: unknown[]) => getOverview(...a) }))

import { OverviewProvider, KpiWidget, PinnedWidget, ActivityWidget, WeekWidget } from '../pages/admin/mon-espace/widgets/OverviewWidgets'

beforeEach(() => {
  vi.clearAllMocks()
  getOverview.mockResolvedValue({
    kpis: [{ label: 'Leads chauds', value: 3, link: '/admin/crm' }],
    overdue: [],
    week: [{ _id: 'w1', title: 'Échéance', status: 'A_FAIRE', priority: 'NORMALE', order: 0, dueDate: new Date().toISOString() }],
    pinned: [{ _id: 'p1', title: 'Épinglé', link: '/admin/x' }],
    activity: [{ _id: 'a1', title: 'Notif', message: 'msg', link: '/x', createdAt: new Date().toISOString() }],
  })
})

const wrap = (ui: React.ReactNode) => render(<MemoryRouter><OverviewProvider>{ui}</OverviewProvider></MemoryRouter>)

describe('Overview widgets', () => {
  it('KPI affiche label/valeur', async () => { wrap(<KpiWidget />); await waitFor(() => expect(screen.getByText('Leads chauds')).toBeInTheDocument()) })
  it('Pinned affiche les épinglés', async () => { wrap(<PinnedWidget />); await waitFor(() => expect(screen.getByText('Épinglé')).toBeInTheDocument()) })
  it('Activity affiche les notifs', async () => { wrap(<ActivityWidget />); await waitFor(() => expect(screen.getByText('Notif')).toBeInTheDocument()) })
  it('Week affiche les échéances', async () => { wrap(<WeekWidget />); await waitFor(() => expect(screen.getByText('Échéance')).toBeInTheDocument()) })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- overviewWidgets`
Expected: FAIL.

- [ ] **Step 3: Écrire `OverviewWidgets.tsx`**

```tsx
// src/pages/admin/mon-espace/widgets/OverviewWidgets.tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, Bell, Calendar } from 'lucide-react'
import { getOverview } from '../../../../services/workspace'
import type { WorkspaceOverview } from '../../../../types/workspace.types'

const OverviewCtx = createContext<WorkspaceOverview | null>(null)

export function OverviewProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceOverview | null>(null)
  useEffect(() => { getOverview().then(setData).catch(() => setData({ kpis: [], overdue: [], week: [], pinned: [], activity: [] })) }, [])
  return <OverviewCtx.Provider value={data}>{children}</OverviewCtx.Provider>
}

const useOverview = () => useContext(OverviewCtx)

export function KpiWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title">Mes chiffres</div>
      <div className="kpi-grid">
        {(o?.kpis ?? []).map((k) => (
          <Link to={k.link} key={k.label} className="kpi-card">
            <b>{k.value}</b><span>{k.label}</span>
          </Link>
        ))}
        {o && o.kpis.length === 0 && <p className="widget-empty">Aucun indicateur</p>}
      </div>
    </div>
  )
}

export function PinnedWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Pin size={15} /> Épinglés</div>
      <ul className="widget-list">
        {(o?.pinned ?? []).map((p) => <li key={p._id}><Link to={p.link}>{p.title}</Link></li>)}
        {o && o.pinned.length === 0 && <li className="widget-empty">Rien d'épinglé</li>}
      </ul>
    </div>
  )
}

export function ActivityWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Bell size={15} /> Activité</div>
      <ul className="widget-list">
        {(o?.activity ?? []).map((a) => (
          <li key={a._id} className="widget-activity"><Link to={a.link}><b>{a.title}</b><span>{a.message}</span></Link></li>
        ))}
        {o && o.activity.length === 0 && <li className="widget-empty">Aucune activité récente</li>}
      </ul>
    </div>
  )
}

export function WeekWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Calendar size={15} /> Cette semaine</div>
      <ul className="widget-list">
        {(o?.week ?? []).map((t) => (
          <li key={t._id} className="widget-week">
            <span className="widget-week__date">{t.dueDate ? new Date(t.dueDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : ''}</span>
            <span>{t.title}</span>
          </li>
        ))}
        {o && o.week.length === 0 && <li className="widget-empty">Pas d'échéance cette semaine</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- overviewWidgets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/mon-espace/widgets/OverviewWidgets.tsx src/test/overviewWidgets.test.tsx
git commit -m "feat(mon-espace): widgets KPIs, épinglés, activité, semaine (1 appel overview)"
```

---

### Task 13: Widgets d'ambiance (ShortcutsWidget, ClockWidget, PomodoroWidget, GoalWidget)

**Files:**
- Create: `src/pages/admin/mon-espace/widgets/AmbianceWidgets.tsx`
- Test: `src/test/ambianceWidgets.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
// src/test/ambianceWidgets.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ClockWidget, PomodoroWidget, GoalWidget, ShortcutsWidget } from '../pages/admin/mon-espace/widgets/AmbianceWidgets'

vi.mock('../services/workspace', () => ({ saveLayout: vi.fn().mockResolvedValue({}) }))

describe('Ambiance widgets', () => {
  it('ClockWidget affiche une heure', () => {
    render(<ClockWidget />)
    expect(screen.getByTestId('clock-time').textContent).toMatch(/\d{1,2}:\d{2}/)
  })
  it('PomodoroWidget démarre/met en pause', () => {
    render(<PomodoroWidget />)
    const btn = screen.getByRole('button', { name: /Démarrer|Pause/ })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })
  it('GoalWidget enregistre l’objectif au blur', () => {
    render(<GoalWidget />)
    const input = screen.getByPlaceholderText(/objectif/i)
    fireEvent.change(input, { target: { value: 'Finir le devis' } })
    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('Finir le devis')
  })
  it('ShortcutsWidget affiche des liens par défaut', () => {
    render(<ShortcutsWidget />)
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npm run test:frontend -- ambianceWidgets`
Expected: FAIL.

- [ ] **Step 3: Écrire `AmbianceWidgets.tsx`**

```tsx
// src/pages/admin/mon-espace/widgets/AmbianceWidgets.tsx
import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Pause, RotateCcw, Target, MessageSquare, Receipt, FolderKanban } from 'lucide-react'
import { saveLayout } from '../../../../services/workspace'

const QUOTES = [
  'Fais aujourd’hui ce que les autres remettent à demain.',
  'La discipline est le pont entre les objectifs et les résultats.',
  'Un petit progrès chaque jour mène à de grands résultats.',
]

export function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  return (
    <div className="widget widget--center">
      <div data-testid="clock-time" className="clock-time">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="clock-date">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  )
}

export function PomodoroWidget() {
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    } else if (ref.current) {
      clearInterval(ref.current)
    }
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [running])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return (
    <div className="widget widget--center">
      <div className="widget-title">Focus</div>
      <div className="pomodoro-time">{mm}:{ss}</div>
      <div className="pomodoro-actions">
        <button onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause' : 'Démarrer'}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Démarrer'}
        </button>
        <button onClick={() => { setRunning(false); setSeconds(25 * 60) }} aria-label="Réinitialiser"><RotateCcw size={16} /></button>
      </div>
    </div>
  )
}

export function GoalWidget() {
  const [goal, setGoal] = useState('')
  const quote = QUOTES[new Date().getDate() % QUOTES.length]
  const save = (text: string) => { saveLayout({ dailyGoal: { text, date: new Date().toISOString() } }).catch(() => {}) }
  return (
    <div className="widget">
      <div className="widget-title"><Target size={15} /> Objectif du jour</div>
      <input className="widget-input" placeholder="Mon objectif du jour…" value={goal}
        onChange={(e) => setGoal(e.target.value)} onBlur={(e) => save(e.target.value)} />
      <p className="goal-quote">“{quote}”</p>
    </div>
  )
}

const DEFAULT_SHORTCUTS = [
  { to: '/admin/messages', label: 'Messages', Icon: MessageSquare },
  { to: '/admin/gestion', label: 'Projets', Icon: FolderKanban },
  { to: '/admin/comptabilite', label: 'Compta', Icon: Receipt },
]

export function ShortcutsWidget() {
  return (
    <div className="widget">
      <div className="widget-title">Raccourcis</div>
      <div className="shortcuts-grid">
        {DEFAULT_SHORTCUTS.map((s) => (
          <Link to={s.to} key={s.to} className="shortcut"><s.Icon size={18} /><span>{s.label}</span></Link>
        ))}
      </div>
    </div>
  )
}
```

> **Note** : la persistance de l'objectif du jour via `saveLayout({ dailyGoal })` écrase uniquement `dailyGoal` côté serveur (le PUT fait un `$set` partiel — voir Task 4). Les raccourcis personnalisables (édition utilisateur) sont hors v1 : on affiche une liste par défaut. Évolution future : lire `layout.shortcuts`.

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npm run test:frontend -- ambianceWidgets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/mon-espace/widgets/AmbianceWidgets.tsx src/test/ambianceWidgets.test.tsx
git commit -m "feat(mon-espace): widgets horloge, pomodoro, objectif du jour, raccourcis"
```

---

### Task 14: Brancher le registry de widgets (remplacer le stub) + CSS widgets + intégration

**Files:**
- Modify: `src/pages/admin/mon-espace/widgets/index.tsx` (remplace le stub de Task 8)
- Modify: `src/pages/admin/mon-espace/MonEspace.css` (ajouter les styles `.widget*`)
- Modify: `src/pages/admin/mon-espace/index.tsx` (envelopper la grille dans `OverviewProvider`)

- [ ] **Step 1: Remplacer le stub `widgets/index.tsx` par le vrai routeur de rendu**

```tsx
// src/pages/admin/mon-espace/widgets/index.tsx
import React from 'react'
import type { WidgetKey } from './registry'
import TaskListWidget from './TaskListWidget'
import NoteCollectionWidget from './NoteCollectionWidget'
import PostItWall from './PostItWall'
import { KpiWidget, PinnedWidget, ActivityWidget, WeekWidget } from './OverviewWidgets'
import { ClockWidget, PomodoroWidget, GoalWidget, ShortcutsWidget } from './AmbianceWidgets'

export function renderWidget(key: WidgetKey): React.ReactNode {
  switch (key) {
    case 'todo': return <TaskListWidget mode="todo" />
    case 'doing': return <TaskListWidget mode="doing" />
    case 'overdue': return <TaskListWidget mode="overdue" />
    case 'week': return <WeekWidget />
    case 'notes': return <NoteCollectionWidget noteType="NOTE" />
    case 'notebook': return <NoteCollectionWidget noteType="DRAFT" />
    case 'ideas': return <NoteCollectionWidget noteType="IDEA" />
    case 'postit': return <PostItWall />
    case 'kpis': return <KpiWidget />
    case 'pinned': return <PinnedWidget />
    case 'activity': return <ActivityWidget />
    case 'shortcuts': return <ShortcutsWidget />
    case 'clock': return <ClockWidget />
    case 'pomodoro': return <PomodoroWidget />
    case 'goal': return <GoalWidget />
    default: return null
  }
}
```

- [ ] **Step 2: Envelopper la grille dans `OverviewProvider`**

Dans `src/pages/admin/mon-espace/index.tsx`, importer `OverviewProvider` depuis `./widgets/OverviewWidgets` et envelopper le `<BentoGrid …/>` :

```tsx
import { OverviewProvider } from './widgets/OverviewWidgets'
// …
<OverviewProvider>
  <BentoGrid widgets={widgets} editing={editing} onChange={persist} renderWidget={(key) => renderWidget(key as WidgetKey)} />
</OverviewProvider>
```

- [ ] **Step 3: Ajouter les styles `.widget*` à `MonEspace.css`**

```css
/* Widgets — base */
.widget { display: flex; flex-direction: column; height: 100%; gap: 8px; }
.widget--center { align-items: center; justify-content: center; text-align: center; }
.widget-title { display: flex; align-items: center; gap: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
.widget-count { margin-left: auto; background: rgba(var(--primary-rgb), 0.2); color: #7dd3fc; border-radius: 8px; padding: 0 8px; font-size: 11px; }
.widget-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 6px 10px; color: #e2e8f0; font-size: 13px; }
.widget-list { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
.widget-empty { color: #64748b; font-size: 12px; padding: 8px 0; }
.widget-task, .widget-note { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.widget-task__check { background: transparent; border: none; color: #94a3b8; cursor: pointer; }
.widget-task__title { flex: 1; color: #e2e8f0; font-size: 13px; }
.widget-task__tag { font-size: 10px; color: #7dd3fc; border: 1px solid rgba(56,189,248,0.3); border-radius: 6px; padding: 1px 6px; }
.widget-task--haute .widget-task__title, .widget-task--urgente .widget-task__title { font-weight: 600; }
.widget-note--done .widget-note__title { text-decoration: line-through; opacity: .6; }
.widget-note__actions button { background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 2px; }
.kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.kpi-card { background: rgba(var(--primary-rgb),0.1); border: 1px solid rgba(var(--primary-rgb),0.25); border-radius: 10px; padding: 10px; text-align: center; text-decoration: none; }
.kpi-card b { display: block; font-size: 20px; color: var(--primary); }
.kpi-card span { font-size: 11px; color: #94a3b8; }
.postit-wall { display: flex; flex-wrap: wrap; gap: 8px; overflow: auto; }
.postit { position: relative; width: 110px; min-height: 90px; border-radius: 6px; padding: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.postit textarea { width: 100%; height: 70px; background: transparent; border: none; resize: none; color: #1e293b; font-size: 11px; }
.postit__close { position: absolute; top: 2px; right: 2px; background: transparent; border: none; cursor: pointer; color: #475569; }
.clock-time { font-size: 32px; font-weight: 700; color: #e2e8f0; }
.clock-date { color: #94a3b8; font-size: 12px; text-transform: capitalize; }
.pomodoro-time { font-size: 30px; font-weight: 700; color: var(--primary); }
.pomodoro-actions { display: flex; gap: 8px; margin-top: 6px; }
.pomodoro-actions button { background: rgba(var(--primary-rgb),0.15); border: 1px solid rgba(var(--primary-rgb),0.3); border-radius: 8px; color: #e2e8f0; padding: 4px 10px; cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
.goal-quote { font-style: italic; color: #94a3b8; font-size: 12px; }
.shortcuts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.shortcut { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.04); color: #cbd5e1; text-decoration: none; font-size: 11px; }
.mon-espace__drawer { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; align-items: center; }
.mon-espace__drawer .chip { background: rgba(var(--primary-rgb),0.12); border: 1px solid rgba(var(--primary-rgb),0.3); color: #7dd3fc; border-radius: 20px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 4: Lancer toute la suite front + typecheck + build**

Run: `npm run typecheck && npm run test:frontend && npm run build`
Expected: PASS (tous les tests verts, bundle généré).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/mon-espace/widgets/index.tsx src/pages/admin/mon-espace/index.tsx src/pages/admin/mon-espace/MonEspace.css
git commit -m "feat(mon-espace): branchement des 15 widgets + styles + OverviewProvider"
```

---

### Task 15: Vérification finale & nettoyage

- [ ] **Step 1: Suite complète back + front**

Run: `npm run typecheck:all && npm run test:all`
Expected: PASS (back + front).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (corriger via `npm run lint:fix` si nécessaire, puis recommiter).

- [ ] **Step 3: Vérification manuelle (lancer l'app)**

Run: `npm run dev` (front) + backend lancé. Se connecter en back-office avec un compte non-super-admin → l'accueil `/admin` doit afficher « Mon espace » avec les 15 widgets ; tester : créer un todo, un post-it, une idée + convertir, passer en mode Personnaliser, masquer/ajouter un widget, changer une taille, recharger la page → la disposition est conservée. Se connecter ensuite en super admin → vérifier que « Mon espace » s'affiche aussi et que « Pédagogie » reste accessible et inchangée.

- [ ] **Step 4: Commit final si correctifs**

```bash
git add -A
git commit -m "chore(mon-espace): corrections post-vérification"
```

---

## Récapitulatif des commits attendus

1. Interfaces TS · 2. Modèles · 3. Service KPIs · 4. Routes · 5. Montage routeur · 6. Types/service front · 7. BentoGrid · 8. Page + registry · 9. Routing/nav · 10. TaskListWidget · 11. Notes/Post-it · 12. Overview widgets · 13. Ambiance widgets · 14. Branchement registry · 15. Vérif finale.

## Notes de suivi (tracker Venio)

Consigner le démarrage et la complétion dans le workspace de suivi dev Venio (skill `venio-dev-tracking`), conformément aux habitudes du projet.
