import ExternalSource from '../../src/models/ExternalSource.js'
import { createEntry } from '../../src/lib/accounting/doubleEntry.js'
import { generateApiKey, generateWebhookSecret } from '../../src/lib/external/apiKey.js'

/**
 * Factories utilitaires pour la création d'objets de test.
 *
 * Chaque factory accepte un objet d'options partielles et fournit des
 * defaults raisonnables pour le reste, afin que chaque test n'ait à préciser
 * que ce qui le concerne.
 */

/**
 * Crée une écriture comptable via la pipeline officielle (doubleEntry.createEntry).
 *
 * @param {Object} options
 * @param {string} [options.journalCode='VE']
 * @param {Date|string} [options.date=new Date()]
 * @param {string} [options.label='Ecriture test']
 * @param {string} [options.pieceRef='']
 * @param {Array}  options.lines  — chaque ligne : { account, debit, credit, ... }
 * @param {string} [options.status='VALIDATED']
 * @param {string} [options.source='MANUAL']
 * @param {string} [options.userId]
 * @returns {Promise<{ entry: object, lines: object[] }>}
 */
export async function makeEntry({
  journalCode = 'VE',
  date = new Date(),
  label = 'Ecriture test',
  pieceRef = '',
  lines,
  status = 'VALIDATED',
  source = 'MANUAL',
  userId,
} = {}) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('makeEntry: lines (≥2) requis')
  }
  return createEntry({
    journal: journalCode,
    date,
    label,
    pieceRef,
    lines,
    status,
    source,
    createdBy: userId,
  })
}

/**
 * Crée une ExternalSource ACTIVE en base et renvoie la source + la clé API
 * en clair + le webhookSecret. Les valeurs en clair ne sont disponibles qu'à
 * la création (côté prod elles sont affichées une seule fois à l'admin).
 *
 * @param {Object} options
 * @param {string} [options.slug='arrow']
 * @param {boolean} [options.autoValidateAll=false]
 * @param {string} [options.status='ACTIVE']
 * @param {number} [options.timestampToleranceSec=300]
 * @returns {Promise<{ source: object, apiKey: string, secret: string }>}
 */
export async function makeExternalSource({
  slug = 'arrow',
  autoValidateAll = false,
  status = 'ACTIVE',
  timestampToleranceSec = 300,
  defaultJournalCode = 'VE',
  defaultCustomerAccount = '411000',
  defaultRevenueAccount = '706000',
  defaultExpenseAccount = '604000',
  defaultBankAccount = '512000',
  defaultVatCollectedAccount = '445710',
  defaultVatDeductibleAccount = '445660',
} = {}) {
  const { plain: apiKey, hash, prefix } = await generateApiKey()
  const secret = generateWebhookSecret()
  const source = await ExternalSource.create({
    slug,
    name: slug.toUpperCase(),
    description: `Source de test ${slug}`,
    apiKeyHash: hash,
    apiKeyPrefix: prefix,
    webhookSecret: secret,
    timestampToleranceSec,
    status,
    autoValidateAll,
    rateLimitPerMin: 1000, // évite tout faux positif rate limit en test
    defaultJournalCode,
    defaultCustomerAccount,
    defaultRevenueAccount,
    defaultExpenseAccount,
    defaultBankAccount,
    defaultVatCollectedAccount,
    defaultVatDeductibleAccount,
  })
  return { source, apiKey, secret }
}

export default { makeEntry, makeExternalSource }
