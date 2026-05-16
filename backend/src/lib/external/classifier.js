import ClassificationRule from '../../models/ClassificationRule.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'

/**
 * Classifier — applique les ClassificationRule d'une source à un payload
 * normalisé, puis construit les lignes d'écriture comptable.
 *
 * Pipeline :
 *   1. Charger les rules enabled triées par priority desc
 *   2. Évaluer les conditions (premier match wins)
 *   3. Si match : appliquer mapping (journal, comptes, TVA, autoValidate, label)
 *   4. Sinon : fallback sur les defaults de la source
 *   5. Construire les lignes en mode 2 (à partir de amount/vatRate)
 *   6. Si le payload est déjà en mode 1 (lines fournies), on les utilise telles
 *      quelles — la rule ne sert qu'à déterminer journalCode et autoValidate.
 *
 * Retourne :
 *   {
 *     journalCode,           string (ex: 'VE')
 *     lines: [...],          [{ accountCode, label, debit, credit, vatRateValue?, auxiliaryRef? }]
 *     autoValidate,          bool — détermine status DRAFT/VALIDATED
 *     ruleId,                ObjectId|null
 *     labelTemplate,         string utilisé pour le label général de l'écriture
 *     auxiliaryWarnings,     [string] — pour MVP : notes informatives
 *   }
 */

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function asRegex(value) {
  if (!value) return null
  try {
    return new RegExp(String(value))
  } catch {
    return null
  }
}

/**
 * Évalue les conditions d'une rule contre un payload normalisé.
 * Retourne true si TOUTES les conditions présentes matchent.
 */
function ruleMatches(rule, payload) {
  const c = rule.conditions || {}

  if (c.type && c.type !== payload.type) return false

  if (c.categoryRegex) {
    const rx = asRegex(c.categoryRegex)
    if (!rx || !rx.test(payload.category || '')) return false
  }

  if (c.descriptionRegex) {
    const rx = asRegex(c.descriptionRegex)
    if (!rx || !rx.test(payload.description || '')) return false
  }

  const amount =
    payload.amount != null
      ? Number(payload.amount)
      : payload.lines
        ? round2(payload.lines.reduce((s, l) => s + Math.max(l.debit || 0, l.credit || 0), 0))
        : 0

  if (c.amountMin != null && amount < Number(c.amountMin)) return false
  if (c.amountMax != null && amount > Number(c.amountMax)) return false

  if (c.currency && c.currency.toUpperCase() !== (payload.currency || 'EUR').toUpperCase()) {
    return false
  }

  if (Array.isArray(c.tagsAll) && c.tagsAll.length > 0) {
    const tags = new Set((payload.tags || []).map((t) => String(t)))
    for (const t of c.tagsAll) {
      if (!tags.has(String(t))) return false
    }
  }

  if (Array.isArray(c.tagsAny) && c.tagsAny.length > 0) {
    const tags = new Set((payload.tags || []).map((t) => String(t)))
    const ok = c.tagsAny.some((t) => tags.has(String(t)))
    if (!ok) return false
  }

  return true
}

/**
 * Substitution simple dans labelTemplate :
 *   {description}, {externalId}, {date}, {type}, {category}
 */
function renderLabel(template, payload) {
  if (!template) {
    return payload.description || `${payload.type} ${payload.externalId || ''}`.trim()
  }
  const dateStr =
    payload.date instanceof Date ? payload.date.toISOString().slice(0, 10) : String(payload.date || '')
  return String(template)
    .replace(/\{description\}/g, payload.description || '')
    .replace(/\{externalId\}/g, payload.externalId || '')
    .replace(/\{date\}/g, dateStr)
    .replace(/\{type\}/g, payload.type || '')
    .replace(/\{category\}/g, payload.category || '')
    .trim()
}

/**
 * Construit les lignes d'écriture en mode 2 (depuis amount + vatRate)
 * selon le type d'opération. amount est TTC.
 *
 * Comptes utilisés (résolus dans cet ordre) :
 *   - Mapping rule (debitAccount/creditAccount) si défini
 *   - Sinon defaults de la source (defaultRevenueAccount, etc.)
 */
