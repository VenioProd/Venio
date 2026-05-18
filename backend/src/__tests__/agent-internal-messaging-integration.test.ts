import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import InternalConversation from '../models/InternalConversation.js'
import InternalConversationMember from '../models/InternalConversationMember.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => teardownMongo())

beforeEach(async () => clearDb())

/**
 * Helper : crée un token agent ET son User AGENT lié, comme le ferait le
 * handler POST /admin/agent-tokens.
 *
 * Note : createAgentTokenInDb retourne { id, plainSecret, prefix } — on
 * reconstruit l'objet token via AgentToken.findById pour l'associer à l'user.
 */
async function createAgentTokenWithUser(scopes: string[], name = 'Test Agent') {
  const seeded = await createAgentTokenInDb(scopes)
  const token = await AgentToken.findById(seeded.id)
  const agentUser = await User.create({
    email: `agent-${seeded.id}@venio.internal`,
    passwordHash: await bcrypt.hash('random', 10),
    name,
    role: 'AGENT',
    isActive: true,
    agentTokenId: seeded.id,
  })
  await AgentToken.updateOne({ _id: seeded.id }, { $set: { userId: agentUser._id } })
  return { token, plainSecret: seeded.plainSecret, agentUser }
}

async function createInternalHuman(role: 'SUPER_ADMIN' | 'ADMIN' = 'ADMIN', name = 'Human') {
  return User.create({
    email: `${name.toLowerCase()}@venio.test`,
    passwordHash: await bcrypt.hash('x', 10),
    name,
    role,
    isActive: true,
  })
}

describe('Agent × Messagerie interne', () => {
  it('placeholder pour structure — sera remplacé', () => {
    expect(true).toBe(true)
  })
})
