/**
 * Relevé de qualification envoyé par le formulaire en cinq étapes du site.
 *
 * Tout ce qui entre est validé contre des listes blanches : aucune clé
 * inconnue n'est acceptée, aucun texte libre n'est stocké au-delà de sa borne.
 * Les libellés servent à composer un résumé lisible pour l'équipe (notes du
 * lead, activité CRM, notification interne).
 */

export const NEED_LABELS = {
  site: 'Un nouveau site',
  refonte: 'Refaire le site',
  com: 'Mieux communiquer',
  marque: 'Une marque',
  outil: 'Un outil métier',
  flou: 'À définir',
} as const

export const FORMULE_LABELS = {
  vitrine: 'Vitrine',
  essentiel: 'Essentiel',
  business: 'Business',
  boutique: 'Boutique en ligne',
  mesure: 'Sur mesure',
} as const

export const PAIN_LABELS = {
  clair: 'On ne comprend pas ce qu’on fait',
  reseaux: 'Les réseaux prennent du temps, sans résultat',
  demandes: 'Pas assez de demandes',
  pub: 'Budget pub sans retour mesurable',
  coherence: 'Chacun présente l’entreprise à sa façon',
} as const

export const MARQUE_LABELS = {
  rien: 'Pas encore de nom',
  nom: 'Un nom, pas d’identité',
  refaire: 'Identité à refaire',
} as const

export const OUTILNOW_LABELS = {
  tableurs: 'Des tableurs partagés',
  logiciels: 'Plusieurs logiciels mal reliés',
  papier: 'Du papier et des e-mails',
} as const

export const TAILLE_LABELS = {
  '1': 'Seul',
  '2-10': '2 à 10 personnes',
  '11-50': '11 à 50 personnes',
  '50+': 'Plus de 50 personnes',
} as const

export const QUAND_LABELS = {
  urgent: 'Moins d’un mois',
  '3m': 'D’ici 3 mois',
  '6m': 'D’ici 6 mois',
  libre: 'Pas de date',
} as const

export const BUDGET_LABELS = {
  b1: 'Moins de 3 000 €',
  b2: '3 000 à 8 000 €',
  b3: '8 000 à 20 000 €',
  b4: 'Plus de 20 000 €',
  b0: 'À conseiller',
} as const

export const DECIDE_LABELS = {
  moi: 'Le contact seul',
  associes: 'Le contact et ses associés',
  comite: 'Un comité ou une direction',
} as const

export const REPONSE_LABELS = {
  ecrit: 'Par écrit',
  appel: 'Un appel de 30 minutes',
} as const

export interface ContactQualification {
  need: (keyof typeof NEED_LABELS)[]
  formule?: keyof typeof FORMULE_LABELS
  /** Adresse du site actuel (étape Précisions ou Entreprise). */
  siteUrl?: string
  pain?: (keyof typeof PAIN_LABELS)[]
  marque?: keyof typeof MARQUE_LABELS
  outilnow?: (keyof typeof OUTILNOW_LABELS)[]
  /** Texte libre « ce qui vous bloque » (besoin « Je ne sais pas encore »). */
  flou?: string
  activite?: string
  taille?: keyof typeof TAILLE_LABELS
  quand?: keyof typeof QUAND_LABELS
  budget?: keyof typeof BUDGET_LABELS
  decide?: keyof typeof DECIDE_LABELS
  reponse?: keyof typeof REPONSE_LABELS
}

export const QUALIFICATION_MAX_LENGTHS = { siteUrl: 300, flou: 1000, activite: 200 } as const

const ALLOWED_KEYS = new Set([
  'need',
  'formule',
  'siteUrl',
  'pain',
  'marque',
  'outilnow',
  'flou',
  'activite',
  'taille',
  'quand',
  'budget',
  'decide',
  'reponse',
])

const has = (labels: object, value: unknown): boolean =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value)

/** Liste blanche, sans doublon, jamais vide. Renvoie null si une valeur sort du cadre. */
function parseChoiceList<L extends object>(value: unknown, labels: L, allowEmpty: boolean): (keyof L)[] | null {
  if (!Array.isArray(value) || value.length > Object.keys(labels).length) return null
  const out: (keyof L)[] = []
  for (const item of value) {
    if (!has(labels, item)) return null
    if (!out.includes(item as keyof L)) out.push(item as keyof L)
  }
  if (!allowEmpty && out.length === 0) return null
  return out
}

function parseText(value: unknown, maxLength: number, multiline = false): string | null {
  if (typeof value !== 'string') return null
  const normalized = multiline
    ? value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
    : value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : null
}

