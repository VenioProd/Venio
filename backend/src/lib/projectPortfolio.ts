import mongoose from 'mongoose'
import Project from '../models/Project.js'
import Task from '../models/Task.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import User from '../models/User.js'

/**
 * Vue d'ensemble du portefeuille projets : signaux de risque par projet,
 * file « À traiter », échéances, budget consommé et charge d'équipe.
 * Tout est calculé à la lecture : aucune donnée de plus à maintenir.
 */

const DAY = 86_400_000
const STALE_DAYS = 14
const QUEUE_MIN_URGENCY = 30
const PROJECTED_GAP_POINTS = 25
const DEFAULT_TASK_HOURS = 4
const LOAD_WINDOW_DAYS = 14
const OPEN_TASK_STATUSES = ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'A_MODIFIER', 'NON_VALIDE']

export type RiskCode = 'LATE' | 'BUDGET_OVER' | 'PROJECTED_LATE' | 'DUE_SOON' | 'STALE' | 'TO_BILL' | 'WAITING_CLIENT'
export type ProjectAction = 'POSTPONE' | 'REMIND_CLIENT' | 'REASSIGN' | 'RESUME' | 'INVOICE' | 'ARCHIVE'

export interface ProjectSignalsInput {
  status: string
  startDate?: Date | null
  endDate?: Date | null
  updatedAt?: Date | null
  budgetAmount?: number | null
  amountInvoiced?: number | null
  billingStatus?: string | null
  tasksTotal: number
  tasksDone: number
  lastActivityAt?: Date | null
}

export interface Risk {
  code: RiskCode
  /** Nombre de jours (retard, inactivité) ou pourcentage (budget, avancement attendu). */
  value: number | null
}

export interface ProjectSignals {
  progress: number
  expectedProgress: number | null
  daysToDue: number | null
  overdueDays: number
  budgetPct: number | null
  staleDays: number
  lastActivityAt: Date | null
  risks: Risk[]
  urgency: number
  actions: ProjectAction[]
}

export function computeSignals(input: ProjectSignalsInput, now: Date = new Date()): ProjectSignals {
  const active = input.status !== 'TERMINE'
  const progress =
    input.tasksTotal > 0 ? Math.round((input.tasksDone / input.tasksTotal) * 100) : input.status === 'TERMINE' ? 100 : 0

  const due = input.endDate ? new Date(input.endDate) : null
  const daysToDue = due ? Math.ceil((due.getTime() - now.getTime()) / DAY) : null
  const overdueDays = active && daysToDue !== null && daysToDue < 0 ? -daysToDue : 0

  let expectedProgress: number | null = null
  if (input.startDate && due && due > input.startDate) {
    const span = due.getTime() - new Date(input.startDate).getTime()
    expectedProgress = Math.max(
      0,
      Math.min(100, Math.round(((now.getTime() - new Date(input.startDate).getTime()) / span) * 100)),
    )
  }

  const budgetPct =
    input.budgetAmount && input.budgetAmount > 0 && input.amountInvoiced != null
      ? Math.round((input.amountInvoiced / input.budgetAmount) * 100)
      : null

  const lastActivityAt = input.lastActivityAt ?? input.updatedAt ?? null
  const staleDays = lastActivityAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / DAY))
    : 0

  const risks: Risk[] = []
  if (overdueDays > 0) risks.push({ code: 'LATE', value: overdueDays })
  if (active && budgetPct !== null && budgetPct > 100) risks.push({ code: 'BUDGET_OVER', value: budgetPct })
  if (
    active &&
    overdueDays === 0 &&
    expectedProgress !== null &&
    daysToDue !== null &&
    daysToDue <= LOAD_WINDOW_DAYS &&
    expectedProgress - progress >= PROJECTED_GAP_POINTS
  ) {
    risks.push({ code: 'PROJECTED_LATE', value: expectedProgress })
  }
  if (active && daysToDue !== null && daysToDue >= 0 && daysToDue <= 3)
    risks.push({ code: 'DUE_SOON', value: daysToDue })
  if (active && staleDays >= STALE_DAYS) risks.push({ code: 'STALE', value: staleDays })
  if (input.status === 'EN_ATTENTE') risks.push({ code: 'WAITING_CLIENT', value: null })
  if (input.status === 'TERMINE' && input.billingStatus !== 'FACTURE') risks.push({ code: 'TO_BILL', value: null })

  const weight: Record<RiskCode, number> = {
    LATE: 100,
    BUDGET_OVER: 70,
    PROJECTED_LATE: 60,
    DUE_SOON: 50,
    STALE: 40,
    TO_BILL: 30,
    WAITING_CLIENT: 10,
  }
  const urgency = risks.reduce(
    (max, r) => Math.max(max, weight[r.code] + (r.code === 'LATE' ? Math.min(r.value ?? 0, 60) : 0)),
    0,
  )

  const actions: ProjectAction[] = []
  const has = (c: RiskCode) => risks.some((r) => r.code === c)
  if (has('LATE') || has('DUE_SOON') || has('PROJECTED_LATE')) actions.push('POSTPONE')
  if (has('LATE') || has('WAITING_CLIENT') || has('STALE')) actions.push('REMIND_CLIENT')
  if (has('LATE') || has('PROJECTED_LATE') || has('BUDGET_OVER')) actions.push('REASSIGN')
  if (has('STALE') || has('WAITING_CLIENT')) actions.push('RESUME')
  if (has('TO_BILL')) actions.push('INVOICE', 'ARCHIVE')

  return {
    progress,
    expectedProgress,
    daysToDue,
    overdueDays,
    budgetPct,
    staleDays,
    lastActivityAt,
    risks,
    urgency,
    actions,
  }
}

