import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AccountingLine from '../../../models/AccountingLine.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import AuditLog from '../../../models/AuditLog.js'
import { letterLines, unletterCode } from '../../../lib/accounting/lettrage.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const VALID_STATUSES = ['VALIDATED', 'LOCKED']

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

/**
 * Charge un compte et 404 si introuvable.
 */
async function loadAccount(code) {
  const account = await ChartOfAccount.findOne({ code })
  return account
}

/**
 * Récupère les lignes d'un compte filtrées par état de lettrage.
 * Toujours filtrées sur entries VALIDATED/LOCKED. Enrichit chaque ligne avec
 * entryNumber et pieceRef remontés depuis l'écriture parente.
 */
async function fetchAccountLines({ accountCode, lettered }) {
  // Filtre principal sur les lignes.
  const lineFilter = { accountCode }
  if (lettered === true) {
    lineFilter.lettrage = { $ne: '' }
  } else if (lettered === false) {
    lineFilter.lettrage = ''
  }

  const lines = await AccountingLine.find(lineFilter).sort({ date: 1, _id: 1 }).lean()
  if (lines.length === 0) return []

  // Récupération des écritures parentes pour filtre statut + enrichissement.
  const entryIds = Array.from(new Set(lines.map((l) => String(l.entry))))
  const entries = await AccountingEntry.find(
    { _id: { $in: entryIds }, status: { $in: VALID_STATUSES } },
    { _id: 1, entryNumber: 1, pieceRef: 1, status: 1 }
  ).lean()
  const entryById = new Map(entries.map((e) => [String(e._id), e]))

  return lines
    .filter((l) => entryById.has(String(l.entry)))
    .map((l) => {
      const entry = entryById.get(String(l.entry))
      return {
        ...l,
        entryNumber: entry.entryNumber,
        pieceRef: entry.pieceRef,
      }
    })
}

// ----------------------------------------------------------------------------
// GET /account/:accountCode/unlettered
// Lignes non lettrées d'un compte (VALIDATED/LOCKED uniquement).
// ----------------------------------------------------------------------------
router.get(
  '/account/:accountCode/unlettered',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      const { accountCode } = req.params
      const account = await loadAccount(accountCode)
      if (!account) return res.status(404).json({ error: 'Compte introuvable' })
      const lines = await fetchAccountLines({ accountCode, lettered: false })
      res.json({
        account: {
          code: account.code,
          label: account.label,
          accountClass: account.accountClass,
          type: account.type,
          isLettrable: account.isLettrable,
        },
        lines: lines.map((l) => ({
          _id: l._id,
          date: l.date,
          journalCode: l.journalCode,
          entryNumber: l.entryNumber,
          pieceRef: l.pieceRef,
          label: l.label,
          debit: round2(l.debit),
          credit: round2(l.credit),
          lettrage: l.lettrage,
          entry: l.entry,
        })),
      })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /account/:accountCode/lettered
// Lignes lettrées d'un compte, groupées par code de lettrage.
// ----------------------------------------------------------------------------
router.get(
  '/account/:accountCode/lettered',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req, res, next) => {
    try {
      const { accountCode } = req.params
      const account = await loadAccount(accountCode)
      if (!account) return res.status(404).json({ error: 'Compte introuvable' })
      const lines = await fetchAccountLines({ accountCode, lettered: true })

      // Regroupement par code, ordonné par date de lettrage desc.
      const groupsMap = new Map()
      for (const line of lines) {
        const code = line.lettrage
        if (!groupsMap.has(code)) {
          groupsMap.set(code, {
            code,
            lineCount: 0,
            totalDebit: 0,
            totalCredit: 0,
            lettrageDate: line.lettrageDate || null,
            lines: [],
          })
        }
        const grp = groupsMap.get(code)
        grp.lineCount += 1
        grp.totalDebit += line.debit || 0
        grp.totalCredit += line.credit || 0
        if (line.lettrageDate && (!grp.lettrageDate || line.lettrageDate > grp.lettrageDate)) {
          grp.lettrageDate = line.lettrageDate
        }
        grp.lines.push({
          _id: line._id,
          date: line.date,
          journalCode: line.journalCode,
          entryNumber: line.entryNumber,
          pieceRef: line.pieceRef,
          label: line.label,
          debit: round2(line.debit),
          credit: round2(line.credit),
          lettrageDate: line.lettrageDate,
          entry: line.entry,
        })
      }

      const groups = Array.from(groupsMap.values())
        .map((g) => ({
          ...g,
          totalDebit: round2(g.totalDebit),
          totalCredit: round2(g.totalCredit),
        }))
        .sort((a, b) => {
          const da = a.lettrageDate ? new Date(a.lettrageDate).getTime() : 0
          const db = b.lettrageDate ? new Date(b.lettrageDate).getTime() : 0
          return db - da
        })

      res.json({
        account: {
          code: account.code,
          label: account.label,
          accountClass: account.accountClass,
          type: account.type,
          isLettrable: account.isLettrable,
        },
        groups,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// POST /
// body { lineIds: [...], code?, override? }
// ----------------------------------------------------------------------------
router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const { lineIds, code, override } = req.body || {}
    const result = await letterLines({ lineIds, code, override: Boolean(override) })
    AuditLog.record({
      action: 'LETTRAGE_APPLY',
      entityType: 'AccountingLine',
      entityRef: `${result.accountCode}:${result.code}`,
      actor: buildActorFromReq(req),
      summary: `Lettrage ${result.code} sur ${result.accountCode} (${result.lineCount} lignes)`,
      after: {
        code: result.code,
        accountCode: result.accountCode,
        lineCount: result.lineCount,
        totalDebit: result.totalDebit,
        totalCredit: result.totalCredit,
        balanced: result.balanced,
        partial: result.partial,
      },
      metadata: { lineIds, override: Boolean(override) },
    })
    res.status(201).json(result)
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

// ----------------------------------------------------------------------------
// DELETE /account/:accountCode/:code
// ----------------------------------------------------------------------------
router.delete(
  '/account/:accountCode/:code',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req, res, next) => {
    try {
      const { accountCode, code } = req.params
      const result = await unletterCode(accountCode, code)
      AuditLog.record({
        action: 'LETTRAGE_REMOVE',
        entityType: 'AccountingLine',
        entityRef: `${accountCode}:${String(code).toUpperCase()}`,
        actor: buildActorFromReq(req),
        summary: `Déletrage ${String(code).toUpperCase()} sur ${accountCode} (${result.unlinked} lignes)`,
        before: { accountCode, code: String(code).toUpperCase() },
        metadata: { unlinked: result.unlinked },
      })
      res.json(result)
    } catch (err) {
      if (err && err.status) {
        return res.status(err.status).json({ error: err.message })
      }
      next(err)
    }
  }
)

export default router
