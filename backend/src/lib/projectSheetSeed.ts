import mongoose from 'mongoose'
import ProjectSheet, {
  PROJECT_SHEET_SECTIONS,
  type IProjectSheet,
  type ProjectSheetStatus,
} from '../models/ProjectSheet.js'
import Subsidiary from '../models/Subsidiary.js'
import { historyEntry, pushHistory } from './projectSheets.js'

/**
 * Contenu initial des fiches projets (migration 012).
 *
 * Brouillon factuel fourni par Raphael le 6 novembre 2026 : chaque fiche créée
 * ou complétée ici passe en `DRAFT` (« Brouillon à relire par Raphael »).
 * Règles d'idempotence :
 *  - une fiche absente est créée (rattachée à la filiale de même slug si elle existe) ;
 *  - une fiche présente ne voit remplis que ses champs vides : rien n'est écrasé ;
 *  - chaque filiale du dossier SUPER_ADMIN sans fiche reçoit une fiche vide
 *    « à compléter », sans aucune donnée recopiée ni inventée ;
 *  - aucun accès démo n'est créé.
 */

export const SEED_MARKER = 'Brouillon à relire par Raphael (migration 012)'
export const EMPTY_MARKER = 'Fiche à compléter (migration 012)'

type SeedText = Partial<Record<(typeof PROJECT_SHEET_SECTIONS)[number] | 'oneLiner', string>>
export interface SheetSeed extends SeedText {
  slug: string
  /** Slugs de filiale (Subsidiary) acceptés pour le rattachement. */
  aliases: string[]
  name: string
  status: ProjectSheetStatus
  legalEntity: IProjectSheet['legalEntity']
  leadProject: IProjectSheet['leadProject']
  accentColor?: string
  websites: { label: string; url: string }[]
  links: { type: IProjectSheet['links'][number]['type']; label: string; url: string }[]
}

