import express from 'express'
import ExternalSource from '../models/ExternalSource.js'
import ExternalTransaction from '../models/ExternalTransaction.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AuditLog from '../models/AuditLog.js'
import { verifyApiKey } from '../lib/external/apiKey.js'
import { verifySignature } from '../lib/external/hmac.js'
import { consume as rateLimitConsume } from '../lib/external/rateLimit.js'
import { normalizePayload } from '../lib/external/normalize.js'
import { classifyTransaction } from '../lib/external/classifier.js'
import { createEntry } from '../lib/accounting/doubleEntry.js'

/**
 * Routes publiques pour les sources externes (Arrow, ecom-bcg, etc.)
 *
 * IMPORTANT : ce router est monté AVANT express.json() dans index.js, car
 * la vérification HMAC nécessite le raw body en bytes. Le router utilise
 * express.raw() pour stocker le buffer brut dans req.body et parse le JSON
 * manuellement à l'intérieur des handlers.
 *
 * Versioning : header X-Venio-Api-Version (loggé seulement, pas refusé).
 *
 * ============================================================================
 * Exemples cURL
 * ============================================================================
 *
 * 1) Ping (public, pas d'auth)
 *
 *   curl https://api.venio.paris/api/external/arrow/ping
 *
 * 2) Calcul de la signature côté client (pseudo-bash) :
 *
 *   TS=$(date +%s)
 *   BODY='{"externalId":"ARROW-INV-1","type":"SALE","date":"2026-05-16T10:30:00Z","amount":1200,"vatRate":20,"description":"Test"}'
 *   SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $2}')"
 *
 *   curl -X POST https://api.venio.paris/api/external/arrow/entries \
 *     -H "Content-Type: application/json" \
 *     -H "X-Api-Key: vno_live_xxx..." \
 *     -H "X-Venio-Signature: $SIG" \
 *     -H "X-Venio-Timestamp: $TS" \
 *     -H "X-Venio-Api-Version: 2026-01" \
 *     -H "Idempotency-Key: $(uuidgen)" \
 *     --data-binary "$BODY"
 *
 * 3) Batch (max 100 entries) :
 *
 *   { "entries": [ { externalId: "...", type: "SALE", ... }, ... ] }
 *
 *   Chaque entry du batch reçoit sa propre clé d'idempotency dérivée :
 *   <Idempotency-Key>:<externalId>
 *
 * 4) Récupération du statut d'une transaction (mêmes headers que POST,
 *    mais sans body → la signature porte sur '<timestamp>.') :
 *
 *   curl https://api.venio.paris/api/external/arrow/entries/ARROW-INV-1 \
 *     -H "X-Api-Key: ..." -H "X-Venio-Signature: ..." \
 *     -H "X-Venio-Timestamp: ..." -H "Idempotency-Key: $(uuidgen)"
 *
 * ============================================================================
 * Codes d'erreur
 * ============================================================================
 *   401 INVALID_SIGNATURE     signature HMAC incorrecte
 *   401 TIMESTAMP_OUT_OF_RANGE  timestamp hors fenêtre (±300s par défaut)
 *   401 UNKNOWN_API_KEY       clé inconnue / hash bcrypt ne matche pas
 *   401 MISSING_HEADERS       un des headers obligatoires absent
 *   403 SOURCE_INACTIVE       source PAUSED ou DISABLED
 *   404 SOURCE_NOT_FOUND      slug inconnu
 *   413 BATCH_TOO_LARGE       plus de 100 entries dans un batch
 *   415 UNSUPPORTED_MEDIA     Content-Type !== application/json
 *   422 INVALID_PAYLOAD       validation normalize/classify échouée
 *   429 RATE_LIMITED          quota dépassé (header Retry-After fourni)
 *   500 INTERNAL              erreur serveur inattendue
 *
 * ============================================================================
 */

const router = express.Router()

const MAX_BATCH = 100
const RAW_LIMIT = '2mb'

// Body raw uniquement (HMAC). On accepte aussi les requêtes sans body
// (GET) — express.raw n'en touche que si Content-Type est application/json
// donc on protège via un middleware d'options.
router.use(
  express.raw({
    type: () => true, // capture tout, on filtrera ensuite
    limit: RAW_LIMIT,
  })
)

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function respondError(res, status, code, message) {
  return res.status(status).json({ error: message, code })
}

