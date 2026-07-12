import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { PERMISSIONS, resolvePermissions } from '../../lib/permissions.js'
import User from '../../models/User.js'
import InternalTicket from '../../models/InternalTicket.js'
import InternalConversationMember from '../../models/InternalConversationMember.js'
import InternalConversation from '../../models/InternalConversation.js'
import InternalMessage from '../../models/InternalMessage.js'
import Lead from '../../models/Lead.js'
import BillingDocument from '../../models/BillingDocument.js'
import Project from '../../models/Project.js'
import Task from '../../models/Task.js'

const router = express.Router()
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const MAX_MESSAGE_MEMBERSHIPS = 100
const OPEN_TASK_STATUSES = ['TERMINE', 'VALIDE']

type ActivityEntry = { id: string; title: string; meta: string; href: string; dueAt?: string }
type ActivitySection = {
  key: string
  label: string
  href: string
  entries: ActivityEntry[]
  hasMore: boolean
}

router.use(auth)
router.use(requireAdmin)

function readLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function takePage<T>(documents: T[], limit: number): { entries: T[]; hasMore: boolean } {
  return { entries: documents.slice(0, limit), hasMore: documents.length > limit }
}

function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString() : ''
}

async function getPermissions(req: Request): Promise<Set<string>> {
  if (req.user!.role === 'SUPER_ADMIN') return new Set(Object.values(PERMISSIONS))
  const user = await User.findById(req.user!.id).select('grantedPermissions deniedPermissions').lean()
  return new Set(resolvePermissions(req.user!.role, user?.grantedPermissions ?? [], user?.deniedPermissions ?? []))
}

async function getUnreadMessages(userId: mongoose.Types.ObjectId, limit: number): Promise<ActivitySection> {
  const membershipResults = await InternalConversationMember.find({ user: userId })
    .sort({ updatedAt: -1 })
    .limit(MAX_MESSAGE_MEMBERSHIPS + 1)
    .select('conversation lastReadAt')
    .lean()
  const membershipHasMore = membershipResults.length > MAX_MESSAGE_MEMBERSHIPS
  const memberships = membershipResults.slice(0, MAX_MESSAGE_MEMBERSHIPS)
  if (memberships.length === 0)
    return { key: 'messages', label: 'Messages non lus', href: '/admin/messages', entries: [], hasMore: false }

  const unreadFilters = memberships.map((membership) => ({
    conversation: membership.conversation,
    ...(membership.lastReadAt ? { createdAt: { $gt: membership.lastReadAt } } : {}),
  }))
  const messages = await InternalMessage.find({
    sender: { $ne: userId },
    deletedAt: null,
    $or: unreadFilters,
  })
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .select('conversation createdAt')
    .lean()
  const conversationIds = [...new Set(messages.map((message) => String(message.conversation)))]
  const conversations = await InternalConversation.find({ _id: { $in: conversationIds }, isArchived: { $ne: true } })
    .select('name slug type')
    .lean()
  const labels = new Map(
    conversations.map((conversation) => [
      String(conversation._id),
      conversation.name || conversation.slug || 'Conversation',
    ]),
  )
  const page = takePage(messages, limit)
  return {
    key: 'messages',
    label: 'Messages non lus',
    href: '/admin/messages',
    hasMore: page.hasMore || membershipHasMore,
    entries: page.entries.map((message) => ({
      id: String(message._id),
      title: labels.get(String(message.conversation)) || 'Conversation',
      meta: 'Message non lu',
      href: `/admin/messages?conversation=${message.conversation}`,
      dueAt: formatDate(message.createdAt),
    })),
  }
}

async function getOverdueTasks(limit: number): Promise<ActivitySection> {
  const tasks = await Task.find({
    isArchived: { $ne: true },
    status: { $nin: OPEN_TASK_STATUSES },
    dueDate: { $lte: new Date(), $ne: null },
  })
    .sort({ dueDate: 1 })
    .limit(limit + 1)
    .select('title project dueDate priority')
    .lean()
  const page = takePage(tasks, limit)
  return {
    key: 'tasks',
    label: 'Tâches en retard',
    href: '/admin/gestion',
    hasMore: page.hasMore,
    entries: page.entries.map((task) => ({
      id: String(task._id),
      title: task.title,
      meta: `Échéance ${formatDate(task.dueDate)}`,
      href: `/admin/projets/${task.project}?tab=tasks`,
      dueAt: formatDate(task.dueDate),
    })),
  }
}

