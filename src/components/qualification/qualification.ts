/**
 * Logique métier du formulaire de qualification : libellés, relevé, piste
 * proposée, remarques franches, validation et payload. Pur, sans React.
 * Source de vérité des textes : docs/design/refonte-2026-maquette.html.
 */

export type NeedKey = 'site' | 'refonte' | 'com' | 'marque' | 'outil' | 'flou'
export type FormuleKey = 'vitrine' | 'essentiel' | 'business' | 'boutique' | 'mesure'
export type PainKey = 'clair' | 'reseaux' | 'demandes' | 'pub' | 'coherence'
export type MarqueKey = 'rien' | 'nom' | 'refaire'
export type OutilNowKey = 'tableurs' | 'logiciels' | 'papier'
export type TailleKey = '1' | '2-10' | '11-50' | '50+'
export type QuandKey = 'urgent' | '3m' | '6m' | 'libre'
export type BudgetKey = 'b1' | 'b2' | 'b3' | 'b4' | 'b0'
export type DecideKey = 'moi' | 'associes' | 'comite'
export type ReponseKey = 'ecrit' | 'appel'

export const LAST_STEP = 4
export const STEP_COUNT = 5

export const STEP_NAMES = ['Besoin', 'Précisions', 'Entreprise', 'Cadre', 'Coordonnées'] as const
export const STEP_TITLES = [
  'De quoi avez-vous besoin ?',
  'Précisons un peu.',
  'Votre entreprise.',
  'Le cadre.',
  'Où vous répondre ?',
] as const

export const NEED_KEYS = ['site', 'refonte', 'com', 'marque', 'outil', 'flou'] as const
export const FORMULE_KEYS = ['vitrine', 'essentiel', 'business', 'boutique', 'mesure'] as const

/** Libellés courts du relevé (colonne de droite) et de la réponse envoyée. */
export const LBL = {
  need: {
    site: 'Un nouveau site',
    refonte: 'Refaire le site',
    com: 'Mieux communiquer',
    marque: 'Une marque',
    outil: 'Un outil métier',
    flou: 'À définir',
  },
  formule: {
    vitrine: 'Vitrine',
    essentiel: 'Essentiel',
    business: 'Business',
    boutique: 'Boutique en ligne',
    mesure: 'Sur mesure',
  },
  taille: { '1': 'Seul', '2-10': '2 à 10 personnes', '11-50': '11 à 50 personnes', '50+': 'Plus de 50 personnes' },
  quand: { urgent: "Moins d'un mois", '3m': "D'ici 3 mois", '6m': "D'ici 6 mois", libre: 'Pas de date' },
  budget: {
    b1: 'Moins de 3 000 €',
    b2: '3 000 à 8 000 €',
    b3: '8 000 à 20 000 €',
    b4: 'Plus de 20 000 €',
    b0: 'À conseiller',
  },
  decide: { moi: 'Vous', associes: 'Vous et vos associés', comite: 'Un comité' },
  marque: { rien: 'pas de nom', nom: "un nom, pas d'identité", refaire: 'identité à refaire' },
} as const

/** Cartes du premier écran et du bloc d'entrée de bas de page. */
export type NeedIcon = 'doc' | 'code' | 'megaphone' | 'glyph' | 'calendar' | 'loupe'

export const NEED_CARDS: readonly { key: NeedKey; title: string; hint: string; icon: NeedIcon }[] = [
  { key: 'site', title: 'Un nouveau site', hint: 'Vitrine, boutique, espace client', icon: 'doc' },
  { key: 'refonte', title: 'Refaire mon site', hint: 'Il existe, il ne fait pas le travail', icon: 'code' },
  { key: 'com', title: 'Mieux communiquer', hint: 'Message, réseaux, acquisition', icon: 'megaphone' },
  { key: 'marque', title: 'Une marque', hint: 'Nom, voix, identité', icon: 'glyph' },
  { key: 'outil', title: 'Un outil métier', hint: 'Ce que le tableur ne fait plus', icon: 'calendar' },
  { key: 'flou', title: 'Je ne sais pas encore', hint: 'Quelque chose bloque, à définir', icon: 'loupe' },
]

