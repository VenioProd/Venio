import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { body, validationResult } from 'express-validator'
import Lead, { LEAD_PROJECTS } from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import LeadActivity from '../../models/LeadActivity.js'
import CrmSettings from '../../models/CrmSettings.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { repLeadFilter } from '../../lib/externalSales.js'
import { toRepLead } from '../../lib/repLeadView.js'
import { callError, importCallLeads, mappedCsv, parseLeadCsv } from '../../lib/callImports.js'
import { computeRequestHash } from '../../lib/agent/idempotency.js'
import { validateCallSettings } from '../../lib/callSettings.js'
import { runInTransaction } from '../../lib/transaction.js'
import { emitLeadChanges, fireLeadEvent } from '../../lib/crmRules.js'
import type { ILead } from '../../types/models/index.js'

const router = express.Router()
const OPEN_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO']

router.get('/calls/settings', async (_req, res, next) => {
  try {
    const settings = await CrmSettings.getSettings()
    res.json({
      outcomes: settings.callOutcomes,
      scriptTags: settings.callScriptTags,
      defaultRegion: settings.callDefaultRegion,
      projects: LEAD_PROJECTS,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/calls/script-tags', async (req, res, next) => {
  try {
    const tag = req.body.tag
    validateCallSettings({ callScriptTags: [tag] })
    const settings = await CrmSettings.getSettings()
    if (settings.callScriptTags.includes(tag)) throw callError(400, 'Script déjà existant')
    const updated = await CrmSettings.findOneAndUpdate(
      { _id: settings._id, callScriptTags: { $ne: tag }, 'callScriptTags.29': { $exists: false } },
      { $push: { callScriptTags: tag } },
      { new: true },
    )
    if (!updated) throw callError(400, '30 scripts maximum, sans doublon')
    res.status(201).json({ scriptTags: updated.callScriptTags })
  } catch (err) {
    next(err)
  }
})

router.get('/calls/filters', async (req, res, next) => {
  try {
    const filter = repLeadFilter(req.user!.id)
    const [lists, projects] = await Promise.all([Lead.distinct('callList', filter), Lead.distinct('project', filter)])
    res.json({ lists: lists.filter(Boolean).sort(), projects: projects.filter(Boolean).sort() })
  } catch (err) {
    next(err)
  }
})

router.get('/calls/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.floor(Math.min(100, Math.max(1, Number(req.query.limit) || 50)))
    let cursor: { bucket: number; time: number; id: string; asOf: string } | undefined
    if (req.query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(String(req.query.cursor), 'base64url').toString())
        if (
          !cursor ||
          !Number.isInteger(cursor.bucket) ||
          cursor.bucket < 0 ||
          cursor.bucket > 3 ||
          !Number.isFinite(cursor.time) ||
          !mongoose.isObjectIdOrHexString(cursor.id) ||
          !Number.isFinite(Date.parse(cursor.asOf))
        )
          throw new Error()
      } catch {
        throw callError(400, 'Curseur invalide')
      }
    }
    const asOf = cursor?.asOf ?? new Date().toISOString()
    const filter: Record<string, unknown> = {
      ...repLeadFilter(req.user!.id),
      closingHandoff: null,
      status: { $in: OPEN_STATUSES },
      archivedAt: null,
      doNotContact: { $ne: true },
      doNotCall: { $ne: true },
      phoneInvalid: { $ne: true },
      contactPhone: { $type: 'string', $regex: /\S/ },
      $or: [{ nextActionAt: null }, { nextActionAt: { $lte: new Date(asOf) } }],
    }
    if (typeof req.query.callList === 'string' && req.query.callList) filter.callList = req.query.callList
    if (typeof req.query.project === 'string' && req.query.project) filter.project = req.query.project
    const settings = await CrmSettings.getSettings()
    const voicemailOutcomes = settings.callOutcomes
      .filter((item) => item.effect === 'VOICEMAIL')
      .map((item) => item.value)
    const items = await Lead.aggregate([
      { $match: filter },
      {
        $set: {
          queueBucket: {
            $switch: {
              branches: [
                { case: { $ne: [{ $ifNull: ['$nextActionAt', null] }, null] }, then: 0 },
                { case: { $eq: [{ $ifNull: ['$lastCallAt', null] }, null] }, then: 1 },
                { case: { $in: ['$lastCallOutcome', voicemailOutcomes] }, then: 2 },
              ],
              default: 3,
            },
          },
          queueTime: { $toLong: { $ifNull: ['$nextActionAt', { $ifNull: ['$lastCallAt', '$createdAt'] }] } },
        },
      },
      ...(cursor
        ? [
            {
              $match: {
                $or: [
                  { queueBucket: { $gt: cursor.bucket } },
                  { queueBucket: cursor.bucket, queueTime: { $gt: cursor.time } },
                  {
                    queueBucket: cursor.bucket,
                    queueTime: cursor.time,
                    _id: { $gt: new mongoose.Types.ObjectId(cursor.id) },
                  },
                ],
              },
            },
          ]
        : []),
      { $sort: { queueBucket: 1, queueTime: 1, _id: 1 } },
      { $limit: Math.floor(limit) + 1 },
    ])
    const page = items.slice(0, limit)
    const last = page.at(-1)
    const nextCursor =
      items.length > limit && last
        ? Buffer.from(
            JSON.stringify({ bucket: last.queueBucket, time: last.queueTime, id: String(last._id), asOf }),
          ).toString('base64url')
        : null
    res.json({ leads: page.map(toRepLead), nextCursor })
  } catch (err) {
    next(err)
  }
})

