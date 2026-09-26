import { MODULE_CHOICES, SERVICE_CHOICES, type ModuleChoice, type ServiceChoice } from './siteSelection.js'

/**
 * Catalogue de la page « Composer mon Artosera » (artosera.com/composer.html et
 * /en/composer.html) : identifiants des questions (`data-q`) et libellés FR/EN.
 *
 * C'est la liste blanche du mail envoyé au prospect. Ce mail part vers une
 * adresse saisie par un inconnu : il ne contient que ces libellés, choisis par
 * identifiant, jamais un texte venu du navigateur. Un identifiant absent d'ici
 * est ignoré. À mettre à jour si la page ajoute ou renomme une question.
 */

interface Libelle {
  fr: string
  en: string
}

export const COMPOSER_MODULES: readonly ({ id: string } & Libelle)[] = [
  { id: 'facturation', fr: 'Facturation complète', en: 'Full invoicing' },
  { id: 'viewing-rooms', fr: 'Viewing rooms', en: 'Viewing rooms' },
  { id: 'coffre', fr: 'Le coffre', en: 'The Vault' },
  { id: 'mode-foire', fr: 'Mode foire', en: 'Fair mode' },
  { id: 'mouvements', fr: 'Mouvements', en: 'Movements' },
  { id: 'application-hors-ligne', fr: 'Application hors ligne', en: 'Offline app' },
  { id: 'offres-relances', fr: 'Offres et relances', en: 'Offers and follow-ups' },
  { id: 'documents-prestige', fr: 'Documents de prestige', en: 'Presentation documents' },
  { id: 'newsletter-reseaux', fr: 'Newsletter et réseaux', en: 'Newsletter and social media' },
  { id: 'artsy-artnet', fr: 'Artsy et Artnet', en: 'Artsy and Artnet' },
  { id: 'contrats-artistes', fr: 'Contrats d’artistes', en: 'Artist contracts' },
  { id: 'editions-provenance', fr: 'Éditions et provenance', en: 'Editions and provenance' },
  { id: 'modeles-contrats', fr: 'Modèles de contrats', en: 'Contract templates' },
  { id: 'agenda-presse', fr: 'Agenda et presse', en: 'Calendar and press' },
  { id: 'roles-fins', fr: 'Rôles fins', en: 'Fine-grained roles' },
  { id: 'api-comptabilite', fr: 'API et comptabilité', en: 'API and accounting' },
]

export const COMPOSER_SERVICES: readonly ({ id: string } & Libelle)[] = [
  { id: 'mise-en-place', fr: 'Mise en place', en: 'Setup' },
  { id: 'reprise-donnees', fr: 'Reprise des données', en: 'Data migration' },
  { id: 'reprise-complexe', fr: 'Reprise complexe', en: 'Complex migration' },
  { id: 'formation', fr: 'Formation', en: 'Training' },
  { id: 'assistance', fr: 'Assistance aux utilisateurs', en: 'User support' },
  { id: 'evolutions-sur-mesure', fr: 'Évolutions sur mesure', en: 'Bespoke development' },
  { id: 'site-galerie', fr: 'Nouveau site de la galerie', en: 'New gallery website' },
  { id: 'boutique-en-ligne', fr: 'Boutique en ligne', en: 'Online shop' },
]

/** Familles du cœur, comprises dans l'abonnement. */
export const COMPOSER_CORE: readonly Libelle[] = [
  { fr: 'La réserve', en: 'Storage' },
  { fr: 'Le carnet', en: 'Contacts' },
  { fr: 'L’accrochage', en: 'The hang' },
  { fr: 'La vente', en: 'The sale' },
  { fr: 'L’équipe', en: 'The team' },
]

export const COMPOSER_GUARANTEES: readonly Libelle[] = [
  { fr: 'Hébergement en France', en: 'Hosted in France' },
  { fr: 'Sauvegardes', en: 'Backups' },
  { fr: 'Mises à jour', en: 'Updates' },
  { fr: 'Export complet, à tout moment', en: 'Full export, any time' },
]

export interface ComposerResponses {
  modules: { id: string; libelle: Libelle; choix: ModuleChoice }[]
  services: { id: string; libelle: Libelle; choix: ServiceChoice }[]
}

/**
 * Lit `devis.responses` ({ [identifiant]: réponse }) contre la liste blanche.
 * Identifiant inconnu, réponse hors de la liste propre à son type, ou valeur
 * non textuelle : ignoré. L'ordre suit celui de la page, pas celui du corps.
 */
export function parseComposerResponses(devis: unknown): ComposerResponses {
  const out: ComposerResponses = { modules: [], services: [] }
  if (!devis || typeof devis !== 'object' || Array.isArray(devis)) return out
  const responses = (devis as Record<string, unknown>).responses
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return out
  const raw = responses as Record<string, unknown>
  const own = (id: string) => (Object.prototype.hasOwnProperty.call(raw, id) ? raw[id] : undefined)

  for (const m of COMPOSER_MODULES) {
    const choix = own(m.id)
    if (typeof choix === 'string' && (MODULE_CHOICES as readonly string[]).includes(choix)) {
      out.modules.push({ id: m.id, libelle: { fr: m.fr, en: m.en }, choix: choix as ModuleChoice })
    }
  }
  for (const s of COMPOSER_SERVICES) {
    const choix = own(s.id)
    if (typeof choix === 'string' && (SERVICE_CHOICES as readonly string[]).includes(choix)) {
      out.services.push({ id: s.id, libelle: { fr: s.fr, en: s.en }, choix: choix as ServiceChoice })
    }
  }
  return out
}

/**
 * Filtre strict des noms repris dans le mail au prospect (galerie,
 * interlocuteur) : 80 caractères au plus, aucun caractère de contrôle, rien qui
 * ressemble à une adresse web ou e-mail, ni chevrons. Refusé → null, et le mail
 * retombe sur une formule générique.
 */
export function strictDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) return null
  }
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 80) return null
  if (/[<>@]|:\/\/|www\.|\b[\p{L}\d-]+\.[a-z]{2,24}\b/iu.test(name)) return null
  return name
}
