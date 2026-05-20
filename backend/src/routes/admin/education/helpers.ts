import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { EducationActivityLog, type EduAction, type EduEntityType } from '../../../models/education/index.js'

export const ownerFilter = (req: Request) => ({ owner: req.user!.id, deletedAt: null })

export const requireBody = (fields: string[]) => (req: Request, res: Response, next: NextFunction): void => {
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

export interface ListOptions {
  defaultLimit?: number
  maxLimit?: number
}

export const parseListQuery = (req: Request, opts: ListOptions = {}) => {
  const limit = Math.min(Number(req.query.limit) || opts.defaultLimit || 50, opts.maxLimit || 200)
  const skip = Math.max(Number(req.query.skip) || 0, 0)
  const sort = String(req.query.sort || '-updatedAt')
  return { limit, skip, sort }
}

export async function logActivity(
  ownerId: string,
  actorId: string,
  entityType: EduEntityType,
  entityId: mongoose.Types.ObjectId | string,
  action: EduAction,
  payload: Record<string, unknown> = {}
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
  } catch {
    // best effort — ne bloque pas la réponse
  }
}

export function asObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
