import crypto from 'crypto'
import fsp from 'fs/promises'
import path from 'path'

/**
 * Devis Artosera envoyé depuis la page commerciale (venio.paris/artosera/devis).
 *
 * La page est autonome et génère son PDF côté client ; le backend ne fait que
 * relayer. Comme la route est publique, tout ce qui vient du navigateur est
 * traité ici comme hostile : adresse, sujet, nom de fichier et PDF sont
 * validés et normalisés avant le moindre envoi ou écriture disque.
 */

export interface ArtoseraDevisSubmission {
  /** Destinataire — une seule adresse, déjà normalisée en minuscules. */
  to: string
  galerie: string
  interlocuteur: string
  /** Sujet sur une seule ligne : les caractères de contrôle sont retirés (injection d'en-tête SMTP). */
  subject: string
  /** Corps en texte brut, sauts de ligne conservés. */
  body: string
  /** Nom de pièce jointe assaini : basename, jeu de caractères restreint, extension .pdf. */
  filename: string
  pdf: Buffer
  /** État du devis, conservé tel quel pour la trace. */
  devis: unknown
  /** Récapitulatif structuré, source du corps HTML de l'e-mail. Absent = corps texte seul. */
  recap: ArtoseraDevisRecap | null
}

/** Récapitulatif normalisé : rien n'en sort qui n'ait été validé ici. */
export interface ArtoseraDevisRecap {
  offre: string
  engagement: string
  services: { titre: string; sousTotal: string; lignes: { nom: string; prix: string }[] }[]
  reprise: { detail: string; montant: string } | null
  abonnement: { detail: string; montant: string } | null
  remise: string
  totaux: { libelle: string; montant: string }[]
  notes: string
  /** Langue de composition de l'e-mail. La page anglaise du devis pose 'en' ; tout le reste vaut 'fr'. */
  lang: 'fr' | 'en'
  /**
   * Nature de l'envoi. La page modules pose 'selection' : une liste de modules
   * et de services retenus, sans aucun montant. Tout le reste vaut 'devis'.
   */
  kind: 'devis' | 'selection'
}

export type ArtoseraDevisRejection =
  | 'invalid_body'
  | 'invalid_recipient'
  | 'invalid_subject'
  | 'invalid_text'
  | 'missing_pdf'
  | 'invalid_pdf'
  | 'pdf_too_large'
  | 'devis_too_large'

export type ArtoseraDevisValidation =
  { ok: true; submission: ArtoseraDevisSubmission } | { ok: false; reason: ArtoseraDevisRejection }

const MAX_LENGTHS = {
  to: 254,
  galerie: 160,
  interlocuteur: 120,
  subject: 200,
  body: 20_000,
  filename: 180,
} as const

/** Bornes du récapitulatif : sept services d'une poignée de lignes, pas un catalogue. */
const RECAP_LIMITS = { services: 30, lignes: 40, totaux: 12, court: 120, detail: 400, notes: 4000 }

/** Un PDF de devis pèse quelques centaines de Ko ; 5 MiB laisse une marge confortable. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024
/** L'état du devis est un petit objet de formulaire — au-delà, c'est un abus. */
export const MAX_DEVIS_JSON_BYTES = 256 * 1024

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BASE64_RE = /^[A-Za-z0-9+/\s]+={0,2}$/

const DIACRITICS = /[̀-ͯ]/g

/**
 * Retire les caractères de contrôle. Ils sont retirés plutôt que rejetés :
 * ils n'ont aucun sens dans un champ de formulaire, et c'est par eux que
 * passerait une injection d'en-tête SMTP. Écrit sans expression régulière —
 * la classe de caractères correspondante est interdite par la configuration
 * ESLint du dépôt (`no-control-regex`).
 */
function stripControlCharacters(value: string, options: { keepNewline: boolean }): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) {
      out += char
    } else if (options.keepNewline) {
      // Sur plusieurs lignes, seul le saut de ligne survit ; le reste disparaît.
      if (code === 0x0a) out += char
    } else {
      // Sur une seule ligne, chaque contrôle devient une espace, absorbée
      // ensuite par la normalisation des blancs.
      out += ' '
    }
  }
  return out
}

function normalizeSingleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = stripControlCharacters(value.normalize('NFKC'), { keepNewline: false }).replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : null
}

function normalizeMultiLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = stripControlCharacters(value.normalize('NFKC').replace(/\r\n?/g, '\n'), {
    keepNewline: true,
  }).trim()
  return normalized.length <= maxLength ? normalized : null
}

/**
 * Le nom proposé par la page n'atteint jamais le disque tel quel : on n'en
 * garde que le basename, réduit à un jeu de caractères sûr. Un nom vide ou
 * entièrement filtré retombe sur un défaut plutôt que d'échouer — la pièce
 * jointe compte, pas son étiquette.
 */
export function sanitizePdfFilename(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  const base = path
    .basename(raw.normalize('NFKC'))
    .toLowerCase()
    .replace(/\.pdf$/, '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, MAX_LENGTHS.filename)
  return `${base || 'devis-artosera'}.pdf`
}

function decodePdf(value: unknown): { ok: true; pdf: Buffer } | { ok: false; reason: ArtoseraDevisRejection } {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false, reason: 'missing_pdf' }

  // La page envoie du base64 nu ; on tolère le préfixe data: par robustesse.
  const raw = value.replace(/^data:application\/pdf;base64,/, '').trim()
  if (!BASE64_RE.test(raw)) return { ok: false, reason: 'invalid_pdf' }
  // Coupe avant décodage : inutile d'allouer un buffer géant pour le rejeter ensuite.
  if (raw.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 1024) return { ok: false, reason: 'pdf_too_large' }

  const pdf = Buffer.from(raw, 'base64')
  if (pdf.length === 0) return { ok: false, reason: 'invalid_pdf' }
  if (pdf.length > MAX_PDF_BYTES) return { ok: false, reason: 'pdf_too_large' }
  // Le base64 se décode silencieusement sur n'importe quoi : c'est l'en-tête
  // qui dit qu'on relaie bien un PDF et non un exécutable renommé.
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return { ok: false, reason: 'invalid_pdf' }

  return { ok: true, pdf }
}

/**
 * Normalise le récapitulatif envoyé par la page. Tout champ absent ou mal typé
 * est ignoré plutôt que de faire échouer l'envoi : le PDF, lui, est complet.
 * Aucun HTML n'est accepté ici — l'e-mail est composé côté serveur.
 */
function normalizeRecap(value: unknown): ArtoseraDevisRecap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const court = (v: unknown) => normalizeSingleLine(v ?? '', RECAP_LIMITS.court) ?? ''
  const detail = (v: unknown) => normalizeSingleLine(v ?? '', RECAP_LIMITS.detail) ?? ''

  const services = Array.isArray(raw.services)
    ? raw.services.slice(0, RECAP_LIMITS.services).flatMap((s) => {
        if (!s || typeof s !== 'object') return []
        const g = s as Record<string, unknown>
        const titre = court(g.titre)
        if (!titre) return []
        const lignes = Array.isArray(g.lignes)
          ? g.lignes.slice(0, RECAP_LIMITS.lignes).flatMap((l) => {
              if (!l || typeof l !== 'object') return []
              const item = l as Record<string, unknown>
              const nom = court(item.nom)
              return nom ? [{ nom, prix: court(item.prix) }] : []
            })
          : []
        return [{ titre, sousTotal: court(g.sousTotal), lignes }]
      })
    : []

  const bloc = (v: unknown) => {
    if (!v || typeof v !== 'object') return null
    const b = v as Record<string, unknown>
    const montant = court(b.montant)
    return montant ? { detail: detail(b.detail), montant } : null
  }

  const totaux = Array.isArray(raw.totaux)
    ? raw.totaux.slice(0, RECAP_LIMITS.totaux).flatMap((t) => {
        if (!t || typeof t !== 'object') return []
        const x = t as Record<string, unknown>
        const libelle = court(x.libelle)
        return libelle ? [{ libelle, montant: court(x.montant) }] : []
      })
    : []

  // Seuls 'fr' et 'en' sont des langues connues ; toute autre valeur (absente,
  // mal typée, ou un code qu'on ne gère pas) retombe sur le français.
  const lang = raw.lang === 'en' ? 'en' : 'fr'
  // Même principe : seule la valeur exacte 'selection' change la rédaction ;
  // les pages devis existantes, qui ne posent rien, restent des devis.
  const kind = raw.kind === 'selection' ? 'selection' : 'devis'
  // Une sélection ne porte aucun montant : les blocs chiffrés sont écartés
  // même si la page en envoyait.
  const chiffre = kind === 'devis'

  const recap: ArtoseraDevisRecap = {
    offre: court(raw.offre),
    engagement: court(raw.engagement),
    services,
    reprise: chiffre ? bloc(raw.reprise) : null,
    abonnement: chiffre ? bloc(raw.abonnement) : null,
    remise: chiffre ? court(raw.remise) : '',
    totaux,
    notes: normalizeMultiLine(raw.notes ?? '', RECAP_LIMITS.notes) ?? '',
    lang,
    kind,
  }
  return services.length || totaux.length ? recap : null
}

