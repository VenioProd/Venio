import mongoose from 'mongoose'
import BetaCampaign from '../../models/BetaCampaign.js'
import BetaScenario, { type BetaScenarioStep, type IBetaScenario } from '../../models/BetaScenario.js'

const DUPLICATE_KEY = 11000
const MAX_RETRIES = 5

/**
 * Réserve le prochain numéro de démarche. Le compteur vit sur la campagne et
 * s'incrémente atomiquement, comme `DevProject.issueCounter` : deux créations
 * simultanées ne peuvent pas obtenir le même numéro.
 */
async function allocateScenarioNumber(campaignId: mongoose.Types.ObjectId): Promise<number> {
  const updated = await BetaCampaign.findOneAndUpdate(
    { _id: campaignId },
    { $inc: { scenarioCounter: 1 } },
    { new: true },
  )
    .select('scenarioCounter')
    .lean()
  if (!updated) throw new Error('Campagne introuvable')

  const taken = await BetaScenario.findOne({ campaign: campaignId, number: updated.scenarioCounter })
    .select('_id')
    .lean()
  if (!taken) return updated.scenarioCounter

  // Données antérieures au compteur : on le recale sur le maximum observé.
  const last = await BetaScenario.findOne({ campaign: campaignId }).sort({ number: -1 }).select('number').lean()
  const base = last?.number ?? 0
  await BetaCampaign.updateOne({ _id: campaignId }, { $set: { scenarioCounter: base } })
  const realigned = await BetaCampaign.findOneAndUpdate(
    { _id: campaignId },
    { $inc: { scenarioCounter: 1 } },
    { new: true },
  )
    .select('scenarioCounter')
    .lean()
  return realigned?.scenarioCounter ?? base + 1
}

/** Renumérote les étapes de 1 à n : l'ordre soumis fait foi, pas les valeurs. */
export function normalizeSteps(raw: unknown): BetaScenarioStep[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((step): step is Record<string, unknown> => typeof step === 'object' && step !== null)
    .map((step) => ({
      instruction: typeof step.instruction === 'string' ? step.instruction.trim().slice(0, 500) : '',
      expected: typeof step.expected === 'string' ? step.expected.trim().slice(0, 500) : '',
    }))
    .filter((step) => step.instruction.length > 0)
    .slice(0, 40)
    .map((step, index) => ({ ...step, order: index + 1 }))
}

export interface CreateScenarioInput {
  campaign: mongoose.Types.ObjectId
  title: string
  description?: string
  steps?: unknown
  rank?: number
}

export async function createScenarioWithRetry(input: CreateScenarioInput): Promise<IBetaScenario> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const number = await allocateScenarioNumber(input.campaign)
    try {
      return await BetaScenario.create({
        campaign: input.campaign,
        number,
        identifier: `BETA-${number}`,
        title: input.title,
        description: input.description ?? '',
        steps: normalizeSteps(input.steps),
        rank: input.rank ?? number,
      })
    } catch (err) {
      const code = (err as { code?: number } | null)?.code
      if (code === DUPLICATE_KEY) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr ?? new Error('Impossible d’allouer un numéro de démarche')
}