async function getOverdueLeads(
  userId: mongoose.Types.ObjectId,
  isSuperAdmin: boolean,
  limit: number,
): Promise<ActivitySection> {
  const leads = await Lead.find({
    nextActionAt: { $lte: new Date(), $ne: null },
    status: { $nin: ['WON', 'LOST'] },
    ...(isSuperAdmin ? {} : { $or: [{ assignedTo: userId }, { createdBy: userId }] }),
  })
    .sort({ nextActionAt: 1 })
    .limit(limit + 1)
    .select('company contactName nextActionAt priority')
    .lean()
  const page = takePage(leads, limit)
  return {
    key: 'crm',
    label: 'Relances CRM',
    href: '/admin/crm',
    hasMore: page.hasMore,
    entries: page.entries.map((lead) => ({
      id: String(lead._id),
      title: lead.company || lead.contactName || 'Lead sans nom',
      meta: `Relance ${formatDate(lead.nextActionAt)}`,
      href: '/admin/crm',
      dueAt: formatDate(lead.nextActionAt),
    })),
  }
}

async function getCriticalInvoices(limit: number): Promise<ActivitySection> {
  const documents = await BillingDocument.find({
    type: 'INVOICE',
    status: { $nin: ['PAID', 'CANCELLED', 'DRAFT'] },
    dueAt: { $lte: new Date(), $ne: null },
  })
    .sort({ dueAt: 1 })
    .limit(limit + 1)
    .select('number dueAt total currency project')
    .lean()
  const page = takePage(documents, limit)
  return {
    key: 'billing',
    label: 'Factures critiques',
    href: '/admin/comptabilite',
    hasMore: page.hasMore,
    entries: page.entries.map((document) => ({
      id: String(document._id),
      title: document.number,
      meta: `Échéance ${formatDate(document.dueAt)}`,
      href: `/admin/projets/${document.project}?tab=billing`,
      dueAt: formatDate(document.dueAt),
    })),
  }
}

async function getProjectRisks(limit: number): Promise<ActivitySection> {
  const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const projects = await Project.find({
    status: 'EN_COURS',
    isArchived: { $ne: true },
    endDate: { $lte: threshold, $ne: null },
  })
    .sort({ endDate: 1 })
    .limit(limit + 1)
    .select('name endDate priority')
    .lean()
  const page = takePage(projects, limit)
  return {
    key: 'projects',
    label: 'Risques projet',
    href: '/admin/gestion',
    hasMore: page.hasMore,
    entries: page.entries.map((project) => ({
      id: String(project._id),
      title: project.name,
      meta: `Échéance ${formatDate(project.endDate)}`,
      href: `/admin/projets/${project._id}`,
      dueAt: formatDate(project.endDate),
    })),
  }
}

async function getOpenTickets(
  userId: mongoose.Types.ObjectId,
  isSuperAdmin: boolean,
  limit: number,
): Promise<ActivitySection> {
  const tickets = await InternalTicket.find({
    status: { $in: ['OUVERT', 'EN_COURS'] },
    isArchived: { $ne: true },
    ...(isSuperAdmin ? {} : { authorId: userId }),
  })
    .sort({ priority: -1, updatedAt: -1 })
    .limit(limit + 1)
    .select('title status priority updatedAt')
    .lean()
  const page = takePage(tickets, limit)
  return {
    key: 'tickets',
    label: 'Tickets ouverts',
    href: '/admin/tickets',
    hasMore: page.hasMore,
    entries: page.entries.map((ticket) => ({
      id: String(ticket._id),
      title: ticket.title,
      meta: `${ticket.status} · ${ticket.priority}`,
      href: '/admin/tickets',
      dueAt: formatDate(ticket.updatedAt),
    })),
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = readLimit(req.query.limit)
    const userId = new mongoose.Types.ObjectId(req.user!.id)
    const permissions = await getPermissions(req)
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN'
    const sections: Promise<ActivitySection>[] = []

    if (permissions.has(PERMISSIONS.VIEW_MESSAGING)) sections.push(getUnreadMessages(userId, limit))
    if (permissions.has(PERMISSIONS.VIEW_PROJECTS)) {
      sections.push(getOverdueTasks(limit), getProjectRisks(limit))
    }
    if (permissions.has(PERMISSIONS.VIEW_CRM)) sections.push(getOverdueLeads(userId, isSuperAdmin, limit))
    if (permissions.has(PERMISSIONS.VIEW_BILLING)) sections.push(getCriticalInvoices(limit))
    if (permissions.has(PERMISSIONS.VIEW_TICKETS)) sections.push(getOpenTickets(userId, isSuperAdmin, limit))

    return res.json({ sections: await Promise.all(sections), limit, checkedAt: new Date().toISOString() })
  } catch (error) {
    next(error)
  }
})

export default router