router.post('/calls/import/preview', (req, res, next) => {
  try {
    res.json({ columns: parseLeadCsv(req.body.csv)[0] })
  } catch (err) {
    next(err)
  }
})
router.post('/calls/import', idempotentRequest, async (req, res, next) => {
  try {
    if (!req.get('Idempotency-Key')) throw callError(400, 'Idempotency-Key UUID requis')
    const report = await importCallLeads({
      externalRep: req.user!.id,
      csv: true,
      leads: mappedCsv(req.body.csv, req.body.mapping),
      callList: req.body.callList,
      project: req.body.project,
      region: req.body.region,
      actorId: req.user!.id,
    })
    res.status(201).json(report)
  } catch (err) {
    next(err)
  }
})

router.post(
  '/leads/:id/quick-call',
  body('clientRequestId').isUUID(),
  body('note').optional().isString().isLength({ max: 20000 }),
  body('outcome').isString().isLength({ min: 1, max: 60 }),
  body('scriptTag').optional().isString().isLength({ max: 60 }),
  body('durationSec').optional().isInt({ min: 0 }),
  body('nextActionAt').optional({ values: 'null' }).isISO8601(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty() || !mongoose.isObjectIdOrHexString(req.params.id))
        throw callError(400, 'Fiche appel invalide')
      const repId = req.user!.id
      const leadId = String(req.params.id)
      const input = {
        leadId,
        note: req.body.note ?? '',
        outcome: req.body.outcome as string,
        scriptTag: req.body.scriptTag ?? '',
        nextActionAt: req.body.nextActionAt ?? null,
        durationSec: req.body.durationSec ?? null,
      }
      const clientRequestId = String(req.body.clientRequestId).toLowerCase()
      const hash = computeRequestHash(input)
      const findReplay = () => Interaction.findOne({ author: repId, clientRequestId }).select('+clientRequestHash')
      const replay = async () => {
        // Vérifier le propriétaire courant même pour un retry après réattribution.
        if (!(await Lead.exists({ _id: leadId, ...repLeadFilter(repId) }))) throw callError(404, 'Lead not found')
        const existing = await findReplay()
        if (!existing) return false
        if (existing.clientRequestHash !== hash) throw callError(409, 'IDEMPOTENCY_CONFLICT')
        res.json({ interactionId: existing._id })
        return true
      }
      if (await replay()) return
      const settings = await CrmSettings.getSettings()
      const outcome = settings.callOutcomes.find((item) => item.value === input.outcome)
      if (!outcome || (input.scriptTag && !settings.callScriptTags.includes(input.scriptTag)))
        throw callError(400, 'Résultat ou script inconnu')
      let saved: { id: unknown; fresh: { lead: ILead; statusBefore: string; occurredAt: Date } | null }
      try {
        saved = await runInTransaction(async (session) => {
          const lead = await Lead.findOne({ _id: leadId, ...repLeadFilter(repId) }).session(session)
          if (!lead) throw callError(404, 'Lead not found')
          const existing = await Interaction.findOne({ author: repId, clientRequestId })
            .select('+clientRequestHash')
            .session(session)
          if (existing) {
            if (existing.clientRequestHash !== hash) throw callError(409, 'IDEMPOTENCY_CONFLICT')
            return { id: existing._id, fresh: null }
          }
          if (lead.closingHandoff || !OPEN_STATUSES.includes(lead.status)) throw callError(409, 'Lead en lecture seule')
          if (lead.archivedAt || lead.doNotContact || lead.doNotCall || lead.phoneInvalid)
            throw callError(409, 'Lead exclu des appels')
          const now = new Date()
          const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null
          if (nextActionAt && nextActionAt <= now) throw callError(400, 'Relance future requise')
          if (outcome.effect === 'CALLBACK' && !nextActionAt) throw callError(400, 'Date de rappel requise')
          const statusBefore = lead.status
          const fields = [
            'status',
            'statusChangedAt',
            'lastCallOutcome',
            'lastCallAt',
            'nextActionAt',
            'interactionsCount',
            'lastInteractionAt',
          ]
          if (outcome.reached) fields.push('lastContactAt')
          if (outcome.effect === 'DO_NOT_CALL') fields.push('doNotCall')
          if (outcome.effect === 'WRONG_NUMBER') fields.push('phoneInvalid')
          if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) fields.push('lostReason', 'lostComment')
          const leadBefore = Object.fromEntries(fields.map((field) => [field, lead.get(field)]))
          if (outcome.effect === 'MEETING') lead.status = 'DEMO'
          else if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) lead.status = 'LOST'
          else if (outcome.effect === 'CALLBACK') lead.status = 'CONTACTED'
          if (statusBefore !== lead.status) lead.statusChangedAt = now
          const activityId = statusBefore !== lead.status ? new mongoose.Types.ObjectId() : null
          lead.lastCallOutcome = input.outcome
          lead.lastCallAt = now
          lead.interactionsCount = (lead.interactionsCount ?? 0) + 1
          if (!lead.lastInteractionAt || lead.lastInteractionAt < now) lead.lastInteractionAt = now
          if (outcome.reached) lead.lastContactAt = now
          lead.nextActionAt = nextActionAt
          if (!nextActionAt && outcome.retryAfterMinutes !== null)
            lead.nextActionAt = new Date(now.getTime() + outcome.retryAfterMinutes * 60000)
          if (outcome.effect === 'DO_NOT_CALL') lead.doNotCall = true
          if (outcome.effect === 'WRONG_NUMBER') lead.phoneInvalid = true
          if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) {
            lead.lostReason =
              settings.lostReasons.find(
                (reason) => reason.toLocaleLowerCase('fr') === outcome.fr.toLocaleLowerCase('fr'),
              ) ?? outcome.fr
            lead.lostComment = input.note
          }
          if (['LOST', 'DO_NOT_CALL', 'WRONG_NUMBER'].includes(outcome.effect)) lead.nextActionAt = null
          for (const field of fields) {
            if (!lead.isModified(field)) delete leadBefore[field]
          }
          await lead.save({ session })
          const [interaction] = await Interaction.create(
            [
              {
                subjectType: 'LEAD',
                subjectId: lead._id,
                kind: 'CALL',
                direction: 'OUT',
                occurredAt: now,
                body: input.note,
                outcome: input.outcome,
                scriptTag: input.scriptTag,
                ...(input.durationSec !== null ? { durationSec: input.durationSec } : {}),
                author: repId,
                clientRequestId,
                clientRequestHash: hash,
                callUndo: { leadBefore, activityId },
              },
            ],
            { session },
          )
          if (statusBefore !== lead.status)
            await LeadActivity.create(
              [
                {
                  leadId: lead._id,
                  _id: activityId,
                  type: 'STATUS_CHANGE',
                  label: `Statut : ${statusBefore} → ${lead.status}`,
                  payload: { from: statusBefore, to: lead.status },
                  actorId: repId,
                },
              ],
              { session },
            )
          return { id: interaction!._id, fresh: { lead, statusBefore, occurredAt: now } }
        })
      } catch (err) {
        if ((err as { code?: number }).code === 11000 && (await replay())) return
        throw err
      }
      // Les règles du CRM s'exécutent une fois l'appel validé ; elles ne bloquent jamais la réponse.
      if (saved.fresh) {
        const { lead, statusBefore } = saved.fresh
        emitLeadChanges(lead, { status: statusBefore, assignedTo: lead.assignedTo }, repId)
        void fireLeadEvent(lead._id as mongoose.Types.ObjectId, {
          type: 'INTERACTION_LOGGED',
          key: `interaction:${String(saved.id)}`,
        })
      }
      res.status(201).json({ interactionId: saved.id })
    } catch (err) {
      next(err)
    }
  },
)

