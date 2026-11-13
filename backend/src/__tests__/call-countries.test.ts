import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import twilio from 'twilio'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import telephonyRoutes from '../routes/telephony/index.js'
import { importCallLeads } from '../lib/callImports.js'
import type { CallCountryRule as CountryRule } from '../lib/telephony/countries.js'
import { addPhoneSuppression } from '../lib/callGuards.js'
import { createBridgeCall, hangupProviderCall, placeCodeCall } from '../lib/telephony/rest.js'
import Call from '../models/Call.js'
import CallerProfile from '../models/CallerProfile.js'
import Lead from '../models/Lead.js'
import Interaction from '../models/Interaction.js'
import LeadActivity from '../models/LeadActivity.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'

/** Lot P, multi-pays : une garde par cas (pays, fuseau, fenêtre de 14 jours, non-professionnel, mode pont). */

vi.mock('../lib/notifyHelpers.js', () => ({ notifyUsers: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/telephony/rest.js', () => ({
  hangupProviderCall: vi.fn().mockResolvedValue(undefined),
  createBridgeCall: vi.fn().mockResolvedValue('CAbridge1'),
  placeCodeCall: vi.fn().mockResolvedValue(undefined),
}))

const PUBLIC_URL = 'https://venio.test'
const AUTH_TOKEN = 'test-auth-token'
const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_API_KEY_SID: 'SKtest',
  TWILIO_API_KEY_SECRET: 'test-api-secret',
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_TWIML_APP_SID: 'APtest',
  TWILIO_CALLER_ID: '+33180000000',
  TELEPHONY_PUBLIC_URL: PUBLIC_URL,
}
// Mardi 10 h à Paris (9 h à Lisbonne et aux Canaries, 4 h à New York).
const TUESDAY_10H = new Date('2026-11-10T09:00:00Z')

const app = express()
app.use('/api/telephony', telephonyRoutes)
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message, code: err.code })
})

let rep: string
let cookie: string
const get = (path: string) => request(app).get(`/api/commercial${path}`).set('Cookie', cookie)
const post = (path: string, body: object = {}) =>
  request(app).post(`/api/commercial${path}`).set('Cookie', cookie).send(body)
const lead = (company: string, contactPhone: string, extra: object = {}) =>
  Lead.create({ company, businessContact: true, externalRep: rep, contactPhone, ...extra })
const launch = (leadId: unknown, extra: object = {}) =>
  post(`/leads/${leadId}/calls`, { clientRequestId: crypto.randomUUID(), ...extra })
