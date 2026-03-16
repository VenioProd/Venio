import { Response, Request } from 'express'
import mongoose from 'mongoose'
import User from '../../../models/User.js'
import ClientActivity from '../../../models/ClientActivity.js'

export function ok(res: Response, data: unknown, meta: unknown = null, status: number = 200): Response {
  const payload: Record<string, unknown> = { data }
  if (meta) payload.meta = meta
  return res.status(status).json(payload)
}

export function error(res: Response, status: number, message: string, code: string | null = null): Response {
  const payload: Record<string, unknown> = { error: message }
  if (code) payload.code = code
  return res.status(status).json(payload)
}

export function parsePagination(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = Math.max(parseInt((query.page as string) || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt((query.limit as string) || '20', 10), 1), 100)
  return { page, limit, skip: (page - 1) * limit }
}

export function normalizeClientPayload(body: Record<string, any> = {}): Record<string, any> {
  const payload: Record<string, any> = {}
  const pickString = (key: string): void => {
    if (body[key] !== undefined) {
      payload[key] = typeof body[key] === 'string' ? body[key].trim() : ''
    }
  }

  pickString('name')
  pickString('companyName')
  pickString('serviceType')
  pickString('phone')
  pickString('website')

  if (body.source !== undefined && ['REFERRAL', 'INBOUND', 'OUTBOUND', 'PARTNER', 'AUTRE'].includes(body.source)) {
    payload.source = body.source
  }

  if (body.status !== undefined && ['PROSPECT', 'ACTIF', 'EN_PAUSE', 'CLOS', 'ARCHIVE'].includes(body.status)) {
    payload.status = body.status
  }

  if (body.onboardingStatus !== undefined && ['A_FAIRE', 'EN_COURS', 'TERMINE'].includes(body.onboardingStatus)) {
    payload.onboardingStatus = body.onboardingStatus
  }

  if (body.healthStatus !== undefined && ['BON', 'ATTENTION', 'CRITIQUE'].includes(body.healthStatus)) {
    payload.healthStatus = body.healthStatus
  }

  if (body.lastContactAt !== undefined) {
    payload.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt) : null
  }

  if (body.tags !== undefined) {
    payload.tags = Array.isArray(body.tags)
      ? body.tags.filter((tag: unknown) => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean)
      : []
  }

  if (body.address !== undefined) {
    const address = body.address && typeof body.address === 'object' ? body.address : {}
    payload.address = {
      line1: typeof address.line1 === 'string' ? address.line1.trim() : '',
      line2: typeof address.line2 === 'string' ? address.line2.trim() : '',
      city: typeof address.city === 'string' ? address.city.trim() : '',
      postalCode: typeof address.postalCode === 'string' ? address.postalCode.trim() : '',
      country: typeof address.country === 'string' ? address.country.trim() : '',
    }
  }

  if (body.ownerAdminId !== undefined) {
    payload.ownerAdminId = body.ownerAdminId || null
  }

  return payload
}

export function isActiveClientStatus(status: string): boolean {
  return ['PROSPECT', 'ACTIF', 'EN_PAUSE'].includes(status)
}

export async function ensureClient(clientId: string, req?: Request): Promise<any> {
  if (!mongoose.isValidObjectId(clientId)) return null
  const client = await User.findOne({ _id: clientId, role: 'CLIENT' })
  if (!client) return null
  // Scope check: non-SUPER_ADMIN can only access their own clients
  if (req && req.user && req.user.role !== 'SUPER_ADMIN') {
    if (!client.ownerAdminId || client.ownerAdminId.toString() !== req.user.id) {
      return null
    }
  }
  return client
}

export async function logActivity({ clientId, actorId, type, label, payload = {} }: {
  clientId: unknown
  actorId: string
  type: string
  label: string
  payload?: Record<string, unknown>
}): Promise<any> {
  return ClientActivity.create({
    clientId,
    actorId,
    type,
    label,
    payload,
  })
}

export function computeProjectProgress(project: any, items: any[] = []): number {
  const deliverableItems = items.filter((item) => ['LIVRABLE', 'MAQUETTE', 'DOCUMENTATION', 'LIEN', 'NOTE'].includes(item.type))
  const milestoneItems = items.filter((item) => item.type === 'LIVRABLE')
  const completedStatuses = new Set(['TERMINE', 'VALIDE'])

  const milestoneRatio = milestoneItems.length === 0
    ? 0
    : milestoneItems.filter((item) => completedStatuses.has(item.status)).length / milestoneItems.length

  const deliverableRatio = deliverableItems.length === 0
    ? 0
    : deliverableItems.filter((item) => completedStatuses.has(item.status)).length / deliverableItems.length

  const statusBonus = project.status === 'TERMINE' ? 1 : project.status === 'EN_COURS' ? 0.55 : 0.25

  const value = ((milestoneRatio * 0.45) + (deliverableRatio * 0.35) + (statusBonus * 0.2)) * 100
  return Math.max(0, Math.min(100, Math.round(value)))
}
