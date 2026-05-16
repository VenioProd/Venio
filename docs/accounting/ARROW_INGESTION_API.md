# Venio — API d'ingestion comptable externe

> Documentation à destination des équipes intégrant un site tiers (par ex. Arrow) à la comptabilité Venio.

## Vue d'ensemble

Venio expose une API REST qui permet à un site tiers de pousser ses **mouvements comptables** (ventes, paiements, achats, avoirs, frais) directement dans le module comptable de Venio. Ces mouvements deviennent des écritures comptables agrégées dans tous les rapports (bilan, compte de résultat, balance, FEC, déclaration TVA).

Une fois la clé API et le secret HMAC partagés, votre intégration peut :

- **Pousser** des écritures (mode structuré ou simplifié) → `POST /api/external/{slug}/entries`
- **Vérifier** le statut d'une écriture → `GET /api/external/{slug}/entries/{externalId}`
- **Réconcilier** une période → `GET /api/external/{slug}/entries?from=…&to=…`
- **Probe** le service → `GET /api/external/{slug}/ping`

---

## 1 · Endpoints

| Méthode | URL | Authentification |
|---------|-----|------------------|
| `GET`  | `/api/external/{slug}/ping` | Aucune (probe public) |
| `POST` | `/api/external/{slug}/entries` | Headers d'auth complets |
| `GET`  | `/api/external/{slug}/entries/{externalId}` | Headers d'auth complets |
| `GET`  | `/api/external/{slug}/entries?from=&to=&limit=&cursor=` | Headers d'auth complets |

**Base URL** : `https://venio.paris` en prod (staging à confirmer si déployé).
**Versioning** : header optionnel `X-Venio-Api-Version: 2026-01`. La version est loggée mais pas encore utilisée pour router.

---

## 2 · Authentification

Trois headers obligatoires (défense en profondeur), plus l'idempotence :

| Header | Format | Rôle |
|---|---|---|
| `X-Api-Key` | `vno_live_<32 hex>` | Clé identifie la source ; vérifiée bcrypt côté Venio |
| `X-Venio-Timestamp` | `1747393200` | Unix seconds (UTC) — toléré ±300 s (configurable par source) |
| `X-Venio-Signature` | `sha256=<hex>` | HMAC-SHA256 sur `{timestamp}.{rawBody}` avec le webhook secret |
| `Idempotency-Key` | UUID v4 recommandé | Unicité de la requête (rétention illimitée) |

### Calcul de la signature (style Stripe)

```
payload = timestamp + "." + rawBodyBytes
sig     = "sha256=" + HMAC_SHA256(payload, webhookSecret).hexLower()
```

Encodage **hex**, en minuscules. La comparaison côté Venio est **timing-safe** (`crypto.timingSafeEqual`).

Exemple Node.js :

```js
import crypto from 'node:crypto'

function sign(timestamp, rawBody, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(`${timestamp}.${rawBody}`)
  return `sha256=${hmac.digest('hex')}`
}
```

Exemple Python :

```python
import hmac, hashlib
def sign(ts, raw, secret):
    mac = hmac.new(secret.encode(), f"{ts}.{raw}".encode(), hashlib.sha256)
    return "sha256=" + mac.hexdigest()
```

### Codes d'erreur d'authentification

| HTTP | `code` | Message |
|---|---|---|
| 401 | `MISSING_HEADERS` | Un des headers obligatoires manque |
| 401 | `UNKNOWN_API_KEY` | Clé API inconnue ou révoquée |
| 401 | `INVALID_SIGNATURE` | HMAC ne correspond pas |
| 401 | `TIMESTAMP_OUT_OF_RANGE` | Timestamp en dehors de la fenêtre de tolérance |
| 403 | `SOURCE_INACTIVE` | Source en `PAUSED` ou `DISABLED` |

---

## 3 · Schéma d'une écriture

### Mode 1 — Structuré (recommandé pour Arrow)

Vous fournissez **directement** les lignes comptables. Venio vérifie l'équilibre et persiste.

```json
{
  "externalId": "ARROW-INV-2026-00123",
  "date": "2026-05-16T10:30:00Z",
  "currency": "EUR",
  "description": "Facture Arrow #00123 — Acme Corp",
  "category": "saas-subscription",
  "tags": ["arrow", "stripe", "subscription"],
  "metadata": { "stripePaymentIntent": "pi_xxx", "customerId": "cus_xxx" },
  "journalCode": "VE",
  "lines": [
    {
      "accountCode": "411000",
      "label": "Facture Acme #00123",
      "debit": 1200,
      "credit": 0,
      "auxiliaryRef": { "kind": "CLIENT", "externalId": "cus_xxx" }
    },
    {
      "accountCode": "706200",
      "label": "Prestation SaaS — base HT",
      "debit": 0,
      "credit": 1000,
      "vatRateValue": 20
    },
    {
      "accountCode": "445710",
      "label": "TVA collectée 20%",
      "debit": 0,
      "credit": 200,
      "vatRateValue": 20
    }
  ]
}
```