export function validateArtoseraDevis(body: unknown): ArtoseraDevisValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid_body' }
  const raw = body as Record<string, unknown>

  const to = normalizeSingleLine(raw.to, MAX_LENGTHS.to)?.toLowerCase() ?? null
  if (!to || !EMAIL_RE.test(to)) return { ok: false, reason: 'invalid_recipient' }

  const galerie = normalizeSingleLine(raw.galerie ?? '', MAX_LENGTHS.galerie)
  const interlocuteur = normalizeSingleLine(raw.interlocuteur ?? '', MAX_LENGTHS.interlocuteur)
  if (galerie === null || interlocuteur === null) return { ok: false, reason: 'invalid_text' }

  const subject = normalizeSingleLine(raw.subject, MAX_LENGTHS.subject)
  if (!subject) return { ok: false, reason: 'invalid_subject' }

  const bodyText = normalizeMultiLine(raw.body, MAX_LENGTHS.body)
  if (!bodyText) return { ok: false, reason: 'invalid_text' }

  const decoded = decodePdf(raw.pdfBase64)
  if (!decoded.ok) return { ok: false, reason: decoded.reason }

  const devis = raw.devis ?? null
  if (devis !== null) {
    let serialized: string | undefined
    try {
      serialized = JSON.stringify(devis)
    } catch {
      // Cycle ou BigInt : rien d'exploitable à archiver.
      return { ok: false, reason: 'devis_too_large' }
    }
    if (serialized === undefined) return { ok: false, reason: 'devis_too_large' }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_DEVIS_JSON_BYTES) return { ok: false, reason: 'devis_too_large' }
  }

  return {
    ok: true,
    submission: {
      to,
      galerie,
      interlocuteur,
      subject,
      body: bodyText,
      filename: sanitizePdfFilename(raw.filename),
      pdf: decoded.pdf,
      devis,
      recap: normalizeRecap(raw.recap),
    },
  }
}

export interface ArtoseraDevisArchive {
  /** Référence courte, reprise dans les logs et dans la copie interne. */
  reference: string
  /** Dossier de l'envoi. */
  directory: string
  pdfPath: string
  jsonPath: string
}

export function artoseraStorageRoot(): string {
  return process.env.ARTOSERA_DEVIS_STORAGE_DIR || path.join(path.resolve(process.cwd(), 'uploads'), 'artosera-devis')
}

/**
 * Archive le devis : un dossier par envoi, contenant le PDF exact mis en
 * pièce jointe et le JSON de l'état du devis. Volontairement en fichiers
 * plutôt qu'en base — la route est publique et sans compte associé, il n'y a
 * aucun modèle métier existant auquel rattacher la trace.
 */
export async function archiveArtoseraDevis(
  submission: ArtoseraDevisSubmission,
  context: { receivedAt?: Date; ip?: string | null; userAgent?: string | null } = {},
): Promise<ArtoseraDevisArchive> {
  const receivedAt = context.receivedAt ?? new Date()
  const day = receivedAt.toISOString().slice(0, 10)
  const stamp = receivedAt.toISOString().slice(11, 19).replace(/:/g, '')
  const reference = `${day}-${stamp}-${crypto.randomBytes(3).toString('hex')}`

  const directory = path.join(artoseraStorageRoot(), day, reference)
  await fsp.mkdir(directory, { recursive: true })

  const pdfPath = path.join(directory, submission.filename)
  const jsonPath = path.join(directory, 'devis.json')

  await fsp.writeFile(pdfPath, submission.pdf)
  await fsp.writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        reference,
        receivedAt: receivedAt.toISOString(),
        to: submission.to,
        galerie: submission.galerie,
        interlocuteur: submission.interlocuteur,
        subject: submission.subject,
        body: submission.body,
        filename: submission.filename,
        pdfBytes: submission.pdf.length,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        devis: submission.devis,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return { reference, directory, pdfPath, jsonPath }
}
