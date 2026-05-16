import express, { type Request, type Response, type NextFunction } from 'express'
import type { Types } from 'mongoose'
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
import type {
  IExternalSource,
  IExternalTransaction,
} from '../types/models/index.js'

/**
 * Routes publiques pour les sources externes (Arrow, ecom-bcg, etc.)
 *
 * IMPORTANT : ce router est monté AVANT express.json() dans index.ts, car
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
 *   401 INVALID_SIGNATURE      signature HMAC incorrecte
 *   401 TIMESTAMP_OUT_OF_RANGE timestamp hors fenêtre (±300s par défaut)
 *   401 UNKNOWN_API_KEY        clé inconnue / hash bcrypt ne matche pas
 *   401 MISSING_HEADERS        un des headers obligatoires absent
 *   403 SOURCE_INACTIVE        source PAUSED ou DISABLED
 *   404 SOURCE_NOT_FOUND       slug inconnu
 *   413 BATCH_TOO_LARGE        plus de 100 entries dans un batch
 *   415 UNSUPPORTED_MEDIA      Content-Type !== application/json
 *   422 INVALID_PAYLOAD        validation normalize/classify échouée
 *   429 RATE_LIMITED           quota dépassé (header Retry-After fourni)
 *   500 INTERNAL               erreur serveur inattendue
 *
 * ============================================================================
 */

const router = express.Router()

const MAX_BATCH = 100
const RAW_LIMIT = '2mb'

// Body raw uniquement (HMAC). On accepte aussi les requêtes sans body
// (GET) — express.raw n'en touche que si Content-Type matche, donc on
// capture tout et on filtrera ensuite.
router.use(
  express.raw({
    type: () => true,
    limit: RAW_LIMIT,
  })
)

// ----------------------------------------------------------------------------
// Types internes
// ----------------------------------------------------------------------------

type CodedError = Error & { status?: number; code?: string; errors?: unknown }

interface AuthedRequest extends Request {
  externalSource?: IExternalSource
  rawBody?: Buffer
  parsedBody?: unknown
  idempotencyKey?: string
  apiVersion?: string
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function respondError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ error: message, code })
}

function bufferOrEmpty(reqBody: unknown): Buffer {
  if (Buffer.isBuffer(reqBody)) return reqBody
  if (reqBody == null) return Buffer.alloc(0)
  if (typeof reqBody === 'string') return Buffer.from(reqBody, 'utf8')
  // Cas express.raw avec body vide : peut être {} → on renvoie buffer vide
  if (typeof reqBody === 'object' && Object.keys(reqBody as object).length === 0) {
    return Buffer.alloc(0)
  }
  return Buffer.from(JSON.stringify(reqBody), 'utf8')
}

function parseJsonBody(rawBuffer: Buffer): unknown {
  if (!rawBuffer || rawBuffer.length === 0) return null
  const text = rawBuffer.toString('utf8')
  try {
    return JSON.parse(text)
  } catch (err) {
    const e = new Error('JSON invalide : ' + (err as Error).message) as CodedError
    e.status = 400
    e.code = 'INVALID_JSON'
    throw e
  }
}

// ----------------------------------------------------------------------------
// Ping (public)
// ----------------------------------------------------------------------------

