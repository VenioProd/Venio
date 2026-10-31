/**
 * Logique métier du formulaire de qualification : libellés, relevé, piste
 * proposée, remarques franches, validation et payload. Pur, sans React.
 * Source de vérité des textes : docs/design/refonte-2026-maquette.html.
 */

import { translate, formatMessage } from '../../i18n'
import type { MessageKey } from '../../i18n'
import fr from '../../i18n/fr/pubForms'

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

export const STEP_NAME_KEYS = [
  'pubForms.qualification.stepNameNeed',
  'pubForms.qualification.stepNameDetails',
  'pubForms.qualification.stepNameCompany',
  'pubForms.qualification.stepNameFrame',
  'pubForms.qualification.stepNameContact',
] as const satisfies readonly MessageKey[]
export const STEP_TITLE_KEYS = [
  'pubForms.qualification.stepTitleNeed',
  'pubForms.qualification.stepTitleDetails',
  'pubForms.qualification.stepTitleCompany',
  'pubForms.qualification.stepTitleFrame',
  'pubForms.qualification.stepTitleContact',
] as const satisfies readonly MessageKey[]

export const NEED_KEYS = ['site', 'refonte', 'com', 'marque', 'outil', 'flou'] as const
export const FORMULE_KEYS = ['vitrine', 'essentiel', 'business', 'boutique', 'mesure'] as const

/** Clés des libellés courts du relevé (colonne de droite) et de la réponse envoyée. */
const LBL_KEYS = {
  need: {
    site: 'pubForms.qualification.needLabelSite',
    refonte: 'pubForms.qualification.needLabelRedo',
    com: 'pubForms.qualification.needLabelCom',
    marque: 'pubForms.qualification.needLabelBrand',
    outil: 'pubForms.qualification.needLabelTool',
    flou: 'pubForms.qualification.needLabelUndefined',
  },
  formule: {
    vitrine: 'pubForms.qualification.planShowcase',
    essentiel: 'pubForms.qualification.planEssential',
    business: 'pubForms.qualification.planBusiness',
    boutique: 'pubForms.qualification.planShop',
    mesure: 'pubForms.qualification.planCustom',
  },
  taille: {
    '1': 'pubForms.qualification.sizeLabel1',
    '2-10': 'pubForms.qualification.sizeLabel2',
    '11-50': 'pubForms.qualification.sizeLabel3',
    '50+': 'pubForms.qualification.sizeLabel4',
  },
  quand: {
    urgent: 'pubForms.qualification.whenUrgent',
    '3m': 'pubForms.qualification.when3m',
    '6m': 'pubForms.qualification.when6m',
    libre: 'pubForms.qualification.whenFree',
  },
  budget: {
    b1: 'pubForms.qualification.budget1',
    b2: 'pubForms.qualification.budget2',
    b3: 'pubForms.qualification.budget3',
    b4: 'pubForms.qualification.budget4',
    b0: 'pubForms.qualification.budgetLabel0',
  },
  decide: {
    moi: 'pubForms.qualification.decideLabelMe',
    associes: 'pubForms.qualification.decideLabelPartners',
    comite: 'pubForms.qualification.decideLabelBoard',
  },
  marque: {
    rien: 'pubForms.qualification.brandLabelNone',
    nom: 'pubForms.qualification.brandLabelName',
    refaire: 'pubForms.qualification.brandLabelRedo',
  },
} as const satisfies Record<string, Record<string, MessageKey>>

/** Libellé affiché dans la langue active. */
const lbl = <G extends keyof typeof LBL_KEYS>(group: G, key: keyof (typeof LBL_KEYS)[G]): string =>
  translate(LBL_KEYS[group][key] as MessageKey)

/** Cartes du premier écran et du bloc d'entrée de bas de page. */
export type NeedIcon = 'doc' | 'code' | 'megaphone' | 'glyph' | 'calendar' | 'loupe'

