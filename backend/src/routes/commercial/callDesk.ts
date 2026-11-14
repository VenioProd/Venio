import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { body, validationResult } from 'express-validator'
import Lead, { LEAD_PROJECTS } from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import LeadActivity from '../../models/LeadActivity.js'
import CrmSettings from '../../models/CrmSettings.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { castLeadFilter, repCallScope, type CallDeskScope } from '../../lib/callDeskScope.js'
import { toRepLead } from '../../lib/repLeadView.js'
import { callError, importCallLeads, mappedCsv, normalizePhone, parseLeadCsv } from '../../lib/callImports.js'
import { computeRequestHash } from '../../lib/agent/idempotency.js'
import { validateCallSettings } from '../../lib/callSettings.js'
import { runInTransaction } from '../../lib/transaction.js'
import { applyLeadChange, isLeadChangeError, LeadChangeError } from '../../lib/crmLeadService.js'
import { stopSequencesOnLeadChange } from '../../lib/crmSequences.js'
import { emitLeadChanges, fireLeadEvent } from '../../lib/crmRules.js'
import type { ILead } from '../../types/models/index.js'
import Call from '../../models/Call.js'
import SuppressionEntry from '../../models/SuppressionEntry.js'
import {
  addPhoneSuppression,
  attemptWindowOf,
  callWindowCheck,
  suppressedPhoneStages,
  windowAttempts,
} from '../../lib/callGuards.js'

const OPEN_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO']

/**
 * File d'appel, résultat rapide et son annulation. Le périmètre (externe ou
 * équipe) est injecté : voir `lib/callDeskScope.ts`.
 */
