import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'

let app: Express

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: '  Ana  ',
    lastName: ' Dupont ',
    email: 'ANA.DUPONT@EXAMPLE.TEST ',
    company: '  Atelier Venio ',
    subject: 'Site web',
    message: 'Bonjour,\r\n  je souhaite échanger sur mon projet. ',
    consent: true,
    website: '',
    startedAt: Date.now() - 2_000,
    ...overrides,
  }
}

beforeAll(async () => {
  await setupMongo()
  const { default: contactRoutes } = await import('../routes/public/contact.js')
  app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/api/contact', contactRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

describe('POST /api/contact', () => {
  it('normalise la demande, crée une trace CRM exploitable et confirme sans exposer de détail interne', async () => {
    const response = await request(app).post('/api/contact').set('X-Forwarded-For', '198.51.100.10').send(validBody())

    expect(response.status).toBe(202)
    expect(response.body).toEqual({
      ok: true,
      message: 'Merci, votre message a bien été reçu. Nous vous répondrons sous 48 h ouvrées.',
    })

    const lead = await Lead.findOne({ contactEmail: 'ana.dupont@example.test' }).lean()
    expect(lead).toMatchObject({
      contactName: 'Ana Dupont',
      company: 'Atelier Venio',
      source: 'FORMULAIRE_SITE',
      serviceType: 'Site web',
      createdBy: null,
    })

    const activity = await LeadActivity.findOne({ leadId: lead!._id }).lean()
    expect(activity).toMatchObject({
      type: 'CONTACT_FORM_SUBMITTED',
      label: 'Nouveau contact reçu depuis le site',
      payload: {
        source: 'FORMULAIRE_SITE',
        subject: 'Site web',
        message: 'Bonjour,\n  je souhaite échanger sur mon projet.',
        consent: true,
      },
    })
    expect(activity?.payload).not.toHaveProperty('ip')
    expect(activity?.payload).not.toHaveProperty('userAgent')
  })

  it('exige le consentement avant toute écriture CRM', async () => {
    const response = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.11')
      .send(validBody({ consent: false }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      ok: false,
      message: 'Votre demande ne peut pas être envoyée. Vérifiez les champs.',
    })
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('absorbe silencieusement le honeypot et les soumissions trop rapides', async () => {
    const honeypot = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.12')
      .send(validBody({ website: 'https://spam.example' }))
    const tooFast = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.13')
      .send(validBody({ startedAt: Date.now() }))

    expect(honeypot.status).toBe(202)
    expect(honeypot.body.ok).toBe(true)
    expect(tooFast.status).toBe(400)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('accepte un téléphone normalisé, s’en passe, et refuse un numéro hors gabarit', async () => {
    const withPhone = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.20')
      .send(
        validBody({
          email: 'rappel@example.test',
          phone: '  06 12  34   56 78 ',
          subject: 'Demande de rappel',
          message: 'Demande de rappel.',
        }),
      )

    expect(withPhone.status).toBe(202)
    expect(await Lead.findOne({ contactEmail: 'rappel@example.test' }).lean()).toMatchObject({
      contactPhone: '06 12 34 56 78',
      serviceType: 'Demande de rappel',
    })

    const withoutPhone = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.21')
      .send(validBody({ email: 'sans-phone@example.test' }))

    expect(withoutPhone.status).toBe(202)
    expect(await Lead.findOne({ contactEmail: 'sans-phone@example.test' }).lean()).toMatchObject({ contactPhone: '' })

    const tooLong = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.22')
      .send(validBody({ email: 'trop-long@example.test', phone: '0'.repeat(41) }))

    expect(tooLong.status).toBe(400)
    expect(await Lead.countDocuments({ contactEmail: 'trop-long@example.test' })).toBe(0)
  })

  it('stocke un relevé de qualification validé, lisible dans le lead et l’activité CRM', async () => {
    const response = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.30')
      .send(
        validBody({
          email: 'quali@example.test',
          lastName: '',
          subject: '',
          message: '',
          qualification: {
            need: ['site', 'com', 'site'],
            formule: 'business',
            pain: ['pub'],
            activite: '  Cabinet   d’avocats ',
            taille: '2-10',
            quand: '3m',
            budget: 'b2',
            decide: 'associes',
            reponse: 'appel',
            siteUrl: 'https://exemple.test',
          },
        }),
      )

    expect(response.status).toBe(202)
    const lead = await Lead.findOne({ contactEmail: 'quali@example.test' }).lean()
    expect(lead?.contactName).toBe('Ana')
    expect(lead?.serviceType).toContain('Un nouveau site, Mieux communiquer')
    expect(lead?.notes).toContain('Besoin : Un nouveau site, Mieux communiquer')
    expect(lead?.notes).toContain('Budget : 3 000 à 8 000 €')
    expect(lead?.notes).toContain('Activité : Cabinet d’avocats')

    const activity = await LeadActivity.findOne({ leadId: lead!._id }).lean()
    expect(activity?.payload).toMatchObject({
      qualification: { need: ['site', 'com'], formule: 'business', budget: 'b2', reponse: 'appel' },
    })
    expect((activity?.payload as { qualificationSummary: string[] }).qualificationSummary).toContain(
      'Formule de site : Business',
    )
  })

  it('refuse un relevé hors liste blanche, avec clé inconnue ou trop long', async () => {
    const send = (qualification: unknown, n: number) =>
      request(app)
        .post('/api/contact')
        .set('X-Forwarded-For', `198.51.100.4${n}`)
        .send(validBody({ email: `bad${n}@example.test`, qualification }))

    expect((await send({ need: ['nimporte'] }, 0)).status).toBe(400)
    expect((await send({ need: [] }, 1)).status).toBe(400)
    expect((await send({ need: ['site'], extra: 'x' }, 2)).status).toBe(400)
    expect((await send({ need: ['site'], budget: 'b9' }, 3)).status).toBe(400)
    expect((await send({ need: ['site'], flou: 'x'.repeat(1001) }, 4)).status).toBe(400)
    expect((await send({ need: ['site'], siteUrl: 'javascript:alert(1)' }, 5)).status).toBe(400)
    expect((await send('site', 6)).status).toBe(400)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('reste rétrocompatible : le message reste obligatoire sans relevé', async () => {
    const response = await request(app)
      .post('/api/contact')
      .set('X-Forwarded-For', '198.51.100.31')
      .send(validBody({ message: '' }))
    expect(response.status).toBe(400)
  })

  it('limite les tentatives répétées par adresse IP', async () => {
    const ip = '198.51.100.14'
    for (let index = 0; index < 5; index += 1) {
      const response = await request(app).post('/api/contact').set('X-Forwarded-For', ip).send(validBody())
      expect(response.status).toBe(202)
    }

    const limited = await request(app).post('/api/contact').set('X-Forwarded-For', ip).send(validBody())
    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({ ok: false, message: 'Merci de patienter quelques minutes avant de réessayer.' })
  })
})
