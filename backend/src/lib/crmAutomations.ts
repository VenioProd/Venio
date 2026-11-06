import type { Types } from 'mongoose'
import LeadActivity from '../models/LeadActivity.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { sendLeadAssignmentEmail } from './email.js'
import { CRM_ASSIGNABLE_ROLES } from './crmScope.js'
import { nextSchedulerCursor } from '../models/SchedulerLock.js'
import { MIN_PHONE_DIGITS, normalizeCompanyName, normalizeEmail, normalizePhone } from './crmDedup.js'

/** Curseur du round-robin, en base : partagé entre instances et conservé aux redémarrages. */
export const ROUND_ROBIN_CURSOR = 'crm:round-robin'

export interface LeadSignalFields {
  status?: string
  priority?: string
  score?: number | null
  nextActionAt?: Date | string | null
  lastContactAt?: Date | string | null
  statusChangedAt?: Date | string | null
}

interface LeadData extends LeadSignalFields {
  company: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  source?: string
  budget?: number | null
  updatedAt?: Date | string | null
  notes?: string
  serviceType?: string
  _id?: Types.ObjectId | string
  clientAccountId?: Types.ObjectId | string | null
}

interface AssigneeData {
  email?: string
  name: string
}

interface ScoringWeights {
  budgetHigh?: number
  budgetMedium?: number
  budgetLow?: number
  sourceReferral?: number
  sourceAds?: number
  sourceOther?: number
  priorityUrgent?: number
  priorityHigh?: number
  priorityNormal?: number
  hasEmail?: number
  hasPhone?: number
}

interface DuplicateCheckSettings {
  duplicateCheckEmail?: boolean
  duplicateCheckCompany?: boolean
  duplicateCheckPhone?: boolean
}

/**
 * Prochain commercial du round-robin : uniquement les membres actifs des rôles
 * habilités à suivre un lead (`CRM_ASSIGNABLE_ROLES`, ni lecture seule ni
 * comptabilité), dans un ordre stable (ancienneté). Le curseur avance d'un cran
 * à chaque appel, atomiquement : deux assignations simultanées ne tombent pas
 * sur la même personne.
 */
export async function getRoundRobinAssignee(): Promise<Types.ObjectId | null> {
  const team = await User.find({ role: { $in: CRM_ASSIGNABLE_ROLES }, isActive: true })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean()
  if (team.length === 0) return null
  const seq = await nextSchedulerCursor(ROUND_ROBIN_CURSOR)
  return team[(seq - 1) % team.length]._id as Types.ObjectId
}

/**
 * Log a lead activity
 */
export async function logLeadActivity(
  leadId: Types.ObjectId | string,
  type: string,
  label: string,
  payload: Record<string, unknown> = {},
  actorId: Types.ObjectId | string | null = null,
) {
  return LeadActivity.create({
    leadId,
    type,
    label,
    payload,
    actorId,
  })
}

/**
 * Send assignment email to commercial (wrapper)
 */
export async function notifyAssignment(lead: LeadData, assignee: AssigneeData | null) {
  if (!assignee?.email) return { sent: false, error: 'No email' }
  return sendLeadAssignmentEmail({
    to: assignee.email,
    assigneeName: assignee.name,
    lead: {
      company: lead.company,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      source: lead.source,
      priority: lead.priority,
      budget: lead.budget,
    },
  })
}

/**
 * Check if a lead should be auto-qualified (has budget AND source)
 */
export function shouldAutoQualify(lead: LeadData): boolean {
  return lead.budget != null && lead.budget > 0 && !!lead.source && lead.source.trim() !== ''
}

/**
 * Check if a lead is "cold" (no contact for X days)
 */
export function isLeadCold(lead: LeadSignalFields, days: number = 7, now: Date = new Date()): boolean {
  if (!lead.lastContactAt) return false
  if (lead.status && ['WON', 'LOST'].includes(lead.status)) return false
  const threshold = new Date(now)
  threshold.setDate(threshold.getDate() - days)
  return new Date(lead.lastContactAt) < threshold
}

/**
 * Check if a lead is "stale" (stuck in same status for X days)
 */
export function isLeadStale(lead: LeadSignalFields, days: number = 14, now: Date = new Date()): boolean {
  if (!lead.statusChangedAt) return false
  if (lead.status && ['WON', 'LOST'].includes(lead.status)) return false
  const threshold = new Date(now)
  threshold.setDate(threshold.getDate() - days)
  return new Date(lead.statusChangedAt) < threshold
}

/**
 * Get number of days since last contact
 */
