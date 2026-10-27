import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Interaction, {
  INTERACTION_KINDS,
  INTERACTION_DIRECTIONS,
  INTERACTION_BODY_MAX_LENGTH,
  INTERACTION_SUBJECT_MAX_LENGTH,
} from '../../models/Interaction.js'
import { resolveSubject } from '../../lib/interactionAccess.js'
import { buildTimeline, logInteraction, TIMELINE_MAX_ENTRIES } from '../../lib/interactions.js'
import { sendBulkEmail, deliveryStatusFrom, EmailTransportUnavailableError } from '../../lib/email/send.js'
import type { InteractionKind } from '../../types/models/index.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

/** Interaction existante, avec le même contrôle d'accès que son sujet. */
async function resolveInteraction(req: Request, res: Response) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: 'Identifiant invalide' })
    return null
  }
  const interaction = await Interaction.findById(req.params.id)
  if (!interaction) {
    res.status(404).json({ error: 'Interaction not found' })
    return null
  }
  // On rejoue la résolution du sujet pour hériter de ses contrôles. Seuls
  // `user` et `params` sont lus par resolveSubject : un objet minimal suffit,
  // et il dit explicitement de quoi la vérification dépend.
  const subjectRequest = {
    user: req.user,
    params: { subjectType: interaction.subjectType, subjectId: String(interaction.subjectId) },
  } as unknown as Request
  const subject = await resolveSubject(subjectRequest, res, 'write')
  if (!subject) return null
  return interaction
}

function readKind(value: unknown): InteractionKind | null {
  const kind = String(value || '').toUpperCase()
  return (INTERACTION_KINDS as readonly string[]).includes(kind) ? (kind as InteractionKind) : null
}

function readOccurredAt(value: unknown): Date | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

// ─── Timeline ────────────────────────────────────────────────────────────────

router.get('/:subjectType/:subjectId/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = await resolveSubject(req, res, 'read')
    if (!subject) return undefined

    const requested = Number.parseInt(String(req.query.limit ?? ''), 10)
    const limit = Number.isFinite(requested) && requested > 0 ? requested : TIMELINE_MAX_ENTRIES
    const { entries, hasMore } = await buildTimeline(subject.type, subject.id, { limit })

    return res.json({
      entries,
      hasMore,
      limit: Math.min(limit, TIMELINE_MAX_ENTRIES),
      subject: {
        type: subject.type,
        id: String(subject.id),
        label: subject.label,
        contactEmail: subject.contactEmail,
        contactName: subject.contactName,
      },
    })
  } catch (err) {
    return next(err)
  }
})

// ─── Consigner un échange ────────────────────────────────────────────────────

router.post('/:subjectType/:subjectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = await resolveSubject(req, res, 'write')
    if (!subject) return undefined

    const kind = readKind(req.body?.kind)
    if (!kind) {
      return res.status(400).json({ error: "Type d'échange inconnu" })
    }
    // Un email se journalise en passant par la route d'envoi : sinon rien ne
    // garantit qu'il soit réellement parti.
    if (kind === 'EMAIL' && req.body?.direction !== 'IN') {
      return res.status(400).json({
        error: "Un email sortant se journalise via la route d'envoi",
      })
    }

    const body = String(req.body?.body ?? '')
    const subjectLine = String(req.body?.subject ?? '').trim()
    if (!body.trim() && !subjectLine) {
      return res.status(400).json({ error: 'Un échange doit porter un contenu' })
    }
    if (body.length > INTERACTION_BODY_MAX_LENGTH) {
      return res.status(400).json({ error: `Le contenu dépasse ${INTERACTION_BODY_MAX_LENGTH} caractères` })
    }
    if (subjectLine.length > INTERACTION_SUBJECT_MAX_LENGTH) {
      return res.status(400).json({ error: `L'objet dépasse ${INTERACTION_SUBJECT_MAX_LENGTH} caractères` })
    }

    const occurredAt = readOccurredAt(req.body?.occurredAt)
    if (occurredAt === 'invalid') {
      return res.status(400).json({ error: 'Date invalide' })
    }

    const rawDirection = String(req.body?.direction || 'NONE').toUpperCase()
    const direction = (INTERACTION_DIRECTIONS as readonly string[]).includes(rawDirection)
      ? (rawDirection as 'OUT' | 'IN' | 'NONE')
      : 'NONE'

    const interaction = await logInteraction({
      subjectType: subject.type,
      subjectId: subject.id,
      kind,
      direction,
      occurredAt: occurredAt ?? undefined,
      subject: subjectLine,
      body,
      pinned: Boolean(req.body?.pinned),
      author: req.user!.id,
    })

    return res.status(201).json({ interaction })
  } catch (err) {
    return next(err)
  }
})

