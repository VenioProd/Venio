import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { deleteProject } from '../lib/projectDeletion.js'
import BillingDocument from '../models/BillingDocument.js'
import ChangeRequest from '../models/ChangeRequest.js'
import ClientUpload from '../models/ClientUpload.js'
import InternalTicket from '../models/InternalTicket.js'
import MissionBrief from '../models/MissionBrief.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Document from '../models/Document.js'
import Project from '../models/Project.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'
import SyncTombstone from '../models/SyncTombstone.js'
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'

const owner = new mongoose.Types.ObjectId()
let dir: string
const file = (name: string) => {
  const target = path.join(dir, name)
  fs.writeFileSync(target, name)
  return target
}

beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      BillingDocument,
      ClientUpload,
      Document,
      InternalTicket,
      MissionBrief,
      Project,
      ProjectItem,
      ProjectPhase,
      QuoteProposal,
      SyncTombstone,
      Task,
      TaskComment,
    ].map((model) => model.init()),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.restoreAllMocks()
  await clearDb()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venio-project-deletion-'))
})

it('supprime le projet, ce qui en dépend et ses fichiers, même si un fichier résiste', async () => {
  const project = await Project.create({ name: 'À supprimer', client: owner })
  const kept = await Project.create({ name: 'Voisin', client: owner })
  const itemFile = file('item.pdf')
  const documentFile = file('document.pdf')
  const stubborn = file('piece-jointe.png')
  await ProjectItem.create({
    project: project._id,
    type: 'AUTRE',
    title: 'Scan',
    createdBy: owner,
    file: { originalName: 'item.pdf', storagePath: itemFile, mimeType: 'application/pdf', size: 8 },
  })
  await ProjectItem.create({ project: kept._id, type: 'NOTE', title: 'Reste', createdBy: owner })
  await Document.create({
    project: project._id,
    type: 'FICHIER_PROJET',
    originalName: 'document.pdf',
    storagePath: documentFile,
    mimeType: 'application/pdf',
    uploadedBy: owner,
  })
  const task = await Task.create({
    project: project._id,
    title: 'Tâche',
    createdBy: owner,
    attachments: [{ originalName: 'piece-jointe.png', storagePath: stubborn, mimeType: 'image/png', size: 16 }],
  })
  await TaskComment.create({ task: task._id, author: owner, content: 'Commentaire' })
  await ProjectPhase.create({ project: project._id, title: 'Étape', createdBy: owner })
  await MissionBrief.create({
    project: project._id,
    destinataire: owner,
    intitule: 'Brief',
    deadline: new Date(),
    createdBy: owner,
  })
  await QuoteProposal.create({
    project: project._id,
    client: owner,
    createdBy: owner,
    title: 'Brouillon',
    status: 'DRAFT',
  })
  const upload = await ClientUpload.create({
    client: owner,
    project: project._id,
    originalName: 'brief.pdf',
    storagePath: file('depot.pdf'),
    mimeType: 'application/pdf',
    size: 9,
  })
  const ticket = await InternalTicket.create({
    project: project._id,
    title: 'Bug',
    message: 'Écran',
    authorId: owner,
    authorName: 'A',
  })
  const requestFile = path.join('uploads', 'change-requests', `test-${Date.now()}-demande.pdf`)
  fs.mkdirSync(path.dirname(requestFile), { recursive: true })
  fs.writeFileSync(requestFile, 'demande')
  await ChangeRequest.collection.insertOne({
    project: project._id,
    title: 'Demande',
    attachments: [{ filename: path.basename(requestFile) }],
    replies: [{ attachments: [] }],
  })

  const rm = fsPromises.rm
  vi.spyOn(fsPromises, 'rm').mockImplementation(async (target, options) => {
    if (String(target) === stubborn) throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    return rm(target, options)
  })

  expect((await deleteProject(String(project._id)))?._id).toEqual(project._id)
  expect(await Project.exists({ _id: project._id })).toBeNull()
  for (const model of [ProjectItem, Document, Task, ProjectPhase] as const) {
    expect(await (model as typeof Task).countDocuments({ project: project._id })).toBe(0)
  }
  expect(await TaskComment.countDocuments()).toBe(0)
  expect((await MissionBrief.countDocuments()) + (await QuoteProposal.countDocuments())).toBe(0)
  // Le dépôt du client et le ticket interne survivent, détachés du projet.
  expect((await ClientUpload.findById(upload._id))!.project).toBeNull()
  expect(fs.existsSync(upload.storagePath)).toBe(true)
  expect((await InternalTicket.findById(ticket._id))!.project).toBeNull()
  expect(await ChangeRequest.countDocuments()).toBe(0)
  expect(fs.existsSync(requestFile)).toBe(false)
  expect(await ProjectItem.countDocuments({ project: kept._id })).toBe(1)
  expect(fs.existsSync(itemFile) || fs.existsSync(documentFile)).toBe(false)
  expect(fs.existsSync(stubborn)).toBe(true)
  expect(await SyncTombstone.countDocuments({ entityType: 'projects', entityId: project._id })).toBe(1)
  expect(await deleteProject(String(project._id))).toBeNull()
})

it('refuse un projet qui porte une facture ou un devis envoyé, sans rien supprimer', async () => {
  const project = await Project.create({ name: 'Facturé', client: owner })
  const itemFile = file('contrat.pdf')
  await ProjectItem.create({
    project: project._id,
    type: 'CONTRAT',
    title: 'Contrat',
    createdBy: owner,
    file: { originalName: 'contrat.pdf', storagePath: itemFile, mimeType: 'application/pdf', size: 11 },
  })
  await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-SUPPR-1',
    project: project._id,
    client: owner,
    createdBy: owner,
    subtotal: 100,
    taxTotal: 20,
    total: 120,
  })
  await expect(deleteProject(String(project._id))).rejects.toMatchObject({ status: 409 })
  await BillingDocument.deleteMany({})
  await QuoteProposal.create({ project: project._id, client: owner, createdBy: owner, title: 'Envoyé', status: 'SENT' })
  await expect(deleteProject(String(project._id))).rejects.toMatchObject({ status: 409 })
  expect(await Project.exists({ _id: project._id })).not.toBeNull()
  expect(await ProjectItem.countDocuments({ project: project._id })).toBe(1)
  expect(fs.existsSync(itemFile)).toBe(true)
})
