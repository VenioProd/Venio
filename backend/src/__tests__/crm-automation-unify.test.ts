/**
 * Chantier 2C — unification des automatisations CRM :
 * une seule source par comportement, verrou en base, heure de Paris,
 * escalade non répétée, round-robin persistant.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationDefinition } from '../automation/types.js'

const mail = vi.hoisted(() => ({
  sendProposalReminderEmail: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
  sendEscalationEmail: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
  sendColdLeadsReminderEmail: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
  sendOverdueActionsEmail: vi.fn(async (..._a: unknown[]) => ({ sent: true })),
}))
vi.mock('../lib/email.js', async (original) => ({ ...(await original<typeof import('../lib/email.js')>()), ...mail }))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn(async () => null) }))

const registered = vi.hoisted(() => ({}) as Record<string, AutomationDefinition>)
vi.mock('../automation/registry.js', () => ({
  registerAutomation: (d: AutomationDefinition) => {
    registered[d.key] = d
  },
}))

import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import CrmRule from '../models/CrmRule.js'
import SchedulerLock, { acquireSchedulerLock } from '../models/SchedulerLock.js'
import { processEscalations, processProposalReminders, processColdLeads, runScheduledJobs, runOnce } from '../lib/crmScheduler.js'
import { getRoundRobinAssignee, ROUND_ROBIN_CURSOR } from '../lib/crmAutomations.js'
import { resetSystemRuleCache, isSystemRuleActive, SEED_RULES, SYSTEM_RULE_FOR } from '../lib/crmRules.js'
import { SOURCE_POLICY } from '../lib/crmLeadService.js'
import {
  parisDateKey,
  parisParts,
  parisWeekKey,
  parisWallTimeToDate,
  serverScheduleForParis,
} from '../automation/jobs/crmParisTime.js'
import { register as regProposal } from '../automation/jobs/crmProposalFollowup.js'
import { register as regHot } from '../automation/jobs/crmHotLeadAlert.js'
import { register as regDemo } from '../automation/jobs/crmPostDemoFollowup.js'
import { register as regInactive } from '../automation/jobs/crmInactiveLeadFollowup.js'
import { register as regArchive } from '../automation/jobs/crmAutoArchiveLost.js'
import { register as regDrop } from '../automation/jobs/crmConversionDropAlert.js'

const DAY = 24 * 3600 * 1000
const pad = (n: number) => String(n).padStart(2, '0')
const localHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Écrit des dates « techniques » sans que les timestamps de Mongoose les écrasent. */
async function backdate(id: unknown, fields: Record<string, Date | null>) {
  await Lead.collection.updateOne({ _id: id as never }, { $set: fields })
}

async function seedRule(systemKey: string, status: 'ACTIVE' | 'DRAFT') {
  const seed = SEED_RULES.find((r) => r.systemKey === systemKey)!
  await CrmRule.create({ ...seed, status })
  resetSystemRuleCache()
}

async function resetSettings(overrides: Record<string, unknown> = {}) {
  await CrmSettings.deleteMany({})
  await CrmSettings.create({ roundRobinEnabled: false, emailOnAssignment: false, scoringEnabled: false, activityLogging: true, ...overrides })
}

// ─────────────────────────── Heure de Paris (pur) ───────────────────────────

