import crypto from 'crypto'

/**
 * Au plus un mail récapitulatif par adresse de prospect et par 24 h.
 *
 * En mémoire, par processus, comme les quotas express-rate-limit du backend :
 * la production tourne en un seul conteneur, et un redémarrage qui remet le
 * compteur à zéro reste couvert par le quota par IP (5 par heure). Pas de
 * collection ni de migration pour une donnée qui n'a de valeur que 24 h.
 * Les adresses sont gardées sous forme d'empreinte, jamais en clair.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000
/** Plafond mémoire. Plein malgré la purge : on refuse (le mail interne part quand même). */
const MAX_ENTRIES = 20_000

const sentAt = new Map<string, number>()

function key(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

function purge(now: number): void {
  for (const [k, at] of sentAt) {
    if (now - at >= WINDOW_MS) sentAt.delete(k)
  }
}

/**
 * Réserve l'envoi pour cette adresse. true : l'envoi est autorisé et compté
 * (même s'il échoue ensuite, par prudence) ; false : déjà servi dans les 24 h.
 */
export function reserveProspectEmail(email: string, now: number = Date.now()): boolean {
  const k = key(email)
  const last = sentAt.get(k)
  if (last !== undefined && now - last < WINDOW_MS) return false
  if (sentAt.size >= MAX_ENTRIES) purge(now)
  if (sentAt.size >= MAX_ENTRIES) return false
  sentAt.set(k, now)
  return true
}

/** Réservé aux tests. */
export function resetProspectQuota(): void {
  sentAt.clear()
}
