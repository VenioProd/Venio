import { seedAccountingDefaults } from '../../src/lib/accounting/pcgSeed.js'
import ChartOfAccount from '../../src/models/ChartOfAccount.js'
import Journal from '../../src/models/Journal.js'
import VatRate from '../../src/models/VatRate.js'

/**
 * Insère le plan comptable général, les journaux par défaut et les taux de
 * TVA standards dans la base de test. Idempotent (safe à appeler plusieurs
 * fois). Doit être appelé après connectTestDb() ET après chaque clean
 * `afterEach` (puisqu'on vide les collections).
 */
export async function seedPcg() {
  return seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })
}

export default seedPcg
