import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'

import { connectTestDb, disconnectTestDb } from './helpers/db.js'
import { seedPcg } from './helpers/seedPcg.js'
import { sign, nowSec } from './helpers/hmac.js'
import { makeExternalSource } from './helpers/factories.js'
import { createApp } from '../src/createApp.js'

import AccountingEntry from '../src/models/AccountingEntry.js'

const SOURCE_SLUG = 'arrow'

let app
let source
let apiKey
let secret

beforeAll(async () => {
  await connectTestDb()
  app = createApp()
})

afterAll(async () => {
  await disconnectTestDb()
})

beforeEach(async () => {
  await seedPcg()
  const created = await makeExternalSource({
    slug: SOURCE_SLUG,
    autoValidateAll: true,
    status: 'ACTIVE',
  })
  source = created.source
  apiKey = created.apiKey
  secret = created.secret
})

/**
 * Helper : construit les headers + envoie un POST signé à /entries.
 * Renvoie la réponse supertest.
 */
async function postSignedEntries(slug, payload, { idempotencyKey, signSecret, signKey, timestamp } = {}) {
  const rawBody = JSON.stringify(payload)
  const ts = timestamp == null ? nowSec() : timestamp
  const usedSecret = signSecret == null ? secret : signSecret
  const usedKey = signKey == null ? apiKey : signKey
  const signature = sign(ts, rawBody, usedSecret)
  const idem = idempotencyKey || `test-idem-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  return request(app)
    .post(`/api/external/${slug}/entries`)
    .set('Content-Type', 'application/json')
    .set('X-Api-Key', usedKey)
    .set('X-Venio-Signature', signature)
    .set('X-Venio-Timestamp', String(ts))
    .set('Idempotency-Key', idem)
    .send(rawBody)
}

describe('POST /api/external/:slug/entries — ingestion mode 2 (SALE)', () => {
  it('crée une écriture POSTED quand tout est valide (autoValidateAll=true)', async () => {
    const payload = {
      externalId: 'ARROW-INV-1',
      type: 'SALE',
      date: '2026-03-15T10:00:00Z',
      amount: 1200,
      vatRate: 20,
      description: 'Facture test',
    }
    const res = await postSignedEntries(SOURCE_SLUG, payload)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('results')
    expect(res.body.results).toHaveLength(1)
    const r = res.body.results[0]
    expect(r.status).toBe('POSTED')
    expect(r.entry).toBeTruthy()
    expect(r.entry.entryNumber).toMatch(/^VE-2026-\d{5}$/)
    expect(r.entry.status).toBe('VALIDATED')

    const entryDoc = await AccountingEntry.findById(r.entry._id).lean()
    expect(entryDoc).toBeTruthy()
    expect(entryDoc.totalDebit).toBe(1200)
    expect(entryDoc.totalCredit).toBe(1200)
  })
})

describe('Idempotency', () => {
  it('deuxième appel avec la même Idempotency-Key → DUPLICATE et même entry', async () => {
    const payload = {
      externalId: 'ARROW-INV-2',
      type: 'SALE',
      date: '2026-03-15T10:00:00Z',
      amount: 600,
      vatRate: 20,
      description: 'Facture idempotency',
    }
    const idem = `idem-dup-${Date.now()}`
    const first = await postSignedEntries(SOURCE_SLUG, payload, { idempotencyKey: idem })
    expect(first.status).toBe(200)
    expect(first.body.results[0].status).toBe('POSTED')
    const firstEntryId = first.body.results[0].entry._id

    const second = await postSignedEntries(SOURCE_SLUG, payload, { idempotencyKey: idem })
    expect(second.status).toBe(200)
    expect(second.body.results[0].status).toBe('DUPLICATE')
    expect(String(second.body.results[0].entry?._id || '')).toBe(String(firstEntryId))
  })
})

describe('Authentification — codes d’erreur', () => {
  it('signature invalide → 401 INVALID_SIGNATURE', async () => {
    const payload = { externalId: 'X', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100 }
    const res = await postSignedEntries(SOURCE_SLUG, payload, { signSecret: 'wrong-secret' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_SIGNATURE')
  })

  it('timestamp hors fenêtre → 401 TIMESTAMP_OUT_OF_RANGE', async () => {
    const payload = { externalId: 'X', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100 }
    const oldTs = nowSec() - 3600 // 1h dans le passé
    const res = await postSignedEntries(SOURCE_SLUG, payload, { timestamp: oldTs })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('TIMESTAMP_OUT_OF_RANGE')
  })

  it('clé API inconnue → 401 UNKNOWN_API_KEY', async () => {
    const payload = { externalId: 'X', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100 }
    const res = await postSignedEntries(SOURCE_SLUG, payload, { signKey: 'vno_live_unknownkey' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNKNOWN_API_KEY')
  })

  it('headers obligatoires manquants → 401 MISSING_HEADERS', async () => {
    const rawBody = JSON.stringify({ externalId: 'X', type: 'SALE' })
    const res = await request(app)
      .post(`/api/external/${SOURCE_SLUG}/entries`)
      .set('Content-Type', 'application/json')
      // pas de X-Api-Key, pas de X-Venio-Signature
      .send(rawBody)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MISSING_HEADERS')
  })
})

describe('Source — états et inexistence', () => {
  it('source PAUSED → 403 SOURCE_INACTIVE', async () => {
    source.status = 'PAUSED'
    await source.save()
    const payload = { externalId: 'X', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100 }
    const res = await postSignedEntries(SOURCE_SLUG, payload)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('SOURCE_INACTIVE')
  })

  it('slug inconnu → 404 SOURCE_NOT_FOUND', async () => {
    const payload = { externalId: 'X', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100 }
    const res = await postSignedEntries('does-not-exist', payload)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('SOURCE_NOT_FOUND')
  })
})

describe('Validation payload', () => {
  it('multi-devises USD → 422', async () => {
    const payload = {
      externalId: 'ARROW-USD-1',
      type: 'SALE',
      date: '2026-03-15T10:00:00Z',
      amount: 100,
      vatRate: 20,
      currency: 'USD',
    }
    const res = await postSignedEntries(SOURCE_SLUG, payload)
    expect(res.status).toBe(422)
    expect(res.body.results[0].status).toBe('REJECTED')
    const errors = res.body.results[0].errors || []
    expect(errors.some((e) => e.field === 'currency')).toBe(true)
  })

  it('mode 1 — Σdebit ≠ Σcredit → 422', async () => {
    const payload = {
      externalId: 'ARROW-UNBAL-1',
      type: 'ADJUSTMENT',
      date: '2026-03-15T10:00:00Z',
      journalCode: 'OD',
      lines: [
        { accountCode: '512000', debit: 100, credit: 0 },
        { accountCode: '758000', debit: 0, credit: 50 },
      ],
    }
    const res = await postSignedEntries(SOURCE_SLUG, payload)
    expect(res.status).toBe(422)
    expect(res.body.results[0].status).toBe('REJECTED')
  })
})

describe('Batch ingestion', () => {
  it('batch de 3 entries dont 1 invalide → 207 avec summary correcte', async () => {
    const entries = [
      // OK
      { externalId: 'B-1', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100, vatRate: 20 },
      // INVALIDE (currency)
      { externalId: 'B-2', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 100, currency: 'USD' },
      // OK
      { externalId: 'B-3', type: 'SALE', date: '2026-03-15T10:00:00Z', amount: 200, vatRate: 20 },
    ]
    const res = await postSignedEntries(SOURCE_SLUG, { entries })
    expect(res.status).toBe(207)
    expect(res.body.results).toHaveLength(3)
    expect(res.body.summary.posted).toBe(2)
    expect(res.body.summary.rejected).toBe(1)
  })
})

describe('Ping (public)', () => {
  it('GET /:slug/ping sans headers → 200', async () => {
    const res = await request(app).get(`/api/external/${SOURCE_SLUG}/ping`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.slug).toBe(SOURCE_SLUG)
    expect(typeof res.body.serverTime).toBe('string')
  })
})
