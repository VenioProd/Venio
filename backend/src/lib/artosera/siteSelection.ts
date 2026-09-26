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

export function normalizeSiteLang(...candidates: unknown[]): SiteSelectionLang {
  return candidates.some((c) => c === 'en') ? 'en' : 'fr'
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
