import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import express, { type Express } from 'express'
import request from 'supertest'
import { TOTP } from 'otpauth'
import authRoutes from '../routes/auth.js'
import auth from '../middleware/auth.js'
import requireMfa from '../middleware/mfa.js'
import crmRoutes from '../routes/admin/crm.js'
import ticketRoutes from '../routes/admin/tickets.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import adminsRoutes from '../routes/admin/admins.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import InternalTicket from '../models/InternalTicket.js'
import { createSession } from '../lib/session.js'
import { createTotpSecret } from '../lib/mfa.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

type RecipeRole = 'SUPER_ADMIN' | 'ADMIN' | 'COMMERCIAL' | 'RH' | 'COMPTABLE' | 'VIEWER' | 'STAGIAIRE'

type RoleScenario = {
  role: RecipeRole
  requiresMfa: boolean
  canReadCrm: boolean
  canReadAccounting: boolean
  canReadTickets: boolean
}

const scenarios: RoleScenario[] = [
  { role: 'SUPER_ADMIN', requiresMfa: true, canReadCrm: true, canReadAccounting: true, canReadTickets: true },
  { role: 'ADMIN', requiresMfa: true, canReadCrm: true, canReadAccounting: true, canReadTickets: true },
  { role: 'COMMERCIAL', requiresMfa: false, canReadCrm: true, canReadAccounting: false, canReadTickets: true },
  { role: 'RH', requiresMfa: false, canReadCrm: false, canReadAccounting: false, canReadTickets: true },
  { role: 'COMPTABLE', requiresMfa: false, canReadCrm: false, canReadAccounting: true, canReadTickets: false },
  { role: 'VIEWER', requiresMfa: false, canReadCrm: false, canReadAccounting: true, canReadTickets: true },
  { role: 'STAGIAIRE', requiresMfa: false, canReadCrm: true, canReadAccounting: false, canReadTickets: true },
]

let app: Express
let password: string
let passwordHash: string
const users = new Map<RecipeRole, { id: string; email: string }>()
const mfaSecrets = new Map<RecipeRole, string>()

function scenarioFor(role: RecipeRole): RoleScenario {
  const scenario = scenarios.find((candidate) => candidate.role === role)
  if (!scenario) throw new Error(`Unknown recipe role: ${role}`)
  return scenario
}

function userFor(role: RecipeRole): { id: string; email: string } {
  const user = users.get(role)
  if (!user) throw new Error(`Missing recipe user for role: ${role}`)
  return user
}

function currentTotp(role: RecipeRole): string {
  const secret = mfaSecrets.get(role)
  const user = userFor(role)
  if (!secret) throw new Error(`Missing MFA secret for role: ${role}`)
  return new TOTP({
    issuer: 'Venio recette isolée',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  }).generate()
}

async function loginAs(role: RecipeRole) {
  const agent = request.agent(app)
  const user = userFor(role)
  const initialLogin = await agent.post('/api/auth/login').send({ email: user.email, password })

  if (scenarioFor(role).requiresMfa) {
    expect(initialLogin.status).toBe(200)
    expect(initialLogin.body).toEqual({ requires2FA: true })
    const completedLogin = await agent
      .post('/api/auth/login')
      .send({ email: user.email, password, totpCode: currentTotp(role) })
    expect(completedLogin.status).toBe(200)
    expect(completedLogin.headers['set-cookie']?.[0]).toContain('HttpOnly')
  } else {
    expect(initialLogin.status).toBe(200)
    expect(initialLogin.body).not.toHaveProperty('requires2FA')
    expect(initialLogin.headers['set-cookie']?.[0]).toContain('HttpOnly')
  }

  return agent
}