// ─── Corriger / supprimer ────────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const interaction = await resolveInteraction(req, res)
    if (!interaction) return undefined

    if (req.body?.body !== undefined) {
      const body = String(req.body.body)
      if (body.length > INTERACTION_BODY_MAX_LENGTH) {
        return res.status(400).json({ error: `Le contenu dépasse ${INTERACTION_BODY_MAX_LENGTH} caractères` })
      }
      interaction.body = body
    }
    if (req.body?.subject !== undefined) {
      const subjectLine = String(req.body.subject).trim()
      if (subjectLine.length > INTERACTION_SUBJECT_MAX_LENGTH) {
        return res.status(400).json({ error: `L'objet dépasse ${INTERACTION_SUBJECT_MAX_LENGTH} caractères` })
      }
      interaction.subject = subjectLine
    }
    if (req.body?.pinned !== undefined) interaction.pinned = Boolean(req.body.pinned)
    if (req.body?.occurredAt !== undefined) {
      const occurredAt = readOccurredAt(req.body.occurredAt)
      if (occurredAt === 'invalid' || occurredAt === null) {
        return res.status(400).json({ error: 'Date invalide' })
      }
      interaction.occurredAt = occurredAt
    }

    await interaction.save()
    return res.json({ interaction })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const interaction = await resolveInteraction(req, res)
    if (!interaction) return undefined
    await interaction.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// ─── Envoyer un email et le journaliser ──────────────────────────────────────

router.post('/:subjectType/:subjectId/email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = await resolveSubject(req, res, 'write')
    if (!subject) return undefined

    const subjectLine = String(req.body?.subject ?? '').trim()
    const body = String(req.body?.body ?? '')
    if (!subjectLine) return res.status(400).json({ error: "L'objet est requis" })
    if (!body.trim()) return res.status(400).json({ error: 'Le corps du message est requis' })
    if (body.length > INTERACTION_BODY_MAX_LENGTH) {
      return res.status(400).json({ error: `Le contenu dépasse ${INTERACTION_BODY_MAX_LENGTH} caractères` })
    }

    const requested: unknown = req.body?.recipients
    const recipients =
      Array.isArray(requested) && requested.length > 0
        ? requested.map((entry) =>
            typeof entry === 'string'
              ? { email: entry }
              : { email: String((entry as { email?: string })?.email ?? '') },
          )
        : subject.contactEmail
          ? [{ email: subject.contactEmail, name: subject.contactName }]
          : []

    const valid = recipients.filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email))
    if (valid.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire valide' })
    }

    let outcome
    try {
      outcome = await sendBulkEmail({
        subject: subjectLine,
        body,
        recipients: valid,
        senderName: (req.user as { name?: string }).name,
      })
    } catch (err) {
      if (err instanceof EmailTransportUnavailableError) {
        return res.status(503).json({ error: err.message })
      }
      throw err
    }

    // On journalise quel que soit le résultat : une relance qui n'est pas
    // partie est une information au moins aussi utile qu'une relance partie.
    const interaction = await logInteraction({
      subjectType: subject.type,
      subjectId: subject.id,
      kind: 'EMAIL',
      direction: 'OUT',
      subject: subjectLine,
      body,
      author: req.user!.id,
      recipients: outcome.results.map((result) => ({
        email: result.email,
        name: result.name,
        status: result.success ? 'SENT' : 'FAILED',
        error: result.error ?? '',
      })),
      deliveryStatus: deliveryStatusFrom(outcome.results),
    })

    const status = outcome.failed === 0 ? 201 : outcome.sent === 0 ? 502 : 207
    return res.status(status).json({
      interaction,
      sent: outcome.sent,
      failed: outcome.failed,
      total: outcome.total,
      results: outcome.results,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
