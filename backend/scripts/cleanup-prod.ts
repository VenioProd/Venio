/**
 * Script de nettoyage prod : vide les clients (role=CLIENT) et les projets internes.
 *
 * Usage (depuis backend/ sur le serveur prod) :
 *   # 1) Toujours commencer par un dry-run pour voir ce qui serait supprimé :
 *   npx tsx scripts/cleanup-prod.ts
 *
 *   # 2) Si OK, lancer la vraie suppression :
 *   npx tsx scripts/cleanup-prod.ts --apply
 *
 * Le script lit MONGODB_URI depuis le .env du backend.
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

import User from '../src/models/User.js'
import Project from '../src/models/Project.js'
import ProjectItem from '../src/models/ProjectItem.js'
import ProjectSection from '../src/models/ProjectSection.js'
import ProjectChecklist from '../src/models/ProjectChecklist.js'
import ProjectUpdate from '../src/models/ProjectUpdate.js'
import Task from '../src/models/Task.js'
import BillingDocument from '../src/models/BillingDocument.js'
import ClientNote from '../src/models/ClientNote.js'
import ClientContact from '../src/models/ClientContact.js'
import ClientActivity from '../src/models/ClientActivity.js'
import Document from '../src/models/Document.js'
import Message from '../src/models/Message.js'
import MissionBrief from '../src/models/MissionBrief.js'
import Lead from '../src/models/Lead.js'
import Notification from '../src/models/Notification.js'

import InternalProject from '../src/models/InternalProject.js'
import InternalMission from '../src/models/InternalMission.js'

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGODB_URI
if (!MONGO_URI) {
  console.error('❌ MONGODB_URI manquant dans .env')
  process.exit(1)
}

function log(label: string, n: number) {
  const tag = APPLY ? '🗑️  SUPPRIMÉ' : '👀 [dry-run] à supprimer'
  console.log(`  ${tag} : ${n.toString().padStart(5, ' ')} × ${label}`)
}

async function cleanupClients() {
  console.log('\n═══════════════════════════════════════════')
  console.log('🧹 NETTOYAGE CLIENTS (role=CLIENT)')
  console.log('═══════════════════════════════════════════')

  const clients = await User.find({ role: 'CLIENT' }).select('_id email').lean()
  const clientIds = clients.map((c) => c._id)
  console.log(`\n📊 ${clients.length} compte(s) CLIENT trouvé(s)`)
  if (clients.length === 0) return

  // 1. Projets liés à ces clients
  const projects = await Project.find({ client: { $in: clientIds } }).select('_id').lean()
  const projectIds = projects.map((p) => p._id)
  log('Project (rattachés à un client)', projects.length)

  // Données liées aux projets
  const tasksCount = await Task.countDocuments({ project: { $in: projectIds } })
  log('Task (tâches projet)', tasksCount)

  const itemsCount = await ProjectItem.countDocuments({ project: { $in: projectIds } })
  log('ProjectItem (livrables, etc.)', itemsCount)

  const sectionsCount = await ProjectSection.countDocuments({ project: { $in: projectIds } })
  log('ProjectSection', sectionsCount)

  const checklistsCount = await ProjectChecklist.countDocuments({ project: { $in: projectIds } })
  log('ProjectChecklist', checklistsCount)

  const updatesCount = await ProjectUpdate.countDocuments({ project: { $in: projectIds } })
  log('ProjectUpdate', updatesCount)

  const documentsCount = await Document.countDocuments({ project: { $in: projectIds } })
  log('Document', documentsCount)

  const messagesCount = await Message.countDocuments({ project: { $in: projectIds } })
  log('Message (projet)', messagesCount)

  const briefsCount = await MissionBrief.countDocuments({ project: { $in: projectIds } })
  log('MissionBrief', briefsCount)

  // Données directement liées au client
  const billingCount = await BillingDocument.countDocuments({ client: { $in: clientIds } })
  log('BillingDocument (devis/factures)', billingCount)

  const notesCount = await ClientNote.countDocuments({ clientId: { $in: clientIds } })
  log('ClientNote', notesCount)

  const contactsCount = await ClientContact.countDocuments({ clientId: { $in: clientIds } })
  log('ClientContact', contactsCount)

  const activitiesCount = await ClientActivity.countDocuments({ clientId: { $in: clientIds } })
  log('ClientActivity', activitiesCount)

  // Leads qui pointent vers un compte client → on délie (clientAccountId = null)
  const leadsLinked = await Lead.countDocuments({ clientAccountId: { $in: clientIds } })
  console.log(`  🔗 Lead.clientAccountId à délier (set null) : ${leadsLinked}`)

  // Notifications adressées à ces utilisateurs
  const notifCount = await Notification.countDocuments({ recipient: { $in: clientIds } })
  log('Notification (destinées aux clients)', notifCount)

  // Comptes utilisateurs eux-mêmes
  log('User (role=CLIENT)', clients.length)

  if (!APPLY) {
    console.log('\n💡 Dry-run terminé. Relance avec --apply pour appliquer.')
    return
  }

  console.log('\n⚠️  Application des suppressions en cours...')
  await Task.deleteMany({ project: { $in: projectIds } })
  await ProjectItem.deleteMany({ project: { $in: projectIds } })
  await ProjectSection.deleteMany({ project: { $in: projectIds } })
  await ProjectChecklist.deleteMany({ project: { $in: projectIds } })
  await ProjectUpdate.deleteMany({ project: { $in: projectIds } })
  await Document.deleteMany({ project: { $in: projectIds } })
  await Message.deleteMany({ project: { $in: projectIds } })
  await MissionBrief.deleteMany({ project: { $in: projectIds } })
  await BillingDocument.deleteMany({ client: { $in: clientIds } })
  await ClientNote.deleteMany({ clientId: { $in: clientIds } })
  await ClientContact.deleteMany({ clientId: { $in: clientIds } })
  await ClientActivity.deleteMany({ clientId: { $in: clientIds } })
  await Lead.updateMany({ clientAccountId: { $in: clientIds } }, { $set: { clientAccountId: null } })
  await Notification.deleteMany({ recipient: { $in: clientIds } })
  await Project.deleteMany({ _id: { $in: projectIds } })
  await User.deleteMany({ _id: { $in: clientIds } })
  console.log('✅ Clients & données associées supprimés.')
}

async function cleanupInternalProjects() {
  console.log('\n═══════════════════════════════════════════')
  console.log('🧹 NETTOYAGE PROJETS INTERNES')
  console.log('═══════════════════════════════════════════')

  const projects = await InternalProject.find().select('_id name').lean()
  const projectIds = projects.map((p) => p._id)
  console.log(`\n📊 ${projects.length} projet(s) interne(s) trouvé(s)`)
  if (projects.length === 0) return

  const missions = await InternalMission.find({ internalProject: { $in: projectIds } })
    .select('_id files')
    .lean()
  log('InternalMission', missions.length)
  log('InternalProject', projects.length)

  // Fichiers physiques uploadés (uploads/mission-files)
  const filesToDelete: string[] = []
  for (const m of missions) {
    for (const f of (m as any).files || []) {
      if (f.storagePath) filesToDelete.push(f.storagePath)
    }
  }
  console.log(`  📁 Fichiers disque à supprimer : ${filesToDelete.length}`)

  if (!APPLY) {
    console.log('\n💡 Dry-run terminé. Relance avec --apply pour appliquer.')
    return
  }

  console.log('\n⚠️  Application des suppressions en cours...')
  // Supprimer fichiers physiques d'abord
  let removed = 0
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        removed++
      }
    } catch (err) {
      console.warn(`  ⚠️  Échec suppression fichier ${filePath}: ${(err as Error).message}`)
    }
  }
  console.log(`  📁 Fichiers disque supprimés : ${removed}/${filesToDelete.length}`)

  await InternalMission.deleteMany({ internalProject: { $in: projectIds } })
  await InternalProject.deleteMany({ _id: { $in: projectIds } })
  console.log('✅ Projets internes & missions supprimés.')
}

async function main() {
  console.log(`\n🔌 Connexion à ${MONGO_URI!.replace(/\/\/.*@/, '//***:***@')}`)
  await mongoose.connect(MONGO_URI!)
  console.log('✅ Connecté.')
  console.log(`\n${APPLY ? '🚨 MODE APPLY (suppressions réelles)' : '👀 MODE DRY-RUN (aucune modification)'}`)

  try {
    await cleanupClients()
    await cleanupInternalProjects()
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 Déconnecté.')
  }
}

main().catch((err) => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