function parseUrl(value: unknown): string | null {
  const text = parseText(value, QUALIFICATION_MAX_LENGTHS.siteUrl)
  if (text === null) return null
  if (text === '') return ''
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null
  } catch {
    return null
  }
}

export type QualificationResult = { ok: true; qualification: ContactQualification } | { ok: false }

/**
 * Valide un objet `qualification`. Une valeur absente, `undefined` ou `null`
 * est traitée par l'appelant ; ici, tout ce qui est fourni doit être conforme.
 */
export function validateQualification(raw: unknown): QualificationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false }
  const input = raw as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false }
  }

  const need = parseChoiceList(input.need, NEED_LABELS, false)
  if (!need) return { ok: false }
  const q: ContactQualification = { need }

  const optionalEnum = <L extends object>(key: keyof ContactQualification, labels: L): boolean => {
    const v = input[key as string]
    if (v === undefined || v === null || v === '') return true
    if (!has(labels, v)) return false
    ;(q as unknown as Record<string, unknown>)[key as string] = v
    return true
  }
  const optionalList = <L extends object>(key: keyof ContactQualification, labels: L): boolean => {
    const v = input[key as string]
    if (v === undefined || v === null) return true
    const list = parseChoiceList(v, labels, true)
    if (!list) return false
    if (list.length) (q as unknown as Record<string, unknown>)[key as string] = list
    return true
  }
  const optionalText = (key: keyof ContactQualification, max: number, multiline = false): boolean => {
    const v = input[key as string]
    if (v === undefined || v === null) return true
    const text = parseText(v, max, multiline)
    if (text === null) return false
    if (text) (q as unknown as Record<string, unknown>)[key as string] = text
    return true
  }

  const ok =
    optionalEnum('formule', FORMULE_LABELS) &&
    optionalList('pain', PAIN_LABELS) &&
    optionalEnum('marque', MARQUE_LABELS) &&
    optionalList('outilnow', OUTILNOW_LABELS) &&
    optionalText('flou', QUALIFICATION_MAX_LENGTHS.flou, true) &&
    optionalText('activite', QUALIFICATION_MAX_LENGTHS.activite) &&
    optionalEnum('taille', TAILLE_LABELS) &&
    optionalEnum('quand', QUAND_LABELS) &&
    optionalEnum('budget', BUDGET_LABELS) &&
    optionalEnum('decide', DECIDE_LABELS) &&
    optionalEnum('reponse', REPONSE_LABELS)
  if (!ok) return { ok: false }

  if (input.siteUrl !== undefined && input.siteUrl !== null) {
    const url = parseUrl(input.siteUrl)
    if (url === null) return { ok: false }
    if (url) q.siteUrl = url
  }

  return { ok: true, qualification: q }
}

const list = (values: readonly string[] | undefined, labels: Record<string, string>): string =>
  (values ?? []).map((v) => labels[v]).join(', ')

/** Lignes « Libellé : valeur » du relevé, sans les champs vides. */
export function qualificationLines(q: ContactQualification): string[] {
  const rows: [string, string | undefined][] = [
    ['Besoin', list(q.need, NEED_LABELS)],
    ['Formule de site', q.formule ? FORMULE_LABELS[q.formule] : undefined],
    ['Site actuel', q.siteUrl],
    ['Points de blocage', list(q.pain, PAIN_LABELS)],
    ['Marque', q.marque ? MARQUE_LABELS[q.marque] : undefined],
    ['Outils actuels', list(q.outilnow, OUTILNOW_LABELS)],
    ['Ce qui bloque', q.flou],
    ['Activité', q.activite],
    ['Taille', q.taille ? TAILLE_LABELS[q.taille] : undefined],
    ['Échéance', q.quand ? QUAND_LABELS[q.quand] : undefined],
    ['Budget', q.budget ? BUDGET_LABELS[q.budget] : undefined],
    ['Décision', q.decide ? DECIDE_LABELS[q.decide] : undefined],
    ['Réponse souhaitée', q.reponse ? REPONSE_LABELS[q.reponse] : undefined],
  ]
  return rows.filter((row): row is [string, string] => Boolean(row[1])).map(([label, value]) => `${label} : ${value}`)
}

/** Résumé court (besoin, budget, échéance) pour la notification interne. */
export function qualificationHeadline(q: ContactQualification): string {
  return [
    list(q.need, NEED_LABELS),
    q.budget ? `budget ${BUDGET_LABELS[q.budget]}` : '',
    q.quand ? QUAND_LABELS[q.quand].toLowerCase() : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