router.get(
  '/:sourceSlug/ping',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params.sourceSlug || '').toLowerCase()
      res.json({ ok: true, slug, serverTime: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// Middleware d'authentification (signature + clé + timestamp + idempotency)
// Charge req.externalSource, req.rawBody, req.parsedBody, req.idempotencyKey
// ----------------------------------------------------------------------------

async function authenticateSource(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const slug = String(req.params.sourceSlug || '').toLowerCase()

    // 1. Charger la source
    const source = await ExternalSource.findOne({ slug })
    if (!source) {
      respondError(res, 404, 'SOURCE_NOT_FOUND', `Source ${slug} inconnue`)
      return
    }
    if (source.status !== 'ACTIVE') {
      respondError(res, 403, 'SOURCE_INACTIVE', `Source ${slug} non active (${source.status})`)
      return
    }

    // 2. Content-Type strict pour les requêtes avec body
    const method = req.method.toUpperCase()
    const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH'
    if (hasBody) {
      const ct = String(req.headers['content-type'] || '').toLowerCase()
      if (!ct.startsWith('application/json')) {
        respondError(res, 415, 'UNSUPPORTED_MEDIA', 'Content-Type doit être application/json')
        return
      }
    }

    // 3. Headers obligatoires
    const apiKey = req.headers['x-api-key']
    const signature = req.headers['x-venio-signature']
    const timestampHeader = req.headers['x-venio-timestamp']
    const idempotencyKey = req.headers['idempotency-key']
    const apiVersion = req.headers['x-venio-api-version'] || ''

    if (!apiKey || !signature || !timestampHeader || !idempotencyKey) {
      respondError(
        res,
        401,
        'MISSING_HEADERS',
        'Headers requis : X-Api-Key, X-Venio-Signature, X-Venio-Timestamp, Idempotency-Key'
      )
      return
    }

    // 4. Timestamp dans la fenêtre
    const ts = Number(timestampHeader)
    if (!Number.isFinite(ts)) {
      respondError(res, 401, 'TIMESTAMP_OUT_OF_RANGE', 'Timestamp invalide')
      return
    }
    const nowSec = Math.floor(Date.now() / 1000)
    const tolerance = Number(source.timestampToleranceSec || 300)
    if (Math.abs(nowSec - ts) > tolerance) {
      respondError(res, 401, 'TIMESTAMP_OUT_OF_RANGE', `Timestamp hors fenêtre (±${tolerance}s)`)
      return
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
      respondError(res, 401, 'INVALID_SIGNATURE', 'Signature HMAC invalide')
      return
    }

    // 7. Vérifier la clé API (bcrypt)
    const keyOk = await verifyApiKey(String(apiKey), source.apiKeyHash)
    if (!keyOk) {
      respondError(res, 401, 'UNKNOWN_API_KEY', 'Clé API inconnue')
      return
    }

    // 8. Rate limit
    const limit = Number(source.rateLimitPerMin || 60)
    const rl = rateLimitConsume(String(source._id), limit)
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfter))
      respondError(res, 429, 'RATE_LIMITED', 'Quota par minute dépassé')
      return
    }

    // 9. Parser le JSON si body présent
    let parsed: unknown = null
    if (rawBody.length > 0) {
      try {
        parsed = parseJsonBody(rawBody)
      } catch (err) {
        const e = err as CodedError
        respondError(res, e.status || 400, e.code || 'INVALID_JSON', e.message)
        return
      }
    }

    req.externalSource = source
    req.rawBody = rawBody
    req.parsedBody = parsed
    req.idempotencyKey = String(idempotencyKey)
    req.apiVersion = String(apiVersion)

    next()
  } catch (err) {
    next(err)
  }
}

// ----------------------------------------------------------------------------
// POST /:sourceSlug/entries  — ingestion (single ou batch)
// ----------------------------------------------------------------------------

interface ProcessEntryArgs {
  source: IExternalSource
  rawPayload: unknown
  idempotencyKey: string
  requestIp: string
  requestUserAgent: string
}

interface ProcessEntryResult {
  externalId: string
  status: 'POSTED' | 'AWAITING_REVIEW' | 'DUPLICATE' | 'REJECTED'
  transactionId: Types.ObjectId | null
  entry: { _id: Types.ObjectId; entryNumber: string; status: string } | null
  errors?: unknown[]
  duplicate?: boolean
}

/**
 * Traite UN entry. Retourne { externalId, status, transactionId, entry, errors? }.
 * Persiste un ExternalTransaction (status RECEIVED → POSTED / AWAITING_REVIEW / DUPLICATE / REJECTED).
 */
