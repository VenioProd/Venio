import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from '../__tests__/helpers/mongoTestEnv.js'
import BillingDocument from './BillingDocument.js'
import ExternalSource from './ExternalSource.js'
import InternalConversation from './InternalConversation.js'
import QualiopiCriterion from './QualiopiCriterion.js'

const objectId = () => new mongoose.Types.ObjectId()

function expectUniqueIndex(operation: Promise<unknown>) {
  return expect(operation).rejects.toMatchObject({ code: 11000 })
}

beforeAll(async () => {
  await setupMongo()
  await Promise.all([
    ExternalSource.init(),
    QualiopiCriterion.init(),
    InternalConversation.init(),
    BillingDocument.init(),
  ])
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

describe('Mongoose index integrity', () => {
  it.each([
    { name: 'ExternalSource', model: ExternalSource },
    { name: 'QualiopiCriterion', model: QualiopiCriterion },
    { name: 'InternalConversation', model: InternalConversation },
    { name: 'BillingDocument', model: BillingDocument },
  ])('does not declare duplicate indexes on $name', ({ model }) => {
    const signatures = model.schema.indexes().map(([keys]) => JSON.stringify(keys))
    expect(new Set(signatures)).toHaveLength(signatures.length)
  })

  it('enforces the unique ExternalSource slug', async () => {
    await ExternalSource.create({
      slug: 'source-unique',
      name: 'Source unique',
      apiKeyHash: 'hash',
      webhookSecret: 'secret',
    })

    await expectUniqueIndex(ExternalSource.create({
      slug: 'source-unique',
      name: 'Autre source',
      apiKeyHash: 'hash-2',
      webhookSecret: 'secret-2',
    }))
  })

  it('enforces the unique Qualiopi criterion number', async () => {
    await QualiopiCriterion.create({ number: 1, title: 'Critère 1' })

    await expectUniqueIndex(QualiopiCriterion.create({ number: 1, title: 'Critère 1 bis' }))
  })

  it('enforces InternalConversation unique slug and DM member key', async () => {
    const createdBy = objectId()
    await InternalConversation.create({
      type: 'CHANNEL',
      name: 'Canal unique',
      slug: 'canal-unique',
      memberKey: 'channel-owner-a',
      createdBy,
    })

    await expectUniqueIndex(InternalConversation.create({
      type: 'CHANNEL',
      name: 'Autre canal',
      slug: 'canal-unique',
      memberKey: 'channel-owner-b',
      createdBy: objectId(),
    }))

    await InternalConversation.create({
      type: 'DM',
      memberKey: 'dm-members-a-b',
      createdBy,
    })

    await expectUniqueIndex(InternalConversation.create({
      type: 'DM',
      memberKey: 'dm-members-a-b',
      createdBy: objectId(),
    }))
  })

  it('enforces the unique BillingDocument number', async () => {
    const document = {
      type: 'INVOICE' as const,
      number: 'FAC-UNIQUE',
      project: objectId(),
      client: objectId(),
      createdBy: objectId(),
    }
    await BillingDocument.create(document)

    await expectUniqueIndex(BillingDocument.create({
      ...document,
      project: objectId(),
    }))
  })
})
