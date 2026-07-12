/**
 * Script de nettoyage des données de démo / test.
 *
 * Ce script remplace le bloc de suppression automatique qui était exécuté au
 * démarrage du serveur. Il doit être lancé MANUELLEMENT après un seed de démo,
 * jamais en production sans backup préalable.
 *
 * Usage :
 *   npm run cleanup:demo:dry            → liste ce qui serait supprimé (sans supprimer)
 *   ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry   → dry-run avec garde activé
 *   ALLOW_DEMO_CLEANUP=true npm run cleanup:demo       → suppression réelle
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { pathToFileURL } from 'url'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import ClientActivity from '../models/ClientActivity.js'

dotenv.config()

export function assertDemoCleanupAllowed(value = process.env.ALLOW_DEMO_CLEANUP): void {
  if (value !== 'true') {
    throw new Error('Set ALLOW_DEMO_CLEANUP=true to run demo cleanup')
  }
}

export function hasDryRunFlag(args = process.argv): boolean {
  return args.includes('--dry-run')
}

// --- Données ciblées -------------------------------------------------------
const testAdminEmails = [
  'hugo@venio.paris',
  'ines@venio.paris',
  'maxime@venio.paris',
]

const testClientExact = [
  'demo@venio.com',
  't.bernard@agencelumiere.com',
  'c.roux@ecosolutions.eu',
  'marie.dupont@techvision.fr',
  'julie@startupflow.io',
  'p.lefebvre@maisonverte.fr',
  'sophie@digitalfirst.co',
  'lucas@studionord.fr',
  'n.simon@datadrive.io',
  'emma@artetcie.com',
  'a.girard@scaleuplab.com',
]

const demoLeadCompanies = [
  'TechVision SAS', 'Agence Lumière', 'Startup Flow', 'Maison Verte',
  'Digital First', 'Studio Nord', 'Eco Solutions', 'DataDrive',
  'Art & Cie', 'Scale Up Lab',
]

// ---------------------------------------------------------------------------

interface CleanupOptions {
  dryRun: boolean
  allowDemoCleanup?: string
}

export async function cleanupDemoData({ dryRun, allowDemoCleanup }: CleanupOptions): Promise<void> {
  assertDemoCleanupAllowed(allowDemoCleanup)
  console.log(`🔎 Mode : ${dryRun ? 'DRY RUN (aucune suppression)' : 'EXÉCUTION RÉELLE'}`)
  console.log('')

  // --- 1. Comptes de test (admins + clients fictifs) -----------------------
  console.log('── Comptes de test ──────────────────────────────────')
  const testAdmins = await User.find({ email: { $in: testAdminEmails } })
  const testClients = await User.find({
    $or: [
      { email: { $in: testClientExact } },
      { email: { $regex: '@demo\\.local$' } },
      { email: { $regex: '@venio-fictif\\.local$' } },
    ],
  })
  const allTestUsers = [...testAdmins, ...testClients]
  const allTestUserIds = allTestUsers.map((u) => u._id)

  if (allTestUsers.length === 0) {
    console.log('  ✓ Aucun compte de test trouvé')
  } else {
    console.log(`  → ${allTestUsers.length} compte(s) trouvé(s) :`)
    for (const u of allTestUsers) {
      console.log(`    • ${u.email}`)
    }

    if (!dryRun) {
      const deletedProjects = await Project.deleteMany({ client: { $in: allTestUserIds } })
      await ClientActivity.deleteMany({ clientId: { $in: allTestUserIds } })
      const deletedUsers = await User.deleteMany({ _id: { $in: allTestUserIds } })
      console.log(`  🧹 Supprimé : ${deletedUsers.deletedCount} compte(s), ${deletedProjects.deletedCount} projet(s) associé(s)`)
    } else {
      // Dry-run : afficher les projets qui seraient supprimés
      const projectsToDelete = await Project.find({ client: { $in: allTestUserIds } }).select('projectNumber name')
      if (projectsToDelete.length > 0) {
        console.log(`  → ${projectsToDelete.length} projet(s) associé(s) à supprimer :`)
        for (const p of projectsToDelete) {
          console.log(`    • ${p.projectNumber ?? '(sans numéro)'} – ${p.name ?? '(sans nom)'}`)
        }
      }
      console.log('  ↷ DRY RUN : aucune suppression effectuée')
    }
  }
  console.log('')

  // --- 2. Leads de démo ---------------------------------------------------
  console.log('── Leads de démo ────────────────────────────────────')
  const demoLeads = await Lead.find({ company: { $in: demoLeadCompanies } })

  if (demoLeads.length === 0) {
    console.log('  ✓ Aucun lead de démo trouvé')
  } else {
    console.log(`  → ${demoLeads.length} lead(s) trouvé(s) :`)
    for (const l of demoLeads) {
      console.log(`    • ${l.company}`)
    }

    if (!dryRun) {
      const leadIds = demoLeads.map((l) => l._id)
      await LeadActivity.deleteMany({ leadId: { $in: leadIds } })
      const deletedLeads = await Lead.deleteMany({ _id: { $in: leadIds } })
      console.log(`  🧹 Supprimé : ${deletedLeads.deletedCount} lead(s)`)
    } else {
      console.log('  ↷ DRY RUN : aucune suppression effectuée')
    }
  }
  console.log('')

  // --- 3. Projets fictifs (seed) ------------------------------------------
  console.log('── Projets fictifs (seed) ───────────────────────────')
  const fictionalFilter = {
    $or: [
      { internalNotes: { $regex: /fictif/i } },
      { internalNotes: { $regex: /seed/i } },
      { projectNumber: { $regex: /^PROJ-DEMO-/ } },
    ],
  }

  if (!dryRun) {
    const fictionalProjects = await Project.deleteMany(fictionalFilter)
    if (fictionalProjects.deletedCount > 0) {
      console.log(`  🧹 Supprimé : ${fictionalProjects.deletedCount} projet(s) fictif(s)`)
    } else {
      console.log('  ✓ Aucun projet fictif trouvé')
    }
  } else {
    const fictionalProjects = await Project.find(fictionalFilter).select('projectNumber name')
    if (fictionalProjects.length === 0) {
      console.log('  ✓ Aucun projet fictif trouvé')
    } else {
      console.log(`  → ${fictionalProjects.length} projet(s) fictif(s) trouvé(s) :`)
      for (const p of fictionalProjects) {
        console.log(`    • ${p.projectNumber ?? '(sans numéro)'} – ${p.name ?? '(sans nom)'}`)
      }
      console.log('  ↷ DRY RUN : aucune suppression effectuée')
    }
  }
  console.log('')

  if (dryRun) {
    console.log('✅ DRY RUN terminé — aucune donnée n\'a été modifiée.')
  } else {
    console.log('✅ Cleanup terminé.')
  }
}

export async function main(): Promise<void> {
  assertDemoCleanupAllowed()

  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(uri)
  console.log('🔗 Connecté à MongoDB')
  try {
    await cleanupDemoData({ dryRun: hasDryRunFlag() })
  } finally {
    await mongoose.disconnect()
  }
}

const invokedAsScript = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedAsScript) {
  void main().catch((err: unknown) => {
    console.error('❌ Erreur fatale :', err)
    process.exit(1)
  })
}
