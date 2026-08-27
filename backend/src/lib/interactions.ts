import type { Types } from 'mongoose'
import Interaction from '../models/Interaction.js'
import LeadActivity from '../models/LeadActivity.js'
import ClientActivity from '../models/ClientActivity.js'
import type { InteractionSubjectType, InteractionKind, InteractionDirection } from '../types/models/index.js'

/** Plafond de lecture de la timeline. Au-delà, `hasMore` le signale au client. */
export const TIMELINE_MAX_ENTRIES = 200

export type TimelineSource = 'INTERACTION' | 'SYSTEM'

export interface TimelineAuthor {
  _id: string
  name: string
  email: string
}

export interface TimelineEntry {
  id: string
  source: TimelineSource
  kind: string
  direction: string
  occurredAt: string
  label: string
  body: string
  pinned: boolean
  author: TimelineAuthor | null
  recipients: { email: string; name: string; status: string; error: string }[]
  deliveryStatus: string
}

interface PopulatedAuthor {
  _id: unknown
  name?: string
  email?: string
}

function toAuthor(value: unknown): TimelineAuthor | null {
  if (!value || typeof value !== 'object') return null
  const author = value as PopulatedAuthor
  if (!author._id) return null
  return { _id: String(author._id), name: author.name || '', email: author.email || '' }
}

/**
 * Titre court d'une interaction. Un email porte son objet ; un appel ou un
 * rendez-vous n'en a pas, on montre alors le début du compte rendu plutôt
 * qu'une ligne vide.
 */
function interactionLabel(kind: string, subject: string, body: string): string {
  if (subject.trim()) return subject.trim()
  const firstLine = body.split('\n').find((line) => line.trim())
  if (firstLine) return firstLine.trim().slice(0, 140)
  return kind === 'CALL' ? 'Appel' : kind === 'MEETING' ? 'Rendez-vous' : 'Note'
}

export interface LogInteractionInput {
  subjectType: InteractionSubjectType
  subjectId: Types.ObjectId | string
  kind: InteractionKind
  direction?: InteractionDirection
  occurredAt?: Date
  subject?: string
  body?: string
  pinned?: boolean
  author?: Types.ObjectId | string | null
  recipients?: { email: string; name?: string; status: 'SENT' | 'FAILED'; error?: string }[]
  deliveryStatus?: 'NONE' | 'SENT' | 'PARTIAL' | 'FAILED'
}

export async function logInteraction(input: LogInteractionInput) {
  return Interaction.create({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    kind: input.kind,
    direction: input.direction ?? 'NONE',
    occurredAt: input.occurredAt ?? new Date(),
    subject: input.subject ?? '',
    body: input.body ?? '',
    pinned: input.pinned ?? false,
    author: input.author ?? null,
    recipients: (input.recipients ?? []).map((recipient) => ({
      email: recipient.email,
      name: recipient.name ?? '',
      status: recipient.status,
      error: recipient.error ?? '',
    })),
    deliveryStatus: input.deliveryStatus ?? 'NONE',
  })
}

/**
 * Timeline d'un lead ou d'un compte client : les échanges (Interaction,
 * éditables) et les événements système du journal correspondant (LeadActivity
 * ou ClientActivity, en lecture seule), fusionnés en une seule liste triée.
 *
 * L'agrégation vit ici et non dans le front : elle sert deux écrans, et le tri
 * mêle deux champs de date différents — `occurredAt` pour les échanges, qui
 * peut précéder leur saisie, `createdAt` pour les événements système.
 */
export async function buildTimeline(
  subjectType: InteractionSubjectType,
  subjectId: Types.ObjectId | string,
  options: { limit?: number } = {},
): Promise<{ entries: TimelineEntry[]; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? TIMELINE_MAX_ENTRIES, TIMELINE_MAX_ENTRIES)

  const systemQuery =
    subjectType === 'LEAD' ? LeadActivity.find({ leadId: subjectId }) : ClientActivity.find({ clientId: subjectId })

  const [interactions, systemEvents] = await Promise.all([
    Interaction.find({ subjectType, subjectId })
      .sort({ occurredAt: -1 })
      .limit(limit + 1)
      .populate('author', 'name email')
      .lean(),
    systemQuery
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('actorId', 'name email')
      .lean(),
  ])

  const fromInteractions: TimelineEntry[] = interactions.map((item) => ({
    id: String(item._id),
    source: 'INTERACTION',
    kind: item.kind,
    direction: item.direction,
    occurredAt: new Date(item.occurredAt).toISOString(),
    label: interactionLabel(item.kind, item.subject || '', item.body || ''),
    body: item.body || '',
    pinned: Boolean(item.pinned),
    author: toAuthor(item.author),
    recipients: (item.recipients || []).map((recipient) => ({
      email: recipient.email,
      name: recipient.name || '',
      status: recipient.status,
      error: recipient.error || '',
    })),
    deliveryStatus: item.deliveryStatus || 'NONE',
  }))

  const fromSystem: TimelineEntry[] = systemEvents.map((item) => ({
    id: String(item._id),
    source: 'SYSTEM',
    kind: item.type,
    direction: 'NONE',
    occurredAt: new Date(item.createdAt).toISOString(),
    label: item.label,
    body: '',
    pinned: false,
    author: toAuthor(item.actorId),
    recipients: [],
    deliveryStatus: 'NONE',
  }))

  // Épinglés en tête — le tri hérité des notes clients — puis par date décroissante.
  const merged = [...fromInteractions, ...fromSystem].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  })

  return { entries: merged.slice(0, limit), hasMore: merged.length > limit }
}

// ─── Compatibilité « notes client » ──────────────────────────────────────────
//
// Les notes internes d'un compte client vivaient dans ClientNote. Elles sont
// désormais des Interaction(NOTE, CLIENT), mais les routes admin et agent
// `/clients/:id/notes` gardent leur contrat : ces deux helpers font la
// traduction en un seul endroit.

export interface ClientNoteShape {
  _id: string
  clientId: string
  content: string
  createdBy: TimelineAuthor | null
  pinned: boolean
  visibility: 'INTERNE'
  createdAt: string
  updatedAt: string
}

export function toClientNoteShape(interaction: {
  _id: unknown
  subjectId: unknown
  body?: string
  author?: unknown
  pinned?: boolean
  createdAt: Date | string
  updatedAt: Date | string
}): ClientNoteShape {
  return {
    _id: String(interaction._id),
    clientId: String(interaction.subjectId),
    content: interaction.body || '',
    createdBy: toAuthor(interaction.author),
    pinned: Boolean(interaction.pinned),
    visibility: 'INTERNE',
    createdAt: new Date(interaction.createdAt).toISOString(),
    updatedAt: new Date(interaction.updatedAt).toISOString(),
  }
}

export async function listClientNotes(clientId: Types.ObjectId | string): Promise<ClientNoteShape[]> {
  const notes = await Interaction.find({ subjectType: 'CLIENT', subjectId: clientId, kind: 'NOTE' })
    .sort({ pinned: -1, createdAt: -1 })
    .populate('author', 'name email')
    .lean()
  return notes.map(toClientNoteShape)
}

export async function findClientNote(clientId: Types.ObjectId | string, noteId: string) {
  return Interaction.findOne({ _id: noteId, subjectType: 'CLIENT', subjectId: clientId, kind: 'NOTE' })
}
