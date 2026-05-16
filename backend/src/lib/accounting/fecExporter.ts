import mongoose, { type Types, type PipelineStage } from 'mongoose'
import type { Writable } from 'node:stream'
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

const VALID_STATUSES = ['VALIDATED', 'LOCKED'] as const

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

type ObjectIdInput = string | Types.ObjectId | { _id: Types.ObjectId | string } | null | undefined

function toObjectId(value: ObjectIdInput): Types.ObjectId | null {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (typeof value === 'object' && '_id' in value && value._id) {
    return toObjectId(value._id as ObjectIdInput)
  }
  return null
}

/**
 * Formate une date en AAAAMMJJ (8 chiffres). Renvoie '' si date invalide.
 */
function formatDateFec(date: Date | string | null | undefined): string {
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
function formatAmountFec(n: number | null | undefined): string {
  const v = Number(n || 0)
  return v.toFixed(2).replace('.', ',')
}

/**
 * Nettoie un champ texte : remplace les `|` et les retours à la ligne par
 * des espaces, trim final.
 */
function cleanField(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/\|/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
}

export interface ExportFecParams {
  from: Date
  to: Date
  fiscalYear?: ObjectIdInput
  stream?: Writable
  siren?: string
}

export interface ExportFecResult {
  content: string | null
  filename: string
  lineCount: number
}

// Forme brute des lignes remontées par l'agrégation FEC.
interface FecRow {
  _id: Types.ObjectId
  accountCode: string
  accountLabel: string
  label: string
  debit: number
  credit: number
  date: Date
  lettrage: string
  lettrageDate: Date | null
  currency: string
  originalAmount: number | null
  originalCurrency: string
  entryNumber: string
  journalCode: string
  entryDate: Date
  entryLabel: string
  pieceRef: string
  validatedAt: Date | null
  lockedAt: Date | null
}

/**
 * Exporte les écritures comptables au format FEC.
 *
 * Si un `stream` est fourni, écrit dedans sans stocker le résultat en mémoire
 * (utile pour les exports annuels). Sinon, renvoie tout le contenu dans
 * `content` (utile pour les tests / petits exports).
 */
export async function exportFec(params: ExportFecParams): Promise<ExportFecResult> {
  const { from, to, fiscalYear, stream, siren } = params || ({} as ExportFecParams)

  if (!(from instanceof Date) || !(to instanceof Date)) {
    const err = new Error('from et to doivent être des Date') as Error & { status?: number }
    err.status = 400
    throw err
  }
  if (from > to) {
    const err = new Error('from doit être <= to') as Error & { status?: number }
    err.status = 400
    throw err
  }

  // Construction du filtre sur AccountingLine.
  const lineMatch: Record<string, unknown> = {
    date: { $gte: from, $lte: to },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) lineMatch.fiscalYear = fyId

  // Précharge les libellés journaux pour la sortie.
  const journals = await Journal.find().lean()
  const journalLabelByCode = new Map<string, string>(journals.map((j) => [j.code, j.label]))

  // Récupération paginée des lignes pour éviter de tout charger en mémoire.
  const pipeline: PipelineStage[] = [
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

  function emit(line: string): void {
    const text = `${line}\r\n`
    if (writeMode && stream) {
      stream.write(text)
    } else {
      buffer += text
    }
  }

  // 1. En-tête
  emit(COLUMN_HEADERS.join('|'))

  // 2. Lignes
  const cursor = AccountingLine.aggregate<FecRow>(pipeline).cursor({ batchSize: 500 })
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
    const isForeign = Boolean(currency) && currency !== 'EUR'
    const montantDevise =
      isForeign && row.originalAmount != null ? formatAmountFec(row.originalAmount) : ''
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
  const filename = sirenClean ? `${sirenClean}FEC${endYmd}.txt` : `FEC-${endYmd}.txt`

  return {
    content: writeMode ? null : buffer,
    filename,
    lineCount,
  }
}