beforeAll(async () => {
  password = crypto.randomBytes(32).toString('base64url')
  passwordHash = await bcrypt.hash(password, 4)
  await setupMongo()

  app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use('/api/admin/crm', crmRoutes)
  app.use('/api/admin/tickets', ticketRoutes)
  app.use('/api/admin/accounting', auth, requireMfa, accountingRoutes)
  app.use('/api/admin/admins', auth, requireMfa, adminsRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  users.clear()
  mfaSecrets.clear()

  const createdUsers = await User.create(
    scenarios.map(({ role, requiresMfa }) => {
      const email = `venio-104-${role.toLowerCase()}@recipe.invalid`
      const twoFactorSecret = requiresMfa ? createTotpSecret() : null
      if (twoFactorSecret) mfaSecrets.set(role, twoFactorSecret)
      return {
        email,
        name: `VENIO-104 ${role}`,
        role,
        passwordHash,
        twoFactorEnabled: requiresMfa,
        twoFactorSecret,
      }
    }),
  )
  for (const user of createdUsers) {
    users.set(user.role as RecipeRole, { id: user._id.toString(), email: user.email })
  }

  await Lead.create(
    scenarios.map(({ role }) => ({
      company: `VENIO-104 lead ${role}`,
      assignedTo: userFor(role).id,
      createdBy: userFor(role).id,
    })),
  )
  await InternalTicket.create(
    scenarios.map(({ role }) => ({
      title: `VENIO-104 ticket ${role}`,
      message: 'Donnée synthétique isolée de recette.',
      authorId: userFor(role).id,
      authorName: `VENIO-104 ${role}`,
    })),
  )
})

describe('VENIO-104 — login et MFA', () => {
  it('authenticates every requested role and requires a TOTP only for privileged roles', async () => {
    for (const { role } of scenarios) {
      await loginAs(role)
    }
  })

  it('refuses a privileged account whose MFA enrollment grace period has expired', async () => {
    const admin = userFor('ADMIN')
    await User.findByIdAndUpdate(admin.id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      mfaGraceUntil: new Date(Date.now() - 1_000),
    })

    const response = await request(app).post('/api/auth/login').send({ email: admin.email, password })
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ error: 'MFA_SETUP_REQUIRED' })
  })

  it('refuses a privileged accounting request when the session has not completed MFA step-up', async () => {
    const superAdmin = userFor('SUPER_ADMIN')
    const session = await createSession(superAdmin.id)

    const response = await request(app)
      .get('/api/admin/accounting/entries')
      .set('Cookie', `venio_session=${session.token}`)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ error: 'MFA_STEP_UP_REQUIRED' })
  })
})

describe('VENIO-104 — permissions backend and data scoping', () => {
  it('enforces the recipe matrix and keeps CRM and ticket data scoped outside SUPER_ADMIN', async () => {
    for (const scenario of scenarios) {
      const agent = await loginAs(scenario.role)

      const crm = await agent.get('/api/admin/crm/leads')
      expect(crm.status).toBe(scenario.canReadCrm ? 200 : 403)
      if (scenario.canReadCrm) {
        const companies = crm.body.leads.map((lead: { company: string }) => lead.company)
        const expectedCompanies =
          scenario.role === 'SUPER_ADMIN'
            ? scenarios.map(({ role }) => `VENIO-104 lead ${role}`)
            : [`VENIO-104 lead ${scenario.role}`]
        expect(companies.sort()).toEqual(expectedCompanies.sort())
      }

      const accounting = await agent.get('/api/admin/accounting/entries')
      expect(accounting.status).toBe(scenario.canReadAccounting ? 200 : 403)

      const tickets = await agent.get('/api/admin/tickets')
      expect(tickets.status).toBe(scenario.canReadTickets ? 200 : 403)
      if (scenario.canReadTickets) {
        const titles = tickets.body.map((ticket: { title: string }) => ticket.title)
        const expectedTitles =
          scenario.role === 'SUPER_ADMIN'
            ? scenarios.map(({ role }) => `VENIO-104 ticket ${role}`)
            : [`VENIO-104 ticket ${scenario.role}`]
        expect(titles.sort()).toEqual(expectedTitles.sort())
      }
    }
  })

  it('allows ticket creation only to roles with CREATE_TICKETS and rejects a COMPTABLE request', async () => {
    for (const { role, canReadTickets } of scenarios) {
      const agent = await loginAs(role)
      const response = await agent.post('/api/admin/tickets').send({
        title: `VENIO-104 created ${role}`,
        message: 'Ticket synthétique créé dans MongoMemoryServer.',
      })
      expect(response.status).toBe(canReadTickets ? 201 : 403)
    }
  })

  it('reserves individual admin-account management to SUPER_ADMIN even when ADMIN completed MFA', async () => {
    const superAdmin = await loginAs('SUPER_ADMIN')
    const admin = await loginAs('ADMIN')
    const targetAdmin = userFor('RH')

    await superAdmin.get(`/api/admin/admins/${targetAdmin.id}`).expect(200)
    await admin.get(`/api/admin/admins/${targetAdmin.id}`).expect(403)
  })
})