async function processSingleEntry({
  source,
  rawPayload,
  idempotencyKey,
  requestIp,
  requestUserAgent,
}: ProcessEntryArgs): Promise<ProcessEntryResult> {
  const externalIdHint =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? String((rawPayload as Record<string, unknown>).externalId || '')
      : ''

  // 1. Idempotency : si déjà reçu, on renvoie immédiatement
  const existing = await ExternalTransaction.findOne({
    source: source._id,
    idempotencyKey,
  }).lean<IExternalTransaction | null>()
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
      transactionId: existing._id as Types.ObjectId,
      entry: generatedEntry
        ? {
            _id: generatedEntry._id as Types.ObjectId,
            entryNumber: generatedEntry.entryNumber,
            status: generatedEntry.status,
          }
        : null,
      duplicate: true,
    }
  }

  // 2. Logger la transaction brute AVANT traitement
  let externalTx: IExternalTransaction
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
    const e = err as Error & { code?: number }
    if (e && e.code === 11000) {
      const race = await ExternalTransaction.findOne({
        source: source._id,
        idempotencyKey,
      }).lean<IExternalTransaction | null>()
      if (race) {
        return {
          externalId: race.externalId || externalIdHint || '',
          status: 'DUPLICATE',
          transactionId: race._id as Types.ObjectId,
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
          ? { kind: (l.auxiliaryRef.kind || 'OTHER') as 'CLIENT' | 'SUPPLIER' | 'OTHER', id: null }
          : undefined,
      })),
      source: 'EXTERNAL',
      externalSource: source._id as Types.ObjectId,
      sourceRef: { kind: 'EXTERNAL_TX', id: externalTx._id as Types.ObjectId },
      idempotencyKey: entryIdempotencyKey,
      status: classification.autoValidate ? 'VALIDATED' : 'DRAFT',
      currency: normalized.currency || 'EUR',
      notes: classification.auxiliaryWarnings?.join(' | ') || '',
    })

    // 4. Mettre à jour la transaction
    externalTx.status = classification.autoValidate ? 'POSTED' : 'AWAITING_REVIEW'
    externalTx.autoValidated = Boolean(classification.autoValidate)
    externalTx.matchedRule = classification.ruleId
    externalTx.normalizedPayload = normalized
    externalTx.generatedEntry = result.entry._id as Types.ObjectId
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

    // 6. Audit de l'ingestion (acteur externe) — uniquement si une vraie
    //    écriture a été créée (pas pour un dédoublonnage / déjà existant).
    if (!result.alreadyExisted) {
      AuditLog.create({
        action: 'ACCOUNTING_ENTRY_CREATE',
        ip: requestIp || '',
        userAgent: requestUserAgent || '',
        metadata: {
          actorType: 'EXTERNAL',
          externalSourceSlug: source.slug,
          entityType: 'AccountingEntry',
          entityId: result.entry._id,
          entityRef: result.entry.entryNumber,
          externalTransactionId: externalTx._id,
          externalId: normalized.externalId || '',
          autoValidated: Boolean(classification.autoValidate),
          matchedRule: classification.ruleId || null,
          summary: `Ingestion ${source.slug} → ${result.entry.entryNumber} (${result.entry.status})`,
          after: {
            entryNumber: result.entry.entryNumber,
            journalCode: result.entry.journalCode,
            date: result.entry.date,
            status: result.entry.status,
            totalDebit: result.entry.totalDebit,
            totalCredit: result.entry.totalCredit,
          },
        },
      }).catch(() => {})
    }

    return {
      externalId: normalized.externalId,
      status: classification.autoValidate ? 'POSTED' : 'AWAITING_REVIEW',
      transactionId: externalTx._id as Types.ObjectId,
      entry: {
        _id: result.entry._id as Types.ObjectId,
        entryNumber: result.entry.entryNumber,
        status: result.entry.status,
      },
    }
  } catch (err) {
    // Échec normalisation / classification / création
    const e = err as Error & { errors?: unknown[] }
    const reason =
      e.errors && Array.isArray(e.errors)
        ? JSON.stringify(e.errors)
        : e.message || 'Erreur inconnue'
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
          lastError: String(e.message || '').slice(0, 500),
        },
      }
    ).catch(() => {})

    return {
      externalId: externalIdHint || '',
      status: 'REJECTED',
      transactionId: externalTx._id as Types.ObjectId,
      entry: null,
      errors: e.errors || [{ field: '_root', message: e.message || 'Erreur inconnue' }],
    }
  }
}

