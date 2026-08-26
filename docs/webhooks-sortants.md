# Webhooks sortants Venio

Venio pousse vers chaque endpoint actif les événements qui produisent une
notification admin. Configuration : `/admin/webhooks` (permission
`view_webhooks` en lecture, `manage_webhooks` en écriture).

## Requête

`POST <url de l'endpoint>` · `Content-Type: application/json` · timeout 10 s ·
aucune redirection suivie (toute réponse 3xx est comptée comme un échec).

| En-tête | Contenu |
|---|---|
| `X-Venio-Event` | type de l'événement (ex. `TICKET_CREATED`) |
| `X-Venio-Delivery` | identifiant de la livraison (unique par tentative de rejeu) |
| `X-Venio-Timestamp` | horodatage Unix en secondes |
| `X-Venio-Signature` | `sha256=` + HEX(HMAC_SHA256(secret, `timestamp + "." + rawBody`)) |

Corps :

```json
{
  "id": "b3c1e0e4-…",
  "type": "TICKET_CREATED",
  "occurredAt": "2026-08-26T10:00:00.000Z",
  "title": "Nouveau ticket",
  "message": "Ticket #12",
  "link": "/admin/tickets",
  "metadata": {}
}
```

`id` est stable pour un même événement logique : il est partagé entre les
endpoints destinataires et conservé par un rejeu. C'est la clé de
déduplication côté récepteur.

Un événement logique produit **une** livraison par endpoint, jamais une par
destinataire de notification : les broadcasts internes (`notifySuperAdmins`,
`notifyInternalAdmins`, `notifyUsers`) émettent une seule fois pour tout leur
fan-out.

## Réponses et reprises

- **Succès** : tout statut 2xx. Répondez immédiatement et traitez en
  asynchrone : le compteur d'échecs de l'endpoint est remis à zéro.
- **Échec** (réseau, timeout, 3xx, 4xx, 5xx) : Venio réessaie selon
  1 min → 5 min → 30 min → 2 h → 12 h, puis marque la livraison `FAILED`.
- **20 échecs consécutifs** sur un endpoint : désactivation automatique et
  alerte aux super admins. La réactivation depuis `/admin/webhooks` remet le
  compteur à zéro.
- **Rattrapage** : après une indisponibilité, `GET /api/v1/agent/notifications`
  (API agent existante) permet de réconcilier.
- Le journal des livraisons est conservé **30 jours** (purge automatique).

## Récepteur de référence

```js
import crypto from 'node:crypto'
import express from 'express'

const app = express()
const SECRET = process.env.VENIO_WEBHOOK_SECRET
const TOLERANCE_SECONDS = 300

app.post('/hooks/venio', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-Venio-Timestamp') || ''
  const provided = req.get('X-Venio-Signature') || ''

  // Fenêtre d'horloge : une signature rejouée plus tard est refusée.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return res.status(401).end()
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', SECRET).update(`${timestamp}.${req.body}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end()

  const event = JSON.parse(req.body.toString('utf8'))
  // Déduplication par event.id, puis traitement asynchrone.
  queue.push(event)
  return res.status(202).end()
})
```

## Configuration serveur

Le secret de chaque endpoint est chiffré en base (AES-256-GCM) avec la clé
dérivée de `CREDENTIALS_KEY` (à défaut `JWT_SECRET`). **`CREDENTIALS_KEY` doit
être définie et stable en production** : la changer rend illisibles les
secrets existants, qu'il faut alors régénérer depuis `/admin/webhooks`.

La reprise des livraisons échues est portée par l'automation
`webhooks.delivery_retry` (moteur d'automations, tick toutes les minutes) ;
elle est visible et désactivable depuis `/admin/automations`.
