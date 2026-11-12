import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../../src/__tests__/helpers/agentTestApp.js'

const exec = promisify(execFile)

it('lists compiled migrations and defaults to a dry run without writing data or indexes', async () => {
  const entry = process.env.MIGRATION_TEST_ENTRY || 'src/scripts/migrate.ts'
  const loader = entry.endsWith('.ts') ? ['--import', 'tsx'] : []
  const listed = await exec(process.execPath, [...loader, entry, '--list'])
  expect(listed.stdout.trim().split('\n')).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(3, '0')))
  const mongo = await MongoMemoryServer.create()
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false, autoCreate: false })
    const leads = mongoose.connection.db!.collection('leads')
    await leads.insertOne({ company: 'Migration test', project: 'ARROW' })
    const before = await leads.indexes()
    for (const args of [['--dry-run', '007'], ['007']]) {
      const result = await exec(process.execPath, [...loader, entry, ...args], {
        env: { ...process.env, MONGODB_URI: mongo.getUri() },
      })
      expect(JSON.parse(result.stdout)).toMatchObject({ id: '007', dryRun: true, result: { arrow: 1 } })
    }
    expect(await leads.findOne({})).not.toHaveProperty('entity')
    expect(await leads.indexes()).toEqual(before)
  } finally {
    await mongoose.disconnect()
    await mongo.stop()
  }
}, 30_000)

it('preserves CRM and messaging mount prefixes in the served OpenAPI spec', async () => {
  const app = await createTestApp()
  const response = await request(app).get('/api/v1/agent/openapi.json').expect(200)
  const paths = response.body.paths as Record<string, unknown>
  expect(paths).toHaveProperty('/crm/leads/bulk')
  expect(Object.keys(paths).some((path) => path.startsWith('/messaging/'))).toBe(true)
  expect(paths).not.toHaveProperty('/leads/bulk')
})
