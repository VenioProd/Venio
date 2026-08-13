import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import {
  EducationActivityLog,
  EducationStudent,
  type EduAction,
  type EduEntityType,
} from '../../../models/education/index.js'
import logger from '../../../lib/logger.js'

export const ownerFilter = (req: Request) => ({ owner: req.user!.id, deletedAt: null })

export const requireBody =
  (fields: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    for (const f of fields) {
      const v = (req.body as Record<string, unknown>)[f]
      if (v === undefined || v === null || v === '') {
        res.status(400).json({ error: `Champ requis: ${f}` })
        return
      }
    }
    next()
  }

export const validId = (id: unknown): boolean => typeof id === 'string' && mongoose.isValidObjectId(id)

/**
 * Validate every learner reference before a bulk mutation starts. Returning the
 * caller-provided ids is safe and makes malformed batches actionable without
 * revealing whether an id exists under another owner.
 */
export async function invalidStudentIdsForClass(
  req: Request,
  classId: mongoose.Types.ObjectId | string,
  studentIds: unknown[],
): Promise<string[]> {
  const normalized = studentIds.map((id) => (typeof id === 'string' ? id : String(id ?? '')))
  const invalidFormat = normalized.filter((id) => !validId(id))
  const validUnique = Array.from(new Set(normalized.filter((id) => validId(id))))
  if (validUnique.length === 0) return Array.from(new Set(invalidFormat))

  const found = await EducationStudent.find({
    _id: { $in: validUnique },
    classId,
    ...ownerFilter(req),
  })
    .select('_id')
    .lean()
  const foundIds = new Set(found.map((student) => String(student._id)))
  return Array.from(new Set([...invalidFormat, ...validUnique.filter((id) => !foundIds.has(id))]))
}

export interface ListOptions {
  defaultLimit?: number
  maxLimit?: number
}

export const parseListQuery = (req: Request, opts: ListOptions = {}) => {
  const requestedLimit = Number(req.query.limit)
  const fallbackLimit = opts.defaultLimit || 50
  const limit = Math.min(
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : fallbackLimit,
    opts.maxLimit || 200,
  )
  const requestedSkip = Number(req.query.skip)
  const skip = Number.isFinite(requestedSkip) && requestedSkip > 0 ? Math.floor(requestedSkip) : 0
  const sort = String(req.query.sort || '-updatedAt')
  return { limit, skip, sort }
}

export async function logActivity(
  ownerId: string,
  actorId: string,
  entityType: EduEntityType,
  entityId: mongoose.Types.ObjectId | string,
  action: EduAction,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await EducationActivityLog.create({
      owner: ownerId,
      actor: actorId,
      entityType,
      entityId,
      action,
      payload,
    })
  } catch (err) {
    logger.warn(
      { data: err instanceof Error ? err.message : String(err), entityType, entityId: String(entityId), action },
      '[education-activity] journalisation échouée',
    )
  }
}

export function asObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