export function getDaysSinceContact(lead: LeadSignalFields): number | null {
  if (!lead.lastContactAt) return null
  const now = new Date()
  const lastContact = new Date(lead.lastContactAt)
  return Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Get number of days since status change
 */
export function getDaysSinceStatusChange(lead: LeadSignalFields): number | null {
  if (!lead.statusChangedAt) return null
  const now = new Date()
  const statusChanged = new Date(lead.statusChangedAt)
  return Math.floor((now.getTime() - statusChanged.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Check if lead has overdue next action
 */
export function isNextActionOverdue(lead: LeadSignalFields, now: Date = new Date()): boolean {
  if (!lead.nextActionAt) return false
  if (lead.status && ['WON', 'LOST'].includes(lead.status)) return false
  return new Date(lead.nextActionAt) < now
}

/**
 * Réglages d'alerte lus par la file de travail. Sous-ensemble de CrmSettings :
 * la file n'a pas besoin du reste, et ce typage étroit permet de la tester
 * sans construire un document Mongoose complet.
 */
export interface WorklistSettings {
  coldLeadAlertEnabled: boolean
  coldLeadThresholdDays: number
  overdueAlertEnabled: boolean
  staleLeadAlertEnabled: boolean
  staleLeadThresholdDays: number
}

export interface WorklistGroups<T> {
  overdue: T[]
  today: T[]
  upcoming: T[]
  drifting: T[]
}

/** Fenêtre du groupe « à venir », en jours après aujourd'hui. */
const UPCOMING_WINDOW_DAYS = 7

const PRIORITY_RANK: Record<string, number> = { URGENTE: 0, HAUTE: 1, NORMALE: 2, BASSE: 3 }
const DEFAULT_PRIORITY_RANK = PRIORITY_RANK.NORMALE

function compareWorklistLeads(a: LeadSignalFields, b: LeadSignalFields): number {
  // Les leads sans échéance passent après ceux qui en ont une.
  const dueA = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Number.POSITIVE_INFINITY
  const dueB = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Number.POSITIVE_INFINITY
  if (dueA !== dueB) return dueA - dueB

  const rankA = PRIORITY_RANK[a.priority ?? ''] ?? DEFAULT_PRIORITY_RANK
  const rankB = PRIORITY_RANK[b.priority ?? ''] ?? DEFAULT_PRIORITY_RANK
  if (rankA !== rankB) return rankA - rankB

  return (b.score ?? 0) - (a.score ?? 0)
}

/**
 * Range les leads actifs dans les quatre groupes de la file de travail
 * commerciale, en appliquant les seuils configurés dans CrmSettings.
 *
 * Un lead n'apparaît que dans un seul groupe : son échéance le classe en
 * priorité, et il ne retombe dans « dérive » que si aucune échéance ne l'a
 * déjà pris en charge. Un retard dont l'alerte est désactivée reste donc
 * candidat à la dérive s'il est froid ou bloqué par ailleurs — désactiver
 * une alerte n'en éteint pas une autre.
 *
 * Les bornes de « aujourd'hui » sont celles du jour civil local, et non un
 * delta de 24 h : sinon une échéance fixée ce matin basculerait en retard
 * selon l'heure à laquelle le commercial ouvre sa file.
 */
export function buildWorklist<T extends LeadSignalFields>(
  leads: T[],
  settings: WorklistSettings,
  now: Date = new Date(),
): WorklistGroups<T> {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const endOfWindow = new Date(startOfToday)
  endOfWindow.setDate(endOfWindow.getDate() + UPCOMING_WINDOW_DAYS + 1)

  const groups: WorklistGroups<T> = { overdue: [], today: [], upcoming: [], drifting: [] }

  for (const lead of leads) {
    if (lead.status && ['WON', 'LOST'].includes(lead.status)) continue

    const due = lead.nextActionAt ? new Date(lead.nextActionAt) : null
    if (due && !Number.isNaN(due.getTime())) {
      if (due < startOfToday) {
        if (settings.overdueAlertEnabled) {
          groups.overdue.push(lead)
          continue
        }
      } else if (due < startOfTomorrow) {
        groups.today.push(lead)
        continue
      } else if (due < endOfWindow) {
        groups.upcoming.push(lead)
        continue
      }
    }

    const isCold = settings.coldLeadAlertEnabled && isLeadCold(lead, settings.coldLeadThresholdDays, now)
    const isStale = settings.staleLeadAlertEnabled && isLeadStale(lead, settings.staleLeadThresholdDays, now)
    if (isCold || isStale) groups.drifting.push(lead)
  }

  groups.overdue.sort(compareWorklistLeads)
  groups.today.sort(compareWorklistLeads)
  groups.upcoming.sort(compareWorklistLeads)
  groups.drifting.sort(compareWorklistLeads)

  return groups
}

/**
 * Calculate lead score based on settings weights
 */
export function calculateLeadScore(lead: LeadData, weights: ScoringWeights = {}): number {
  let score = 0

  // Budget scoring
  if (lead.budget != null) {
    if (lead.budget > 10000) {
      score += weights.budgetHigh || 30
    } else if (lead.budget >= 1000) {
      score += weights.budgetMedium || 15
    } else if (lead.budget > 0) {
      score += weights.budgetLow || 5
    }
  }

  // Source scoring
  if (lead.source) {
    const sourceLower = lead.source.toLowerCase()
    if (sourceLower === 'referral') {
      score += weights.sourceReferral || 25
    } else if (sourceLower === 'ads') {
      score += weights.sourceAds || 15
    } else {
      score += weights.sourceOther || 10
    }
  }

  // Priority scoring
  if (lead.priority) {
    if (lead.priority === 'URGENTE') {
      score += weights.priorityUrgent || 20
    } else if (lead.priority === 'HAUTE') {
      score += weights.priorityHigh || 15
    } else if (lead.priority === 'NORMALE') {
      score += weights.priorityNormal || 5
    }
  }

  // Contact info scoring
  if (lead.contactEmail && lead.contactEmail.trim()) {
    score += weights.hasEmail || 10
  }
  if (lead.contactPhone && lead.contactPhone.trim()) {
    score += weights.hasPhone || 10
  }

  // Cap at 100
  return Math.min(score, 100)
}

/** Options de `checkDuplicateLead`. */
export interface DuplicateCheckOptions {
  /** Périmètre de lecture de l'appelant (`leadScopeFilter`), appliqué dans la requête : `null` = tout le CRM. */
  scope?: Record<string, unknown> | null
  /** Nombre maximal de doublons renvoyés, compté APRÈS application du périmètre (défaut : 10). */
  limit?: number
}

/**
 * Doublons probables d'un lead, d'après les réglages `duplicateCheck*` :
 * égalité exacte sur l'e-mail normalisé (trim + minuscules), le téléphone
 * normalisé (chiffres, +33/0033 → 0) et le nom d'entreprise normalisé
 * (minuscules, sans accents ni ponctuation). Les champs normalisés sont ceux
 * stockés sur les leads (voir lib/crmDedup, migration 008).
 *
 * Le périmètre est dans la requête : la limite ne peut pas être consommée par
 * des leads que l'appelant n'a pas le droit de voir.
 */
export async function checkDuplicateLead(
  leadData: LeadData,
  settings: DuplicateCheckSettings,
  excludeId: Types.ObjectId | string | null = null,
  options: DuplicateCheckOptions = {},
) {
  const conditions: Record<string, unknown>[] = []

  if (settings.duplicateCheckEmail) {
    const email = normalizeEmail(leadData.contactEmail)
    if (email) conditions.push({ contactEmailNormalized: email })
  }

  if (settings.duplicateCheckCompany) {
    const company = normalizeCompanyName(leadData.company)
    if (company) conditions.push({ companyNormalized: company })
  }

  if (settings.duplicateCheckPhone) {
    const phone = normalizePhone(leadData.contactPhone)
    if (phone.length >= MIN_PHONE_DIGITS) conditions.push({ contactPhoneNormalized: phone })
  }

  if (conditions.length === 0) return []

  const clauses: Record<string, unknown>[] = [{ $or: conditions }]
  if (excludeId) clauses.push({ _id: { $ne: excludeId } })
  if (options.scope && Object.keys(options.scope).length > 0) clauses.push(options.scope)

  return Lead.find({ $and: clauses })
    .select('company contactName contactEmail contactPhone status archivedAt assignedTo updatedAt')
    .sort({ updatedAt: -1 })
    .limit(options.limit ?? 10)
}

/**
 * Get days since lead was updated (for escalation)
 */
export function getDaysSinceUpdate(lead: LeadData): number {
  if (!lead.updatedAt) return 0
  const now = new Date()
  const updated = new Date(lead.updatedAt)
  return Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Get days overdue for next action
 */
export function getDaysOverdue(lead: LeadData): number {
  if (!lead.nextActionAt) return 0
  const now = new Date()
  const nextAction = new Date(lead.nextActionAt)
  if (nextAction >= now) return 0
  return Math.floor((now.getTime() - nextAction.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Auto-create a project when a lead is won.
 */
export async function autoCreateProjectFromLead(lead: LeadData, actorId: Types.ObjectId | string | null) {
  // Dynamic import to avoid circular dependency
  const Project = (await import('../models/Project.js')).default

  // Find or create client account
  let clientId = lead.clientAccountId
  if (!clientId && lead.contactEmail) {
    const existingClient = await User.findOne({ email: lead.contactEmail, role: 'CLIENT' })
    if (existingClient) clientId = existingClient._id as Types.ObjectId
  }
  if (!clientId) return null // Cannot create project without a client

  const project = await Project.create({
    name: `Projet — ${lead.company}`,
    description: lead.notes || '',
    status: 'EN_ATTENTE',
    client: clientId,
    priority: lead.priority || 'NORMALE',
    serviceTypes: lead.serviceType ? [lead.serviceType] : [],
    budget: lead.budget ? { amount: lead.budget, currency: 'EUR' } : undefined,
    tags: ['auto-crm'],
    // Le tag disait que le projet vient du CRM ; il ne disait pas de quel lead.
    sourceLead: lead._id ?? null,
  })

  await logLeadActivity(
    lead._id!,
    'PROJECT_CREATED',
    `Projet "${project.name}" créé automatiquement`,
    { projectId: project._id },
    actorId,
  )

  return project
}

