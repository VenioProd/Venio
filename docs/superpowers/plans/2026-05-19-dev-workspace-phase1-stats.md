# Dev Workspace — Phase 1 (Stats & Progression) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir les endpoints stats du module dev (admin + agent) et exposer la progression par projet via un nouveau endpoint `/overview`, sans toucher aux modèles ni au front.

**Architecture:** Lib pure `backend/src/lib/dev/stats.ts` qui factorise tous les calculs (progress, health, agrégats). Les routes (admin et agent) sont de simples wrappers HTTP autour de cette lib. Convention « blocked » par label (`blocked`/`blocker` case-insensitive) en attendant un champ dédié en phase 2.

**Tech Stack:** Node 22, TypeScript, Express, Mongoose, Vitest, supertest, mongodb-memory-server.

**Spec :** [docs/superpowers/specs/2026-05-19-dev-workspace-phase1-stats-design.md](../specs/2026-05-19-dev-workspace-phase1-stats-design.md)

---

## File Structure

**Création** :
- `backend/src/lib/dev/stats.ts` — lib pure de calculs + agrégats Mongo
- `backend/src/__tests__/dev-stats-lib.test.ts` — tests unitaires lib (pas de DB)
- `backend/src/__tests__/dev-stats-lib-integration.test.ts` — tests lib avec Mongo en mémoire (computeStats/computeOverview)
- `backend/src/__tests__/agent-dev-stats.test.ts` — tests intégration routes agent
- `backend/src/__tests__/admin-dev-stats.test.ts` — tests intégration routes admin

**Modification** :
- `backend/src/routes/admin/dev/stats.ts` — délégation à la lib + nouveau champs + route `/overview`
- `backend/src/routes/agent/dev.ts` — ajout routes `/dev/stats` et `/dev/overview`

---

## Task 1: Lib — squelette + `computeProgress`

**Files:**
- Create: `backend/src/lib/dev/stats.ts`
- Create: `backend/src/__tests__/dev-stats-lib.test.ts`

- [ ] **Step 1: Write the failing test**

`backend/src/__tests__/dev-stats-lib.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { computeProgress, STATUS_WEIGHT } from '../lib/dev/stats.js'
import type { DevIssueStatus } from '../models/DevIssue.js'

const empty: Record<DevIssueStatus, number> = {
  BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0,
}

describe('computeProgress', () => {
  it('returns 0 when there are no issues', () => {
    expect(computeProgress(empty)).toBe(0)
  })

  it('returns 100 when all non-cancelled issues are DONE', () => {
    expect(computeProgress({ ...empty, DONE: 5, CANCELLED: 2 })).toBe(100)
  })

  it('returns 0 when only CANCELLED issues exist', () => {
    expect(computeProgress({ ...empty, CANCELLED: 3 })).toBe(0)
  })

  it('ignores CANCELLED in both numerator and denominator', () => {
    // 2 DONE (100) + 2 CANCELLED → 200 / (2*100) = 100
    expect(computeProgress({ ...empty, DONE: 2, CANCELLED: 2 })).toBe(100)
  })

  it('weights mixed statuses correctly', () => {
    // 1 BACKLOG (0) + 1 TODO (10) + 1 IN_PROGRESS (50) + 1 IN_REVIEW (80) + 1 DONE (100)
    // = 240 / 500 = 48
    expect(
      computeProgress({ ...empty, BACKLOG: 1, TODO: 1, IN_PROGRESS: 1, IN_REVIEW: 1, DONE: 1 })
    ).toBe(48)
  })

  it('rounds to nearest integer', () => {
    // 1 TODO (10) + 2 IN_PROGRESS (50) = 110 / 300 = 36.666... → 37
    expect(computeProgress({ ...empty, TODO: 1, IN_PROGRESS: 2 })).toBe(37)
  })

  it('exposes the documented weight map', () => {
    expect(STATUS_WEIGHT).toEqual({
      BACKLOG: 0, TODO: 10, IN_PROGRESS: 50, IN_REVIEW: 80, DONE: 100, CANCELLED: 0,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib.test.ts`
Expected: FAIL with module resolution error (`lib/dev/stats.js` does not exist).

- [ ] **Step 3: Create the lib with minimal implementation**

