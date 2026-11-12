import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

/**
 * Séquences d'e-mails du CRM (lot 5) : calendrier (jours ouvrés, heure de
 * Paris), inscription et refus, moteur (idempotence en concurrence, verrou
 * orphelin, échecs d'envoi), blocage « ne pas contacter » au moment d'envoyer,
 * arrêts automatiques (réponse, statut, désinscription, anonymisation).
 */

const mail = vi.hoisted(() => ({ calls: [] as Array<Record<string, any>>, fail: false, delayMs: 0 }))
vi.mock('../lib/email/send.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendBulkEmail: vi.fn(async (input: { recipients: Array<{ email: string; name?: string }> }) => {
    if (mail.delayMs) await new Promise((r) => setTimeout(r, mail.delayMs))
    mail.calls.push(input)
    const results = input.recipients.map((r) => ({
      email: r.email,
      name: r.name ?? '',
      success: !mail.fail,
      ...(mail.fail ? { error: 'SMTP down' } : {}),
    }))
    return {
      results,
      sent: mail.fail ? 0 : results.length,
      failed: mail.fail ? results.length : 0,
      total: results.length,
    }
  }),
}))
vi.mock('../lib/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNotification: vi.fn(async () => null),
}))

let Lead: typeof import('../models/Lead.js').default
let User: typeof import('../models/User.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let Interaction: typeof import('../models/Interaction.js').default
let PersonalTask: typeof import('../models/PersonalTask.js').default
let SuppressionEntry: typeof import('../models/SuppressionEntry.js').default
let CrmSettings: typeof import('../models/CrmSettings.js').default
let CrmSequence: typeof import('../models/CrmSequence.js').default
let Enrollment: typeof import('../models/CrmSequenceEnrollment.js').default
let seq: typeof import('../lib/crmSequences.js')
let service: typeof import('../lib/crmLeadService.js')
let privacy: typeof import('../lib/crmPrivacy.js')
let interactions: typeof import('../lib/interactions.js')
let locks: typeof import('../models/SchedulerLock.js')
let ownerId: string

// Novembre 2026 : Paris = UTC+1. Le 6 est un vendredi, le 9 un lundi.
const MON_10H = new Date('2026-11-09T09:00:00Z')
const SAT_10H = new Date('2026-11-07T09:00:00Z')

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  User = (await import('../models/User.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  Interaction = (await import('../models/Interaction.js')).default
  PersonalTask = (await import('../models/PersonalTask.js')).default
  SuppressionEntry = (await import('../models/SuppressionEntry.js')).default
  CrmSettings = (await import('../models/CrmSettings.js')).default
  CrmSequence = (await import('../models/CrmSequence.js')).default
  Enrollment = (await import('../models/CrmSequenceEnrollment.js')).default
  seq = await import('../lib/crmSequences.js')
  service = await import('../lib/crmLeadService.js')
  privacy = await import('../lib/crmPrivacy.js')
  interactions = await import('../lib/interactions.js')
  locks = await import('../models/SchedulerLock.js')
  await Enrollment.createIndexes()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  mail.calls.length = 0
  mail.fail = false
  mail.delayMs = 0
  await CrmSettings.create({
    roundRobinEnabled: false,
    emailOnAssignment: false,
    activityLogging: true,
    scoringEnabled: false,
    autoQualifyEnabled: false,
  })
  const owner = await User.create({
    email: 'owner@seq.test',
    name: 'Olivia Owner',
    role: 'COMMERCIAL',
    passwordHash: 'x',
  })
  ownerId = String(owner._id)
})

const newLead = (extra: Record<string, unknown> = {}) =>
  Lead.create({
    company: 'Atelier',
    contactName: 'Camille',
    contactEmail: 'camille@atelier.test',
    status: 'CONTACTED',
    assignedTo: ownerId,
    createdBy: ownerId,
    ...extra,
  })

const emailStep = (extra: Record<string, unknown> = {}) => ({
  type: 'EMAIL',
  delayDays: 0,
  sendHourParis: 9,
  subject: 'Bonjour {contact}',
  body: 'Bonjour {contact}, ici {owner} pour {company}.',
  ...extra,
})

const newSequence = (extra: Record<string, unknown> = {}) =>
  CrmSequence.create({
    name: 'Prospection',
    status: 'ACTIVE',
    steps: [
      emailStep(),
      { type: 'TASK', delayDays: 2, sendHourParis: 9, taskTitle: 'Appeler {contact}' },
      emailStep({ delayDays: 1, subject: 'Relance' }),
    ],
    ...extra,
  })

const enroll = async (sequence: any, lead: any, now = MON_10H) => {
  const res = await seq.enrollLeads(sequence, [String(lead._id)], { actorId: ownerId, now })
  expect(res.refused).toEqual([])
  return Enrollment.findById(res.enrolled[0].enrollmentId)
}

const waitFor = async (check: () => Promise<boolean>, ms = 2000) => {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

describe('calendrier : jours ouvrés et heure de Paris', () => {
  it('reporte un week-end au lundi, à l’heure de Paris', () => {
    // Vendredi 16:00 Paris + 1 jour = samedi → lundi 09:00 Paris (08:00 UTC en hiver).
    expect(seq.computeNextRunAt(new Date('2026-11-06T15:00:00Z'), 1, 9).toISOString()).toBe('2026-11-09T08:00:00.000Z')
    // Vendredi 21:00 Paris, délai nul : hors plage → lundi.
    expect(seq.computeNextRunAt(new Date('2026-11-06T20:00:00Z'), 0, 9).toISOString()).toBe('2026-11-09T08:00:00.000Z')
  })

  it('délai nul : à l’heure prévue si elle est à venir, tout de suite si elle est passée dans la plage', () => {
    expect(seq.computeNextRunAt(new Date('2026-11-10T06:00:00Z'), 0, 9).toISOString()).toBe('2026-11-10T08:00:00.000Z')
    const afternoon = new Date('2026-11-10T13:00:00Z')
    expect(seq.computeNextRunAt(afternoon, 0, 9).getTime()).toBe(afternoon.getTime())
  })

  it('suit l’heure d’été et borne l’heure à 8–19', () => {
    expect(seq.computeNextRunAt(new Date('2026-06-30T10:00:00Z'), 1, 9).toISOString()).toBe('2026-07-01T07:00:00.000Z')
    expect(seq.computeNextRunAt(new Date('2026-06-30T10:00:00Z'), 1, 23).toISOString()).toBe('2026-07-01T17:00:00.000Z')
    expect(seq.clampSendHour(3)).toBe(8)
  })

  it('plage d’exécution : jours ouvrés, 08:00–20:00 Paris', () => {
    expect(seq.isInSendWindow(SAT_10H)).toBe(false)
    expect(seq.isInSendWindow(new Date('2026-11-09T06:30:00Z'))).toBe(false)
    expect(seq.isInSendWindow(new Date('2026-11-09T18:59:00Z'))).toBe(true)
    expect(seq.isInSendWindow(new Date('2026-11-09T19:00:00Z'))).toBe(false)
  })
})

describe('modèles de texte', () => {
  it('remplace {contact}, {company}, {owner}, {amount} en un seul passage', () => {
    const out = seq.renderSequenceTemplate(
      '{contact} / {company} / {owner} / {amount} / {inconnu}',
      { contactName: '{company}', company: 'ACME', budget: 1200 },
      'Olivia',
    )
    expect(out).toBe('{company} / ACME / Olivia / 1200 € / {inconnu}')
  })

  it('valide les étapes', () => {
    const bad = seq.normalizeSequencePayload(
      {
        name: 'X',
        steps: [
          { type: 'EMAIL', subject: '', body: '' },
          { type: 'TASK' },
          { type: 'WAIT', sendHourParis: 22 },
          { type: 'SMS' },
        ],
      },
      { creating: true },
    )
    expect(bad.errors).toHaveLength(4)
    const good = seq.normalizeSequencePayload(
      { name: ' Y ', steps: [{ type: 'WAIT', delayDays: 3 }], stopOn: { reply: false, statuses: ['LOST', 'XX'] } },
      { creating: true },
    )
    expect(good.errors).toEqual([])
    expect(good.data).toMatchObject({
      name: 'Y',
      steps: [{ type: 'WAIT', delayDays: 3, sendHourParis: 9 }],
      stopOn: { reply: false, statusChange: true, statuses: ['LOST'] },
    })
  })
})

describe('inscription', () => {
  it('refuse avec une raison par lead', async () => {
    const sequence = await newSequence({ entity: 'VENIO' })
    const ok = await newLead()
    const dnc = await newLead({ doNotContact: true })
    const suppressed = await newLead({ contactEmail: 'gone@atelier.test' })
    await SuppressionEntry.create({ emailNormalized: 'gone@atelier.test', reason: 'MANUAL' })
    const anonymized = await newLead({ anonymizedAt: new Date() })
    const noEmail = await newLead({ contactEmail: '' })
    const won = await newLead({ status: 'WON' })
    const lost = await newLead({ status: 'LOST' })
    const archived = await newLead({ archivedAt: new Date() })
    const arrow = await newLead({ entity: 'ARROW' })
    const missing = '0123456789abcdef01234567'
    const ids = [ok, dnc, suppressed, anonymized, noEmail, won, lost, archived, arrow].map((l) => String(l._id))
    const res = await seq.enrollLeads(sequence, [...ids, missing], { actorId: ownerId, now: MON_10H })
    expect(res.enrolled.map((e) => e.leadId)).toEqual([String(ok._id)])
    expect(Object.fromEntries(res.refused.map((r) => [r.leadId, r.reason]))).toEqual({
      [String(dnc._id)]: 'DO_NOT_CONTACT',
      [String(suppressed._id)]: 'SUPPRESSED',
      [String(anonymized._id)]: 'ANONYMIZED',
      [String(noEmail._id)]: 'NO_EMAIL',
      [String(won._id)]: 'CLOSED',
      [String(lost._id)]: 'CLOSED',
      [String(archived._id)]: 'ARCHIVED',
      [String(arrow._id)]: 'ENTITY_MISMATCH',
      [missing]: 'NOT_FOUND',
    })
    expect(await LeadActivity.countDocuments({ leadId: ok._id, type: 'SEQUENCE_ENROLLED' })).toBe(1)
  })

  it('une séquence sans e-mail accepte un lead sans adresse', async () => {
    const sequence = await newSequence({
      steps: [{ type: 'TASK', delayDays: 0, sendHourParis: 9, taskTitle: 'Appeler' }],
    })
    const lead = await newLead({ contactEmail: '' })
    const res = await seq.enrollLeads(sequence, [String(lead._id)], { actorId: ownerId, now: MON_10H })
    expect(res.enrolled).toHaveLength(1)
  })

  it('une seule inscription ouverte par séquence et lead, même en concurrence ; réinscription après arrêt', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const [a, b] = await Promise.all([
      seq.enrollLeads(sequence, [String(lead._id)], { actorId: ownerId, now: MON_10H }),
      seq.enrollLeads(sequence, [String(lead._id)], { actorId: ownerId, now: MON_10H }),
    ])
    expect(a.enrolled.length + b.enrolled.length).toBe(1)
    expect([...a.refused, ...b.refused].map((r) => r.reason)).toEqual(['ALREADY_ENROLLED'])
    const un = await seq.unenrollLeads(sequence, [String(lead._id)], { actorId: ownerId })
    expect(un.stopped).toEqual([String(lead._id)])
    const again = await seq.enrollLeads(sequence, [String(lead._id)], { actorId: ownerId, now: MON_10H })
    expect(again.enrolled).toHaveLength(1)
    expect(await Enrollment.countDocuments({ lead: lead._id })).toBe(2)
    expect((await Enrollment.findOne({ lead: lead._id, status: 'STOPPED' }))!.stoppedReason).toBe('MANUAL')
  })

  it('le périmètre d’écriture rend NOT_FOUND', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const res = await seq.enrollLeads(sequence, [String(lead._id)], {
      actorId: ownerId,
      scope: { assignedTo: '0123456789abcdef01234567' },
    })
    expect(res.refused).toEqual([{ leadId: String(lead._id), reason: 'NOT_FOUND' }])
  })
})

