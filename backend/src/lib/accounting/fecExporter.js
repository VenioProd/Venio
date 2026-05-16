import mongoose from 'mongoose'
import AccountingLine from '../../models/AccountingLine.js'
import Journal from '../../models/Journal.js'

// Exporteur FEC (Fichier des Écritures Comptables) — format légal défini par
// l'article A.47 A-1 du LPF.
// Spécifications :
//  - 18 colonnes, séparées par `|`
//  - Encodage UTF-8 (sans BOM)
//  - Sauts de ligne CRLF (\r\n)
//  - Tri chronologique par (JournalCode, EcritureDate, EcritureNum)
//  - Format décimal : virgule, jamais de séparateur de milliers
//  - Pipes dans les libellés remplacés par espaces

const VALID_STATUSES = ['VALIDATED', 'LOCKED']
const COLUMN_HEADERS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
]

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (value._id) return toObjectId(value._id)
  return null
}

/**
 * Formate une date en AAAAMMJJ (8 chiffres). Renvoie '' si date invalide.
 */
function formatDateFec(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

/**
 * Formate un montant en décimal avec virgule (ex 1234,56). Toujours 2 décimales.
 * Pas de séparateur de milliers.
 */
function formatAmountFec(n) {
  const v = Number(n || 0)
  return v.toFixed(2).replace('.', ',')
}

/**
 * Nettoie un champ texte : remplace les `|` et les retours à la ligne par
 * des espaces, trim final.
 */
function cleanField(value) {
  if (value == null) return ''
  return String(value)
    .replace(/\|/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

/**
 * Exporte les écritures comptables au format FEC.
 *
 * @param {Object} params
 * @param {Date} params.from              Date début incluse
 * @param {Date} params.to                Date fin incluse
 * @param {ObjectId|string} [params.fiscalYear]
 * @param {Writable} [params.stream]      Si fourni, écrit dans le stream.
 * @param {string} [params.siren]         SIREN pour composer le nom de fichier.
 * @returns {Promise<{ content: string|null, filename: string, lineCount: number }>}
 */
export async function exportFec({ from, to, fiscalYear, stream, siren } = {}) {
  if (!(from instanceof Date) || !(to instanceof Date)) {
    const err = new Error('from et to doivent être des Date')
    err.status = 400
    throw err
  }
  if (from > to) {
    const err = new Error('from doit être <= to')
    err.status = 400
    throw err
  }

  // Construction du filtre sur AccountingLine.
  const lineMatch = {
    date: { $gte: from, $lte: to },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) lineMatch.fiscalYear = fyId

  // Précharge les libellés journaux pour la sortie (on les lit depuis l'entry
  // mais via $lookup il faut aussi tomber sur le label complet).
  const journals = await Journal.find().lean()
  const journalLabelByCode = new Map(journals.map((j) => [j.code, j.label]))

  // Récupération paginée des lignes pour éviter de tout charger en mémoire si
  // la base est très grosse. On joint l'écriture pour pouvoir filtrer sur
  // status + récupérer entryNumber, label, validatedAt, pieceRef.
  const pipeline = [
    { $match: lineMatch },
    {
      $lookup: {
        from: 'accountingentries',
        let: { entryId: '$entry' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$entryId'] },
                  { $in: ['$status', VALID_STATUSES] },
                ],
              },
            },
          },
          {
            $project: {
              entryNumber: 1,
              journalCode: 1,
              date: 1,
              label: 1,
              pieceRef: 1,
              validatedAt: 1,
              lockedAt: 1,
              status: 1,
            },
          },
        ],
        as: 'entryDoc',
      },
    },
    { $match: { 'entryDoc.0': { $exists: true } } },
    { $unwind: '$entryDoc' },
    {
      $sort: {
        'entryDoc.journalCode': 1,
        'entryDoc.date': 1,
        'entryDoc.entryNumber': 1,
        sortIndex: 1,
      },
    },
    {
      $project: {
        _id: 1,
        accountCode: 1,
        accountLabel: 1,
        label: 1,
        debit: 1,
        credit: 1,
        date: 1,
        lettrage: 1,
        lettrageDate: 1,
        currency: 1,
        originalAmount: 1,
        originalCurrency: 1,
        entryNumber: '$entryDoc.entryNumber',
        journalCode: '$entryDoc.journalCode',
        entryDate: '$entryDoc.date',
        entryLabel: '$entryDoc.label',
        pieceRef: '$entryDoc.pieceRef',
        validatedAt: '$entryDoc.validatedAt',
        lockedAt: '$entryDoc.lockedAt',
      },
    },
  ]

  const writeMode = Boolean(stream)
  let buffer = ''
  let lineCount = 0

  function emit(line) {
    const text = `${line}\r\n`
    if (writeMode) {
      stream.write(text)
    } else {
      buffer += text
    }
  }

  // 1. En-tête
  emit(COLUMN_HEADERS.join('|'))

  // 2. Lignes
  const cursor = AccountingLine.aggregate(pipeline).cursor({ batchSize: 500 })
  for await (const row of cursor) {
    const journalCode = cleanField(row.journalCode)
    const journalLib = cleanField(journalLabelByCode.get(row.journalCode) || '')
    const ecritureNum = cleanField(row.entryNumber)
    const ecritureDate = formatDateFec(row.entryDate)
    const compteNum = cleanField(row.accountCode)
    const compteLib = cleanField(row.accountLabel)
    const compAuxNum = '' // MVP : pas d'auxiliaires
    const compAuxLib = ''
    const pieceRef = cleanField(row.pieceRef)
    const pieceDate = ecritureDate // pas de date de pièce distincte stockée
    const ecritureLib = cleanField(row.label || row.entryLabel || '')
    const debit = formatAmountFec(row.debit)
    const credit = formatAmountFec(row.credit)
    const ecritureLet = cleanField(row.lettrage)
    const dateLet = row.lettrage ? formatDateFec(row.lettrageDate) : ''
    const validDate = formatDateFec(row.validatedAt || row.lockedAt || row.entryDate)
    const currency = String(row.currency || 'EUR').toUpperCase()
    const isForeign = currency && currency !== 'EUR'
    const montantDevise = isForeign && row.originalAmount != null ? formatAmountFec(row.originalAmount) : ''
    const iDevise = isForeign ? cleanField(row.originalCurrency || currency) : ''

    const cols = [
      journalCode,
      journalLib,
      ecritureNum,
      ecritureDate,
      compteNum,
      compteLib,
      compAuxNum,
      compAuxLib,
      pieceRef,
      pieceDate,
      ecritureLib,
      debit,
      credit,
      ecritureLet,
      dateLet,
      validDate,
      montantDevise,
      iDevise,
    ]
    emit(cols.join('|'))
    lineCount += 1
  }

  // Nom de fichier : <SIREN>FEC<YYYYMMDD>.txt (à défaut FEC-YYYYMMDD.txt)
  const endYmd = formatDateFec(to)
  const sirenClean = String(siren || '').replace(/\D/g, '')
  const filename = sirenClean
    ? `${sirenClean}FEC${endYmd}.txt`
    : `FEC-${endYmd}.txt`

  return {
    content: writeMode ? null : buffer,
    filename,
    lineCount,
  }
}
