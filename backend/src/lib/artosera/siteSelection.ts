/**
 * Sélection composée sur artosera.com (page « Composer mon Artosera ») et
 * postée en arrière-plan sur `POST /api/artosera/devis`. Le navigateur ne
 * poste que des données : réponses, coordonnées, PDF. L'objet, le corps HTML
 * et la version texte de l'e-mail sont composés ici et dans le gabarit
 * `email/templates/artoseraSiteSelection.ts`, jamais repris du navigateur.
 */

export const MODULE_CHOICES = ['indispensable', 'interessant', 'plus-tard', 'pas-pour-nous'] as const
export const SERVICE_CHOICES = ['oui', 'a-discuter', 'non'] as const

export type ModuleChoice = (typeof MODULE_CHOICES)[number]
export type ServiceChoice = (typeof SERVICE_CHOICES)[number]
export type SiteSelectionLang = 'fr' | 'en'

export interface ArtoseraSiteSelection {
  lang: SiteSelectionLang
  /** Groupes de fonctions du cœur, compris dans l'abonnement. */
  coeur: { titre: string; items: string[] }[]
  modules: { titre: string; groupe: string; choix: ModuleChoice }[]
  accompagnement: { titre: string; choix: ServiceChoice }[]
  notes: string
}

const LIMITS = { coeur: 20, items: 40, modules: 80, accompagnement: 40, titre: 160, notes: 4000 }

function stripControls(value: string, keepNewline: boolean): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) out += char
    else if (keepNewline && code === 0x0a) out += char
    else if (!keepNewline) out += ' '
  }
  return out
}

/** Une ligne, sans contrôle, tronquée : un titre trop long reste lisible plutôt que de faire échouer l'envoi. */
function line(value: unknown, max = LIMITS.titre): string {
  if (typeof value !== 'string') return ''
  return stripControls(value.normalize('NFKC'), false).replace(/\s+/g, ' ').trim().slice(0, max)
}

function isChoice<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

/**
 * Normalise la sélection postée par le composeur. Une entrée mal formée ou à
 * choix inconnu est écartée ; une sélection sans aucun module ni
 * accompagnement exploitable est refusée (null).
 */
export function normalizeSiteSelection(value: unknown, lang: SiteSelectionLang): ArtoseraSiteSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

  const coeur = list(raw.coeur, LIMITS.coeur).flatMap((g) => {
    const group = obj(g)
    if (!group) return []
    const titre = line(group.titre)
    const items = list(group.items, LIMITS.items)
      .map((i) => line(i))
      .filter(Boolean)
    return titre || items.length ? [{ titre, items }] : []
  })

  const modules = list(raw.modules, LIMITS.modules).flatMap((m) => {
    const item = obj(m)
    if (!item || !isChoice(MODULE_CHOICES, item.choix)) return []
    const titre = line(item.titre)
    return titre ? [{ titre, groupe: line(item.groupe), choix: item.choix }] : []
  })

  const accompagnement = list(raw.accompagnement, LIMITS.accompagnement).flatMap((s) => {
    const item = obj(s)
    if (!item || !isChoice(SERVICE_CHOICES, item.choix)) return []
    const titre = line(item.titre)
    return titre ? [{ titre, choix: item.choix }] : []
  })

  if (!modules.length && !accompagnement.length) return null

  const notes =
    typeof raw.notes === 'string'
      ? stripControls(raw.notes.normalize('NFKC').replace(/\r\n?/g, '\n'), true).trim().slice(0, LIMITS.notes)
      : ''

  return { lang, coeur, modules, accompagnement, notes }
}

export const SITE_SELECTION_LABELS = {
  fr: {
    locale: 'fr-FR',
    titre: 'Sélection Artosera',
    preheader: 'Nouvelle sélection composée sur artosera.com',
    intro: 'Un prospect a composé sa sélection sur artosera.com. Répondre à ce message lui écrit directement.',
    qui: 'Qui',
    galerie: 'Galerie',
    interlocuteur: 'Interlocuteur',
    email: 'E-mail',
    langue: 'Langue',
    date: 'Reçue le',
    nonPrecise: 'Non précisé',
    emailAbsent: 'Aucune adresse valide saisie',
    langues: { fr: 'Français', en: 'Anglais' },
    coeur: 'Le cœur',
    compris: 'Compris',
    modules: 'Modules',
    accompagnement: 'Accompagnement',
    remarques: 'Remarques',
    aucun: 'Aucun',
    pieceJointe: 'PDF de la sélection en pièce jointe',
    reference: 'Référence',
    choixModule: {
      indispensable: 'Indispensables',
      interessant: 'Intéressants',
      'plus-tard': 'Plus tard',
      'pas-pour-nous': 'Pas pour nous',
    },
    choixService: { oui: 'Oui', 'a-discuter': 'À discuter', non: 'Non' },
    compteIndispensables: (n: number) =>
      n === 0 ? 'aucun module indispensable' : `${n} module${n > 1 ? 's' : ''} indispensable${n > 1 ? 's' : ''}`,
  },
  en: {
    locale: 'en-GB',
    titre: 'Artosera selection',
    preheader: 'New selection composed on artosera.com',
    intro: 'A prospect composed their selection on artosera.com. Replying to this message writes to them directly.',
    qui: 'Who',
    galerie: 'Gallery',
    interlocuteur: 'Contact',
    email: 'Email',
    langue: 'Language',
    date: 'Received',
    nonPrecise: 'Not specified',
    emailAbsent: 'No valid address entered',
    langues: { fr: 'French', en: 'English' },
    coeur: 'The core',
    compris: 'Included',
    modules: 'Modules',
    accompagnement: 'Support',
    remarques: 'Notes',
    aucun: 'None',
    pieceJointe: 'Selection PDF attached',
    reference: 'Reference',
    choixModule: {
      indispensable: 'Essential',
      interessant: 'Interesting',
      'plus-tard': 'Later',
      'pas-pour-nous': 'Not for us',
    },
    choixService: { oui: 'Yes', 'a-discuter': 'To discuss', non: 'No' },
    compteIndispensables: (n: number) => (n === 0 ? 'no essential module' : `${n} essential module${n > 1 ? 's' : ''}`),
  },
} as const