router.post('/leads/:id/quick-call/:interactionId/undo', async (req, res, next) => {
  try {
    const { id, interactionId } = req.params
    if (!mongoose.isObjectIdOrHexString(id) || !mongoose.isObjectIdOrHexString(interactionId))
      throw callError(400, 'Identifiant invalide')
    const restored = await runInTransaction(async (session) => {
      const lead = await Lead.findOne({ _id: id, ...repLeadFilter(req.user!.id) }).session(session)
      if (!lead) throw callError(404, 'Lead not found')
      const interaction = await Interaction.findOne({
        _id: interactionId,
        subjectType: 'LEAD',
        subjectId: id,
        kind: 'CALL',
        author: req.user!.id,
      })
        .select('+callUndo')
        .session(session)
      if (!interaction) throw callError(404, 'Appel introuvable')
      if (!interaction.callUndo || Date.now() - interaction.createdAt.getTime() > 120000)
        throw callError(409, 'Délai d’annulation dépassé')
      const newer = await Interaction.exists({
        subjectType: 'LEAD',
        subjectId: id,
        kind: 'CALL',
        $or: [
          { createdAt: { $gt: interaction.createdAt } },
          { createdAt: interaction.createdAt, _id: { $gt: interaction._id } },
        ],
      }).session(session)
      if (newer) throw callError(409, 'Un appel plus récent existe')
      lead.set(interaction.callUndo.leadBefore)
      await lead.save({ session })
      if (interaction.callUndo.activityId)
        await LeadActivity.deleteOne({ _id: interaction.callUndo.activityId, leadId: id }).session(session)
      await Interaction.deleteOne({ _id: interaction._id }).session(session)
      return lead
    })
    res.json({ lead: toRepLead(restored) })
  } catch (err) {
    next(err)
  }
})

export default router