`backend/src/lib/dev/stats.ts` :
```ts
import type { DevIssueStatus } from '../../models/DevIssue.js'

export const STATUS_WEIGHT: Record<DevIssueStatus, number> = {
  BACKLOG: 0,
  TODO: 10,
  IN_PROGRESS: 50,
  IN_REVIEW: 80,
  DONE: 100,
  CANCELLED: 0,
}

/**
 * Calcule un pourcentage 0-100 (arrondi entier) à partir d'un compte par
 * statut. CANCELLED est ignoré au numérateur ET au dénominateur.
 */
export function computeProgress(byStatus: Record<DevIssueStatus, number>): number {
  let weighted = 0
  let nonCancelled = 0
  for (const [status, count] of Object.entries(byStatus) as [DevIssueStatus, number][]) {
    if (status === 'CANCELLED') continue
    weighted += STATUS_WEIGHT[status] * count
    nonCancelled += count
  }
  if (nonCancelled === 0) return 0
  return Math.round(weighted / nonCancelled)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib.test.ts`
Expected: all 7 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/dev/stats.ts backend/src/__tests__/dev-stats-lib.test.ts
git commit -m "feat(dev/stats): lib computeProgress with status weighting"
```

---

## Task 2: Lib — `computeHealth`

**Files:**
- Modify: `backend/src/lib/dev/stats.ts`
- Modify: `backend/src/__tests__/dev-stats-lib.test.ts`

- [ ] **Step 1: Append the failing test**

Ajouter en fin de `dev-stats-lib.test.ts` :
```ts
import { computeHealth } from '../lib/dev/stats.js'