export const NEED_CARDS: readonly { key: NeedKey; titleKey: MessageKey; hintKey: MessageKey; icon: NeedIcon }[] = [
  {
    key: 'site',
    titleKey: 'pubForms.qualification.cardSite',
    hintKey: 'pubForms.qualification.cardSiteHint',
    icon: 'doc',
  },
  {
    key: 'refonte',
    titleKey: 'pubForms.qualification.cardRedo',
    hintKey: 'pubForms.qualification.cardRedoHint',
    icon: 'code',
  },
  {
    key: 'com',
    titleKey: 'pubForms.qualification.cardCom',
    hintKey: 'pubForms.qualification.cardComHint',
    icon: 'megaphone',
  },
  {
    key: 'marque',
    titleKey: 'pubForms.qualification.cardBrand',
    hintKey: 'pubForms.qualification.cardBrandHint',
    icon: 'glyph',
  },
  {
    key: 'outil',
    titleKey: 'pubForms.qualification.cardTool',
    hintKey: 'pubForms.qualification.cardToolHint',
    icon: 'calendar',
  },
  {
    key: 'flou',
    titleKey: 'pubForms.qualification.cardUndefined',
    hintKey: 'pubForms.qualification.cardUndefinedHint',
    icon: 'loupe',
  },
]

/** Puces de réponse par question (chips) : [valeur envoyée, clé du libellé]. */
export const CHOICES = {
  formule: [
    ['vitrine', 'pubForms.qualification.planChoiceShowcase'],
    ['essentiel', 'pubForms.qualification.planChoiceEssential'],
    ['business', 'pubForms.qualification.planChoiceBusiness'],
    ['boutique', 'pubForms.qualification.planChoiceShop'],
    ['mesure', 'pubForms.qualification.planChoiceCustom'],
  ],
  pain: [
    ['clair', 'pubForms.qualification.painUnclear'],
    ['reseaux', 'pubForms.qualification.painSocial'],
    ['demandes', 'pubForms.qualification.painLeads'],
    ['pub', 'pubForms.qualification.painAds'],
    ['coherence', 'pubForms.qualification.painConsistency'],
  ],
  marque: [
    ['rien', 'pubForms.qualification.brandChoiceNone'],
    ['nom', 'pubForms.qualification.brandChoiceName'],
    ['refaire', 'pubForms.qualification.brandChoiceRedo'],
  ],
  outilnow: [
    ['tableurs', 'pubForms.qualification.toolNowSheets'],
    ['logiciels', 'pubForms.qualification.toolNowSoftware'],
    ['papier', 'pubForms.qualification.toolNowPaper'],
  ],
  taille: [
    ['1', 'pubForms.qualification.sizeChoice1'],
    ['2-10', 'pubForms.qualification.sizeChoice2'],
    ['11-50', 'pubForms.qualification.sizeChoice3'],
    ['50+', 'pubForms.qualification.sizeChoice4'],
  ],
  quand: [
    ['urgent', 'pubForms.qualification.whenUrgent'],
    ['3m', 'pubForms.qualification.when3m'],
    ['6m', 'pubForms.qualification.when6m'],
    ['libre', 'pubForms.qualification.whenFree'],
  ],
  budget: [
    ['b1', 'pubForms.qualification.budget1'],
    ['b2', 'pubForms.qualification.budget2'],
    ['b3', 'pubForms.qualification.budget3'],
    ['b4', 'pubForms.qualification.budget4'],
    ['b0', 'pubForms.qualification.budgetChoice0'],
  ],
  decide: [
    ['moi', 'pubForms.qualification.decideChoiceMe'],
    ['associes', 'pubForms.qualification.decideChoicePartners'],
    ['comite', 'pubForms.qualification.decideChoiceBoard'],
  ],
  reponse: [
    ['ecrit', 'pubForms.qualification.replyWritten'],
    ['appel', 'pubForms.qualification.replyCall'],
  ],
} as const satisfies Record<string, readonly (readonly [string, MessageKey])[]>

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
      s.formule
        ? translate('pubForms.qualification.recoSitePlan', { plan: lbl('formule', s.formule) })
        : hasNeed(s, 'refonte')
          ? translate('pubForms.qualification.recoRedo')
          : translate('pubForms.qualification.recoSite'),
    )
  }
  if (hasNeed(s, 'com')) {
    r.push(translate('pubForms.qualification.recoDiagnostic'))
    if (s.pain.includes('clair') || s.pain.includes('coherence'))
      r.push(translate('pubForms.qualification.recoPositioning'))
    if (s.pain.includes('reseaux')) r.push(translate('pubForms.qualification.recoPlan'))
    if (s.pain.includes('demandes') || s.pain.includes('pub'))
      r.push(translate('pubForms.qualification.recoAcquisition'))
  }
  if (hasNeed(s, 'marque')) r.push(translate('pubForms.qualification.recoBrand'))
  if (hasNeed(s, 'outil') || s.formule === 'mesure') r.push(translate('pubForms.qualification.recoCustom'))
  if (hasNeed(s, 'flou')) r.push(translate('pubForms.qualification.recoAdvice'))
  return r.filter((v, i) => r.indexOf(v) === i)
}

