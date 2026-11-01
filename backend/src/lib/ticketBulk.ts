import fs from 'node:fs'
import path from 'node:path'
import InternalTicket from '../models/InternalTicket.js'
import { createNotification } from './notifications.js'
import { BulkItemError, parseBulkIds, runBulk, type BulkResult } from './bulk.js'

export const TICKET_STATUSES = ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'] as const
export const TICKET_BULK_ACTIONS = ['delete', 'archive', 'unarchive', 'update'] as const
export type TicketBulkAction = (typeof TICKET_BULK_ACTIONS)[number]

export type TicketBulkParse =
  | { ok: true; ids: string[]; action: TicketBulkAction; patch: { status?: (typeof TICKET_STATUSES)[number] } }
  | { ok: false; error: string }

export function parseTicketBulkBody(body: unknown): TicketBulkParse {
  const b = (body ?? {}) as Record<string, unknown>
  const parsed = parseBulkIds(b.ids)
  if (!parsed.ok) return parsed
  if (typeof b.action !== 'string' || !(TICKET_BULK_ACTIONS as readonly string[]).includes(b.action)) {
    return { ok: false, error: `action doit valoir ${TICKET_BULK_ACTIONS.join(', ')}` }
  }
  const action = b.action as TicketBulkAction
  const patch: { status?: (typeof TICKET_STATUSES)[number] } = {}
  if (action === 'update') {
    const p = b.patch
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'patch requis pour update' }
    const keys = Object.keys(p)
    if (keys.length === 0 || keys.some((k) => k !== 'status')) {
      return { ok: false, error: 'patch : seul status est pris en charge' }
    }
    const status = (p as Record<string, unknown>).status
    if (typeof status !== 'string' || !(TICKET_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: 'Statut invalide' }
    }
    patch.status = status as (typeof TICKET_STATUSES)[number]
  } else if (b.patch !== undefined) {
    return { ok: false, error: 'patch n’est accepté que pour update' }
  }
  return { ok: true, ids: parsed.ids, action, patch }
}

export interface TicketBulkContext {
  /** Dossier des pièces jointes à effacer à la suppression. */
  uploadsDir?: string
  /** Présent pour l'admin : notifie l'auteur d'un changement de statut, comme le PATCH unitaire. */
  actor?: { id: string; name?: string; email?: string }
}

export async function applyTicketBulk(
  input: { ids: string[]; action: TicketBulkAction; patch: { status?: string } },
  ctx: TicketBulkContext = {},
): Promise<BulkResult> {
  const { ids, action, patch } = input
  return runBulk(ids, async (id) => {
    const ticket = await InternalTicket.findById(id)
    if (!ticket) throw new BulkItemError('Ticket introuvable')

    if (action === 'delete') {
      if (ctx.uploadsDir) {
        const files = [...ticket.attachments, ...ticket.replies.flatMap((r) => r.attachments || [])]
        for (const f of files) {
          try {
            const filePath = path.join(ctx.uploadsDir, f.filename)
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
          } catch {
            // Fichier déjà absent : la suppression du ticket continue.
          }
        }
      }
      await InternalTicket.deleteOne({ _id: ticket._id })
      return
    }

    if (action === 'archive') {
      ticket.isArchived = true
      ticket.archivedAt = new Date()
      if (ticket.status !== 'FERME') ticket.status = 'FERME'
      await ticket.save()
      return
    }

    if (action === 'unarchive') {
      ticket.isArchived = false
      ticket.archivedAt = null
      await ticket.save()
      return
    }

    ticket.status = patch.status as (typeof TICKET_STATUSES)[number]
    await ticket.save()
    if (ctx.actor && ticket.authorId && String(ticket.authorId) !== ctx.actor.id) {
      createNotification({
        recipient: ticket.authorId,
        type: 'TICKET_STATUS_CHANGED',
        title: `Ticket "${ticket.title || 'sans titre'}" — ${patch.status}`,
        message: `Statut mis à jour par ${ctx.actor.name || ctx.actor.email}`,
        link: `/admin/tickets/${ticket._id}`,
        metadata: { ticketId: String(ticket._id), status: patch.status },
      }).catch(() => {})
    }
  })
}
