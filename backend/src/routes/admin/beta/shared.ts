import mongoose from 'mongoose'
import type { Request, Response, NextFunction } from 'express'
import BetaCampaign, { type IBetaCampaign } from '../../../models/BetaCampaign.js'

export const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

export function readString(raw: unknown, maxLength: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, maxLength) : ''
}

/**
 * Une adresse sert d'identité au testeur et de destination pour son lien. On
 * refuse donc ce qui ne peut pas en être une, sans prétendre valider plus que
 * la forme.
 */
export function isPlausibleEmail(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim())
}

export function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

declare module 'express-serve-static-core' {
  interface Request {
    betaCampaign?: IBetaCampaign
  }
}

/** Charge la campagne de `:campaignId` et la pose sur la requête. */
export async function loadCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params
    if (!isObjectId(campaignId)) return res.status(400).json({ error: 'Identifiant de campagne invalide' })
    const campaign = await BetaCampaign.findById(campaignId)
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' })
    req.betaCampaign = campaign
    return next()
  } catch (err) {
    return next(err)
  }
}