### Mode 2 — Simplifié (Venio mappe via règles)

Vous envoyez un montant et un type, Venio applique les `ClassificationRule` configurées :

```json
{
  "externalId": "ARROW-INV-2026-00123",
  "type": "SALE",                       // SALE / REFUND / EXPENSE / FEE / PAYMENT / TRANSFER / ADJUSTMENT
  "date": "2026-05-16T10:30:00Z",
  "currency": "EUR",
  "amount": 1200,                       // TTC
  "vatRate": 20,
  "description": "Facture Arrow #00123 — Acme Corp",
  "customerExternalId": "cus_xxx",
  "tags": ["arrow", "subscription"]
}
```

Venio :
1. Évalue chaque règle (par priority desc) → première match wins
2. Si aucune match → applique le mapping par défaut de la source
3. Construit les lignes (411 D=1200, 706 C=1000, 44571 C=200 pour une vente standard)
4. Crée l'écriture en `DRAFT` ou `VALIDATED` selon le flag `autoValidate`

### Mode batch (jusqu'à 100 écritures)

```json
{
  "entries": [
    { "externalId": "TX1", ... },
    { "externalId": "TX2", ... }
  ]
}
```

Les clés d'idempotence finales sont dérivées de `{Idempotency-Key}:{externalId}` — donc une seule clé d'idempotency globale suffit pour un batch.

### Validation

- `externalId` : requis, unique par source
- `date` : ISO 8601, requis
- `currency` : par défaut `EUR` — **multi-devises rejeté en MVP** (422)
- Mode 1 :
  - `journalCode` requis (existant dans le PCG Venio)
  - `lines` min 2 lignes
  - `Σ debit = Σ credit` à 0.01 € près (sinon 422)
  - `accountCode` doit exister et être actif
- Mode 2 : `amount` ou `type` requis

---

## 4 · Réponses

### `POST /entries` — succès single

```json
{
  "results": [
    {
      "externalId": "ARROW-INV-2026-00123",
      "status": "POSTED",
      "transactionId": "65f...",
      "entry": {
        "_id": "65f...",
        "entryNumber": "VE-2026-00042",
        "status": "VALIDATED"
      }
    }
  ],
  "summary": { "posted": 1, "awaitingReview": 0, "duplicate": 0, "rejected": 0 }
}
```

### `status` possibles par entry

| Status | Quand |
|---|---|
| `POSTED` | Écriture créée et validée (auto-validation par règle ou source `autoValidateAll`) |
| `AWAITING_REVIEW` | Écriture créée en DRAFT — visible dans la file d'attente Venio, à valider manuellement |
| `DUPLICATE` | Même `Idempotency-Key` déjà reçue — l'écriture existante est retournée |
| `REJECTED` | Validation a échoué (voir `errors`) |

### Codes HTTP du POST

| Code | Sens |
|---|---|
| 200 | Tout est POSTED/AWAITING/DUPLICATE |
| 207 | Batch mixte (au moins une OK + au moins une rejected) |
| 422 | Tout est rejected, OU payload globalement invalide |
| 401 / 403 / 404 / 415 / 429 | Voir auth/source/payload/rate-limit |

### Erreur 422 sur une entry

```json
{
  "results": [
    {
      "externalId": "ARROW-INV-2026-00123",
      "status": "REJECTED",
      "transactionId": "65f...",
      "errors": [
        { "field": "lines", "message": "Σdebit (1200) ≠ Σcredit (1100)" }
      ]
    }
  ],
  "summary": { "posted": 0, "awaitingReview": 0, "duplicate": 0, "rejected": 1 }
}
```

### Rate limit (429)

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
Content-Type: application/json