describe('moteur', () => {
  it('deux passages concurrents : un seul envoi, puis tâche, puis relance et fin', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    expect(enrollment!.nextRunAt!.getTime()).toBe(MON_10H.getTime())
    mail.delayMs = 30
    const [a, b] = await Promise.all([seq.runSequenceTick(MON_10H), seq.runSequenceTick(MON_10H)])
    mail.delayMs = 0
    expect(mail.calls).toHaveLength(1)
    expect((a.outcomes.SENT ?? 0) + (b.outcomes.SENT ?? 0)).toBe(1)
    const sent = mail.calls[0]
    expect(sent.subject).toBe('Bonjour Camille')
    expect(sent.body).toBe('Bonjour Camille, ici Olivia Owner pour Atelier.')
    expect(sent.unsubscribeUrl).toMatch(/\/api\/public\/unsubscribe\?token=/)
    await waitFor(async () => (await Interaction.countDocuments({ subjectId: lead._id, direction: 'OUT' })) === 1)
    expect(
      await Interaction.countDocuments({ subjectType: 'LEAD', subjectId: lead._id, kind: 'EMAIL', direction: 'OUT' }),
    ).toBe(1)

    let after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ currentStep: 1, status: 'ACTIVE' })
    // Tâche à J+2 (mercredi 09:00 Paris).
    expect(after!.nextRunAt!.toISOString()).toBe('2026-11-11T08:00:00.000Z')
    // Un troisième passage au même instant ne fait rien.
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(1)

    await seq.runSequenceTick(new Date('2026-11-11T08:00:00Z'))
    const task = await PersonalTask.findOne({ leadId: lead._id }).lean()
    expect(task).toMatchObject({ title: 'Appeler Camille', sequenceId: sequence._id })
    expect(String(task!.userId)).toBe(ownerId)

    await seq.runSequenceTick(new Date('2026-11-12T08:00:00Z'))
    expect(mail.calls).toHaveLength(2)
    after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ status: 'COMPLETED', currentStep: 3, nextRunAt: null })
    expect(after!.openKey).toBeUndefined()
    expect(after!.history.filter((h) => h.status === 'OK').map((h) => h.type)).toEqual(['EMAIL', 'TASK', 'EMAIL'])
    // Le journal de la séquence ne garde pas l'adresse du prospect.
    expect(JSON.stringify(after!.history)).not.toContain('camille@atelier.test')
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'SEQUENCE_COMPLETED' })).toBe(1)
  })

  it('deux instances sur la même inscription au même moment : l’une envoie, l’autre trouve le verrou', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    const [copyA, copyB] = await Promise.all([
      Enrollment.findById(enrollment!._id),
      Enrollment.findById(enrollment!._id),
    ])
    mail.delayMs = 30
    const outcomes = await Promise.all([
      seq.processEnrollment(copyA!, sequence, MON_10H),
      seq.processEnrollment(copyB!, sequence, MON_10H),
    ])
    expect(outcomes.sort()).toEqual(['LOCKED', 'SENT'])
    expect(mail.calls).toHaveLength(1)
    // Redémarrage : l'inscription relue telle qu'avant l'envoi ne rejoue pas l'étape.
    expect(await seq.processEnrollment(copyA!, sequence, MON_10H)).toBe('LOCKED')
    expect(mail.calls).toHaveLength(1)
  })

  it('rien ne part tant que la séquence n’est pas ACTIVE', async () => {
    const sequence = await newSequence({ status: 'DRAFT' })
    const lead = await newLead()
    await enroll(sequence, lead)
    await seq.runSequenceTick(MON_10H)
    await CrmSequence.updateOne({ _id: sequence._id }, { status: 'PAUSED' })
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(0)
    await CrmSequence.updateOne({ _id: sequence._id }, { status: 'ACTIVE' })
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(1)
  })

  it('le week-end, l’étape est reportée au lundi sans rien exécuter', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead, new Date('2026-11-06T10:00:00Z'))
    await Enrollment.updateOne({ _id: enrollment!._id }, { nextRunAt: new Date('2026-11-07T08:00:00Z') })
    const summary = await seq.runSequenceTick(SAT_10H)
    expect(summary.outcomes.RESCHEDULED).toBe(1)
    expect(mail.calls).toHaveLength(0)
    expect((await Enrollment.findById(enrollment!._id))!.nextRunAt!.toISOString()).toBe('2026-11-09T08:00:00.000Z')
  })

  it('automatisation suspendue sur le lead : report d’un jour ouvré', async () => {
    const sequence = await newSequence()
    const lead = await newLead({ automationPausedAt: new Date() })
    const enrollment = await enroll(sequence, lead)
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(0)
    expect((await Enrollment.findById(enrollment!._id))!.nextRunAt!.toISOString()).toBe('2026-11-10T08:00:00.000Z')
  })

  it('un verrou d’étape déjà pris (autre instance, redémarrage) bloque l’envoi', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await locks.acquireSchedulerLock(seq.stepLockKey(enrollment!._id, 0), seq.STEP_LOCK_TTL_MS, MON_10H)
    const summary = await seq.runSequenceTick(MON_10H)
    expect(summary.outcomes.LOCKED).toBe(1)
    expect(mail.calls).toHaveLength(0)
    expect((await Enrollment.findById(enrollment!._id))!.currentStep).toBe(0)
  })

  it('verrou orphelin (instance arrêtée pendant l’étape) : l’étape passe sans être rejouée', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await locks.acquireSchedulerLock(
      seq.stepLockKey(enrollment!._id, 0),
      seq.STEP_LOCK_TTL_MS,
      new Date(MON_10H.getTime() - 60 * 60 * 1000),
    )
    const summary = await seq.runSequenceTick(MON_10H)
    expect(summary.outcomes.SKIPPED_STEP).toBe(1)
    expect(mail.calls).toHaveLength(0)
    const after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ currentStep: 1, status: 'ACTIVE' })
    expect(after!.history.at(-1)).toMatchObject({ status: 'SKIP', type: 'EMAIL' })
  })

  it('envoi refusé par le serveur SMTP : nouvelle tentative une heure plus tard, arrêt au 3e échec', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    mail.fail = true
    expect((await seq.runSequenceTick(MON_10H)).outcomes.RETRY).toBe(1)
    let after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ attempts: 1, currentStep: 0, status: 'ACTIVE' })
    expect(after!.nextRunAt!.getTime()).toBe(MON_10H.getTime() + 3600_000)
    await seq.runSequenceTick(new Date(MON_10H.getTime() + 3600_000))
    await seq.runSequenceTick(new Date(MON_10H.getTime() + 7200_000))
    after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ status: 'STOPPED', stoppedReason: 'SEND_FAILED' })
    expect(mail.calls).toHaveLength(3)
  })
})

