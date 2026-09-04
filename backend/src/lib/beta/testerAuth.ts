import type { Request, Response, NextFunction } from 'express'
import BetaCampaign, { type IBetaCampaign } from '../../models/BetaCampaign.js'
import BetaTester, { type IBetaTester } from '../../models/BetaTester.js'
import { hashBetaTesterToken, isValidBetaTesterToken } from './tokens.js'

export interface ResolvedBetaTester {
  tester: IBetaTester
  campaign: IBetaCampaign
}

/**
 * Résout le porteur d'un lien de test. Toute cause de refus — jeton mal formé,
 * inconnu, révoqué, expiré, campagne pas encore ouverte ou déjà close — renvoie
 * la même valeur nulle : l'appelant ne peut pas distinguer les cas, donc ne
 * peut pas énumérer les campagnes ni les testeurs.
 */
export async function resolveBetaTester(token: unknown): Promise<ResolvedBetaTester | null> {
  if (!isValidBetaTesterToken(token)) return null

  const tester = await BetaTester.findOne({ tokenHash: hashBetaTesterToken(token) })
  if (!tester) return null
  if (tester.revokedAt) return null
  if (tester.expiresAt && tester.expiresAt.getTime() <= Date.now()) return null

  const campaign = await BetaCampaign.findById(tester.campaign)
  if (!campaign || campaign.status !== 'RUNNING') return null

  const now = Date.now()
  if (campaign.startsAt && campaign.startsAt.getTime() > now) return null
  if (campaign.endsAt && campaign.endsAt.getTime() <= now) return null

  // Trace de présence, utile pour relancer les testeurs silencieux. On n'attend
  // pas l'écriture pour répondre : elle n'a aucune valeur transactionnelle.
  tester.lastSeenAt = new Date()
  await tester.save()

  return { tester, campaign }
}

declare module 'express-serve-static-core' {
  interface Request {
    betaTester?: ResolvedBetaTester
  }
}

/**
 * Porte d'entrée de la surface testeur. Un refus renvoie toujours un 404
 * identique, sans corps discriminant.
 */
export async function requireBetaTester(req: Request, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveBetaTester(req.params.token)
    if (!resolved) return res.status(404).json({ error: 'Lien de test introuvable ou expiré' })
    req.betaTester = resolved
    return next()
  } catch (err) {
    return next(err)
  }
}
