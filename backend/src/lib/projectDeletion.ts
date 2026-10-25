import fs from 'node:fs/promises'
import path from 'node:path'
import AccountingLine from '../models/AccountingLine.js'
import BillingDocument from '../models/BillingDocument.js'
import Document from '../models/Document.js'
import Project from '../models/Project.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectMember from '../models/ProjectMember.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectSection from '../models/ProjectSection.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'
import type { IProject } from '../types/models/index.js'
import { runInTransaction } from './transaction.js'
import logger from './logger.js'

/**
 * Supprime un projet et tout ce qui n'existe que par lui, en une transaction.
 * Les fichiers ne sont effacés qu'après la validation : un échec disque laisse
 * au pire un fichier orphelin, jamais un projet à moitié supprimé.
 *
 * Un projet qui porte une facture ou une écriture comptable est refusé (409) :
 * ces pièces doivent survivre, on archive le projet à la place.
 */
export async function deleteProject(projectId: string): Promise<IProject | null> {
  const removed = await runInTransaction(async (session) => {
    const project = await Project.findById(projectId).session(session)
    if (!project) return null
    const money =
      (await BillingDocument.exists({ project: project._id }).session(session)) ||
      (await AccountingLine.exists({ project: project._id }).session(session))
    if (money) {
      throw Object.assign(new Error('Ce projet porte des factures ou des écritures comptables : archivez-le plutôt.'), {
        status: 409,
      })
    }
    const filter = { project: project._id }
    const items = await ProjectItem.find(filter).select('file.storagePath').session(session).lean()
    const documents = await Document.find(filter).select('storagePath').session(session).lean()
    const tasks = await Task.find(filter).select('attachments.storagePath').session(session).lean()
    const files = [
      ...items.map((item) => item.file?.storagePath),
      ...documents.map((document) => document.storagePath),
      ...tasks.flatMap((task) => task.attachments.map((attachment) => attachment.storagePath)),
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
