/**
 * Helpers d'audit pour Express.
 *
 * Le but est de fournir une manière homogène de :
 *   - construire l'objet `actor` à passer à AuditLog.record() en fonction
 *     du type de requête (utilisateur JWT vs appel externe API key) ;
 *   - calculer un diff trivial entre deux objets plain au premier niveau.
 *
 * Aucune dépendance à AuditLog ici : on reste utilitaire pur pour éviter
 * les imports circulaires.
 */

/**
 * Renvoie l'objet actor à passer à AuditLog.record() pour cette requête.
 *
 * Distingue :
 *   - les appels externes authentifiés par X-Api-Key (req.externalSource posé
 *     par le middleware authenticateSource du router /api/external) ;
 *   - les utilisateurs admin authentifiés par JWT (req.user posé par auth) ;
 *   - le reste (cron interne, script) → type SYSTEM.
 *
 * @param {import('express').Request} req
 * @returns {object}
 */
export function buildActorFromReq(req) {
  if (req && req.externalSource) {
    return {
      type: 'EXTERNAL',
      externalSourceSlug: req.externalSource.slug || '',
      ip: extractIp(req),
      userAgent: extractUserAgent(req),
    }
  }
  if (req && req.user) {
    return {
      type: 'USER',
      userId: req.user.id || null,
      userEmail: req.user.email || '',
      ip: extractIp(req),
      userAgent: extractUserAgent(req),
    }
  }
  return { type: 'SYSTEM' }
}

/**
 * Petit utilitaire pour extraire l'IP la plus fiable du client.
 * Cherche req.ip puis X-Forwarded-For, sans planter si headers est absent.
 */
function extractIp(req) {
  if (!req) return ''
  if (req.ip) return req.ip
  const xff = req.headers && req.headers['x-forwarded-for']
  if (typeof xff === 'string') return xff.split(',')[0].trim()
  return ''
}

function extractUserAgent(req) {
  if (!req || !req.headers) return ''
  return String(req.headers['user-agent'] || '')
}

/**
 * Calcule un diff au premier niveau entre deux objets plain.
 * Retourne un tableau de { field, before, after } pour chaque champ qui
 * diffère. Compare par sérialisation JSON pour gérer dates, ObjectId
 * stringifiables et objets imbriqués sans deep diff.
 *
 * @param {object|null|undefined} before
 * @param {object|null|undefined} after
 * @returns {Array<{field: string, before: any, after: any}>}
 */
export function shallowDiff(before, after) {
  const a = before && typeof before === 'object' ? before : {}
  const b = after && typeof after === 'object' ? after : {}
  const fields = new Set([...Object.keys(a), ...Object.keys(b)])
  const diff = []
  for (const field of fields) {
    const av = a[field]
    const bv = b[field]
    if (!sameValue(av, bv)) {
      diff.push({ field, before: av === undefined ? null : av, after: bv === undefined ? null : bv })
    }
  }
  return diff
}

function sameValue(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  // Comparaison via sérialisation : tolère Date, ObjectId, sous-objets simples.
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
