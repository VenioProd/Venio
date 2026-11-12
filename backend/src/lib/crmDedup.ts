/**
 * Normalisation des coordonnées d'un lead pour la détection de doublons.
 * Fonctions pures, sans accès base : le modèle `Lead` et le service les
 * partagent sans cycle d'import. Les valeurs normalisées sont stockées sur le
 * lead (`contactEmailNormalized`, `contactPhoneNormalized`, `companyNormalized`)
 * et indexées : la recherche de doublons compare des égalités exactes.
 */

/** E-mail : espaces retirés, minuscules. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

/**
 * Téléphone : chiffres uniquement. Un préfixe français (+33, 0033) est ramené
 * au 0 national (« +33 6 12 34 56 78 » et « 06.12.34.56.78 » donnent la même
 * valeur). Un autre indicatif international garde ses chiffres tels quels.
 * Renvoie '' sans aucun chiffre.
 */
export function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim()
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0033')) {
    digits = digits.slice(4)
  } else if (raw.startsWith('+33')) {
    digits = digits.slice(2)
  } else {
    return digits
  }
  // « +33 (0)6… » : le 0 de confort est déjà là ; sinon on le rétablit.
  return digits.startsWith('0') ? digits : `0${digits}`
}

/** Nom d'entreprise : minuscules, sans accents ni ponctuation, espaces réduits. */
export function normalizeCompanyName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Longueur minimale (en chiffres) pour qu'un téléphone serve de critère de doublon. */
export const MIN_PHONE_DIGITS = 8

/** Champs normalisés déduits des champs saisis présents dans `source`. */
export function normalizedLeadFields(source: { contactEmail?: unknown; contactPhone?: unknown; company?: unknown }): {
  contactEmailNormalized?: string
  contactPhoneNormalized?: string
  companyNormalized?: string
} {
  const out: { contactEmailNormalized?: string; contactPhoneNormalized?: string; companyNormalized?: string } = {}
  if (source.contactEmail !== undefined) out.contactEmailNormalized = normalizeEmail(source.contactEmail)
  if (source.contactPhone !== undefined) out.contactPhoneNormalized = normalizePhone(source.contactPhone)
  if (source.company !== undefined) out.companyNormalized = normalizeCompanyName(source.company)
  return out
}