describe('ne pas contacter au moment de l’envoi', () => {
  it('adresse ajoutée à la liste de suppression après l’inscription : rien ne part, inscription arrêtée', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await SuppressionEntry.create({ emailNormalized: 'camille@atelier.test', reason: 'MANUAL' })
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(0)
    expect(await Enrollment.findById(enrollment!._id).lean()).toMatchObject({
      status: 'STOPPED',
      stoppedReason: 'DO_NOT_CONTACT',
    })
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'SEQUENCE_STOPPED' })).toBe(1)
  })

  it('opposition posée directement en base (hors service) : bloquée par la revérification', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await Lead.updateOne({ _id: lead._id }, { doNotContact: true })
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(0)
    expect((await Enrollment.findById(enrollment!._id))!.stoppedReason).toBe('DO_NOT_CONTACT')
  })
})

describe('arrêts automatiques', () => {
  it('réponse du prospect (échange entrant consigné) : arrêt immédiat', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead, new Date(Date.now() - 60_000))
    await interactions.logInteraction({
      subjectType: 'LEAD',
      subjectId: lead._id,
      kind: 'EMAIL',
      direction: 'IN',
      subject: 'Re',
      body: 'Intéressé',
    })
    expect(await waitFor(async () => (await Enrollment.findById(enrollment!._id))!.status === 'STOPPED')).toBe(true)
    expect((await Enrollment.findById(enrollment!._id))!.stoppedReason).toBe('REPLY')
  })

  it('réponse constatée par le moteur avant l’étape ; un échange sortant ou antérieur ne compte pas', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const other = await newLead({ contactEmail: 'other@atelier.test' })
    const enrollment = await enroll(sequence, lead)
    const otherEnrollment = await enroll(sequence, other)
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: lead._id,
      kind: 'CALL',
      direction: 'IN',
      occurredAt: new Date(MON_10H.getTime() + 1000),
    })
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: other._id,
      kind: 'EMAIL',
      direction: 'OUT',
      occurredAt: new Date(MON_10H.getTime() + 1000),
    })
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: other._id,
      kind: 'EMAIL',
      direction: 'IN',
      occurredAt: new Date(MON_10H.getTime() - 86_400_000),
    })
    await seq.runSequenceTick(new Date(MON_10H.getTime() + 2000))
    expect((await Enrollment.findById(enrollment!._id))!.stoppedReason).toBe('REPLY')
    expect((await Enrollment.findById(otherEnrollment!._id))!.currentStep).toBe(1)
    expect(mail.calls.map((c) => c.recipients[0].email)).toEqual(['other@atelier.test'])
  })

  it('stopOn.reply désactivé : la réponse n’arrête pas', async () => {
    const sequence = await newSequence({ stopOn: { reply: false, statusChange: true, statuses: ['WON', 'LOST'] } })
    const lead = await newLead()
    await enroll(sequence, lead)
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: lead._id,
      kind: 'EMAIL',
      direction: 'IN',
      occurredAt: new Date(MON_10H.getTime() + 1000),
    })
    await seq.runSequenceTick(new Date(MON_10H.getTime() + 2000))
    expect(mail.calls).toHaveLength(1)
  })

  it('passage à un statut d’arrêt (via applyLeadChange) : arrêt ; un autre statut ne l’arrête pas', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await service.applyLeadChange(lead._id, { status: 'DEMO' }, { actor: ownerId, source: 'admin' })
    expect((await Enrollment.findById(enrollment!._id))!.status).toBe('ACTIVE')
    await service.applyLeadChange(lead._id, { status: 'LOST' }, { actor: ownerId, source: 'bulk', emit: false })
    expect(await Enrollment.findById(enrollment!._id).lean()).toMatchObject({
      status: 'STOPPED',
      stoppedReason: 'STATUS_CHANGE',
    })
  })

  it('désinscription par le lien : arrêt UNSUBSCRIBE', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await privacy.applyUnsubscribe(String(lead._id), 'camille@atelier.test')
    expect(await Enrollment.findById(enrollment!._id).lean()).toMatchObject({
      status: 'STOPPED',
      stoppedReason: 'UNSUBSCRIBE',
    })
    await seq.runSequenceTick(MON_10H)
    expect(mail.calls).toHaveLength(0)
  })

  it('opposition posée sur la fiche : arrêt DO_NOT_CONTACT', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await service.applyLeadChange(lead._id, { doNotContact: true }, { actor: ownerId, source: 'admin' })
    expect((await Enrollment.findById(enrollment!._id))!.stoppedReason).toBe('DO_NOT_CONTACT')
  })

  it('anonymisation : arrêt et journal de séquence vidé', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    const enrollment = await enroll(sequence, lead)
    await seq.runSequenceTick(MON_10H)
    await privacy.anonymizeLead((await Lead.findById(lead._id))!, { actor: null, source: 'admin', reason: 'REQUEST' })
    const after = await Enrollment.findById(enrollment!._id).lean()
    expect(after).toMatchObject({ status: 'STOPPED', stoppedReason: 'ANONYMIZED' })
    expect(after!.history.every((h) => h.message === '')).toBe(true)
  })

  it('suppression du lead : inscriptions supprimées en cascade', async () => {
    const sequence = await newSequence()
    const lead = await newLead()
    await enroll(sequence, lead)
    await service.deleteLeadCascade(lead)
    expect(await Enrollment.countDocuments()).toBe(0)
  })
})

