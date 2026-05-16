import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'

import { connectTestDb, disconnectTestDb } from './helpers/db.js'
import { seedPcg } from './helpers/seedPcg.js'
import { createTestAdmin, authHeader } from './helpers/auth.js'
import { makeEntry } from './helpers/factories.js'
import { createApp } from '../src/createApp.js'

import CompanySettings from '../src/models/CompanySettings.js'

const FROM = '2026-01-01T00:00:00Z'
const TO = '2026-12-31T23:59:59Z'
const TO_YMD = '20261231'

let app
let token

beforeAll(async () => {
  await connectTestDb()
  app = createApp()
})

afterAll(async () => {
  await disconnectTestDb()
})

beforeEach(async () => {
  await seedPcg()
  const created = await createTestAdmin({ role: 'SUPER_ADMIN' })
  token = created.token
})

async function getFec({ from = FROM, to = TO, useAuth = true } = {}) {
  const req = request(app).get(`/api/admin/accounting/fec/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  if (useAuth) req.set(authHeader(token))
  return req
}

describe('GET /api/admin/accounting/fec/export', () => {
  it('exercice vide → 200 avec uniquement l’en-tête FEC', async () => {
    const res = await getFec()
    expect(res.status).toBe(200)
    const lines = res.text.split('\r\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(1)
    // Header doit contenir les 18 colonnes officielles
    const headers = lines[0].split('|')
    expect(headers).toHaveLength(18)
    expect(headers[0]).toBe('JournalCode')
    expect(headers[17]).toBe('Idevise')
  })

  it('après 2 écritures VALIDATED → header + 2 * nbLines lignes data', async () => {
    // 2 écritures VALIDATED de 2 lignes chacune
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-10T10:00:00Z'),
      label: 'Vente 1',
      pieceRef: 'FA-001',
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 1200, credit: 0 },
        { account: '706000', debit: 0, credit: 1000 },
        { account: '445710', debit: 0, credit: 200 },
      ],
    })
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-04-15T10:00:00Z'),
      label: 'Vente 2',
      pieceRef: 'FA-002',
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 600, credit: 0 },
        { account: '706000', debit: 0, credit: 500 },
        { account: '445710', debit: 0, credit: 100 },
      ],
    })

    const res = await getFec()
    expect(res.status).toBe(200)
    const lines = res.text.split('\r\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(1 + 3 + 3) // header + 3 lignes ecr1 + 3 lignes ecr2
  })

  it('écriture DRAFT NE doit PAS apparaître dans le FEC', async () => {
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-10T10:00:00Z'),
      label: 'Brouillon',
      status: 'DRAFT',
      lines: [
        { account: '411000', debit: 100, credit: 0 },
        { account: '706000', debit: 0, credit: 100 },
      ],
    })
    const res = await getFec()
    expect(res.status).toBe(200)
    const lines = res.text.split('\r\n').filter((l) => l.length > 0)
    expect(lines).toHaveLength(1) // juste le header, écriture DRAFT exclue
  })

  it('Content-Disposition = <SIREN>FEC<YYYYMMDD>.txt quand SIREN configuré', async () => {
    const settings = await CompanySettings.getOrCreate()
    settings.siren = '123456789'
    await settings.save()

    const res = await getFec()
    expect(res.status).toBe(200)
    const cd = res.headers['content-disposition'] || ''
    expect(cd).toContain(`123456789FEC${TO_YMD}.txt`)
  })

  it('Content-Disposition fallback = FEC-YYYYMMDD.txt quand pas de SIREN', async () => {
    // Pas de modif des settings → siren vide
    const res = await getFec()
    expect(res.status).toBe(200)
    const cd = res.headers['content-disposition'] || ''
    expect(cd).toContain(`FEC-${TO_YMD}.txt`)
  })

  it('sans permission EXPORT_FEC → 403', async () => {
    const { token: viewerToken } = await createTestAdmin({ role: 'VIEWER' })
    const res = await request(app)
      .get(`/api/admin/accounting/fec/export?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`)
      .set(authHeader(viewerToken))
    expect(res.status).toBe(403)
  })

  it('format FEC : exactement 18 colonnes pipe-séparées dans la première ligne data', async () => {
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-10T10:00:00Z'),
      label: 'Vente colonnes',
      pieceRef: 'FA-PIPES',
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 1200, credit: 0 },
        { account: '706000', debit: 0, credit: 1200 },
      ],
    })
    const res = await getFec()
    expect(res.status).toBe(200)
    const allLines = res.text.split('\r\n').filter((l) => l.length > 0)
    expect(allLines.length).toBeGreaterThanOrEqual(2)
    const firstData = allLines[1]
    const cols = firstData.split('|')
    expect(cols).toHaveLength(18)
  })
})
