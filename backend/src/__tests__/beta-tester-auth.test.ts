import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import BetaCampaign, { type BetaCampaignStatus } from '../models/BetaCampaign.js'
import BetaTester from '../models/BetaTester.js'
import { createBetaTesterToken, hashBetaTesterToken } from '../lib/beta/tokens.js'
import { resolveBetaTester } from '../lib/beta/testerAuth.js'

const devProject = new mongoose.Types.ObjectId()
const author = new mongoose.Types.ObjectId()

async function seed(
  campaignOverrides: Partial<{ status: BetaCampaignStatus; endsAt: Date | null; startsAt: Date | null }> = {},
  testerOverrides: Partial<{ revokedAt: Date | null; expiresAt: Date | null }> = {},
) {
  const campaign = await BetaCampaign.create({
    devProject,
    name: 'Recette',
    createdBy: author,
    status: 'RUNNING',
    ...campaignOverrides,
  })
  const token = createBetaTesterToken()
  const tester = await BetaTester.create({
    campaign: campaign._id,
    name: 'Lea',
    email: 'lea@example.test',
    tokenHash: hashBetaTesterToken(token),
    ...testerOverrides,
  })
  return { campaign, tester, token }
}

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('resolveBetaTester', () => {
  it('reconnait un testeur actif sur une campagne en cours', async () => {
    const { tester, token } = await seed()
    const resolved = await resolveBetaTester(token)
    expect(resolved).not.toBeNull()
    expect(String(resolved!.tester._id)).toBe(String(tester._id))
    expect(resolved!.campaign.name).toBe('Recette')
  })

  it('horodate le passage du testeur', async () => {
    const { tester, token } = await seed()
    expect(tester.lastSeenAt).toBeNull()
    await resolveBetaTester(token)
    const reloaded = await BetaTester.findById(tester._id)
    expect(reloaded!.lastSeenAt).toBeInstanceOf(Date)
  })

  it('refuse un jeton mal forme sans interroger la base', async () => {
    expect(await resolveBetaTester('pas-un-jeton')).toBeNull()
    expect(await resolveBetaTester('')).toBeNull()
    expect(await resolveBetaTester(undefined)).toBeNull()
  })

  it('refuse un jeton bien forme mais inconnu', async () => {
    await seed()
    expect(await resolveBetaTester(createBetaTesterToken())).toBeNull()
  })

  it('refuse un testeur revoque', async () => {
    const { token } = await seed({}, { revokedAt: new Date() })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('refuse un testeur dont le lien a expire', async () => {
    const { token } = await seed({}, { expiresAt: new Date(Date.now() - 1000) })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('accepte un testeur dont le lien expire plus tard', async () => {
    const { token } = await seed({}, { expiresAt: new Date(Date.now() + 60_000) })
    expect(await resolveBetaTester(token)).not.toBeNull()
  })

  it('refuse l acces tant que la campagne est en brouillon', async () => {
    const { token } = await seed({ status: 'DRAFT' })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('refuse l acces une fois la campagne close', async () => {
    const { token } = await seed({ status: 'CLOSED' })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('refuse l acces au dela de la date de fin de campagne', async () => {
    const { token } = await seed({ endsAt: new Date(Date.now() - 1000) })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('refuse l acces avant la date d ouverture de campagne', async () => {
    const { token } = await seed({ startsAt: new Date(Date.now() + 60_000) })
    expect(await resolveBetaTester(token)).toBeNull()
  })

  it('ne conserve jamais le secret en clair', async () => {
    const { tester, token } = await seed()
    const raw = await BetaTester.findById(tester._id).lean()
    expect(JSON.stringify(raw)).not.toContain(token)
  })
})