export interface WorkloadInput {
  capacityHours: number
  openHours: number
}

/** Charge en % sur la fenêtre de deux semaines (capacité hebdomadaire × 2). */
export function loadPercent({ capacityHours, openHours }: WorkloadInput): number {
  const capacity = capacityHours * (LOAD_WINDOW_DAYS / 7)
  return capacity > 0 ? Math.round((openHours / capacity) * 100) : 0
}

export async function buildPortfolioOverview(projectIds: string[] | null, now: Date = new Date()) {
  const filter: Record<string, unknown> = { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }
  if (projectIds !== null) filter._id = { $in: projectIds }

  const projects = await Project.find(filter)
    .populate('client', 'name companyName')
    .populate('assignedTo', 'name')
    .limit(500)
    .lean()
  const ids = projects.map((p) => p._id)

  const [taskStats, updates, openTasks] = await Promise.all([
    Task.aggregate([
      { $match: { project: { $in: ids }, isArchived: { $ne: true } } },
      {
        $group: {
          _id: '$project',
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $in: ['$status', ['TERMINE', 'VALIDE']] }, 1, 0] } },
          lastTask: { $max: '$updatedAt' },
        },
      },
    ]),
    ProjectUpdate.aggregate([
      { $match: { project: { $in: ids } } },
      { $group: { _id: '$project', last: { $max: '$createdAt' } } },
    ]),
    Task.find({
      project: { $in: ids },
      isArchived: { $ne: true },
      status: { $in: OPEN_TASK_STATUSES },
      assignee: { $ne: null },
      $or: [{ dueDate: null }, { dueDate: { $lte: new Date(now.getTime() + LOAD_WINDOW_DAYS * DAY) } }],
    })
      .select('assignee estimatedDuration project')
      .lean(),
  ])
  const statByProject = new Map(taskStats.map((s) => [String(s._id), s]))
  const updateByProject = new Map(updates.map((u) => [String(u._id), u.last as Date]))

  const items = projects.map((p) => {
    const id = String(p._id)
    const stat = statByProject.get(id)
    const candidates = [p.updatedAt, stat?.lastTask, updateByProject.get(id)].filter(Boolean) as Date[]
    const lastActivityAt = candidates.length
      ? new Date(Math.max(...candidates.map((d) => new Date(d).getTime())))
      : null
    const signals = computeSignals(
      {
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        updatedAt: p.updatedAt,
        budgetAmount: p.budget?.amount ?? null,
        amountInvoiced: p.billing?.amountInvoiced ?? null,
        billingStatus: p.billing?.billingStatus ?? null,
        tasksTotal: stat?.total ?? 0,
        tasksDone: stat?.done ?? 0,
        lastActivityAt,
      },
      now,
    )
    const client = p.client as unknown as { _id: unknown; name?: string; companyName?: string } | null
    const assignee = p.assignedTo as unknown as { _id: unknown; name?: string } | null
    return {
      _id: id,
      name: p.name,
      projectNumber: p.projectNumber || '',
      status: p.status,
      priority: p.priority,
      client: client ? { _id: String(client._id), name: client.companyName || client.name || '' } : null,
      assignedTo: assignee ? { _id: String(assignee._id), name: assignee.name || '' } : null,
      endDate: p.endDate ?? null,
      budget: {
        amount: p.budget?.amount ?? null,
        invoiced: p.billing?.amountInvoiced ?? null,
        currency: p.budget?.currency ?? 'EUR',
      },
      tasks: { total: stat?.total ?? 0, done: stat?.done ?? 0 },
      ...signals,
    }
  })

  const active = items.filter((i) => i.status !== 'TERMINE')
  const budgeted = active.filter((i) => i.budget.amount && i.budget.invoiced != null)
  const budgetTotal = budgeted.reduce((s, i) => s + (i.budget.amount ?? 0), 0)
  const budgetInvoiced = budgeted.reduce((s, i) => s + (i.budget.invoiced ?? 0), 0)

  const hoursByUser = new Map<string, { hours: number; projects: Set<string>; tasks: number }>()
  for (const t of openTasks) {
    const key = String(t.assignee)
    const entry = hoursByUser.get(key) ?? { hours: 0, projects: new Set<string>(), tasks: 0 }
    entry.hours += t.estimatedDuration && t.estimatedDuration > 0 ? t.estimatedDuration : DEFAULT_TASK_HOURS
    entry.projects.add(String(t.project))
    entry.tasks += 1
    hoursByUser.set(key, entry)
  }
  const userDocs = await User.find({ _id: { $in: [...hoursByUser.keys()].filter((k) => mongoose.isValidObjectId(k)) } })
    .select('name weeklyCapacityHours')
    .lean()
  const workload = userDocs
    .map((u) => {
      const e = hoursByUser.get(String(u._id))!
      const capacityHours = u.weeklyCapacityHours ?? 35
      return {
        _id: String(u._id),
        name: u.name,
        projects: e.projects.size,
        openTasks: e.tasks,
        capacityHours,
        loadPct: loadPercent({ capacityHours, openHours: e.hours }),
      }
    })
    .sort((a, b) => b.loadPct - a.loadPct)

  const queue = items
    .filter((i) => i.urgency >= QUEUE_MIN_URGENCY)
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 10)

  const upcoming = items
    .filter((i) => i.status !== 'TERMINE' && i.endDate && i.daysToDue !== null && i.daysToDue <= LOAD_WINDOW_DAYS)
    .sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0))
    .slice(0, 10)
    .map((i) => ({
      _id: i._id,
      name: i.name,
      assignedTo: i.assignedTo,
      endDate: i.endDate,
      daysToDue: i.daysToDue,
      overdueDays: i.overdueDays,
    }))

  return {
    pulse: {
      total: items.length,
      active: active.length,
      done: items.length - active.length,
      late: active.filter((i) => i.overdueDays > 0).length,
      atRisk: active.filter((i) => i.risks.some((r) => r.code !== 'WAITING_CLIENT')).length,
      dueIn7Days: active.filter((i) => i.daysToDue !== null && i.daysToDue >= 0 && i.daysToDue <= 7).length,
      dueIn48h: active.filter((i) => i.daysToDue !== null && i.daysToDue >= 0 && i.daysToDue <= 2).length,
      toBill: items.filter((i) => i.risks.some((r) => r.code === 'TO_BILL')).length,
      budget: {
        total: budgetTotal,
        invoiced: budgetInvoiced,
        pct: budgetTotal > 0 ? Math.round((budgetInvoiced / budgetTotal) * 100) : null,
      },
      load: {
        pct: workload.length ? Math.round(workload.reduce((s, w) => s + w.loadPct, 0) / workload.length) : null,
        overloaded: workload.filter((w) => w.loadPct > 100).length,
      },
    },
    queue,
    upcoming,
    workload,
    items,
  }
}
