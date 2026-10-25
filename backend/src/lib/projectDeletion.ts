import fs from 'node:fs/promises'
import path from 'node:path'
import AccountingLine from '../models/AccountingLine.js'
import ActivityLog from '../models/ActivityLog.js'
import BillingDocument from '../models/BillingDocument.js'
import ChangeRequest from '../models/ChangeRequest.js'
import ClientUpload from '../models/ClientUpload.js'
import Document from '../models/Document.js'
import InternalTicket from '../models/InternalTicket.js'
import Message from '../models/Message.js'
import MissionBrief from '../models/MissionBrief.js'
import Project from '../models/Project.js'
import ProjectChecklist from '../models/ProjectChecklist.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ProjectInvitation from '../models/ProjectInvitation.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectMember from '../models/ProjectMember.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectSection from '../models/ProjectSection.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import QuoteProposal from '../models/QuoteProposal.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'
import type { IProject } from '../types/models/index.js'
import { runInTransaction } from './transaction.js'
import { lockProject } from './projectWriteLock.js'
import logger from './logger.js'

/**
 * Supprime un projet et tout ce qui n'existe que par lui, en une transaction.
 * Les fichiers ne sont effacés qu'après la validation : un échec disque laisse
 * au pire un fichier orphelin, jamais un projet à moitié supprimé.
 *
 * Un projet qui porte une facture, une écriture comptable ou un devis déjà
 * envoyé est refusé (409) : ces pièces doivent survivre, on archive le projet.
 * Ce qui appartient à quelqu'un d'autre que le projet (tickets internes et
 * dépôts du client) est détaché plutôt que supprimé. Les demandes de changement
 * n'ont de sens que pour leur projet : elles partent avec lui.
 */
export async function deleteProject(projectId: string): Promise<IProject | null> {
  const removed = await runInTransaction(async (session) => {
    const project = await Project.findById(projectId).session(session)
    if (!project) return null
    // Écrire le projet avant de chercher ses factures : une création concurrente,
    // qui verrouille le même document, entre alors en conflit avec la suppression.
    await lockProject(project._id, session)
    const committed =
      (await BillingDocument.exists({ project: project._id }).session(session)) ||
      (await AccountingLine.exists({ project: project._id }).session(session)) ||
      (await QuoteProposal.exists({ project: project._id, status: { $ne: 'DRAFT' } }).session(session))
    if (committed) {
      throw Object.assign(
        new Error('Ce projet porte des factures, des écritures comptables ou des devis envoyés : archivez-le plutôt.'),
        { status: 409 },
      )
    }
    const filter = { project: project._id }
    const items = await ProjectItem.find(filter).select('file.storagePath').session(session).lean()
    const documents = await Document.find(filter).select('storagePath').session(session).lean()
    const tasks = await Task.find(filter).select('attachments.storagePath').session(session).lean()
    const requests = await ChangeRequest.find(filter)
      .select('attachments.filename replies.attachments.filename')
      .session(session)
      .lean()
    const files = [
      ...items.map((item) => item.file?.storagePath),
      ...documents.map((document) => document.storagePath),
      ...tasks.flatMap((task) => task.attachments.map((attachment) => attachment.storagePath)),
      ...requests
        .flatMap((request) => [...request.attachments, ...request.replies.flatMap((reply) => reply.attachments)])
        .map((attachment) => path.join('uploads', 'change-requests', attachment.filename)),
    ].filter((file): file is string => Boolean(file))

    // Opérations séquentielles : une transaction n'accepte pas d'écritures parallèles.
    await TaskComment.deleteMany({ task: { $in: tasks.map((task) => task._id) } }, { session })
    await Task.deleteMany(filter, { session })
    await ProjectItem.deleteMany(filter, { session })
    await Document.deleteMany(filter, { session })
    await ProjectSection.deleteMany(filter, { session })
    await ProjectUpdate.deleteMany(filter, { session })
    await ProjectPhase.deleteMany(filter, { session })
    await ProjectMember.deleteMany(filter, { session })
    await ProjectFinance.deleteMany(filter, { session })
    await ShareRuleVersion.deleteMany(filter, { session })
    await MissionBrief.deleteMany(filter, { session })
    await Message.deleteMany(filter, { session })
    await ProjectInvitation.deleteMany(filter, { session })
    await ProjectChecklist.deleteMany(filter, { session })
    await QuoteProposal.deleteMany(filter, { session })
    await ActivityLog.deleteMany(filter, { session })
    await InternalTicket.updateMany(filter, { $set: { project: null } }, { session })
    await ChangeRequest.deleteMany(filter, { session })
    await ClientUpload.updateMany(filter, { $set: { project: null } }, { session })
    await Project.deleteOne({ _id: project._id }, { session })
    return { project, files }
  })
  if (!removed) return null

  for (const file of removed.files) {
    try {
      await fs.rm(path.resolve(file), { force: true })
    } catch (err) {
      logger.warn({ err, file, projectId }, 'Fichier du projet supprimé non effacé du disque')
    }
  }
  return removed.project
}