describe('computeHealth', () => {
  it("returns 'blocked' when blocked > 0, even with high progress", () => {
    expect(computeHealth({ blocked: 1, urgent: 0 }, 90)).toBe('blocked')
  })

  it("returns 'at_risk' when urgent > 0 and progress < 50", () => {
    expect(computeHealth({ blocked: 0, urgent: 1 }, 30)).toBe('at_risk')
  })

  it("returns 'on_track' when urgent > 0 but progress >= 50", () => {
    expect(computeHealth({ blocked: 0, urgent: 2 }, 60)).toBe('on_track')
  })

  it("returns 'on_track' for healthy projects", () => {
    expect(computeHealth({ blocked: 0, urgent: 0 }, 10)).toBe('on_track')
  })

  it('prioritises blocked over urgent', () => {
    expect(computeHealth({ blocked: 1, urgent: 5 }, 0)).toBe('blocked')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib.test.ts -t computeHealth`
Expected: FAIL with `computeHealth is not a function`.

- [ ] **Step 3: Add `computeHealth` to the lib**

Ajouter à `backend/src/lib/dev/stats.ts` :
```ts
export type ProjectHealth = 'on_track' | 'at_risk' | 'blocked'

export interface HealthSignals {
  blocked: number
  urgent: number
}

/**
 * Heuristique provisoire :
 *   blocked > 0             → 'blocked'
 *   urgent > 0 && progress < 50 → 'at_risk'
 *   sinon                   → 'on_track'
 */
export function computeHealth(signals: HealthSignals, progress: number): ProjectHealth {
  if (signals.blocked > 0) return 'blocked'
  if (signals.urgent > 0 && progress < 50) return 'at_risk'
  return 'on_track'
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib.test.ts`
Expected: all tests pass (12 assertions total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/dev/stats.ts backend/src/__tests__/dev-stats-lib.test.ts
git commit -m "feat(dev/stats): lib computeHealth heuristic"
```

---

## Task 3: Lib — `computeStats` (avec DB)

**Files:**
- Modify: `backend/src/lib/dev/stats.ts`
- Create: `backend/src/__tests__/dev-stats-lib-integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

`backend/src/__tests__/dev-stats-lib-integration.test.ts` :
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import User from '../models/User.js'
import { computeStats } from '../lib/dev/stats.js'

let systemUserId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
  const p = await DevProject.create({
    key: 'VEN', name: 'Venio', createdBy: systemUserId,
  })
  projectId = p._id as mongoose.Types.ObjectId
})

async function createIssue(over: Partial<{
  status: string; priority: string; labels: string[]; completedAt: Date | null
}> = {}) {
  return DevIssue.create({
    project: projectId,
    identifier: `VEN-${Math.floor(Math.random() * 1e6)}`,
    title: 'T',
    status: over.status ?? 'TODO',
    priority: over.priority ?? 'MEDIUM',
    type: 'TASK',
    labels: over.labels ?? [],
    reporter: systemUserId,
    completedAt: over.completedAt ?? null,
  })
}

describe('computeStats', () => {
  it('returns zeros when there are no issues', async () => {
    const s = await computeStats()
    expect(s.total).toBe(0)
    expect(s.open).toBe(0)
    expect(s.urgent).toBe(0)
    expect(s.blocked).toBe(0)
    expect(s.completed7d).toBe(0)
    expect(s.completed14d).toBe(0)
    expect(s.completedRecent).toBe(0) // alias rétro-compat
    expect(s.velocity14d).toBe(0)
    expect(s.totalProjects).toBe(1)
  })

  it('counts urgent open issues correctly', async () => {
    await createIssue({ priority: 'URGENT', status: 'TODO' })
    await createIssue({ priority: 'URGENT', status: 'DONE' }) // pas comptée
    await createIssue({ priority: 'HIGH', status: 'TODO' })   // pas urgente
    const s = await computeStats()
    expect(s.urgent).toBe(1)
  })

  it('counts blocked issues by label (case-insensitive, blocked or blocker)', async () => {
    await createIssue({ labels: ['Blocked'] })
    await createIssue({ labels: ['BLOCKER'] })
    await createIssue({ labels: ['feature'] }) // pas bloquée
    await createIssue({ labels: ['blocked'], status: 'DONE' }) // closed, pas comptée
    const s = await computeStats()
    expect(s.blocked).toBe(2)
  })

  it('computes completed7d / completed14d windows', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    await createIssue({ status: 'DONE', completedAt: new Date(now - 3 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(now - 10 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(now - 30 * day) })
    const s = await computeStats()
    expect(s.completed7d).toBe(1)
    expect(s.completed14d).toBe(2)
    expect(s.completedRecent).toBe(2)
    expect(s.velocity14d).toBeCloseTo(2 / 14, 2)
  })

  it('filters by project when match is supplied', async () => {
    const other = await DevProject.create({ key: 'ZEP', name: 'Zephyr', createdBy: systemUserId })
    await createIssue({ status: 'TODO' })
    await DevIssue.create({
      project: other._id, identifier: 'ZEP-1', title: 'Z', status: 'TODO',
      priority: 'MEDIUM', type: 'TASK', reporter: systemUserId,
    })
    const sFiltered = await computeStats({ project: projectId })
    expect(sFiltered.total).toBe(1)
    const sAll = await computeStats()
    expect(sAll.total).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib-integration.test.ts`
Expected: FAIL with `computeStats is not a function`.

- [ ] **Step 3: Implement `computeStats`**

Ajouter à `backend/src/lib/dev/stats.ts` :
```ts
import DevIssue, {
  DEV_ISSUE_STATUSES,
  DEV_ISSUE_PRIORITIES,
  type DevIssueStatus,
} from '../../models/DevIssue.js'
import DevProject from '../../models/DevProject.js'

export interface StatsPayload {
  total: number
  open: number
  completedRecent: number // alias rétro-compat de completed14d
  completed7d: number
  completed14d: number
  urgent: number
  blocked: number
  totalProjects: number
  velocity14d: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
}

const BLOCKED_LABELS = ['blocked', 'blocker']
const CLOSED_STATUSES = ['DONE', 'CANCELLED'] as const

export async function computeStats(
  match: Record<string, unknown> = {}
): Promise<StatsPayload> {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const since14 = new Date(now - 14 * day)
  const since7 = new Date(now - 7 * day)
  const openMatch = { ...match, status: { $nin: CLOSED_STATUSES } }

  const [byStatusAgg, byPriorityAgg, total, openCount, totalProjects, urgent, blocked, completed7d, completed14d] =
    await Promise.all([
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      DevIssue.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      DevIssue.countDocuments(match),
      DevIssue.countDocuments(openMatch),
      DevProject.countDocuments({ status: { $ne: 'ARCHIVED' } }),
      DevIssue.countDocuments({ ...openMatch, priority: 'URGENT' }),
      DevIssue.countDocuments({
        ...openMatch,
        labels: { $in: BLOCKED_LABELS.map((l) => new RegExp(`^${l}$`, 'i')) },
      }),
      DevIssue.countDocuments({ ...match, status: 'DONE', completedAt: { $gte: since7 } }),
      DevIssue.countDocuments({ ...match, status: 'DONE', completedAt: { $gte: since14 } }),
    ])

  const byStatus: Record<string, number> = {}
  for (const s of DEV_ISSUE_STATUSES) byStatus[s] = 0
  for (const row of byStatusAgg) byStatus[row._id as string] = row.count

  const byPriority: Record<string, number> = {}
  for (const p of DEV_ISSUE_PRIORITIES) byPriority[p] = 0
  for (const row of byPriorityAgg) byPriority[row._id as string] = row.count

  return {
    total,
    open: openCount,
    completedRecent: completed14d,
    completed7d,
    completed14d,
    urgent,
    blocked,
    totalProjects,
    velocity14d: Math.round((completed14d / 14) * 100) / 100,
    byStatus,
    byPriority,
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib-integration.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/dev/stats.ts backend/src/__tests__/dev-stats-lib-integration.test.ts
git commit -m "feat(dev/stats): lib computeStats with urgent/blocked/velocity"
```

---

## Task 4: Lib — `computeOverview`

**Files:**
- Modify: `backend/src/lib/dev/stats.ts`
- Modify: `backend/src/__tests__/dev-stats-lib-integration.test.ts`

- [ ] **Step 1: Append the failing test**

Ajouter à `dev-stats-lib-integration.test.ts` :
```ts
import { computeOverview } from '../lib/dev/stats.js'

describe('computeOverview', () => {
  it('includes projects with no issues, progress=0, health=on_track', async () => {
    const o = await computeOverview()
    expect(o.projects).toHaveLength(1)
    expect(o.projects[0].key).toBe('VEN')
    expect(o.projects[0].progress).toBe(0)
    expect(o.projects[0].health).toBe('on_track')
    expect(o.projects[0].counts.total).toBe(0)
    expect(o.kpis.totalProjects).toBe(1)
    expect(o.kpis.activeProjects).toBe(1)
    expect(o.kpis.totalOpen).toBe(0)
  })

  it('computes progress, counts and health for a project with mixed issues', async () => {
    await createIssue({ status: 'BACKLOG' })
    await createIssue({ status: 'IN_PROGRESS' })
    await createIssue({ status: 'DONE' })
    await createIssue({ status: 'CANCELLED' })
    await createIssue({ priority: 'URGENT', status: 'TODO', labels: ['blocked'] })

    const o = await computeOverview()
    const p = o.projects.find((x) => x.key === 'VEN')!
    expect(p.counts.total).toBe(5)
    expect(p.counts.done).toBe(1)
    expect(p.counts.cancelled).toBe(1)
    expect(p.counts.urgent).toBe(1)
    expect(p.counts.blocked).toBe(1)
    expect(p.counts.open).toBe(3) // total - DONE - CANCELLED
    // Statuts non-CANCELLED : BACKLOG(0) + IN_PROGRESS(50) + DONE(100) + TODO(10) = 160 / 400 = 40
    expect(p.progress).toBe(40)
    // blocked > 0 → 'blocked'
    expect(p.health).toBe('blocked')
  })

  it("sorts ACTIVE projects first, then by lastActivityAt desc", async () => {
    const archived = await DevProject.create({
      key: 'ARC', name: 'Archived', status: 'ARCHIVED', createdBy: systemUserId,
    })
    const newer = await DevProject.create({
      key: 'NEW', name: 'Newer', createdBy: systemUserId,
    })
    // Force ordering: bump VEN's updatedAt
    await DevProject.updateOne({ _id: projectId }, { $set: { updatedAt: new Date(Date.now() - 1000) } })
    const o = await computeOverview()
    const keys = o.projects.map((p) => p.key)
    // ACTIVE first (NEW, VEN), then ARCHIVED
    expect(keys[keys.length - 1]).toBe('ARC')
    expect(keys.indexOf('NEW')).toBeLessThan(keys.indexOf('VEN'))
  })

  it('populates lead with name and email when present', async () => {
    const lead = await User.create({
      email: 'lead@test.local', name: 'Lead', role: 'ADMIN', passwordHash: 'x',
    })
    await DevProject.updateOne({ _id: projectId }, { $set: { lead: lead._id } })
    const o = await computeOverview()
    const p = o.projects.find((x) => x.key === 'VEN')!
    expect(p.lead).toMatchObject({ name: 'Lead', email: 'lead@test.local' })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib-integration.test.ts -t computeOverview`
Expected: FAIL with `computeOverview is not a function`.

- [ ] **Step 3: Implement `computeOverview`**

Ajouter à `backend/src/lib/dev/stats.ts` :
```ts
import type { DevIssueStatus } from '../../models/DevIssue.js'

export interface ProjectCounts {
  total: number
  open: number
  done: number
  cancelled: number
  urgent: number
  blocked: number
  byStatus: Record<DevIssueStatus, number>
}

export interface OverviewProject {
  _id: string
  key: string
  name: string
  color: string
  status: string
  lead: { _id: string; name: string; email: string } | null
  counts: ProjectCounts
  progress: number
  health: ProjectHealth
  lastActivityAt: string
}

export interface OverviewKpis {
  totalProjects: number
  activeProjects: number
  totalOpen: number
  urgent: number
  blocked: number
  completed7d: number
  completed14d: number
  velocity14d: number
}

export interface OverviewPayload {
  kpis: OverviewKpis
  projects: OverviewProject[]
}

function emptyByStatus(): Record<DevIssueStatus, number> {
  return { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0 }
}

export async function computeOverview(): Promise<OverviewPayload> {
  const blockedRegexes = BLOCKED_LABELS.map((l) => new RegExp(`^${l}$`, 'i'))

  // 1) Tous les projets + lead populé
  const projectsRaw = await DevProject.find({})
    .populate<{ lead: { _id: mongoose.Types.ObjectId; name: string; email: string } | null }>(
      'lead',
      'name email'
    )
    .lean()

  // 2) Aggrégat par projet sur les issues
  const perProjectAgg = await DevIssue.aggregate<{
    _id: mongoose.Types.ObjectId
    byStatus: { status: string; count: number }[]
    urgent: number
    blocked: number
    lastUpdatedAt: Date | null
  }>([
    {
      $group: {
        _id: '$project',
        byStatus: { $push: { status: '$status', count: 1 } },
        urgent: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$priority', 'URGENT'] }, { $not: { $in: ['$status', CLOSED_STATUSES] } }] },
              1,
              0,
            ],
          },
        },
        blocked: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $not: { $in: ['$status', CLOSED_STATUSES] } },
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: { $ifNull: ['$labels', []] },
                            as: 'l',
                            cond: {
                              $regexMatch: {
                                input: '$$l',
                                regex: '^(blocked|blocker)$',
                                options: 'i',
                              },
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        lastUpdatedAt: { $max: '$updatedAt' },
      },
    },
  ])

  const aggByProjectId = new Map<string, (typeof perProjectAgg)[number]>()
  for (const row of perProjectAgg) aggByProjectId.set(String(row._id), row)

  // 3) Merge en mémoire
  const projects: OverviewProject[] = projectsRaw.map((p) => {
    const agg = aggByProjectId.get(String(p._id))
    const byStatus = emptyByStatus()
    if (agg) {
      for (const row of agg.byStatus) {
        byStatus[row.status as DevIssueStatus] = (byStatus[row.status as DevIssueStatus] ?? 0) + row.count
      }
    }
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    const done = byStatus.DONE
    const cancelled = byStatus.CANCELLED
    const open = total - done - cancelled
    const urgent = agg?.urgent ?? 0
    const blocked = agg?.blocked ?? 0
    const progress = computeProgress(byStatus)
    const health = computeHealth({ urgent, blocked }, progress)
    const lastActivityAt = new Date(
      Math.max(
        new Date(p.updatedAt).getTime(),
        agg?.lastUpdatedAt ? new Date(agg.lastUpdatedAt).getTime() : 0
      )
    ).toISOString()
    return {
      _id: String(p._id),
      key: p.key,
      name: p.name,
      color: p.color,
      status: p.status,
      lead: p.lead
        ? { _id: String(p.lead._id), name: p.lead.name, email: p.lead.email }
        : null,
      counts: { total, open, done, cancelled, urgent, blocked, byStatus },
      progress,
      health,
      lastActivityAt,
    }
  })

  // 4) Tri : ACTIVE d'abord, puis lastActivityAt desc
  projects.sort((a, b) => {
    const aActive = a.status === 'ACTIVE' ? 0 : 1
    const bActive = b.status === 'ACTIVE' ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return b.lastActivityAt.localeCompare(a.lastActivityAt)
  })

  // 5) KPI globaux : on réutilise computeStats() pour cohérence (1 calcul, 1 source de vérité)
  const stats = await computeStats()
  const kpis: OverviewKpis = {
    totalProjects: stats.totalProjects,
    activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
    totalOpen: stats.open,
    urgent: stats.urgent,
    blocked: stats.blocked,
    completed7d: stats.completed7d,
    completed14d: stats.completed14d,
    velocity14d: stats.velocity14d,
  }

  return { kpis, projects }
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx vitest run src/__tests__/dev-stats-lib-integration.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/dev/stats.ts backend/src/__tests__/dev-stats-lib-integration.test.ts
git commit -m "feat(dev/stats): lib computeOverview with per-project progress"
```

---

## Task 5: Route admin `/stats` enrichie + nouveau `/overview`

**Files:**
- Modify: `backend/src/routes/admin/dev/stats.ts`
- Create: `backend/src/__tests__/admin-dev-stats.test.ts`

- [ ] **Step 1: Write the failing integration test**

`backend/src/__tests__/admin-dev-stats.test.ts` :
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

vi.mock('../middleware/auth.js', () => ({
  default: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express
let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  const { default: devRoutes } = await import('../routes/admin/dev/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
})
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('GET /api/admin/dev/stats', () => {
  it('returns the documented shape with new fields', async () => {
    const res = await request(app).get('/api/admin/dev/stats').expect(200)
    expect(res.body).toMatchObject({
      total: 0, open: 0, completedRecent: 0, completed7d: 0, completed14d: 0,
      urgent: 0, blocked: 0, totalProjects: 0, velocity14d: 0,
    })
    expect(res.body.byStatus).toBeDefined()
    expect(res.body.byPriority).toBeDefined()
  })
})

describe('GET /api/admin/dev/overview', () => {
  it('returns kpis and projects (empty when no project)', async () => {
    const res = await request(app).get('/api/admin/dev/overview').expect(200)
    expect(res.body.kpis).toMatchObject({ totalProjects: 0, activeProjects: 0 })
    expect(res.body.projects).toEqual([])
  })

  it('returns a project entry with counts and progress', async () => {
    const { default: DevProject } = await import('../models/DevProject.js')
    const { default: DevIssue } = await import('../models/DevIssue.js')
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    await DevIssue.create({
      project: p._id, identifier: 'VEN-1', title: 'T',
      status: 'DONE', priority: 'MEDIUM', type: 'TASK', reporter: systemUserId,
    })
    const res = await request(app).get('/api/admin/dev/overview').expect(200)
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.projects[0]).toMatchObject({
      key: 'VEN', progress: 100, health: 'on_track',
    })
    expect(res.body.projects[0].counts).toMatchObject({ total: 1, done: 1, open: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx vitest run src/__tests__/admin-dev-stats.test.ts`
Expected: FAIL — `/overview` 404 et `/stats` n'a pas les nouveaux champs.

- [ ] **Step 3: Replace `backend/src/routes/admin/dev/stats.ts`**

```ts
import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { computeStats, computeOverview } from '../../../lib/dev/stats.js'

const router = express.Router()

router.get(
  '/stats',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const match: Record<string, unknown> = {}
      const { project } = req.query
      if (typeof project === 'string' && mongoose.isValidObjectId(project)) {
        match.project = new mongoose.Types.ObjectId(project)
      }
      const stats = await computeStats(match)
      res.json(stats)
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/overview',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await computeOverview()
      res.json(overview)
    } catch (err) {
      next(err)
    }
  }
)

export default router
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd backend && npx vitest run src/__tests__/admin-dev-stats.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/dev/stats.ts backend/src/__tests__/admin-dev-stats.test.ts
git commit -m "feat(admin/dev): enriched /stats + new /overview endpoint"
```

---

## Task 6: Routes agent `/dev/stats` + `/dev/overview`

**Files:**
- Modify: `backend/src/routes/agent/dev.ts`
- Create: `backend/src/__tests__/agent-dev-stats.test.ts`

- [ ] **Step 1: Write the failing integration test**

`backend/src/__tests__/agent-dev-stats.test.ts` :
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'

let app: Express
let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('GET /api/v1/agent/dev/stats', () => {
  it('401 without token', async () => {
    await request(app).get('/api/v1/agent/dev/stats').expect(401)
  })

  it('403 with wrong scope', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    await request(app)
      .get('/api/v1/agent/dev/stats')
      .set(authHeaders(plainSecret))
      .expect(403)
  })

  it('200 with read:dev, returns enriched stats payload', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get('/api/v1/agent/dev/stats')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body).toMatchObject({
      total: 0, open: 0, urgent: 0, blocked: 0,
      completed7d: 0, completed14d: 0, velocity14d: 0,
    })
  })
})

describe('GET /api/v1/agent/dev/overview', () => {
  it('200 with read:dev returns kpis + projects', async () => {
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    await DevIssue.create({
      project: p._id, identifier: 'VEN-1', title: 'T',
      status: 'IN_PROGRESS', priority: 'URGENT', type: 'TASK',
      reporter: systemUserId, labels: ['blocked'],
    })
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get('/api/v1/agent/dev/overview')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.projects[0]).toMatchObject({
      key: 'VEN', health: 'blocked',
    })
    expect(res.body.kpis).toMatchObject({ urgent: 1, blocked: 1 })
  })

  it('403 without read:dev', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    await request(app)
      .get('/api/v1/agent/dev/overview')
      .set(authHeaders(plainSecret))
      .expect(403)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx vitest run src/__tests__/agent-dev-stats.test.ts`
Expected: FAIL — routes inexistantes (404).

- [ ] **Step 3: Add routes in `backend/src/routes/agent/dev.ts`**

Localiser le bloc `// ─── Projects ───` et insérer **avant** ce bloc (juste après les helpers) :

```ts
import { computeStats, computeOverview } from '../../lib/dev/stats.js'

// ─── Stats & overview (read:dev) ─────────────────────────────────────────────

router.get(
  '/dev/stats',
  requireScope('read:dev'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const match: Record<string, unknown> = {}
      const { project } = req.query
      if (isObjectId(project)) {
        match.project = new mongoose.Types.ObjectId(project)
      }
      const stats = await computeStats(match)
      res.json(stats)
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/dev/overview',
  requireScope('read:dev'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await computeOverview()
      res.json(overview)
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd backend && npx vitest run src/__tests__/agent-dev-stats.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Run the full backend test suite to ensure nothing regressed**

Run: `cd backend && npx vitest run`
Expected: all tests pass. If a previous test of admin dev stats was relying on the old payload shape, it should still pass thanks to retro-compat (`completedRecent` preserved).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/agent/dev.ts backend/src/__tests__/agent-dev-stats.test.ts
git commit -m "feat(agent/dev): /stats and /overview endpoints (read:dev)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `cd backend && npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Lint (if configured)**

Run: `cd backend && (npm run lint 2>/dev/null || echo "no lint script — skipping")`
Expected: no errors (or skipped).

- [ ] **Step 4: Manual smoke (optional, requires running server)**

If a dev backend is running locally :
- `curl -s http://localhost:PORT/api/admin/dev/stats | jq '.urgent, .blocked, .velocity14d'`
- `curl -s http://localhost:PORT/api/admin/dev/overview | jq '.kpis, .projects[0].progress'`

- [ ] **Step 5: Final summary commit (only if any docs touched)**

If no changes since Task 6, skip. Otherwise:
```bash
git add -A
git commit -m "chore(dev/stats): phase 1 wrap-up"
```

---

## Done criteria

- [ ] `backend/src/lib/dev/stats.ts` exporte `STATUS_WEIGHT`, `computeProgress`, `computeHealth`, `computeStats`, `computeOverview` avec leurs types.
- [ ] `/api/admin/dev/stats` retourne tous les anciens champs + `urgent`, `blocked`, `completed7d`, `completed14d`, `velocity14d`.
- [ ] `/api/admin/dev/overview` retourne `{ kpis, projects }` avec progress et health par projet.
- [ ] `/api/v1/agent/dev/stats` et `/api/v1/agent/dev/overview` retournent les mêmes payloads, gated par `read:dev`.
- [ ] Tous les nouveaux tests passent ; suite complète backend verte.
- [ ] Aucune modification dans `src/pages/admin/dev-workspace/` ni dans les modèles Mongoose.