export const SHEET_SEEDS: SheetSeed[] = [
  {
    slug: 'venio',
    aliases: ['venio', 'groupe-venio'],
    name: 'Groupe Venio',
    status: 'ACTIVE',
    legalEntity: 'VENIO',
    leadProject: '',
    websites: [{ label: 'Site', url: 'https://venio.paris' }],
    links: [],
    oneLiner:
      'Maison mère du groupe : stratégie de communication, branding et conseil pour des marques premium qui refusent le marketing tiède.',
    whatWeDo: [
      'Venio est la maison mère du groupe.',
      '',
      '- **Stratégie de communication**',
      '- **Branding et positionnement**',
      '- **Marketing digital**',
      '- **Conseil stratégique**',
      '',
      'Pour qui : marques de l’hôtellerie-restauration, du premium et du luxe.',
      '',
      'La **plateforme Venio** (site public + back-office : CRM, projets, comptabilité, Qualiopi, tickets, dev tracker) est l’outil interne de tout le groupe.',
    ].join('\n'),
    audience: '- Hôtellerie-restauration\n- Marques premium\n- Luxe',
    positioning: 'Discours décalé et anti-bullshit : on refuse le marketing tiède.',
    brandVoice: 'Décalé, direct, anti-bullshit. Exigeant sur le fond, jamais tiède.',
    stack:
      'Plateforme Venio : site public et back-office (CRM, projets, comptabilité, Qualiopi, tickets, dev tracker).',
  },
  {
    slug: 'creatio',
    aliases: ['creatio'],
    name: 'Creatio',
    status: 'ACTIVE',
    legalEntity: 'CREATIO',
    leadProject: '',
    websites: [{ label: 'Site', url: 'https://creatio.paris' }],
    links: [],
    oneLiner: 'Contenus pédagogiques clés en main pour les écoles, par abonnement mensuel.',
    whatWeDo: [
      'Creatio fournit aux écoles des **contenus pédagogiques clés en main** :',
      '',
      '- slides structurées, prêtes à être projetées ;',
      '- programmes en marketing, digital, communication et IA.',
      '',
      'Problème résolu : les équipes pédagogiques n’ont plus à produire elles-mêmes leurs supports de cours.',
    ].join('\n'),
    audience: '- Directeurs et directrices pédagogiques\n- Écoles de commerce\n- CFA',
    offers: 'Abonnement mensuel donnant accès aux contenus. Grille tarifaire à compléter.',
  },
  {
    slug: 'decisio',
    aliases: ['decisio'],
    name: 'Decisio',
    status: 'ACTIVE',
    legalEntity: 'DECISIO',
    leadProject: '',
    websites: [{ label: 'Site', url: 'https://decisio.paris' }],
    links: [],
    oneLiner: 'Communication, conseil et formation pour les avocats indépendants.',
    whatWeDo: [
      'Decisio accompagne les **avocats indépendants** sur trois piliers :',
      '',
      '1. **Communication** : branding, rédaction, contenus, site.',
      '2. **Conseil stratégique**.',
      '3. **Formations** : l’IA dans le droit, la communication des professions réglementées, les réseaux sociaux.',
    ].join('\n'),
    audience: '- Avocats indépendants',
    brandVoice: 'Sérieux, expert, bienveillant. Toujours conforme à la déontologie de la profession.',
  },
  {
    slug: 'formatio',
    aliases: ['formatio'],
    name: 'Formatio',
    status: 'ACTIVE',
    legalEntity: 'FORMATIO',
    leadProject: '',
    accentColor: '#ec4899',
    websites: [],
    links: [],
    oneLiner: 'Organisme de formation continue certifié Qualiopi, éligible au financement OPCO.',
    whatWeDo: [
      'Formatio est l’**organisme de formation continue** du groupe : certifié Qualiopi, formations éligibles OPCO.',
      '',
      'Thématiques :',
      '',
      '- management (dont management des personnes neurodivergentes) ;',
      '- IA appliquée ;',
      '- marketing et communication.',
    ].join('\n'),
    brandVoice: 'Identité visuelle : fond noir, texte blanc, accent rose.',
  },
  {
    slug: 'arrow',
    aliases: ['arrow'],
    name: 'Arrow',
    status: 'ACTIVE',
    legalEntity: 'ARROW',
    leadProject: 'ARROW',
    websites: [],
    links: [],
    oneLiner:
      'SaaS de gestion pédagogique et administrative pour écoles et organismes de formation — priorité commerciale du groupe.',
    whatWeDo: [
      'Arrow est un **SaaS de gestion pédagogique et administrative** pour les écoles et les organismes de formation.',
      '',
      '- authentification et rôles ;',
      '- cohortes et modules ;',
      '- cours, sessions et présences ;',
      '- devoirs et évaluations ;',
      '- suivi pédagogique ;',
      '- messagerie en temps réel ;',
      '- documents.',
      '',
      'Vision : plateforme **multi-établissements**. Arrow est la **priorité commerciale** du groupe.',
    ].join('\n'),
    audience: '- Écoles\n- Organismes de formation',
    positioning: ['- Remplace 5 à 10 outils.', '- Conformité RNCP, Qualiopi et RGPD.', '- IA embarquée.'].join('\n'),
    offers: [
      'Tarifs **indicatifs recommandés — à valider avant toute diffusion** :',
      '',
      '| Offre | Prix |',
      '| --- | --- |',
      '| Starter | 399 €/mois HT |',
      '| Pro | 749 €/mois HT |',
      '| Business | 1 390 €/mois HT |',
      '| Enterprise | sur devis |',
    ].join('\n'),
    stack: '- Back : NestJS\n- Front : React / Vite\n- Base : MongoDB',
  },
  {
    slug: 'virendys',
    aliases: ['virendys', 'sukuna'],
    name: 'Virendys',
    status: 'LAUNCHING',
    legalEntity: '',
    leadProject: '',
    websites: [
      { label: 'Application', url: 'https://virendys.fr' },
      { label: 'Site commercial', url: 'https://info.virendys.fr' },
    ],
    links: [{ type: 'repo', label: 'Dépôt VenioProd/sukuna', url: 'https://github.com/VenioProd/sukuna' }],
    oneLiner: 'Application santé (ex-Sukuna) — description à compléter par Raphael.',
    whatWeDo: [
      'Virendys (anciennement Sukuna) est une **application santé**. Description de l’offre à compléter par Raphael.',
      '',
      '- Application : https://virendys.fr',
      '- Site commercial : https://info.virendys.fr',
      '',
      '> L’environnement en ligne est une **démonstration à données synthétiques**. Il n’est **pas HDS** : aucune vraie donnée patient ne doit y être saisie.',
    ].join('\n'),
    stack: 'Dépôt : VenioProd/sukuna.',
  },
  {
    slug: 'artosera',
    aliases: ['artosera'],
    name: 'Artosera',
    status: 'LAUNCHING',
    legalEntity: 'VENIO',
    leadProject: 'ARTOSERA',
    websites: [],
    links: [],
    oneLiner: 'Projet porté par Venio autour d’un réseau de galeries d’art — à compléter par Raphael.',
    whatWeDo: 'Projet porté par Venio, lié à un **réseau de galeries d’art**. Description à compléter par Raphael.',
    keyFigures: '39 galeries en prospection dans le CRM (novembre 2026).',
  },
]

const TEXT_FIELDS = ['oneLiner', ...PROJECT_SHEET_SECTIONS] as const

export interface SeedReport {
  created: string[]
  completed: Array<{ slug: string; fields: string[] }>
  emptyCreated: string[]
  unchanged: string[]
}