function bufferOrEmpty(reqBody) {
  if (Buffer.isBuffer(reqBody)) return reqBody
  if (reqBody == null) return Buffer.alloc(0)
  if (typeof reqBody === 'string') return Buffer.from(reqBody, 'utf8')
  // Cas express.raw avec body vide : peut être {} → on renvoie buffer vide
  if (typeof reqBody === 'object' && Object.keys(reqBody).length === 0) {
    return Buffer.alloc(0)
  }
  return Buffer.from(JSON.stringify(reqBody), 'utf8')
}

function parseJsonBody(rawBuffer) {
  if (!rawBuffer || rawBuffer.length === 0) return null
  const text = rawBuffer.toString('utf8')
  try {
    return JSON.parse(text)
  } catch (err) {
    const e = new Error('JSON invalide : ' + err.message)
    e.status = 400
    e.code = 'INVALID_JSON'
    throw e
  }
}

// ----------------------------------------------------------------------------
// Ping (public)
// ----------------------------------------------------------------------------

router.get('/:sourceSlug/ping', async (req, res, next) => {
  try {
    const slug = String(req.params.sourceSlug || '').toLowerCase()
    res.json({ ok: true, slug, serverTime: new Date().toISOString() })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// Middleware d'authentification (signature + clé + timestamp + idempotency)
// Charge req.externalSource, req.rawBody, req.parsedBody, req.idempotencyKey
// ----------------------------------------------------------------------------

async function authenticateSource(req, res, next) {
  try {
    const slug = String(req.params.sourceSlug || '').toLowerCase()

    // 1. Charger la source
    const source = await ExternalSource.findOne({ slug })
    if (!source) {
      return respondError(res, 404, 'SOURCE_NOT_FOUND', `Source ${slug} inconnue`)
    }
    if (source.status !== 'ACTIVE') {
      return respondError(
        res,
        403,
        'SOURCE_INACTIVE',
        `Source ${slug} non active (${source.status})`
      )
    }

    // 2. Content-Type strict pour les requêtes avec body
    const method = req.method.toUpperCase()
    const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH'
    if (hasBody) {
      const ct = String(req.headers['content-type'] || '').toLowerCase()
      if (!ct.startsWith('application/json')) {
        return respondError(
          res,
          415,
          'UNSUPPORTED_MEDIA',
          'Content-Type doit être application/json'
        )
      }
    }

    // 3. Headers obligatoires
    const apiKey = req.headers['x-api-key']
    const signature = req.headers['x-venio-signature']
    const timestampHeader = req.headers['x-venio-timestamp']
    const idempotencyKey = req.headers['idempotency-key']
    const apiVersion = req.headers['x-venio-api-version'] || ''

    if (!apiKey || !signature || !timestampHeader || !idempotencyKey) {
      return respondError(
        res,
        401,
        'MISSING_HEADERS',
        'Headers requis : X-Api-Key, X-Venio-Signature, X-Venio-Timestamp, Idempotency-Key'
      )
    }

    // 4. Timestamp dans la fenêtre
    const ts = Number(timestampHeader)
    if (!Number.isFinite(ts)) {
      return respondError(res, 401, 'TIMESTAMP_OUT_OF_RANGE', 'Timestamp invalide')
    }
    const nowSec = Math.floor(Date.now() / 1000)
    const tolerance = Number(source.timestampToleranceSec || 300)
    if (Math.abs(nowSec - ts) > tolerance) {
      return respondError(
        res,
        401,
        'TIMESTAMP_OUT_OF_RANGE',
        `Timestamp hors fenêtre (±${tolerance}s)`
      )
    }

    // 5. Récupérer le raw body (Buffer)
    const rawBody = bufferOrEmpty(req.body)

    // 6. Vérifier la signature HMAC
    const sigOk = verifySignature(ts, rawBody, source.webhookSecret, String(signature))
    if (!sigOk) {
      // On note l'erreur sur la source pour debug
      source.lastErrorAt = new Date()
      source.lastError = 'INVALID_SIGNATURE'
      source.save().catch(() => {})
      return respondError(res, 401, 'INVALID_SIGNATURE', 'Signature HMAC invalide')
    }

    // 7. Vérifier la clé API (bcrypt)
    const keyOk = await verifyApiKey(String(apiKey), source.apiKeyHash)
    if (!keyOk) {
      return respondError(res, 401, 'UNKNOWN_API_KEY', 'Clé API inconnue')
    }

    // 8. Rate limit
    const limit = Number(source.rateLimitPerMin || 60)
    const rl = rateLimitConsume(String(source._id), limit)
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      return respondError(res, 429, 'RATE_LIMITED', 'Quota par minute dépassé')
    }

    // 9. Parser le JSON si body présent
    let parsed = null
    if (rawBody.length > 0) {
      try {
        parsed = parseJsonBody(rawBody)
      } catch (err) {
        return respondError(res, err.status || 400, err.code || 'INVALID_JSON', err.message)
      }
    }

    req.externalSource = source
    req.rawBody = rawBody
    req.parsedBody = parsed
    req.idempotencyKey = String(idempotencyKey)
    req.apiVersion = String(apiVersion)

    return next()
  } catch (err) {
    return next(err)
  }
}

// ----------------------------------------------------------------------------
// POST /:sourceSlug/entries  — ingestion (single ou batch)
// ----------------------------------------------------------------------------

/**
 * Traite UN entry. Retourne { externalId, status, transactionId, entry, errors? }.
 * Persiste un ExternalTransaction (status RECEIVED → POSTED / AWAITING_REVIEW / DUPLICATE / REJECTED).
 */
async function processSingleEntry({ source, rawPayload, idempotencyKey, requestIp, requestUserAgent }) {
  const externalIdHint = rawPayload && typeof rawPayload === 'object' ? rawPayload.externalId : ''

  // 1. Idempotency : si déjà reçu, on renvoie immédiatement
  const existing = await ExternalTransaction.findOne({
    source: source._id,
    idempotencyKey,
  }).lean()
  if (existing) {
    const generatedEntry = existing.generatedEntry
      ? await AccountingEntry.findById(existing.generatedEntry).lean()
      : null
    // On incrémente le compteur de doublons (best effort)
    ExternalSource.updateOne(
      { _id: source._id },
      { $inc: { totalDuplicates: 1 }, $set: { lastSeenAt: new Date() } }
    ).catch(() => {})
    return {
      externalId: existing.externalId || externalIdHint || '',
      status: 'DUPLICATE',
      transactionId: existing._id,
      entry: generatedEntry
        ? {
            _id: generatedEntry._id,
            entryNumber: generatedEntry.entryNumber,
            status: generatedEntry.status,
          }
        : null,
      duplicate: true,
    }
  }

  // 2. Logger la transaction brute AVANT traitement
  let externalTx
  try {
    externalTx = await ExternalTransaction.create({
      source: source._id,
      sourceSlug: source.slug,
      externalId: externalIdHint || '',
      idempotencyKey,
      status: 'RECEIVED',
      rawPayload,
      requestIp: requestIp || '',
      requestUserAgent: requestUserAgent || '',
      signatureVerified: true,
    })
  } catch (err) {
    // Cas typique : violation d'unicité concurrente → on retry en lecture
    if (err && err.code === 11000) {
      const race = await ExternalTransaction.findOne({
        source: source._id,
        idempotencyKey,
      }).lean()
      if (race) {
        return {
          externalId: race.externalId || externalIdHint || '',
          status: 'DUPLICATE',
          transactionId: race._id,
          entry: null,
          duplicate: true,
        }
      }
    }
    throw err
  }

  // 3. Normalisation + classification + création d'écriture
  try {
    const normalized = normalizePayload(rawPayload)
    const classification = await classifyTransaction(source, normalized)

    const entryIdempotencyKey = `external:${source.slug}:${idempotencyKey}`

    const result = await createEntry({
      journal: classification.journalCode,
      date: normalized.date,
      label: classification.labelTemplate,
      pieceRef: normalized.externalId || '',
      lines: classification.lines.map((l) => ({
        account: l.accountCode,
        label: l.label,
        debit: l.debit,
        credit: l.credit,
        vatRateValue: l.vatRateValue,
        lettrage: l.lettrage,
        auxiliaryRef: l.auxiliaryRef
          ? { kind: l.auxiliaryRef.kind || '', id: null }
          : undefined,
      })),
      source: 'EXTERNAL',
      externalSource: source._id,
      sourceRef: { kind: 'EXTERNAL_TX', id: externalTx._id },
      idempotencyKey: entryIdempotencyKey,
      status: classification.autoValidate ? 'VALIDATED' : 'DRAFT',
      currency: normalized.currency || 'EUR',
      notes: classification.auxiliaryWarnings?.join(' | ') || '',
    })

    // 4. Mettre à jour la transaction
    externalTx.status = classification.autoValidate ? 'POSTED' : 'AWAITING_REVIEW'
    externalTx.autoValidated = Boolean(classification.autoValidate)
    externalTx.matchedRule = classification.ruleId || null
    externalTx.normalizedPayload = normalized
    externalTx.generatedEntry = result.entry._id
    externalTx.externalId = normalized.externalId || externalTx.externalId
    externalTx.processedAt = new Date()
    await externalTx.save()

    // 5. Stats source
    ExternalSource.updateOne(
      { _id: source._id },
      {
        $inc: { totalIngested: 1 },
        $set: { lastSeenAt: new Date() },
      }
    ).catch(() => {})

    // 6. Audit de l'ingestion (actor EXTERNAL) — uniquement si une vraie
    //    écriture a été créée (pas pour un dédoublonnage / déjà existant).
    if (!result.alreadyExisted) {
      AuditLog.record({
        action: 'ENTRY_CREATE',
        entityType: 'AccountingEntry',
        entityId: result.entry._id,
        entityRef: result.entry.entryNumber,
        actor: {
          type: 'EXTERNAL',
          externalSourceSlug: source.slug,
          ip: requestIp || '',
          userAgent: requestUserAgent || '',
        },
        summary: `Ingestion ${source.slug} → ${result.entry.entryNumber} (${result.entry.status})`,
        after: {
          entryNumber: result.entry.entryNumber,
          journalCode: result.entry.journalCode,
          date: result.entry.date,
          status: result.entry.status,
          totalDebit: result.entry.totalDebit,
          totalCredit: result.entry.totalCredit,
        },
        metadata: {
          sourceSlug: source.slug,
          externalId: normalized.externalId || '',
          externalTransactionId: externalTx._id,
          autoValidated: Boolean(classification.autoValidate),
          matchedRule: classification.ruleId || null,
        },
      })
    }

    return {
      externalId: normalized.externalId,
      status: classification.autoValidate ? 'POSTED' : 'AWAITING_REVIEW',
      transactionId: externalTx._id,
      entry: {
        _id: result.entry._id,
        entryNumber: result.entry.entryNumber,
        status: result.entry.status,
      },
    }
  } catch (err) {
    // Échec normalisation / classification / création
    const reason =
      err.errors && Array.isArray(err.errors)
        ? JSON.stringify(err.errors)
        : err.message || 'Erreur inconnue'
    externalTx.status = 'REJECTED'
    externalTx.errorReason = reason
    externalTx.processedAt = new Date()
    await externalTx.save().catch(() => {})

    ExternalSource.updateOne(
      { _id: source._id },
      {
        $inc: { totalRejected: 1 },
        $set: {
          lastSeenAt: new Date(),
          lastErrorAt: new Date(),
          lastError: String(err.message || '').slice(0, 500),
        },
      }
    ).catch(() => {})

    return {
      externalId: externalIdHint || '',
      status: 'REJECTED',
      transactionId: externalTx._id,
      entry: null,
      errors: err.errors || [{ field: '_root', message: err.message || 'Erreur inconnue' }],
    }
  }
}

router.post('/:sourceSlug/entries', authenticateSource, async (req, res, next) => {
  try {
    const source = req.externalSource
    const body = req.parsedBody
    if (!body || typeof body !== 'object') {
      return respondError(res, 422, 'INVALID_PAYLOAD', 'Body JSON requis')
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] || '').toString().split(',')[0]
    const ua = String(req.headers['user-agent'] || '')

    // Détecter single vs batch
    let entries
    let isBatch = false
    if (Array.isArray(body.entries)) {
      isBatch = true
      entries = body.entries
    } else {
      entries = [body]
    }

    if (isBatch && entries.length > MAX_BATCH) {
      return respondError(
        res,
        413,
        'BATCH_TOO_LARGE',
        `Batch limité à ${MAX_BATCH} entries (reçu : ${entries.length})`
      )
    }
    if (entries.length === 0) {
      return respondError(res, 422, 'INVALID_PAYLOAD', 'Aucun entry à traiter')
    }

    // Traitement séquentiel (idempotency + équilibre côté base)
    const results = []
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]
      // Clé d'idempotency par entry :
      //   - single : idempotencyKey global
      //   - batch  : <idempotencyKey>:<externalId>
      const externalIdForKey =
        (e && typeof e === 'object' && e.externalId) || `idx-${i}`
      const itemKey = isBatch
        ? `${req.idempotencyKey}:${externalIdForKey}`
        : req.idempotencyKey

      try {
        const r = await processSingleEntry({
          source,
          rawPayload: e,
          idempotencyKey: itemKey,
          requestIp: ip,
          requestUserAgent: ua,
        })
        results.push(r)
      } catch (err) {
        results.push({
          externalId: externalIdForKey,
          status: 'REJECTED',
          transactionId: null,
          entry: null,
          errors: [{ field: '_root', message: err.message || 'Erreur interne' }],
        })
      }
    }

    const summary = {
      posted: results.filter((r) => r.status === 'POSTED').length,
      awaitingReview: results.filter((r) => r.status === 'AWAITING_REVIEW').length,
      duplicate: results.filter((r) => r.status === 'DUPLICATE').length,
      rejected: results.filter((r) => r.status === 'REJECTED').length,
    }

    // Choix du code HTTP
    let httpStatus = 200
    if (results.length > 1) {
      // batch
      if (summary.rejected === results.length) httpStatus = 422
      else if (summary.rejected > 0) httpStatus = 207
      else httpStatus = 200
    } else {
      // single
      const only = results[0]
      if (only.status === 'REJECTED') httpStatus = 422
      else httpStatus = 200
    }

    return res.status(httpStatus).json({ results, summary })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// GET /:sourceSlug/entries/:externalId — réconciliation
// ----------------------------------------------------------------------------

router.get('/:sourceSlug/entries/:externalId', authenticateSource, async (req, res, next) => {
  try {
    const source = req.externalSource
    const externalId = String(req.params.externalId || '')
    const tx = await ExternalTransaction.findOne({
      source: source._id,
      externalId,
    })
      .sort({ receivedAt: -1 })
      .lean()
    if (!tx) {
      return res.status(404).json({
        error: `Aucune transaction trouvée pour externalId=${externalId}`,
        code: 'TRANSACTION_NOT_FOUND',
      })
    }
    let entry = null
    if (tx.generatedEntry) {
      entry = await AccountingEntry.findById(tx.generatedEntry).lean()
    }
    return res.json({ transaction: tx, entry })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// GET /:sourceSlug/entries — pagination cursor pour réconciliation périodique
// ----------------------------------------------------------------------------

function encodeCursor(item) {
  const payload = JSON.stringify({
    r: new Date(item.receivedAt).getTime(),
    i: String(item._id),
  })
  return Buffer.from(payload, 'utf8').toString('base64')
}

function decodeCursor(cursor) {
  if (!cursor) return null
  try {
    const obj = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'))
    if (!obj || !obj.r || !obj.i) return null
    return { receivedAt: new Date(Number(obj.r)), _id: String(obj.i) }
  } catch {
    return null
  }
}

router.get('/:sourceSlug/entries', authenticateSource, async (req, res, next) => {
  try {
    const source = req.externalSource
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const from = req.query.from ? new Date(String(req.query.from)) : null
    const to = req.query.to ? new Date(String(req.query.to)) : null
    const cursor = decodeCursor(req.query.cursor)

    const filter = { source: source._id }
    if (from || to) {
      filter.receivedAt = {}
      if (from && !Number.isNaN(from.getTime())) filter.receivedAt.$gte = from
      if (to && !Number.isNaN(to.getTime())) filter.receivedAt.$lte = to
    }
    if (cursor) {
      // Tri receivedAt desc puis _id desc → on continue avec ($lt)
      filter.$or = [
        { receivedAt: { $lt: cursor.receivedAt } },
        {
          receivedAt: cursor.receivedAt,
          _id: { $lt: cursor._id },
        },
      ]
    }

    const items = await ExternalTransaction.find(filter)
      .sort({ receivedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()

    let nextCursor = null
    let page = items
    if (items.length > limit) {
      page = items.slice(0, limit)
      nextCursor = encodeCursor(page[page.length - 1])
    }

    return res.json({ items: page, nextCursor })
  } catch (err) {
    next(err)
  }
})

// Handler d'erreur local (codes et format JSON cohérents)
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  const status = err.status || 500
  res.status(status).json({
    error: err.message || 'Erreur interne',
    code: err.code || 'INTERNAL',
  })
})

export default router