export function createCallDeskRoutes(scope: CallDeskScope) {
  const router = express.Router()

  router.get('/calls/settings', scope.read, async (_req, res, next) => {
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

  router.post('/calls/script-tags', scope.write, async (req, res, next) => {
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

  router.get('/calls/filters', scope.read, async (req, res, next) => {
    try {
      const filter = scope.leadFilter(req)
      const [lists, projects] = await Promise.all([Lead.distinct('callList', filter), Lead.distinct('project', filter)])
      res.json({ lists: lists.filter(Boolean).sort(), projects: projects.filter(Boolean).sort() })
    } catch (err) {
      next(err)
    }
  })

  router.get('/calls/queue', scope.read, async (req: Request, res: Response, next: NextFunction) => {
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
      // L'externe s'arrête au passage au closer ; l'équipe appelle aussi les fiches transmises, les
      // siennes par défaut (`mine=0` : tout son périmètre d'écriture). L'aggregate ne caste rien.
      const scoped =
        scope.kind === 'rep'
          ? { ...scope.leadFilter(req), closingHandoff: null }
          : castLeadFilter({
              ...scope.leadFilter(req),
              ...(req.query.mine === '0' ? {} : { assignedTo: req.user!.id }),
            })
      const filter: Record<string, unknown> = {
        ...scoped,
        status: { $in: OPEN_STATUSES },
        archivedAt: null,
        doNotContact: { $ne: true },
        doNotCall: { $ne: true },
        phoneInvalid: { $ne: true },
        // Fiche retenue par une opposition détectée (absent ou null : proposable).
        callHold: null,
        // Plafond de la fenêtre atteint sans jamais joindre personne (lot P).
        callUnreachableAt: null,
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
        // Un numéro opposé sort de la file quel que soit le commercial ou la fiche qui le porte.
        ...suppressedPhoneStages(settings.callDefaultRegion),
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
      // Lot P : pays, fuseaux et ce qui empêche d'appeler maintenant (le lancement repasse la garde exacte).
      const now = new Date()
      res.json({
        leads: page.map((lead) => {
          const { target, block } = callWindowCheck(lead, settings, now)
          return {
            ...toRepLead(lead),
            callCheck: { country: target?.country ?? null, timeZones: target?.timeZones ?? [], block },
          }
        }),
        nextCursor,
      })
    } catch (err) {
      next(err)
    }
  })

  // Pas d'import de listes d'appel côté équipe.
  if (scope.kind === 'rep') {
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
          businessContact: req.body.businessContact,
          actorId: req.user!.id,
        })
        res.status(201).json(report)
      } catch (err) {
        next(err)
      }
    })
  }

  router.post(
    '/leads/:id/quick-call',
    scope.write,
    body('clientRequestId').isUUID(),
    body('note').optional().isString().isLength({ max: 20000 }),
    body('outcome').isString().isLength({ min: 1, max: 60 }),
    body('scriptTag').optional().isString().isLength({ max: 60 }),
    body('durationSec').optional().isInt({ min: 0 }),
    body('nextActionAt').optional({ values: 'null' }).isISO8601(),
    body('callId').optional().isMongoId(),
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
          // Appel passé depuis le navigateur : heure et durée sont prises sur l'appel, pas sur la saisie.
          ...(req.body.callId ? { callId: String(req.body.callId) } : {}),
        }
        const clientRequestId = String(req.body.clientRequestId).toLowerCase()
        const hash = computeRequestHash(input)
        const findReplay = () => Interaction.findOne({ author: repId, clientRequestId }).select('+clientRequestHash')
        const replay = async () => {
          // Vérifier le propriétaire courant même pour un retry après réattribution.
          if (!(await Lead.exists({ _id: leadId, ...scope.leadFilter(req) }))) throw callError(404, 'Lead not found')
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
            const lead = await Lead.findOne({ _id: leadId, ...scope.leadFilter(req) }).session(session)
            if (!lead) throw callError(404, 'Lead not found')
            const existing = await Interaction.findOne({ author: repId, clientRequestId })
              .select('+clientRequestHash')
              .session(session)
            if (existing) {
              if (existing.clientRequestHash !== hash) throw callError(409, 'IDEMPOTENCY_CONFLICT')
              return { id: existing._id, fresh: null }
            }
            // Transmise au closer : lecture seule pour l'externe, l'équipe la reprend.
            if ((scope.kind === 'rep' && lead.closingHandoff) || !OPEN_STATUSES.includes(lead.status))
              throw callError(409, 'Lead en lecture seule')
            if (lead.archivedAt || lead.doNotContact || lead.doNotCall || lead.phoneInvalid)
              throw callError(409, 'Lead exclu des appels')
            const now = new Date()
            const call = input.callId
              ? await Call.findOne({ _id: input.callId, author: repId, lead: lead._id }).session(session)
              : null
            if (input.callId && !call) throw callError(404, 'Appel introuvable')
            if (call?.interaction) throw callError(409, 'Appel déjà consigné')
            const occurredAt = call ? (call.answeredAt ?? call.startedAt ?? call.createdAt) : now
            const durationSec = call ? call.durationSec : input.durationSec
            const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null
            if (nextActionAt && nextActionAt <= now) throw callError(400, 'Relance future requise')
            if (outcome.effect === 'CALLBACK' && !nextActionAt) throw callError(400, 'Date de rappel requise')
            const statusBefore = lead.status
            const fields = [
              'status',
              'statusChangedAt',
              'score',
              'probability',
              'lastContactAt',
              'lastCallOutcome',
              'lastCallAt',
              'nextActionAt',
              'interactionsCount',
              'lastInteractionAt',
            ]
            if (outcome.effect === 'DO_NOT_CALL') fields.push('doNotCall')
            if (outcome.effect === 'WRONG_NUMBER') fields.push('phoneInvalid')
            if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) fields.push('lostReason', 'lostComment')
            const leadBefore = Object.fromEntries(fields.map((field) => [field, lead.get(field)]))
            const patch: Record<string, any> = {
              lastCallOutcome: input.outcome,
              lastCallAt: occurredAt,
              interactionsCount: (lead.interactionsCount ?? 0) + 1,
              lastInteractionAt: !lead.lastInteractionAt || lead.lastInteractionAt < now ? now : lead.lastInteractionAt,
              nextActionAt:
                nextActionAt ??
                (outcome.retryAfterMinutes !== null
                  ? new Date(now.getTime() + outcome.retryAfterMinutes * 60000)
                  : null),
            }
            if (outcome.effect === 'MEETING') patch.status = 'DEMO'
            else if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) patch.status = 'LOST'
            else if (outcome.effect === 'CALLBACK') patch.status = 'CONTACTED'
            if (outcome.reached) patch.lastContactAt = occurredAt
            if (outcome.effect === 'DO_NOT_CALL') patch.doNotCall = true
            if (outcome.effect === 'WRONG_NUMBER') patch.phoneInvalid = true
            if (['LOST', 'DO_NOT_CALL'].includes(outcome.effect)) {
              patch.lostReason =
                settings.lostReasons.find(
                  (reason) => reason.toLocaleLowerCase('fr') === outcome.fr.toLocaleLowerCase('fr'),
                ) ?? ''
              patch.lostComment = input.note
            }
            if (['LOST', 'DO_NOT_CALL', 'WRONG_NUMBER'].includes(outcome.effect)) patch.nextActionAt = null
            // Lot P : la dernière tentative permise sur la fenêtre, sans jamais avoir joint personne → « non joignable ».
            if (call && !outcome.reached && !lead.callUnreachableAt) {
              const window = await windowAttempts(call.to, now, settings)
              if (!window.reached && window.count >= attemptWindowOf(settings).max) {
                fields.push('callUnreachableAt')
                leadBefore.callUnreachableAt = lead.get('callUnreachableAt') ?? null
                patch.callUnreachableAt = now
              }
            }
            const change = await applyLeadChange(lead, patch, {
              actor: repId,
              source: 'bulk',
              settings,
              session,
              emit: false,
            })
            const activityId = change.statusActivityIds[0] ?? null
            for (const field of fields) {
              if (JSON.stringify(leadBefore[field]) === JSON.stringify(lead.get(field))) delete leadBefore[field]
            }
            const [interaction] = await Interaction.create(
              [
                {
                  subjectType: 'LEAD',
                  subjectId: lead._id,
                  kind: 'CALL',
                  direction: 'OUT',
                  occurredAt,
                  body: input.note,
                  outcome: input.outcome,
                  scriptTag: input.scriptTag,
                  ...(durationSec !== null ? { durationSec } : {}),
                  author: repId,
                  clientRequestId,
                  clientRequestHash: hash,
                  callUndo: { leadBefore, activityId },
                },
              ],
              { session },
            )
            if (call) {
              const linked = await Call.updateOne(
                { _id: call._id, interaction: null },
                { $set: { interaction: interaction!._id } },
                { session },
              )
              if (!linked.modifiedCount) throw callError(409, 'Appel déjà consigné')
            }
            // L'opposition vaut pour le numéro, pas seulement pour cette fiche.
            if (outcome.effect === 'DO_NOT_CALL')
              await addPhoneSuppression(String(lead.contactPhone ?? ''), {
                reason: 'OPPOSITION',
                createdBy: repId,
                leadId: lead._id,
                region: settings.callDefaultRegion,
                session,
              })
            return { id: interaction!._id, fresh: { lead, statusBefore, occurredAt } }
          })
        } catch (err) {
          if ((err as { code?: number }).code === 11000 && (await replay())) return
          throw err
        }
        // Les règles du CRM s'exécutent une fois l'appel validé ; elles ne bloquent jamais la réponse.
        if (saved.fresh) {
          const { lead, statusBefore } = saved.fresh
          await stopSequencesOnLeadChange(lead, { status: statusBefore }, repId)
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

  router.post('/leads/:id/quick-call/:interactionId/undo', scope.write, async (req, res, next) => {
    try {
      const { id, interactionId } = req.params
      if (!mongoose.isObjectIdOrHexString(id) || !mongoose.isObjectIdOrHexString(interactionId))
        throw callError(400, 'Identifiant invalide')
      const restored = await runInTransaction(async (session) => {
        const lead = await Lead.findOne({ _id: id, ...scope.leadFilter(req) }).session(session)
        if (!lead) throw callError(404, 'Lead not found')
        // Transmise au closer : lecture seule pour l'externe, même pour défaire son dernier résultat.
        if (scope.kind === 'rep' && lead.closingHandoff)
          throw new LeadChangeError(409, 'LEAD_HANDED_OFF', 'Dossier transmis pour closing : il est en lecture seule')
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
        // L'appel redevient libre d'être consigné, et l'opposition posée par ce seul résultat est retirée.
        await Call.updateOne({ interaction: interaction._id }, { $set: { interaction: null } }, { session })
        const phoneNormalized = normalizePhone(
          String(lead.contactPhone ?? ''),
          (await CrmSettings.getSettings()).callDefaultRegion,
        )
        if ('doNotCall' in interaction.callUndo.leadBefore && phoneNormalized) {
          await SuppressionEntry.deleteOne({
            phoneNormalized,
            leadId: lead._id,
            createdBy: req.user!.id,
            reason: 'OPPOSITION',
            createdAt: { $gte: interaction.createdAt },
          }).session(session)
        }
        lead.set(interaction.callUndo.leadBefore)
        await lead.save({ session })
        if (interaction.callUndo.activityId)
          await LeadActivity.deleteOne({ _id: interaction.callUndo.activityId, leadId: id }).session(session)
        await Interaction.deleteOne({ _id: interaction._id }).session(session)
        return lead
      })
      res.json({ lead: toRepLead(restored) })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, code: err.code })
      next(err)
    }
  })

  return router
}

export default createCallDeskRoutes(repCallScope)