/** Champs vides de la fiche que la graine peut remplir. */
export function fillableFields(sheet: Partial<IProjectSheet>, seed: SheetSeed): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const key of TEXT_FIELDS) {
    const value = seed[key]
    if (value && !String(sheet[key] ?? '').trim()) updates[key] = value
  }
  if (!sheet.legalEntity && seed.legalEntity) updates.legalEntity = seed.legalEntity
  if (!sheet.leadProject && seed.leadProject) updates.leadProject = seed.leadProject
  if (!sheet.websites?.length && seed.websites.length) updates.websites = seed.websites
  if (!sheet.links?.length && seed.links.length) updates.links = seed.links
  return updates
}

function statusFromSubsidiary(status: unknown): ProjectSheetStatus {
  if (status === 'ACTIVE') return 'ACTIVE'
  if (status === 'PAUSE') return 'PAUSED'
  return 'LAUNCHING'
}

/**
 * Crée les fiches manquantes et complète les champs vides. Idempotente :
 * une seconde exécution ne modifie rien. `dryRun` calcule le rapport sans écrire.
 */
export async function seedProjectSheets({ dryRun = false } = {}): Promise<SeedReport> {
  const report: SeedReport = { created: [], completed: [], emptyCreated: [], unchanged: [] }
  const subsidiaries = await Subsidiary.find({}).select('name slug status archived accentColor logoUrl').lean()
  const claimed = new Set(
    (
      await ProjectSheet.find({ subsidiary: { $ne: null } })
        .select('subsidiary')
        .lean()
    ).map((s) => String(s.subsidiary)),
  )

  for (const seed of SHEET_SEEDS) {
    const existing = await ProjectSheet.findOne({ slug: seed.slug })
    if (!existing) {
      const subsidiary = subsidiaries.find((s) => seed.aliases.includes(s.slug) && !claimed.has(String(s._id)))
      if (subsidiary) claimed.add(String(subsidiary._id))
      report.created.push(seed.slug)
      if (dryRun) continue
      const sheet = new ProjectSheet({
        ...fillableFields({}, seed),
        slug: seed.slug,
        name: seed.name,
        status: seed.status,
        reviewStatus: 'DRAFT',
        accentColor: seed.accentColor ?? subsidiary?.accentColor ?? undefined,
        logoUrl: subsidiary?.logoUrl && /^https?:\/\//.test(subsidiary.logoUrl) ? subsidiary.logoUrl : '',
        subsidiary: subsidiary?._id ?? null,
      })
      pushHistory(sheet.history, historyEntry(null, ['création'], SEED_MARKER))
      await sheet.save()
      continue
    }
    const updates = fillableFields(existing.toObject(), seed)
    const fields = Object.keys(updates)
    if (!fields.length) {
      report.unchanged.push(seed.slug)
      continue
    }
    report.completed.push({ slug: seed.slug, fields })
    if (dryRun) continue
    existing.set(updates)
    if (existing.reviewStatus === 'TO_COMPLETE') existing.reviewStatus = 'DRAFT'
    pushHistory(existing.history, historyEntry(null, fields, SEED_MARKER))
    await existing.save()
  }

  // Filiales du dossier SUPER_ADMIN encore sans fiche : fiche vide « à compléter ».
  const taken = new Set((await ProjectSheet.find({}).select('slug').lean()).map((s) => s.slug))
  for (const subsidiary of subsidiaries) {
    if (subsidiary.archived || subsidiary.status === 'ARCHIVED') continue
    if (claimed.has(String(subsidiary._id))) continue
    if (SHEET_SEEDS.some((seed) => seed.aliases.includes(subsidiary.slug))) continue
    if (taken.has(subsidiary.slug)) {
      report.unchanged.push(subsidiary.slug)
      continue
    }
    report.emptyCreated.push(subsidiary.slug)
    if (dryRun) continue
    const sheet = new ProjectSheet({
      slug: subsidiary.slug,
      name: subsidiary.name,
      status: statusFromSubsidiary(subsidiary.status),
      reviewStatus: 'TO_COMPLETE',
      accentColor: /^#[0-9a-fA-F]{6}$/.test(subsidiary.accentColor ?? '') ? subsidiary.accentColor : undefined,
      subsidiary: subsidiary._id as mongoose.Types.ObjectId,
    })
    pushHistory(sheet.history, historyEntry(null, ['création'], EMPTY_MARKER))
    await sheet.save()
    taken.add(subsidiary.slug)
  }
  return report
}

/** Index de la collection (slug unique, filiale unique). */
export async function ensureProjectSheetIndexes(): Promise<void> {
  await ProjectSheet.createCollection().catch(() => undefined)
  // createIndexes (et non syncIndexes) : ne supprime jamais un index existant.
  await ProjectSheet.createIndexes()
}