{ "error": "Rate limit dépassé", "code": "RATE_LIMITED" }
```

Le débit par défaut est **60 req/min par source**, configurable côté Venio.

---

## 5 · Idempotence & retry

- L'`Idempotency-Key` est **obligatoire** (UUID v4 recommandé).
- La rétention de la clé côté Venio est **permanente** (obligation comptable 10 ans).
- En cas de retransmission, la même clé renvoie 200 avec `status: "DUPLICATE"` et l'écriture existante.
- Politique de retry recommandée côté client : **6 tentatives avec backoff exponentiel** `1s → 2s → 4s → 8s → 16s → 32s` (≈ 1 min cumulé).
- Ne retry **que** sur 5xx, 429, ou timeout réseau. Ne retry **jamais** sur 4xx (sauf 429).

---

## 6 · Lecture / réconciliation

### Récupérer une écriture par externalId

```
GET /api/external/{slug}/entries/{externalId}
```

Réponse :

```json
{
  "transaction": {
    "_id": "...",
    "externalId": "ARROW-INV-2026-00123",
    "status": "POSTED",
    "receivedAt": "2026-05-16T10:30:01Z",
    "processedAt": "2026-05-16T10:30:01Z",
    "autoValidated": true
  },
  "entry": {
    "_id": "...",
    "entryNumber": "VE-2026-00042",
    "date": "2026-05-16T10:30:00Z",
    "status": "VALIDATED",
    "totalDebit": 1200,
    "totalCredit": 1200
  }
}
```

### Lister les écritures d'une période (paginé curseur)

```
GET /api/external/{slug}/entries?from=2026-05-01&to=2026-05-31&limit=100&cursor=<base64>
```

```json
{
  "items": [ /* mêmes objets que ci-dessus */ ],
  "nextCursor": "eyJyZWNlaXZlZEF0Ijoi..." // null si fin
}
```

---

## 7 · Plan comptable côté Venio

- **Référentiel** : PCG français (sycomore-like), codes à **6 chiffres** par défaut (mais 3 chiffres min toléré).
- **Comptes clients** : auxiliaires non automatiques en MVP — utilisez `411000` + champ `auxiliaryRef: { kind: 'CLIENT', externalId: 'cus_xxx' }`. Le passage à un compte 411XXX dédié par client est planifié en v2.
- **TVA** : un seul code `445710` (collectée) et `445660` (déductible). Le **taux** est porté par la ligne via `vatRateValue` — pas par un compte différent.
- **Codes journaux** : `VE` (ventes), `AC` (achats), `BQ` (banque), `CA` (caisse), `OD` (opérations diverses), `AN` (à-nouveaux).
- **autoCreate** : non. Tous les comptes utilisés doivent exister côté Venio. Sinon, l'écriture est rejetée avec `errors: [{ field: 'lines[0].accountCode', message: 'Compte 999999 inconnu' }]`.

Pour obtenir la liste des comptes disponibles, l'admin Venio peut vous l'exporter en CSV depuis l'interface (Plan comptable → Filtrer → Export CSV).

---

## 8 · Cycle de vie & corrections

- Une écriture envoyée est **immutable** en lecture API.
- Corrections : envoyer une **nouvelle écriture inverse** (contre-passation) avec un nouveau `externalId`, ou un **avoir** typé `REFUND`.
- Avoirs : envoyez `type: "REFUND"` (mode 2) ou une écriture mode 1 avec les montants inverses sur les mêmes comptes.
- Pas de webhook retour de Venio pour signaler validation/refus en MVP — utilisez le polling sur `GET /entries/{externalId}`.

---

## 9 · Multi-périodes & exercices

- Pas besoin de transmettre `fiscalYearId` — Venio infère depuis la `date` de l'écriture.
- Si l'exercice contenant la date est **clos** (status `CLOTURE`), l'écriture est **rejetée** avec 423 et message explicite. Aucune réorientation auto en AN.

---

## 10 · Multi-tenant

- L'identification du tenant se fait via le **slug** dans l'URL : `/api/external/{slug}/...`.
- Le SIREN/SIRET de l'entité Arrow Corp se renseigne **une seule fois** côté Venio (CompanySettings), pas dans chaque payload.

---

## 11 · Numérotation FEC

- **Venio assigne** l'`entryNumber` chronologique unique par journal+année (`VE-2026-00042`).
- Votre `externalId` est conservé séparément (champ `pieceRef`) et apparaît dans la colonne `PieceRef` du FEC.
- Cela garantit la conformité du FEC (numérotation monotone immuable par journal) tout en préservant la traçabilité externe.

---

## 12 · Observabilité

- `GET /api/external/{slug}/ping` : health-check public (cron de réconciliation).
- Logs côté Venio : accessibles dans l'admin via "Sources externes → Historique des transactions". Pour Arrow, demandez à un admin Venio de vous transmettre les traces de transactions rejetées.

---

## 13 · Aspects légaux

- Venio **n'est pas** un logiciel comptable certifié DGFiP — c'est un outil interne agence digitale. Le FEC produit est conforme au format légal (art. A.47 A-1 LPF), mais l'expertise comptable reste à la charge de votre cabinet.
- Archivage : Venio conserve **10 ans** les `ExternalTransaction` brutes + les `AccountingEntry` (obligation art. L102B CGI).
- Le `rawPayload` est conservé tel que reçu pour audit. La trace `signatureVerified: true` est stockée pour preuve d'intégrité.

---

## 14 · Exemple complet (cURL)

```bash
SLUG="arrow"
API_KEY="vno_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TS=$(date +%s)
BODY='{"externalId":"ARROW-INV-2026-00123","date":"2026-05-16T10:30:00Z","type":"SALE","amount":1200,"vatRate":20,"description":"Facture Acme","customerExternalId":"cus_xxx"}'

SIG="sha256=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -X POST "https://venio.paris/api/external/$SLUG/entries" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Venio-Timestamp: $TS" \
  -H "X-Venio-Signature: $SIG" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "$BODY"
```

---

## 15 · Changelog API

| Date | Version | Changement |
|---|---|---|
| 2026-01-XX | `2026-01` | Version initiale (Phase 5) |

---

## Support

Pour toute question d'intégration : contact@venio.paris