describe('statistiques, job, garde-fous', () => {
  it('compte inscrits, en cours, terminés, arrêtés par raison', async () => {
    const sequence = await newSequence({ steps: [emailStep()] })
    const a = await newLead()
    const b = await newLead({ contactEmail: 'b@atelier.test' })
    const c = await newLead({ contactEmail: 'c@atelier.test' })
    await enroll(sequence, a)
    await enroll(sequence, b)
    await enroll(sequence, c)
    await seq.unenrollLeads(sequence, [String(b._id)], { actorId: ownerId })
    await Lead.updateOne({ _id: c._id }, { doNotContact: true })
    await seq.runSequenceTick(MON_10H)
    const stats = (await seq.sequenceStats([sequence._id])).get(String(sequence._id))
    expect(stats).toEqual({
      total: 3,
      active: 0,
      paused: 0,
      completed: 1,
      stopped: 2,
      stoppedByReason: { MANUAL: 1, DO_NOT_CONTACT: 1 },
    })
  })

  it('le job crm.sequences tourne toutes les 5 minutes avec une clé par tranche', async () => {
    const { definition } = await import('../automation/jobs/crmSequences.js')
    expect(definition).toMatchObject({ key: 'crm.sequences', triggerType: 'cron', schedule: '*/5 * * * *' })
    const { shouldRunNow } = await import('../automation/scheduler.js')
    const at = (m: number) => new Date(2026, 10, 9, 10, m)
    expect(shouldRunNow(definition.schedule, at(5))).toBe(true)
    expect(shouldRunNow(definition.schedule, at(7))).toBe(false)
    const key = (m: number) => definition.buildIdempotencyKey({ now: at(m), dateKey: '2026-11-09' } as never)
    expect(key(5)).toBe(key(9))
    expect(key(5)).not.toBe(key(10))
  })

  it('le moteur passe par checkProspectContact et deliverEmail, jamais par un envoi direct', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const lib = readFileSync(path.join(here, '../lib/crmSequences.ts'), 'utf8')
    expect(lib).toMatch(/checkProspectContact\(/)
    expect(lib).toMatch(/deliverEmail\(/)
    expect(lib).not.toMatch(/sendBulkEmail/)
    expect(lib).not.toMatch(/Lead\.(updateOne|updateMany|findByIdAndUpdate|findOneAndUpdate)\(/)
  })

  it('migration 011 : index idempotents', async () => {
    const first = await seq.ensureSequenceIndexes()
    const second = await seq.ensureSequenceIndexes()
    expect(first.dryRun).toBe(false)
    expect(second.dryRun).toBe(false)
    const indexes = await Enrollment.collection.indexes()
    expect(indexes.some((i) => i.key.status === 1 && i.key.nextRunAt === 1)).toBe(true)
    expect(indexes.find((i) => i.key.openKey === 1)?.unique).toBe(true)
    expect((await seq.ensureSequenceIndexes(true)).dryRun).toBe(true)
  })
})
