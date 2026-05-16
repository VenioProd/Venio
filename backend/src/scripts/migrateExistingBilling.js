/**
 * Migration ponctuelle : génère les écritures comptables manquantes pour
 * toutes les factures existantes (BillingDocument INVOICE).
 *
 * - Pour chaque facture en statut ISSUED/SENT/ACCEPTED/PAID : crée l'écriture VE
 * - Pour chaque facture PAID : crée aussi l'écriture BQ
 *
 * Idempotent : utilise les idempotencyKey, donc safe à relancer.
 *
 * Usage :
 *   node src/scripts/migrateExistingBilling.js
 *   node src/scripts/migrateExistingBilling.js --dry-run
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import BillingDocument from '../models/BillingDocument.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import Journal from '../models/Journal.js'
import VatRate from '../models/VatRate.js'
import { seedAccountingDefaults } from '../lib/accounting/pcgSeed.js'
import { createSaleEntryFromBilling } from '../lib/accounting/billingToEntry.js'
import { createPaymentEntryFromBilling } from '../lib/accounting/paymentToEntry.js'

dotenv.config()

const DRY_RUN = process.argv.includes('--dry-run')
const SALE_STATUSES = new Set(['ISSUED', 'SENT', 'ACCEPTED', 'PAID'])

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI manquant')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log(`Connecté à ${uri}`)
  console.log(`Mode : ${DRY_RUN ? 'DRY RUN (aucune écriture)' : 'EXÉCUTION'}`)

  // S'assurer que le PCG, journaux et taux TVA existent (idempotent)
  if (!DRY_RUN) {
    const seedResult = await seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })
    if (seedResult.accounts || seedResult.journals || seedResult.vatRates) {
      console.log(
        `Plan comptable initialisé : ${seedResult.accounts} comptes, ${seedResult.journals} journaux, ${seedResult.vatRates} taux TVA`
      )
    }
  }

  const invoices = await BillingDocument.find({ type: 'INVOICE' })
    .sort({ issuedAt: 1, createdAt: 1 })
    .lean()

  console.log(`${invoices.length} facture(s) trouvée(s)`)

  let saleCreated = 0
  let saleSkipped = 0
  let paymentCreated = 0
  let paymentSkipped = 0
  let errors = 0

  for (const invoice of invoices) {
    if (!SALE_STATUSES.has(invoice.status)) {
      console.log(`  ↷ ${invoice.number} statut=${invoice.status} : ignorée`)
      continue
    }

    if (DRY_RUN) {
      console.log(
        `  → ${invoice.number} : générerait une écriture VE${
          invoice.status === 'PAID' ? ' + BQ' : ''
        }`
      )
      continue
    }

    // Écriture VE
    try {
      const r = await createSaleEntryFromBilling(invoice)
      if (r.alreadyExisted) {
        saleSkipped += 1
      } else {
        saleCreated += 1
        console.log(`  ✓ ${invoice.number} → VE ${r.entry.entryNumber}`)
      }
    } catch (err) {
      errors += 1
      console.error(`  ✗ ${invoice.number} (VE) : ${err.message}`)
      continue
    }

    // Écriture BQ si payée
    if (invoice.status === 'PAID') {
      try {
        const r = await createPaymentEntryFromBilling(invoice)
        if (r.alreadyExisted) {
          paymentSkipped += 1
        } else {
          paymentCreated += 1
          console.log(`  ✓ ${invoice.number} → BQ ${r.entry.entryNumber}`)
        }
      } catch (err) {
        errors += 1
        console.error(`  ✗ ${invoice.number} (BQ) : ${err.message}`)
      }
    }
  }

  console.log('')
  console.log('=== Résumé ===')
  console.log(`Ventes créées       : ${saleCreated}`)
  console.log(`Ventes existantes   : ${saleSkipped}`)
  console.log(`Paiements créés     : ${paymentCreated}`)
  console.log(`Paiements existants : ${paymentSkipped}`)
  console.log(`Erreurs             : ${errors}`)

  await mongoose.disconnect()
  process.exit(errors > 0 ? 2 : 0)
}

main().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