router.post(
  '/:sourceSlug/entries',
  authenticateSource as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authedReq = req as AuthedRequest
      const source = authedReq.externalSource!
      const body = authedReq.parsedBody
      if (!body || typeof body !== 'object') {
        respondError(res, 422, 'INVALID_PAYLOAD', 'Body JSON requis')
        return
      }

      const ip =
        req.ip ||
        String(req.headers['x-forwarded-for'] || '')
          .toString()
          .split(',')[0] ||
        ''
      const ua = String(req.headers['user-agent'] || '')

      // Détecter single vs batch
      let entries: unknown[]
      let isBatch = false
      const bodyRecord = body as Record<string, unknown>
      if (Array.isArray(bodyRecord.entries)) {
        isBatch = true
        entries = bodyRecord.entries as unknown[]
      } else {
        entries = [body]
      }

      if (isBatch && entries.length > MAX_BATCH) {
        respondError(
          res,
          413,
          'BATCH_TOO_LARGE',
          `Batch limité à ${MAX_BATCH} entries (reçu : ${entries.length})`
        )
        return
      }
      if (entries.length === 0) {
        respondError(res, 422, 'INVALID_PAYLOAD', 'Aucun entry à traiter')
        return
      }

      // Traitement séquentiel (idempotency + équilibre côté base)
      const results: ProcessEntryResult[] = []
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i]
        // Clé d'idempotency par entry :
        //   - single : idempotencyKey global
        //   - batch  : <idempotencyKey>:<externalId>
        const externalIdForKey =
          (e && typeof e === 'object' && !Array.isArray(e)
            ? String((e as Record<string, unknown>).externalId || '')
            : '') || `idx-${i}`
        const itemKey = isBatch
          ? `${authedReq.idempotencyKey}:${externalIdForKey}`
          : (authedReq.idempotencyKey as string)

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
            errors: [
              { field: '_root', message: (err as Error).message || 'Erreur interne' },
            ],
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
        const only = results[0]!
        if (only.status === 'REJECTED') httpStatus = 422
        else httpStatus = 200
      }

      res.status(httpStatus).json({ results, summary })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /:sourceSlug/entries/:externalId — réconciliation
// ----------------------------------------------------------------------------

router.get(
  '/:sourceSlug/entries/:externalId',
  authenticateSource as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authedReq = req as AuthedRequest
      const source = authedReq.externalSource!
      const externalId = String(req.params.externalId || '')
      const tx = await ExternalTransaction.findOne({
        source: source._id,
        externalId,
      })
        .sort({ receivedAt: -1 })
        .lean<IExternalTransaction | null>()
      if (!tx) {
        res.status(404).json({
          error: `Aucune transaction trouvée pour externalId=${externalId}`,
          code: 'TRANSACTION_NOT_FOUND',
        })
        return
      }
      let entry: unknown = null
      if (tx.generatedEntry) {
        entry = await AccountingEntry.findById(tx.generatedEntry).lean()
      }
      res.json({ transaction: tx, entry })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /:sourceSlug/entries — pagination cursor pour réconciliation périodique
// ----------------------------------------------------------------------------

interface CursorPayload {
  receivedAt: Date
  _id: string
}

function encodeCursor(item: { receivedAt: Date; _id: unknown }): string {
  const payload = JSON.stringify({
    r: new Date(item.receivedAt).getTime(),
    i: String(item._id),
  })
  return Buffer.from(payload, 'utf8').toString('base64')
}

function decodeCursor(cursor: unknown): CursorPayload | null {
  if (!cursor) return null
  try {
    const obj = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'))
    if (!obj || !obj.r || !obj.i) return null
    return { receivedAt: new Date(Number(obj.r)), _id: String(obj.i) }
  } catch {
    return null
  }
}

router.get(
  '/:sourceSlug/entries',
  authenticateSource as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authedReq = req as AuthedRequest
      const source = authedReq.externalSource!
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
      const from = req.query.from ? new Date(String(req.query.from)) : null
      const to = req.query.to ? new Date(String(req.query.to)) : null
      const cursor = decodeCursor(req.query.cursor)

      const filter: Record<string, unknown> = { source: source._id }
      if (from || to) {
        const range: Record<string, Date> = {}
        if (from && !Number.isNaN(from.getTime())) range.$gte = from
        if (to && !Number.isNaN(to.getTime())) range.$lte = to
        filter.receivedAt = range
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
        .lean<IExternalTransaction[]>()

      let nextCursor: string | null = null
      let page = items
      if (items.length > limit) {
        page = items.slice(0, limit)
        const last = page[page.length - 1]
        if (last) nextCursor = encodeCursor(last)
      }

      res.json({ items: page, nextCursor })
    } catch (err) {
      next(err)
    }
  }
)

// Handler d'erreur local (codes et format JSON cohérents)
router.use((err: CodedError, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500
  res.status(status).json({
    error: err.message || 'Erreur interne',
    code: err.code || 'INTERNAL',
  })
})

export default router