/** Puces de réponse par question (chips). */
export const CHOICES = {
  formule: [
    ['vitrine', 'Me faire connaître'],
    ['essentiel', 'Publier moi-même'],
    ['business', 'Vendre, suivre mes clients'],
    ['boutique', "Vendre en ligne, c'est mon métier"],
    ['mesure', "Un outil qui n'existe pas"],
  ],
  pain: [
    ['clair', 'On ne comprend pas ce qu’on fait'],
    ['reseaux', 'Les réseaux prennent du temps, sans résultat'],
    ['demandes', 'Pas assez de demandes'],
    ['pub', 'Un budget pub sans retour mesurable'],
    ['coherence', 'Chacun présente l’entreprise à sa façon'],
  ],
  marque: [
    ['rien', 'Pas encore de nom'],
    ['nom', "Un nom, pas d'identité"],
    ['refaire', 'Une identité à refaire'],
  ],
  outilnow: [
    ['tableurs', 'Des tableurs partagés'],
    ['logiciels', 'Plusieurs logiciels mal reliés'],
    ['papier', 'Du papier et des e-mails'],
  ],
  taille: [
    ['1', 'Seul'],
    ['2-10', '2 à 10'],
    ['11-50', '11 à 50'],
    ['50+', 'Plus de 50'],
  ],
  quand: [
    ['urgent', "Moins d'un mois"],
    ['3m', "D'ici 3 mois"],
    ['6m', "D'ici 6 mois"],
    ['libre', 'Pas de date'],
  ],
  budget: [
    ['b1', 'Moins de 3 000 €'],
    ['b2', '3 000 à 8 000 €'],
    ['b3', '8 000 à 20 000 €'],
    ['b4', 'Plus de 20 000 €'],
    ['b0', 'Je ne sais pas, conseillez-moi'],
  ],
  decide: [
    ['moi', 'Moi'],
    ['associes', 'Moi et mes associés'],
    ['comite', 'Un comité ou une direction'],
  ],
  reponse: [
    ['ecrit', 'Par écrit'],
    ['appel', 'Un appel de 30 minutes'],
  ],
} as const

export interface QualificationState {
  need: NeedKey[]
  formule: FormuleKey | null
  siteUrl: string
  pain: PainKey[]
  marque: MarqueKey | null
  outilnow: OutilNowKey[]
  flou: string
  activite: string
  taille: TailleKey | null
  quand: QuandKey | null
  budget: BudgetKey | null
  decide: DecideKey | null
  reponse: ReponseKey | null
  prenom: string
  nom: string
  email: string
  tel: string
  message: string
  consent: boolean
}

export const initialState = (): QualificationState => ({
  need: [],
  formule: null,
  siteUrl: '',
  pain: [],
  marque: null,
  outilnow: [],
  flou: '',
  activite: '',
  taille: null,
  quand: null,
  budget: null,
  decide: null,
  reponse: null,
  prenom: '',
  nom: '',
  email: '',
  tel: '',
  message: '',
  consent: false,
})

export const hasNeed = (s: QualificationState, n: NeedKey): boolean => s.need.includes(n)

/** Une question conditionnelle s'affiche si l'un des besoins listés est coché. */
export const showsForAny = (s: QualificationState, needs: readonly NeedKey[]): boolean =>
  needs.some((n) => hasNeed(s, n))

/** Ce qu'on vous proposerait sans doute. */
export function reco(s: QualificationState): string[] {
  const r: string[] = []
  if (hasNeed(s, 'site') || hasNeed(s, 'refonte')) {
    r.push(
      s.formule ? `Site · formule ${LBL.formule[s.formule]}` : hasNeed(s, 'refonte') ? 'Refonte du site' : 'Site web',
    )
  }
  if (hasNeed(s, 'com')) {
    r.push('Diagnostic de communication')
    if (s.pain.includes('clair') || s.pain.includes('coherence')) r.push('Positionnement et messages')
    if (s.pain.includes('reseaux')) r.push('Plan de communication')
    if (s.pain.includes('demandes') || s.pain.includes('pub')) r.push('Acquisition et mesure')
  }
  if (hasNeed(s, 'marque')) r.push('Marque : nom, voix, système')
  if (hasNeed(s, 'outil') || s.formule === 'mesure') r.push('Développement sur mesure')
  if (hasNeed(s, 'flou')) r.push('Conseil : un état des lieux écrit')
  return r.filter((v, i) => r.indexOf(v) === i)
}

/** Remarque franche, ou chaîne vide. */
export function note(s: QualificationState): string {
  const big = hasNeed(s, 'outil') || (s.formule !== null && ['business', 'boutique', 'mesure'].includes(s.formule))
  if (s.budget === 'b1' && big) {
    return "Pour ce budget, un outil du marché sera souvent plus adapté. On vous le dira franchement pendant l'échange, avec des noms."
  }
  if (s.budget === 'b1' && hasNeed(s, 'com') && s.pain.includes('pub')) {
    return "Avec ce budget, on commence par le diagnostic : inutile d'acheter plus de publicité avant de savoir ce qui rapporte."
  }
  if (s.quand === 'urgent') {
    return "Moins d'un mois : on vous dira pendant l'échange ce qui est tenable, et ce qui ne l'est pas."
  }
  if (s.budget === 'b0') {
    return 'Pas de souci : le devis écrit vous donnera un prix ferme, et on vous dira ce qui peut attendre.'
  }
  return ''
}

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