/** Remarque franche, ou chaîne vide. */
export function note(s: QualificationState): string {
  const big = hasNeed(s, 'outil') || (s.formule !== null && ['business', 'boutique', 'mesure'].includes(s.formule))
  if (s.budget === 'b1' && big) return translate('pubForms.qualification.noteSmallBudgetTool')
  if (s.budget === 'b1' && hasNeed(s, 'com') && s.pain.includes('pub')) {
    return translate('pubForms.qualification.noteSmallBudgetAds')
  }
  if (s.quand === 'urgent') return translate('pubForms.qualification.noteUrgent')
  if (s.budget === 'b0') return translate('pubForms.qualification.noteUnknownBudget')
  return ''
}

/** Lignes du relevé de droite ; `value` vide = ligne grisée « — ». */
export function releve(s: QualificationState): { label: string; value: string }[] {
  const precisions = [
    s.formule && translate('pubForms.qualification.relPlan', { plan: lbl('formule', s.formule) }),
    s.pain.length > 0 && translate('pubForms.qualification.relPain', { count: s.pain.length }),
    s.marque && translate('pubForms.qualification.relBrand', { brand: lbl('marque', s.marque) }),
    s.outilnow.length > 0 && translate('pubForms.qualification.relTools', { count: s.outilnow.length }),
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    { label: translate('pubForms.qualification.stepNameNeed'), value: s.need.map((n) => lbl('need', n)).join(', ') },
    { label: translate('pubForms.qualification.stepNameDetails'), value: precisions },
    {
      label: translate('pubForms.qualification.stepNameCompany'),
      value: [s.activite.trim(), s.taille && lbl('taille', s.taille)].filter(Boolean).join(' · '),
    },
    { label: translate('pubForms.qualification.relTimeline'), value: s.quand ? lbl('quand', s.quand) : '' },
    { label: translate('pubForms.qualification.relBudget'), value: s.budget ? lbl('budget', s.budget) : '' },
    { label: translate('pubForms.qualification.relDecision'), value: s.decide ? lbl('decide', s.decide) : '' },
    {
      label: translate('pubForms.qualification.relContact'),
      value: [s.prenom.trim(), s.email.trim()].filter(Boolean).join(' · '),
    },
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

/** Messages de validation, résolus à la lecture dans la langue active. */
export const MSG = {
  get need() {
    return translate('pubForms.qualification.errNeed')
  },
  get prenom() {
    return translate('pubForms.qualification.errFirstName')
  },
  get email() {
    return translate('pubForms.qualification.errEmail')
  },
  get consent() {
    return translate('pubForms.qualification.errConsent')
  },
  get url() {
    return translate('pubForms.qualification.errUrl')
  },
}

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

/**
 * Sujet lisible du lead pour les vues d'admin existantes. Toujours en français,
 * quelle que soit la langue du visiteur : c'est l'équipe qui le lit.
 */
export function subjectOf(s: QualificationState): string {
  const needs = s.need.map((n) => fr[LBL_KEYS.need[n]]).join(', ')
  return formatMessage(fr['pubForms.qualification.leadSubject'], { needs }, 'fr').slice(0, 100)
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