const twilioPost = (path: string, params: Record<string, string>) =>
  request(app)
    .post(`/api/telephony/twilio${path}`)
    .type('form')
    .set(
      'X-Twilio-Signature',
      twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}/api/telephony/twilio${path}`, params),
    )
    .send(params)
const voice = (callId: string, callSid: string) =>
  twilioPost('/voice', { CallSid: callSid, From: `client:u_${rep}`, To: '', callId })
const queueCheck = async (company: string) =>
  (await get('/calls/queue')).body.leads.find((item: { company: string }) => item.company === company)?.callCheck
const openCountries = async (codes: string[], defaultCallerId = true) => {
  const telephony = (await CrmSettings.getSettings()).toObject().telephony
  await CrmSettings.updateSettings({
    telephony: {
      ...telephony,
      countries: telephony.countries!.map((rule: CountryRule) =>
        codes.includes(rule.code) ? { ...rule, enabled: true, defaultCallerId } : rule,
      ),
    },
  } as never)
}

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all(
    [Lead, Call, CallerProfile, Interaction, LeadActivity, SuppressionEntry, CrmSettings, UserIdempotencyKey].map(
      (model) => (model as typeof Lead).init(),
    ),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TUESDAY_10H })
  Object.assign(process.env, TWILIO_ENV)
  vi.clearAllMocks()
  await clearDb()
  const user = await User.create({
    name: 'Anna',
    email: 'anna@pays.test',
    passwordHash: 'x',
    role: 'COMMERCIAL_EXTERNE',
  })
  rep = String(user._id)
  cookie = `venio_session=${(await createSession(rep)).token}`
})
afterEach(() => {
  vi.useRealTimers()
  for (const key of [...Object.keys(TWILIO_ENV), 'TWILIO_CALLER_ID_GB']) delete process.env[key]
})

it('pays non autorisé : refusé au lancement, signalé dans la file, rejeté à l’import ; numéro présenté par pays', async () => {
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) // 16 h à Paris, 15 h à Londres, 10 h à New York
  const [newYork, london, brussels] = await Promise.all([
    lead('NY', '+12125550123'),
    lead('Londres', '+442071234567'),
    lead('Bruxelles', '+3225550123'),
  ])
  expect(newYork.phoneCountry).toBe('US')
  expect((await launch(newYork._id)).body.code).toBe('COUNTRY_NOT_ALLOWED')
  expect(await queueCheck('NY')).toEqual({
    country: 'US',
    timeZones: ['America/New_York'],
    block: 'COUNTRY_NOT_ALLOWED',
  })
  const report = await importCallLeads({
    externalRep: rep,
    businessContact: true,
    leads: [
      { company: 'Boston', contactPhone: '+16175550123' },
      { company: 'Liège', contactPhone: '+3242123456' },
    ],
  })
  expect(report).toMatchObject({ created: 1, rejected: 1, errors: [{ row: 1, reason: 'COUNTRY_NOT_ALLOWED' }] })

  // UE : le numéro par défaut est présenté.
  const be = await launch(brussels._id)
  expect(be.status).toBe(201)
  expect((await Call.findById(be.body.callId).lean())!.from).toBe('+33180000000')
  await post(`/calls/${be.body.callId}/hangup`)

  // Royaume-Uni ouvert sans numéro par défaut : refusé faute de numéro propre, puis le sien est présenté.
  await openCountries(['GB'], false)
  expect((await launch(london._id)).body.code).toBe('NO_CALLER_ID')
  process.env.TWILIO_CALLER_ID_GB = '+442080000000'
  const gb = await launch(london._id)
  expect(gb.status).toBe(201)
  expect((await Call.findById(gb.body.callId).lean())!.from).toBe('+442080000000')
})

it('plage dans le fuseau du prospect : chaque fuseau possible doit y être, fuseau inconnu refusé', async () => {
  await openCountries(['US'])
  const [paris, lisbon, canaryFixed, spanishMobile, tollFree] = await Promise.all([
    lead('Paris', '+33612345678'),
    lead('Lisbonne', '+351213456789'),
    lead('Canaries', '+34922123456'),
    lead('Mobile espagnol', '+34612345678'),
    lead('Numéro vert', '+18005550123'),
  ])
  // 9 h 30 à Paris et Madrid, 8 h 30 à Lisbonne et aux Canaries.
  vi.setSystemTime(new Date('2026-11-10T08:30:00Z'))
  const parisCall = await launch(paris._id)
  expect(parisCall.status).toBe(201)
  await post(`/calls/${parisCall.body.callId}/hangup`)
  expect((await launch(lisbon._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  expect((await launch(canaryFixed._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  // Un mobile espagnol peut être aux Canaries : il attend que les deux fuseaux soient dans la plage.
  expect((await launch(spanishMobile._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  expect(await queueCheck('Mobile espagnol')).toMatchObject({
    country: 'ES',
    timeZones: ['Europe/Madrid', 'Atlantic/Canary'],
    block: 'OUTSIDE_CALLING_HOURS',
  })
  expect((await launch(tollFree._id)).body.code).toBe('TIMEZONE_UNKNOWN')
  // 18 h 15 à Paris et à Madrid, 17 h 15 aux Canaries : le mobile espagnol passe, Paris aussi ; 18 h 45 à Paris : non.
  vi.setSystemTime(new Date('2026-11-10T17:15:00Z'))
  expect((await launch(spanishMobile._id)).status).toBe(201)
  vi.setSystemTime(new Date('2026-11-10T17:45:00Z'))
  expect((await launch(paris._id)).body.code).toBe('OUTSIDE_CALLING_HOURS')
  // Le soir à Paris est encore la plage à Lisbonne (17 h 45).
  await Call.updateMany({}, { $set: { status: 'CANCELED' } })
  expect((await launch(lisbon._id)).status).toBe(201)
})

it('6 tentatives sur 14 jours puis « non joignable » ; une fiche déjà jointe reste joignable', async () => {
  const [silent, reached] = await Promise.all([lead('Muet', '+33611111111'), lead('Joint', '+33622222222')])
  const day = (offset: number) => new Date(TUESDAY_10H.getTime() + offset * 86_400_000)
  // Mar., mer., jeu. : deux tentatives par jour (plafond quotidien), la sixième consignée sans réponse.
  for (const offset of [0, 1, 2]) {
    vi.setSystemTime(day(offset))
    for (const attempt of [1, 2]) {
      for (const item of [silent, reached]) {
        const res = await launch(item._id)
        expect(res.status, `${item.company} j${offset} n°${attempt}`).toBe(201)
        await post(`/calls/${res.body.callId}/hangup`)
        if (item === reached && offset === 0 && attempt === 1)
          await Call.updateOne({ _id: res.body.callId }, { $set: { answeredAt: new Date(), answeredBy: 'HUMAN' } })
        if (item === silent && offset === 2 && attempt === 2) {
          const logged = await post(`/leads/${silent._id}/quick-call`, {
            clientRequestId: crypto.randomUUID(),
            outcome: 'NO_ANSWER',
            scriptTag: 'DEFAULT',
            callId: res.body.callId,
          })
          expect(logged.status).toBe(201)
        }
      }
    }
    if (offset === 0) expect((await launch(silent._id)).body.code).toBe('ATTEMPT_CAP_REACHED')
  }
  // La sixième tentative consignée sans réponse a posé « non joignable » : la fiche quitte la file.
  expect((await Lead.findById(silent._id).lean())!.callUnreachableAt).toBeTruthy()
  vi.setSystemTime(day(6)) // lundi suivant
  expect((await launch(silent._id)).body.code).toBe('LEAD_UNREACHABLE')
  const queue = (await get('/calls/queue')).body.leads.map((item: { company: string }) => item.company)
  expect(queue).toEqual(['Joint'])
  // Déjà jointe une fois : refusée au plafond de la fenêtre, mais jamais « non joignable ».
  expect((await launch(reached._id)).body.code).toBe('ATTEMPT_WINDOW_REACHED')
  expect((await Lead.findById(reached._id).lean())!.callUnreachableAt).toBeNull()
  // La fenêtre glisse : quinze jours après la première tentative, l'appel repart.
  vi.setSystemTime(day(15))
  cookie = `venio_session=${(await createSession(rep)).token}`
  expect((await launch(reached._id)).status).toBe(201)
  // Un autre numéro lève « non joignable ».
  await Lead.updateOne({ _id: silent._id }, { $set: { contactPhone: '+33633333333' } })
  expect((await Lead.findById(silent._id).lean())!.callUnreachableAt).toBeNull()
})

it('contact professionnel obligatoire : fiche express, import, appel et file', async () => {
  const express = (body: object) =>
    request(app)
      .post('/api/commercial/leads')
      .set('Cookie', cookie)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ company: 'Express', contactPhone: '+33644444444', ...body })
  expect((await express({})).status).toBe(400)
  expect((await express({ businessContact: 'true' })).status).toBe(400)
  const pro = await express({ businessContact: true })
  expect(pro.status).toBe(201)
  expect(pro.body.lead).toMatchObject({ businessContact: true, phoneCountry: 'FR' })
  await expect(
    importCallLeads({ externalRep: rep, leads: [{ company: 'X', contactPhone: '+33655555555' }] }),
  ).rejects.toMatchObject({ status: 400, code: 'BUSINESS_CONTACT_REQUIRED' })

  const unconfirmed = await lead('Particulier ?', '+33666666666', { businessContact: false })
  expect((await launch(unconfirmed._id)).body.code).toBe('NOT_BUSINESS_CONTACT')
  expect(await queueCheck('Particulier ?')).toMatchObject({ block: 'NOT_BUSINESS_CONTACT' })
  // Le commercial confirme sur la fiche : la fiche devient appelable.
  const confirmed = await request(app)
    .patch(`/api/commercial/leads/${unconfirmed._id}`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', crypto.randomUUID())
    .send({ businessContact: true })
  expect(confirmed.body.lead.businessContact).toBe(true)
  expect((await launch(unconfirmed._id)).status).toBe(201)
})

it('mode pont : portable vérifié, confirmation par 1, mêmes gardes, rien du navigateur', async () => {
  const prospect = await lead('Alpha', '+33612345678')
  // Audio conservé : l'enregistrement et l'annonce sont actifs sans transcription configurée.
  const settings = await CrmSettings.getSettings()
  await CrmSettings.updateSettings({
    callRecording: { ...settings.toObject().callRecording, keepAudioDays: 30 },
  } as never)
  // Activer sans portable vérifié : refusé.
  expect(
    (await request(app).patch('/api/commercial/calls/bridge').set('Cookie', cookie).send({ enabled: true })).body.code,
  ).toBe('BRIDGE_NOT_VERIFIED')
  expect((await post('/calls/bridge/code', { phone: '06 98 76 54 32' })).status).toBe(202)
  const spoken = vi.mocked(placeCodeCall).mock.calls[0]![1]
  expect(spoken.to).toBe('+33698765432')
  const code = /code Venio est : ([\d, ]+)\./.exec(spoken.twiml)![1]!.replace(/\D/g, '')
  expect((await post('/calls/bridge/verify', { code: code === '000000' ? '111111' : '000000' })).body.code).toBe(
    'INVALID_CODE',
  )
  expect((await post('/calls/bridge/verify', { code })).body.bridge).toEqual({
    enabled: false,
    phone: '+33698765432',
    verified: true,
  })
  // Trois codes par heure au plus.
  await post('/calls/bridge/code', { phone: '0698765432' })
  await post('/calls/bridge/code', { phone: '0698765432' })
  expect((await post('/calls/bridge/code', { phone: '0698765432' })).body.code).toBe('CODE_RATE_LIMITED')
  await request(app).patch('/api/commercial/calls/bridge').set('Cookie', cookie).send({ enabled: true }).expect(200)
  expect((await get('/calls/config')).body.bridge).toEqual({ active: true })

  // Le serveur choisit le pont ; le power dialer n'y a pas droit.
  expect((await launch(prospect._id, { mode: 'power' })).body.code).toBe('BRIDGE_CLICK_ONLY')
  const first = await launch(prospect._id)
  expect(first.body.via).toBe('BRIDGE')
  const callId = String(first.body.callId)
  expect(vi.mocked(createBridgeCall).mock.calls[0]![1]).toMatchObject({
    to: '+33698765432',
    url: `${PUBLIC_URL}/api/telephony/twilio/bridge?callId=${callId}`,
  })
  // Le navigateur ne peut pas relier un appel en mode pont ; une autre branche que le portable non plus.
  expect((await voice(callId, 'CAbrowser')).text).not.toContain('<Dial')
  const stranger = (await twilioPost(`/bridge?callId=${callId}`, { CallSid: 'CAbridge1', To: '+33600000000' })).text
  expect(stranger).toContain('<Hangup')
  expect(stranger).not.toContain('<Gather')
  const otherLeg = (await twilioPost(`/bridge?callId=${callId}`, { CallSid: 'CAother', To: '+33698765432' })).text
  expect(otherLeg).not.toContain('<Gather')
  const gather = (await twilioPost(`/bridge?callId=${callId}`, { CallSid: 'CAbridge1', To: '+33698765432' })).text
  expect(gather).toContain('<Gather')
  expect(gather).not.toContain('+33612345678')
  // Répondeur du commercial (aucune touche) ou autre touche : rien ne part vers le prospect.
  const refused = await twilioPost(`/bridge/confirm?callId=${callId}`, {
    CallSid: 'CAbridge1',
    To: '+33698765432',
    Digits: '2',
  })
  expect(refused.text).not.toContain('<Dial')
  expect((await Call.findById(callId).lean())!.status).toBe('CANCELED')

  // Deuxième appel : confirmé par 1, il compose le prospect avec l'enregistrement et l'annonce habituels.
  vi.mocked(createBridgeCall).mockResolvedValueOnce('CAbridge2')
  const second = String((await launch(prospect._id)).body.callId)
  const dial = (
    await twilioPost(`/bridge/confirm?callId=${second}`, { CallSid: 'CAbridge2', To: '+33698765432', Digits: '1' })
  ).text
  expect(dial).toContain('<Number')
  expect(dial).toContain('+33612345678')
  expect(dial).toContain('callerId="+33180000000"')
  expect(dial).toContain('record-from-answer-dual')
  expect(dial).toContain(`/api/telephony/twilio/notice?callId=${second}`)
  expect((await Call.findById(second).lean())!.providerCallSid).toBe('CAbridge2')
})

it('mode pont : la garde repassée à la décroche refuse un numéro opposé entre-temps ; raccrocher coupe le portable', async () => {
  const prospect = await lead('Alpha', '+33612345678')
  await CallerProfile.create({ _id: rep, bridge: { enabled: true, phone: '+33698765432', verifiedAt: new Date() } })
  const callId = String((await launch(prospect._id)).body.callId)
  await addPhoneSuppression('+33612345678', { reason: 'OPPOSITION', createdBy: rep, leadId: prospect._id })
  const res = await twilioPost(`/bridge/confirm?callId=${callId}`, {
    CallSid: 'CAbridge1',
    To: '+33698765432',
    Digits: '1',
  })
  expect(res.text).not.toContain('<Dial')
  expect((await Call.findById(callId).lean())!.events.at(-1)!.status).toBe('REJECTED:PHONE_SUPPRESSED')

  await SuppressionEntry.deleteMany({})
  const next = String((await launch(prospect._id)).body.callId)
  await post(`/calls/${next}/hangup`)
  expect(hangupProviderCall).toHaveBeenCalledWith(expect.anything(), 'CAbridge1')
  // Sans réponse du portable : l'appel jamais relié est annulé (le lendemain, plafond quotidien oblige).
  vi.setSystemTime(new Date(TUESDAY_10H.getTime() + 86_400_000))
  const third = String((await launch(prospect._id)).body.callId)
  await Call.updateOne({ _id: third }, { $set: { bridgeCallSid: 'CAbridge3' } })
  await twilioPost(`/bridge/status?callId=${third}`, { CallSid: 'CAbridge3', CallStatus: 'no-answer' })
  expect((await Call.findById(third).lean())!.status).toBe('CANCELED')
})