/** Lignes du relevé de droite ; `value` vide = ligne grisée « — ». */
export function releve(s: QualificationState): { label: string; value: string }[] {
  const precisions = [
    s.formule && `Site : ${LBL.formule[s.formule]}`,
    s.pain.length > 0 && `${plural(s.pain.length, 'point')} de blocage`,
    s.marque && `Marque : ${LBL.marque[s.marque]}`,
    s.outilnow.length > 0 && `Remplace : ${plural(s.outilnow.length, 'outil')}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    { label: 'Besoin', value: s.need.map((n) => LBL.need[n]).join(', ') },
    { label: 'Précisions', value: precisions },
    { label: 'Entreprise', value: [s.activite.trim(), s.taille && LBL.taille[s.taille]].filter(Boolean).join(' · ') },
    { label: 'Échéance', value: s.quand ? LBL.quand[s.quand] : '' },
    { label: 'Budget', value: s.budget ? LBL.budget[s.budget] : '' },
    { label: 'Décision', value: s.decide ? LBL.decide[s.decide] : '' },
    { label: 'Contact', value: [s.prenom.trim(), s.email.trim()].filter(Boolean).join(' · ') },
  ]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isEmail = (v: string): boolean => EMAIL_RE.test(v.trim())

/** Ajoute https:// à une adresse saisie sans protocole. Vide reste vide. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`
}

export function isValidUrl(raw: string): boolean {
  const v = normalizeUrl(raw)
  if (!v) return true
  try {
    const u = new URL(v)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

export type FieldName = 'prenom' | 'email' | 'siteUrl'
export interface StepError {
  message: string
  fields: FieldName[]
}

export const MSG = {
  need: 'Choisissez au moins une réponse. Si rien ne correspond, prenez « Je ne sais pas encore ».',
  prenom: "Indiquez votre prénom, pour qu'on sache à qui répondre.",
  email: "Cette adresse e-mail semble incomplète. Vérifiez-la, c'est là qu'on vous répond.",
  consent: "Cochez la case pour qu'on puisse utiliser ces informations pour vous répondre.",
  url: "Cette adresse de site semble incomplète. Corrigez-la, ou laissez le champ vide si vous n'en avez pas.",
} as const

/** Validation d'une étape. `null` = l'étape est valide. */
export function validateStep(step: number, s: QualificationState): StepError | null {
  if (step === 0 && s.need.length === 0) return { message: MSG.need, fields: [] }
  if ((step === 1 || step === 2) && !isValidUrl(s.siteUrl)) return { message: MSG.url, fields: ['siteUrl'] }
  if (step === 4) {
    const fields: FieldName[] = []
    if (!s.prenom.trim()) fields.push('prenom')
    if (!isEmail(s.email)) fields.push('email')
    if (!s.prenom.trim()) return { message: MSG.prenom, fields }
    if (!isEmail(s.email)) return { message: MSG.email, fields }
    if (!s.consent) return { message: MSG.consent, fields }
  }
  return null
}

/** Sujet lisible du lead pour les vues d'admin existantes. */
export function subjectOf(s: QualificationState): string {
  return `Qualification : ${s.need.map((n) => LBL.need[n]).join(', ')}`.slice(0, 100)
}

/** Objet `qualification` du payload : uniquement les réponses encore pertinentes. */
export function toQualification(s: QualificationState): Record<string, unknown> {
  const q: Record<string, unknown> = { need: [...s.need] }
  const siteish = hasNeed(s, 'site') || hasNeed(s, 'refonte')
  if (siteish && s.formule) q.formule = s.formule
  const url = normalizeUrl(s.siteUrl)
  if (url) q.siteUrl = url
  if (hasNeed(s, 'com') && s.pain.length) q.pain = [...s.pain]
  if (hasNeed(s, 'marque') && s.marque) q.marque = s.marque
  if (hasNeed(s, 'outil') && s.outilnow.length) q.outilnow = [...s.outilnow]
  if (hasNeed(s, 'flou') && s.flou.trim()) q.flou = s.flou.trim()
  if (s.activite.trim()) q.activite = s.activite.trim()
  if (s.taille) q.taille = s.taille
  if (s.quand) q.quand = s.quand
  if (s.budget) q.budget = s.budget
  if (s.decide) q.decide = s.decide
  if (s.reponse) q.reponse = s.reponse
  return q
}

export function toPayload(
  s: QualificationState,
  meta: { startedAt: number; website: string },
): Record<string, unknown> {
  return {
    firstName: s.prenom.trim(),
    lastName: s.nom.trim(),
    email: s.email.trim(),
    phone: s.tel.trim(),
    subject: subjectOf(s),
    message: s.message.trim(),
    consent: s.consent,
    website: meta.website,
    startedAt: meta.startedAt,
    qualification: toQualification(s),
  }
}

/** Pré-remplissage : ?besoin=site,com&formule=business */
export function parsePreset(search: string): { need: NeedKey[]; formule: FormuleKey | null } {
  const params = new URLSearchParams(search)
  const need = (params.get('besoin') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is NeedKey => (NEED_KEYS as readonly string[]).includes(v))
  const uniq = need.filter((v, i) => need.indexOf(v) === i)
  const f = (params.get('formule') ?? '').trim()
  const formule = (FORMULE_KEYS as readonly string[]).includes(f) ? (f as FormuleKey) : null
  // Une formule de site n'a de sens que pour un besoin de site : on le coche.
  if (formule && !uniq.includes('site') && !uniq.includes('refonte')) uniq.unshift('site')
  return { need: uniq, formule }
}