/** « Sélection Artosera — <galerie> (<n> modules indispensables) », dans la langue de la sélection. */
export function siteSelectionSubject(selection: ArtoseraSiteSelection, galerie: string): string {
  const t = SITE_SELECTION_LABELS[selection.lang]
  const n = selection.modules.filter((m) => m.choix === 'indispensable').length
  return `${t.titre} — ${galerie || t.nonPrecise} (${t.compteIndispensables(n)})`
}

/** Clé de comparaison des libellés : minuscules, sans accents ni ponctuation superflue. */
function labelKey(value: unknown): string {
  return line(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Titres de groupe du récapitulatif posté par le composeur, FR et EN. */
const MODULE_GROUP_TITLES: Record<string, ModuleChoice> = {
  'modules indispensables': 'indispensable',
  'essential modules': 'indispensable',
  'modules interessants': 'interessant',
  'interesting modules': 'interessant',
  'modules pour plus tard': 'plus-tard',
  'modules for later': 'plus-tard',
  'modules ecartes': 'pas-pour-nous',
  'modules set aside': 'pas-pour-nous',
}

/** Réponses isolées, telles qu'affichées dans une pastille, FR et EN. */
const MODULE_LABELS: Record<string, ModuleChoice> = {
  indispensable: 'indispensable',
  essential: 'indispensable',
  interessant: 'interessant',
  interesting: 'interessant',
  'plus tard': 'plus-tard',
  later: 'plus-tard',
  'pas pour nous': 'pas-pour-nous',
  'not for us': 'pas-pour-nous',
}

const SERVICE_LABELS: Record<string, ServiceChoice> = {
  oui: 'oui',
  yes: 'oui',
  'a discuter': 'a-discuter',
  'to discuss': 'a-discuter',
  non: 'non',
  no: 'non',
}

const CORE_KEYS = new Set(['le coeur', 'the core', 'compris', 'included'])

/**
 * Convertit le récapitulatif générique (`recap.services[].lignes[]`) posté par
 * le composeur en sélection structurée. Pour chaque ligne, dans l'ordre :
 * un `choix` explicite s'il est connu ; sinon le groupe du cœur (titre « Le
 * cœur » ou sous-total « Compris ») ; sinon le titre du groupe de modules ;
 * sinon la pastille (`prix`) d'accompagnement ou de module. Une ligne qui ne
 * correspond à rien est écartée. Null si rien d'exploitable.
 */
export function siteSelectionFromRecap(value: unknown, lang: SiteSelectionLang): ArtoseraSiteSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const groups = Array.isArray(raw.services) ? raw.services.slice(0, LIMITS.coeur + 10) : []

  const coeur: ArtoseraSiteSelection['coeur'] = []
  const modules: { titre: string; groupe: string; choix: ModuleChoice }[] = []
  const accompagnement: { titre: string; choix: ServiceChoice }[] = []

  for (const g of groups) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue
    const group = g as Record<string, unknown>
    const isCore = CORE_KEYS.has(labelKey(group.titre)) || CORE_KEYS.has(labelKey(group.sousTotal))
    const groupChoice = MODULE_GROUP_TITLES[labelKey(group.titre)]
    const lignes = Array.isArray(group.lignes) ? group.lignes.slice(0, LIMITS.modules) : []

    for (const l of lignes) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) continue
      const ligne = l as Record<string, unknown>
      const titre = line(ligne.nom)
      if (!titre) continue
      const prix = labelKey(ligne.prix)

      if (isChoice(MODULE_CHOICES, ligne.choix)) modules.push({ titre, groupe: '', choix: ligne.choix })
      else if (isChoice(SERVICE_CHOICES, ligne.choix)) accompagnement.push({ titre, choix: ligne.choix })
      else if (isCore) coeur.push({ titre, items: line(ligne.prix) ? [line(ligne.prix)] : [] })
      else if (groupChoice) modules.push({ titre, groupe: '', choix: groupChoice })
      else if (SERVICE_LABELS[prix]) accompagnement.push({ titre, choix: SERVICE_LABELS[prix] })
      else if (MODULE_LABELS[prix]) modules.push({ titre, groupe: '', choix: MODULE_LABELS[prix] })
    }
  }

  return normalizeSiteSelection(
    {
      coeur: coeur.slice(0, LIMITS.coeur),
      modules,
      accompagnement,
      notes: raw.notes,
    },
    lang,
  )
}

/** Langue d'un corps posté : `lang`, puis `selection.lang`, puis `recap.lang` ; français par défaut. */
export function bodyLang(body: unknown): SiteSelectionLang {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'fr'
  const raw = body as Record<string, unknown>
  const nested = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>).lang : undefined)
  const first = [raw.lang, nested(raw.selection), nested(raw.recap)].find((v) => v === 'fr' || v === 'en')
  return first === 'en' ? 'en' : 'fr'
}