describe('heure de Paris', () => {
  it('le jour de Paris change à minuit heure de Paris, pas à minuit UTC', () => {
    expect(parisDateKey(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02') // 00:30 à Paris (été)
    expect(parisDateKey(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-01') // 23:30 à Paris (hiver)
    expect(parisDateKey(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02')
  })

  it("suit le passage à l'heure d'été (29 mars 2026) et à l'heure d'hiver (25 octobre 2026)", () => {
    // Avant / après le passage à l'heure d'été : 08:00 Paris = 07:00 UTC puis 06:00 UTC.
    expect(parisWallTimeToDate(2026, 3, 28, 8 * 60).toISOString()).toBe('2026-03-28T07:00:00.000Z')
    expect(parisWallTimeToDate(2026, 3, 29, 8 * 60).toISOString()).toBe('2026-03-29T06:00:00.000Z')
    // Avant / après le passage à l'heure d'hiver.
    expect(parisWallTimeToDate(2026, 10, 24, 8 * 60).toISOString()).toBe('2026-10-24T06:00:00.000Z')
    expect(parisWallTimeToDate(2026, 10, 25, 8 * 60).toISOString()).toBe('2026-10-25T07:00:00.000Z')
    // 02:00 → 03:00 le 29 mars : l'heure qui n'existe pas tombe juste après.
    expect(parisParts(parisWallTimeToDate(2026, 3, 29, 2 * 60 + 30)).hour).toBe(3)
    // 02:30 existe deux fois le 25 octobre : même jour de Paris dans les deux cas.
    expect(parisDateKey(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25')
    expect(parisDateKey(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25')
  })

  it("traduit l'heure de Paris en heure locale du serveur pour le planificateur d'automatisations", () => {
    const winter = new Date('2026-12-01T05:00:00Z')
    const summer = new Date('2026-07-01T05:00:00Z')
    expect(serverScheduleForParis('09:00', winter)).toBe(localHHMM(parisWallTimeToDate(2026, 12, 1, 9 * 60)))
    expect(serverScheduleForParis('09:00', summer)).toBe(localHHMM(parisWallTimeToDate(2026, 7, 1, 9 * 60)))
    if (new Date().getTimezoneOffset() === 0 && winter.getTimezoneOffset() === 0) {
      // Serveur en UTC (production) : 09:00 Paris = 08:00 l'hiver, 07:00 l'été.
      expect(serverScheduleForParis('09:00', winter)).toBe('08:00')
      expect(serverScheduleForParis('09:00', summer)).toBe('07:00')
      expect(serverScheduleForParis('monday:08:00', new Date('2026-11-02T05:00:00Z'))).toBe('monday:07:00')
      // 00:30 Paris l'été = 22:30 UTC la veille : le jour suit.
      expect(serverScheduleForParis('monday:00:30', new Date('2026-07-06T05:00:00Z'))).toBe('sunday:22:30')
    }
  })

  it('semaine ISO du jour de Paris', () => {
    expect(parisWeekKey(new Date('2026-11-02T08:00:00Z'))).toBe('2026-W45')
    // Dimanche 23:30 UTC = lundi 00:30 à Paris : déjà la semaine suivante.
    expect(parisWeekKey(new Date('2026-11-08T23:30:00Z'))).toBe('2026-W46')
  })
})

// ─────────────────────────── Intégration (Mongo) ───────────────────────────

describe('automatisations CRM unifiées', () => {
  let owner: InstanceType<typeof User>
  let other: InstanceType<typeof User>
  let manager: InstanceType<typeof User>

  beforeAll(async () => {
    await setupMongo()
    await SchedulerLock.init()
    for (const r of [regProposal, regHot, regDemo, regInactive, regArchive, regDrop]) r()
  })
  afterAll(teardownMongo)
  beforeEach(async () => {
    await clearDb()
    vi.clearAllMocks()
    resetSystemRuleCache()
    await resetSettings()
    owner = await User.create({ email: 'owner@test.local', name: 'Owner', role: 'COMMERCIAL', passwordHash: 'x' })
    other = await User.create({ email: 'other@test.local', name: 'Other', role: 'COMMERCIAL', passwordHash: 'x' })
    manager = await User.create({ email: 'manager@test.local', name: 'Manager', role: 'VIEWER', passwordHash: 'x' })
  })

  async function proposalLead() {
    const lead = await Lead.create({ company: 'Acme', status: 'PROPOSAL', assignedTo: owner._id, budget: 20000 })
    await backdate(lead._id, { statusChangedAt: new Date(Date.now() - 20 * DAY) })
    return lead
  }

  describe('verrou en base', () => {
    it('dix prises simultanées du même verrou : une seule réussit', async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => acquireSchedulerLock('crm-scheduler:test:2026-11-06', DAY)))
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await acquireSchedulerLock('crm-scheduler:test:2026-11-06', DAY)).toBe(false)
      expect(await acquireSchedulerLock('crm-scheduler:test:2026-11-07', DAY)).toBe(true)
    })

    it('une tâche qui lève libère le verrou pour être retentée', async () => {
      await expect(runOnce('boom', '2026-11-06', DAY, async () => { throw new Error('x') })).rejects.toThrow('x')
      expect(await runOnce('boom', '2026-11-06', DAY, async () => null)).toBe(true)
      expect(await runOnce('boom', '2026-11-06', DAY, async () => null)).toBe(false)
    })

    it('deux passages concurrents du planificateur (deux instances) : une seule relance envoyée', async () => {
      await resetSettings({ proposalReminderEnabled: true, proposalReminderDays: 7 })
      await proposalLead()
      const at = new Date('2026-12-01T07:05:00Z') // 08:05 à Paris
      await Promise.all([runScheduledJobs(at), runScheduledJobs(at)])
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
      // Redémarrage : un nouveau passage le même jour ne renvoie rien.
      await runScheduledJobs(new Date('2026-12-01T07:10:00Z'))
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
      expect(await SchedulerLock.exists({ _id: 'crm-scheduler:proposalReminder:2026-12-01' })).toBeTruthy()
      // Le lendemain, nouvelle occurrence.
      await runScheduledJobs(new Date('2026-12-02T07:05:00Z'))
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(2)
    })
  })

  describe('heures de Paris dans le planificateur CRM', () => {
    beforeEach(async () => {
      await resetSettings({ proposalReminderEnabled: true, proposalReminderDays: 7, dailyOverdueEmailTime: '08:00' })
      await proposalLead()
    })

    it("l'hiver, 08:00 Paris = 07:00 UTC", async () => {
      await runScheduledJobs(new Date('2026-12-01T06:30:00Z')) // 07:30 Paris : trop tôt
      expect(mail.sendProposalReminderEmail).not.toHaveBeenCalled()
      await runScheduledJobs(new Date('2026-12-01T07:00:00Z'))
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
    })

    it("l'été, 08:00 Paris = 06:00 UTC ; 08:05 UTC (10:05 Paris) est hors fenêtre", async () => {
      await runScheduledJobs(new Date('2026-07-01T08:05:00Z'))
      expect(mail.sendProposalReminderEmail).not.toHaveBeenCalled()
      await runScheduledJobs(new Date('2026-07-01T06:01:00Z'))
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
    })

    it("le jour du passage à l'heure d'hiver, une seule exécution", async () => {
      await runScheduledJobs(new Date('2026-10-25T07:00:00Z')) // 08:00 Paris (UTC+1)
      await runScheduledJobs(new Date('2026-10-25T08:00:00Z')) // 09:00 Paris
      expect(mail.sendProposalReminderEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe('une seule source par comportement', () => {
    it('règle « proposition-sans-reponse » active : le planificateur et le job s’abstiennent', async () => {
      await resetSettings({ proposalReminderEnabled: true, proposalReminderDays: 7 })
      await proposalLead()
      await seedRule(SYSTEM_RULE_FOR.proposalFollowUp, 'ACTIVE')
      const res = await processProposalReminders()
      expect(res.skippedForRule).toBe('proposition-sans-reponse')
      expect(mail.sendProposalReminderEmail).not.toHaveBeenCalled()
      expect(await registered['crm.proposal_followup'].evaluate({} as never)).toBe(false)
    })

    it('règle en brouillon : le planificateur relance, et le job lui laisse la main', async () => {
      await resetSettings({ proposalReminderEnabled: true, proposalReminderDays: 7 })
      await proposalLead()
      await seedRule(SYSTEM_RULE_FOR.proposalFollowUp, 'DRAFT')
      expect((await processProposalReminders()).sent).toBe(1)
      expect(await registered['crm.proposal_followup'].evaluate({} as never)).toBe(false)
    })

    it('ni règle active ni réglage du planificateur : le job agit', async () => {
      expect(await registered['crm.proposal_followup'].evaluate({} as never)).toBe(true)
      expect(await registered['crm.inactive_lead_followup'].evaluate({} as never)).toBe(true)
      expect(await registered['crm.post_demo_followup'].evaluate({} as never)).toBe(true)
      expect(await registered['crm.hot_lead_untreated_alert'].evaluate({} as never)).toBe(true)
    })

    it.each([
      ['crm.inactive_lead_followup', SYSTEM_RULE_FOR.inactiveLeadFollowUp],
      ['crm.post_demo_followup', SYSTEM_RULE_FOR.postDemoFollowUp],
      ['crm.hot_lead_untreated_alert', SYSTEM_RULE_FOR.hotLeadAlert],
    ])('%s s’abstient quand la règle %s est active', async (key, systemKey) => {
      await seedRule(systemKey, 'ACTIVE')
      expect(await registered[key].evaluate({} as never)).toBe(false)
    })

    it('règle « relance-7j » active : l’e-mail des leads froids du planificateur s’abstient', async () => {
      await resetSettings({ coldLeadEmailEnabled: true, coldLeadThresholdDays: 7 })
      await seedRule(SYSTEM_RULE_FOR.inactiveLeadFollowUp, 'ACTIVE')
      expect((await processColdLeads()).skippedForRule).toBe('relance-7j')
      expect(mail.sendColdLeadsReminderEmail).not.toHaveBeenCalled()
    })

    it('le cache des règles actives est court et se vide', async () => {
      const t0 = Date.now()
      expect(await isSystemRuleActive('lead-chaud-48h', t0)).toBe(false)
      await CrmRule.create({ ...SEED_RULES.find((r) => r.systemKey === 'lead-chaud-48h')!, status: 'ACTIVE' })
      expect(await isSystemRuleActive('lead-chaud-48h', t0 + 1000)).toBe(false) // encore en cache
      expect(await isSystemRuleActive('lead-chaud-48h', t0 + 61_000)).toBe(true)
    })

    it('chaque comportement couvert a sa règle au catalogue', () => {
      for (const key of Object.values(SYSTEM_RULE_FOR)) expect(SEED_RULES.some((r) => r.systemKey === key)).toBe(true)
    })

    it('les jobs utilisent le jour et la semaine de Paris', () => {
      const now = new Date('2026-07-01T22:30:00Z') // 2 juillet à Paris
      expect(registered['crm.proposal_followup'].buildIdempotencyKey({ now, dateKey: '2026-07-01' } as never)).toBe('crm.proposal:2026-07-02')
      expect(registered['crm.auto_archive_lost'].buildIdempotencyKey({ now, dateKey: '2026-07-01' } as never)).toBe('crm.archive_lost:2026-07-02')
      expect(registered['crm.conversion_drop_alert'].buildIdempotencyKey({ now: new Date('2026-11-08T23:30:00Z') } as never)).toBe('crm.conversion_drop:2026-W46')
    })
  })

  describe('escalade', () => {
    async function staleLead(extra: Record<string, unknown> = {}) {
      const lead = await Lead.create({ company: 'Dormant', status: 'CONTACTED', assignedTo: owner._id, ...extra })
      const old = new Date(Date.now() - 30 * DAY)
      await backdate(lead._id, { createdAt: old, statusChangedAt: old, lastContactAt: old, lastInteractionAt: null })
      return lead
    }

    it('un seul e-mail par lead et par fenêtre, pas un par jour', async () => {
      await resetSettings({ escalationEnabled: true, escalationThresholdDays: 10, escalationAction: 'NOTIFY_MANAGER', escalationManagerId: manager._id })
      const lead = await staleLead()
      await processEscalations(new Date())
      await processEscalations(new Date(Date.now() + DAY))
      await processEscalations(new Date(Date.now() + 2 * DAY))
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(1)
      // Un échange relance le compteur : nouvelle fenêtre, nouvel e-mail une fois le délai dépassé.
      await backdate(lead._id, { lastInteractionAt: new Date(Date.now() - 15 * DAY) })
      await processEscalations(new Date())
      await processEscalations(new Date(Date.now() + DAY))
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(2)
    })

    it("mesure l'inactivité sur les échanges, contacts et statuts, pas sur updatedAt", async () => {
      await resetSettings({ escalationEnabled: true, escalationThresholdDays: 10, escalationAction: 'NOTIFY_MANAGER', escalationManagerId: manager._id })
      const stale = await staleLead()
      await backdate(stale._id, { updatedAt: new Date() }) // écriture technique récente
      const active = await staleLead({ company: 'Actif' })
      await backdate(active._id, { lastInteractionAt: new Date(Date.now() - 2 * DAY) })
      await processEscalations(new Date())
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(1)
      expect((mail.sendEscalationEmail.mock.calls[0][0] as { lead: { company: string } }).lead.company).toBe('Dormant')
    })

    it('au plus une réattribution automatique par lead, puis seulement l’alerte au manager', async () => {
      await resetSettings({ escalationEnabled: true, escalationThresholdDays: 10, escalationAction: 'REASSIGN', escalationManagerId: manager._id })
      const lead = await staleLead()
      const first = await processEscalations(new Date())
      expect(first.reassigned).toBe(1)
      expect(mail.sendEscalationEmail).not.toHaveBeenCalled()
      const after = await Lead.findById(lead._id).lean()
      expect(String(after!.assignedTo)).not.toBe(String(owner._id))
      expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ESCALATION_REASSIGN' })).toBe(1)
      // Journalisé aussi par le service unique.
      expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ASSIGNED' })).toBe(1)

      // Le nouveau commercial a son propre délai : rien le lendemain.
      await processEscalations(new Date(Date.now() + DAY))
      expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ESCALATION_REASSIGN' })).toBe(1)

      // Délai dépassé à nouveau : pas de seconde réattribution, une alerte au manager, une seule.
      const later = await processEscalations(new Date(Date.now() + 11 * DAY))
      await processEscalations(new Date(Date.now() + 12 * DAY))
      expect(later.reassigned).toBe(0)
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(1)
      expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ESCALATION_REASSIGN' })).toBe(1)
      expect(String((await Lead.findById(lead._id).lean())!.assignedTo)).toBe(String(after!.assignedTo))
    })

    it('un échec d’envoi laisse la fenêtre ouverte (nouvel essai au passage suivant)', async () => {
      await resetSettings({ escalationEnabled: true, escalationThresholdDays: 10, escalationAction: 'NOTIFY_MANAGER', escalationManagerId: manager._id })
      await staleLead()
      mail.sendEscalationEmail.mockResolvedValueOnce({ sent: false })
      await processEscalations(new Date())
      await processEscalations(new Date(Date.now() + DAY))
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(2)
      await processEscalations(new Date(Date.now() + 2 * DAY))
      expect(mail.sendEscalationEmail).toHaveBeenCalledTimes(2)
    })
  })

  describe('round-robin', () => {
    it('ne tire que les membres actifs des rôles habilités, à tour de rôle', async () => {
      await User.create({ email: 'compta@test.local', name: 'Compta', role: 'COMPTABLE', passwordHash: 'x' })
      await User.create({ email: 'off@test.local', name: 'Off', role: 'COMMERCIAL', passwordHash: 'x', isActive: false })
      await User.create({ email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' })
      const picks = []
      for (let i = 0; i < 4; i++) picks.push(String(await getRoundRobinAssignee()))
      // owner et other (COMMERCIAL actifs) ; manager est VIEWER, exclu.
      expect(picks).toEqual([String(owner._id), String(other._id), String(owner._id), String(other._id)])
    })

    it('curseur persistant en base, partagé et atomique', async () => {
      await Promise.all(Array.from({ length: 6 }, () => getRoundRobinAssignee()))
      const cursor = await SchedulerLock.findById(ROUND_ROBIN_CURSOR).lean()
      expect(cursor?.seq).toBe(6)
      expect(cursor?.expiresAt ?? null).toBeNull()
      // Après « redémarrage » (aucun état en mémoire), la rotation reprend au cran suivant.
      expect(String(await getRoundRobinAssignee())).toBe(String(owner._id))
      expect((await SchedulerLock.findById(ROUND_ROBIN_CURSOR).lean())?.seq).toBe(7)
    })

    it('personne d’habilité : aucun assigné', async () => {
      await User.updateMany({}, { $set: { isActive: false } })
      expect(await getRoundRobinAssignee()).toBeNull()
    })
  })

  describe('archivage des perdus par le service unique', () => {
    it('archive un lead perdu depuis 30 jours et le consigne', async () => {
      const lost = await Lead.create({ company: 'Perdu', status: 'LOST', assignedTo: owner._id })
      await backdate(lost._id, { statusChangedAt: new Date(Date.now() - 40 * DAY) })
      const recent = await Lead.create({ company: 'Perdu récent', status: 'LOST', assignedTo: owner._id })
      const now = new Date()
      const res = await registered['crm.auto_archive_lost'].execute({ now, dateKey: parisDateKey(now), settings: { config: {} } } as never)
      expect(res.details).toEqual({ archivedCount: 1 })
      expect((await Lead.findById(lost._id).lean())!.archivedAt).toBeTruthy()
      expect((await Lead.findById(recent._id).lean())!.archivedAt ?? null).toBeNull()
      expect(await LeadActivity.countDocuments({ leadId: lost._id, type: 'ARCHIVED' })).toBe(1)
    })

    it('la source « scheduler » n’envoie ni e-mail ni notification par lead', () => {
      expect(SOURCE_POLICY.scheduler).toEqual({ autoQualify: false, assignmentEmail: false, statusNotifications: false })
    })
  })
})