function buildLinesMode2(payload, source, mapping, label, warnings) {
  const amountTTC = round2(payload.amount)
  const rate = mapping.useVatFromPayload !== false && payload.vatRate != null
    ? Number(payload.vatRate)
    : Number(mapping.vatRateValue || 0)
  const ht = rate > 0 ? round2(amountTTC / (1 + rate / 100)) : amountTTC
  const tva = round2(amountTTC - ht)

  const customerAccount = source.defaultCustomerAccount || '411000'
  const supplierAccount = '401000' // standard, pas de default dédié sur ExternalSource
  const bankAccount = source.defaultBankAccount || '512000'
  const vatCollected = source.defaultVatCollectedAccount || '445710'
  const vatDeductible = source.defaultVatDeductibleAccount || '445660'
  const revenueAccount = mapping.creditAccount || source.defaultRevenueAccount || '706000'
  const expenseAccount = mapping.debitAccount || source.defaultExpenseAccount || '604000'

  // Compte auxiliaire client si demandé
  let clientLineAuxRef
  if (mapping.assignToAuxiliary && payload.customerExternalId) {
    clientLineAuxRef = {
      kind: 'CLIENT',
      externalId: payload.customerExternalId,
    }
    warnings.push(
      'assignToAuxiliary=true : la création automatique de compte auxiliaire 411XXX est un TODO ; la référence est conservée dans auxiliaryRef.'
    )
  }

  switch (payload.type) {
    case 'SALE': {
      // 411 D=TTC / 706 C=HT / 445710 C=TVA
      const lines = [
        {
          accountCode: customerAccount,
          label,
          debit: amountTTC,
          credit: 0,
          auxiliaryRef: clientLineAuxRef,
        },
        {
          accountCode: revenueAccount,
          label: rate > 0 ? `${label} — base HT ${rate}%` : label,
          debit: 0,
          credit: ht,
          vatRateValue: rate,
        },
      ]
      if (tva > 0) {
        lines.push({
          accountCode: vatCollected,
          label: `TVA collectée ${rate}%`,
          debit: 0,
          credit: tva,
          vatRateValue: rate,
        })
      }
      return lines
    }

    case 'REFUND': {
      // Inverse de SALE
      const lines = [
        {
          accountCode: revenueAccount,
          label: rate > 0 ? `${label} — base HT ${rate}%` : label,
          debit: ht,
          credit: 0,
          vatRateValue: rate,
        },
      ]
      if (tva > 0) {
        lines.push({
          accountCode: vatCollected,
          label: `TVA collectée ${rate}% (avoir)`,
          debit: tva,
          credit: 0,
          vatRateValue: rate,
        })
      }
      lines.push({
        accountCode: customerAccount,
        label,
        debit: 0,
        credit: amountTTC,
        auxiliaryRef: clientLineAuxRef,
      })
      return lines
    }

    case 'EXPENSE': {
      // 604 D=HT / 445660 D=TVA / 401 C=TTC
      const lines = [
        {
          accountCode: expenseAccount,
          label: rate > 0 ? `${label} — base HT ${rate}%` : label,
          debit: ht,
          credit: 0,
          vatRateValue: rate,
        },
      ]
      if (tva > 0) {
        lines.push({
          accountCode: vatDeductible,
          label: `TVA déductible ${rate}%`,
          debit: tva,
          credit: 0,
          vatRateValue: rate,
        })
      }
      lines.push({
        accountCode: supplierAccount,
        label,
        debit: 0,
        credit: amountTTC,
      })
      return lines
    }

    case 'PAYMENT': {
      // Encaissement client : 512 D=amount / 411 C=amount
      return [
        {
          accountCode: bankAccount,
          label,
          debit: amountTTC,
          credit: 0,
        },
        {
          accountCode: customerAccount,
          label,
          debit: 0,
          credit: amountTTC,
          auxiliaryRef: clientLineAuxRef,
        },
      ]
    }

    case 'FEE': {
      // Frais bancaires : 627800 D=HT / 445660 D=TVA / 512 C=TTC
      const feeAccount = mapping.debitAccount || '627800'
      const lines = [
        {
          accountCode: feeAccount,
          label: rate > 0 ? `${label} — base HT ${rate}%` : label,
          debit: ht,
          credit: 0,
          vatRateValue: rate,
        },
      ]
      if (tva > 0) {
        lines.push({
          accountCode: vatDeductible,
          label: `TVA déductible ${rate}%`,
          debit: tva,
          credit: 0,
          vatRateValue: rate,
        })
      }
      lines.push({
        accountCode: bankAccount,
        label,
        debit: 0,
        credit: amountTTC,
      })
      return lines
    }

    case 'TRANSFER': {
      // Virement interne : nécessite metadata.sourceAccount + metadata.destinationAccount
      const meta = payload.metadata || {}
      const dest =
        meta.destinationAccount || mapping.debitAccount || source.defaultBankAccount || '512000'
      const src =
        meta.sourceAccount || mapping.creditAccount || source.defaultBankAccount || '512000'
      if (dest === src) {
        warnings.push(
          'TRANSFER : sourceAccount et destinationAccount identiques — écriture probablement invalide.'
        )
      }
      return [
        {
          accountCode: String(dest),
          label,
          debit: amountTTC,
          credit: 0,
        },
        {
          accountCode: String(src),
          label,
          debit: 0,
          credit: amountTTC,
        },
      ]
    }

    case 'ADJUSTMENT':
    default: {
      // Pas de mapping standard — on utilise les comptes du mapping s'ils sont définis
      const dr = mapping.debitAccount || source.defaultExpenseAccount || '658000'
      const cr = mapping.creditAccount || source.defaultRevenueAccount || '758000'
      return [
        { accountCode: dr, label, debit: amountTTC, credit: 0 },
        { accountCode: cr, label, debit: 0, credit: amountTTC },
      ]
    }
  }
}

