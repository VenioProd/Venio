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
    [BillingDocument, Document, Project, ProjectItem, ProjectPhase, SyncTombstone, Task, TaskComment].map((model) =>
      model.init(),
    ),
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
  expect(await ProjectItem.countDocuments({ project: kept._id })).toBe(1)
  expect(fs.existsSync(itemFile) || fs.existsSync(documentFile)).toBe(false)
  expect(fs.existsSync(stubborn)).toBe(true)
  expect(await SyncTombstone.countDocuments({ entityType: 'projects', entityId: project._id })).toBe(1)
  expect(await deleteProject(String(project._id))).toBeNull()
})

it('refuse un projet qui porte une facture, sans rien supprimer', async () => {
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
  expect(await Project.exists({ _id: project._id })).not.toBeNull()
  expect(await ProjectItem.countDocuments({ project: project._id })).toBe(1)
  expect(fs.existsSync(itemFile)).toBe(true)
})
