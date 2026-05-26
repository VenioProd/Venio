import express, { type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import InternalTicket from '../../models/InternalTicket.js'
import InternalConversationMember from '../../models/InternalConversationMember.js'
import InternalConversation from '../../models/InternalConversation.js'
import InternalMessage from '../../models/InternalMessage.js'
import Lead from '../../models/Lead.js'
import BillingDocument from '../../models/BillingDocument.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const isSuper = user.role === 'SUPER_ADMIN'

    // --- Tickets ouverts ---
    const ticketFilter: Record<string, unknown> = {
      status: { $in: ['OUVERT', 'EN_COURS'] },
      isArchived: { $ne: true },
    }
    if (!isSuper) ticketFilter.authorId = new mongoose.Types.ObjectId(user.id)
    const openTickets = await InternalTicket.countDocuments(ticketFilter)

    // --- Messages non lus ---
    // Compte les conversations dont lastMessageAt > lastReadAt du membre courant
    // (InternalConversationMember.lastReadAt est null si jamais lu → toute la conv est non lue)
    let unreadMessages = 0
    try {
      const userId = new mongoose.Types.ObjectId(user.id)

      // Récupère tous les membres de conversations actives pour cet utilisateur
      const memberships = await InternalConversationMember.find({ user: userId }).lean()

      if (memberships.length > 0) {
        // Récupère les conversations correspondantes qui ont des messages
        const convIds = memberships.map((m) => m.conversation)
        const conversations = await InternalConversation.find({
          _id: { $in: convIds },
          lastMessageAt: { $ne: null },
          isArchived: { $ne: true },
        }).lean()

        const membershipMap = new Map(memberships.map((m) => [m.conversation.toString(), m.lastReadAt]))

        for (const conv of conversations) {
          const lastReadAt = membershipMap.get(conv._id.toString())
          const lastMessageAt = conv.lastMessageAt
          if (!lastMessageAt) continue
          // non lu si jamais lu OU si lastMessageAt > lastReadAt
          if (!lastReadAt || lastMessageAt > lastReadAt) {
            // Compte les messages non lus de cette conversation (non supprimés, non envoyés par soi)
            const count = await InternalMessage.countDocuments({
              conversation: conv._id,
              sender: { $ne: userId },
              deletedAt: null,
              ...(lastReadAt ? { createdAt: { $gt: lastReadAt } } : {}),
            })
            unreadMessages += count
          }
        }
      }
    } catch {
      // Remplacer par un $aggregate si bottleneck (volume > 1000 projets) — voir issue #83
      unreadMessages = 0
    }

    // --- Leads en retard de relance ---
    // Le champ dans Lead est `nextActionAt` (pas nextFollowUpAt)
    // L'assignation est via `assignedTo` (pas assigneeId)
    const overdueLeads = await Lead.countDocuments({
      nextActionAt: { $lte: new Date(), $ne: null },
      status: { $nin: ['WON', 'LOST'] },
      ...(isSuper ? {} : { assignedTo: new mongoose.Types.ObjectId(user.id) }),
    })

    // --- Factures impayées et en retard ---
    // BillingDocument.type enum: 'INVOICE' (pas 'FACTURE')
    // Pas de champ `paid` boolean — on utilise status !== 'PAID' && status !== 'CANCELLED'
    // Le champ date d'échéance est `dueAt` (pas `dueDate`)
    const overdueBilling = await BillingDocument.countDocuments({
      type: 'INVOICE',
      status: { $nin: ['PAID', 'CANCELLED', 'DRAFT'] },
      dueAt: { $lte: new Date(), $ne: null },
    })

    res.json({
      openTickets,
      unreadMessages,
      overdueLeads,
      overdueBilling,
      checkedAt: new Date().toISOString(),
      details: {
        unreadMessages: 'computed_via_membership',
        overdueLeads: 'uses_nextActionAt_field',
        overdueBilling: 'uses_dueAt_field_status_not_in_PAID_CANCELLED_DRAFT',
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