/**
 * Tente de résoudre un compte auxiliaire 411XXX existant pour un externalId
 * client donné. MVP : on cherche un ChartOfAccount avec auxiliaryRef.kind=CLIENT
 * et un parent 411000. Si non trouvé : on stocke la ref textuelle.
 *
 * (utilitaire exporté pour usage futur depuis admin)
 */
export async function resolveAuxiliaryAccount(externalId, kind = 'CLIENT') {
  if (!externalId) return null
  const acc = await ChartOfAccount.findOne({
    isAuxiliary: true,
    'auxiliaryRef.kind': kind,
    code: { $regex: '^411' },
  }).lean()
  return acc || null
}

/**
 * Point d'entrée principal.
 *
 * @param {object} source             ExternalSource doc (peut être lean)
 * @param {object} normalizedPayload  Sortie de normalizePayload()
 * @returns {Promise<object>}         { journalCode, lines, autoValidate, ruleId, labelTemplate, auxiliaryWarnings }
 */
export async function classifyTransaction(source, normalizedPayload) {
  const warnings = []

  // 1. Charger les rules
  const rules = await ClassificationRule.find({ source: source._id, enabled: true })
    .sort({ priority: -1, createdAt: 1 })
    .lean()

  // 2. Trouver la première qui match
  let matched = null
  for (const rule of rules) {
    if (ruleMatches(rule, normalizedPayload)) {
      matched = rule
      break
    }
  }

  // 3. Mapping : rule.mapping ou defaults source
  const mapping = matched?.mapping || {}
  const journalCode =
    mapping.journalCode ||
    normalizedPayload.journalCode ||
    source.defaultJournalCode ||
    'VE'

  const autoValidate = matched ? Boolean(mapping.autoValidate) : Boolean(source.autoValidateAll)

  // 4. Label final
  const label = renderLabel(
    mapping.labelTemplate,
    normalizedPayload
  ) || normalizedPayload.description || `${normalizedPayload.type} ${normalizedPayload.externalId}`

  // 5. Construction des lignes
  let lines
  if (Array.isArray(normalizedPayload.lines) && normalizedPayload.lines.length > 0) {
    // Mode 1 : on garde les lignes telles que fournies par le client
    lines = normalizedPayload.lines.map((l) => ({
      accountCode: l.accountCode,
      label: l.label || label,
      debit: l.debit,
      credit: l.credit,
      vatRateValue: l.vatRateValue != null ? l.vatRateValue : undefined,
      lettrage: l.lettrage || undefined,
      auxiliaryRef: l.auxiliaryRef || undefined,
    }))
  } else {
    // Mode 2 : construction à partir de amount + vatRate
    lines = buildLinesMode2(normalizedPayload, source, mapping, label, warnings)
  }

  // Mise à jour stats de la rule (best effort)
  if (matched) {
    ClassificationRule.updateOne(
      { _id: matched._id },
      { $inc: { matchCount: 1 }, $set: { lastMatchedAt: new Date() } }
    ).catch(() => {
      /* noop */
    })
  }

  return {
    journalCode,
    lines,
    autoValidate,
    ruleId: matched?._id || null,
    labelTemplate: label,
    auxiliaryWarnings: warnings,
  }
}
