import { getTransporter, escapeHtml } from '../transport.js'
import { emailLayout } from '../layout.js'
import { renderEmailBody } from '../send.js'
import type { ArtoseraDevisRecap } from '../../artosera/devis.js'

export interface SendArtoseraDevisEmailInput {
  /** Adresse de la galerie, déjà validée par la couche de validation. */
  to: string
  subject: string
  /** Corps en texte brut ; chaque ligne devient un paragraphe côté HTML. */
  body: string
  filename: string
  pdf: Buffer
  /** Récapitulatif structuré : quand il est là, le corps HTML est un vrai tableau. */
  recap?: ArtoseraDevisRecap | null
  galerie?: string
  interlocuteur?: string
  /** Référence d'archive, jointe pour retrouver la trace disque depuis l'e-mail. */
  reference: string
}

export interface ArtoseraDevisEmailResult {
  sent: boolean
  messageId?: string
  error?: string
}

/** Adresse mise en copie de chaque devis envoyé. Surchargeable par l'environnement. */
export function artoseraDevisBcc(): string[] {
  const raw = process.env.ARTOSERA_DEVIS_BCC ?? 'contact@venio.paris'
  return raw
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address !== '')
}

/**
 * Envoie le devis Artosera à la galerie, PDF en pièce jointe, avec Venio en
 * copie cachée. Le sujet et le corps viennent de la page commerciale : la
 * validation en amont a retiré ce qui pourrait servir à forger des en-têtes,
 * et tout ce qui entre dans le HTML est échappé ici.
 */
export async function sendArtoseraDevisEmail(input: SendArtoseraDevisEmailInput): Promise<ArtoseraDevisEmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const bcc = artoseraDevisBcc()

  // Le préheader suit la langue du récapitulatif : c'est le seul indice de
  // langue disponible, la page anglaise ne postant que le devis structuré.
  const preheader =
    input.recap?.lang === 'en'
      ? `Artosera quote${input.galerie ? ' — ' + input.galerie : ''} · PDF attached.`
      : `Devis Artosera${input.galerie ? ' — ' + input.galerie : ''} · PDF en pièce jointe.`

  // emailLayout insère `title` brut dans son <h1> (send.ts lui passe un
  // objet déjà échappé) : l'objet vient ici d'une route publique, on
  // l'échappe donc avant de le lui confier.
  const html = emailLayout({
    title: escapeHtml(input.subject),
    preheader,
    body: input.recap ? renderDevisRecap(input.recap, input) : renderEmailBody(input.body),
  })

  try {
    const info = await transporter.sendMail({
      from: `"Venio — Artosera" <${from}>`,
      to: input.to,
      bcc: bcc.length > 0 ? bcc : undefined,
      replyTo: from,
      subject: input.subject,
      text: input.body,
      html,
      headers: { 'X-Artosera-Devis': input.reference },
      attachments: [{ filename: input.filename, content: input.pdf, contentType: 'application/pdf' }],
    })
    return { sent: true, messageId: typeof info?.messageId === 'string' ? info.messageId : undefined }
  } catch (err) {
    return { sent: false, error: (err as Error)?.message || String(err) }
  }
}

const CERISE = '#A8122F'
const ENCRE = '#17140F'
const GRIS = '#5E584E'
const FILET = '#DFDAD1'
const PALE = '#F4F2EE'

/** Libellés fixes du récapitulatif, selon la langue posée par la page (fr par défaut). */
const LABELS = {
  fr: {
    devisPour: 'Devis établi pour',
    galerieAPreciser: 'Galerie à préciser',
    perimetreRetenu: 'Périmètre retenu',
    aucuneFonction: 'Aucune fonction retenue au-delà du socle compris dans l’abonnement.',
    remarques: 'Remarques et conditions particulières',
    piedDePage:
      'Le devis complet est en pièce jointe. Prix en euros hors taxes, valable 60 jours. Mise en service estimée à treize semaines après signature, reprise des données comprise.',
  },
  en: {
    devisPour: 'Quote prepared for',
    galerieAPreciser: 'Gallery to be confirmed',
    perimetreRetenu: 'Selected scope',
    aucuneFonction: 'No module selected beyond the core included in the subscription.',
    remarques: 'Notes and special terms',
    piedDePage:
      'The full quote is attached. Prices in euros, excluding VAT, valid for 60 days. Go-live estimated at thirteen weeks after signature, data migration included.',
  },
} as const

/**
 * Corps HTML du devis : un tableau par service, puis les totaux. Écrit en
 * tableaux et styles en ligne, seule mise en forme que les clients de
 * messagerie rendent de façon fiable.
 */
function renderDevisRecap(recap: ArtoseraDevisRecap, input: SendArtoseraDevisEmailInput): string {
  const t = LABELS[recap.lang]
  const e = (v: string | undefined) => escapeHtml(v ?? '')
  const cellule = `padding:7px 0;border-bottom:1px solid ${FILET};font-size:14px;color:${ENCRE};`
  const montant = `${cellule}text-align:right;white-space:nowrap;`

  const entete = `
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS}">${t.devisPour}</p>
    <p style="margin:0 0 2px;font-size:19px;font-weight:700;color:${ENCRE}">${e(input.galerie) || t.galerieAPreciser}</p>
    <p style="margin:0 0 18px;font-size:14px;color:${GRIS}">${[e(input.interlocuteur), e(input.to)].filter(Boolean).join(' · ')}</p>
    <p style="margin:0 0 22px;font-size:14px;color:${ENCRE}">${e(recap.offre)}${recap.engagement ? ' · ' + e(recap.engagement) : ''}</p>`

  const services = recap.services
    .map(
      (service) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
      <tr>
        <td style="padding:8px 10px;background:${PALE};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${CERISE}">${e(service.titre)}</td>
        <td style="padding:8px 10px;background:${PALE};font-size:14px;font-weight:700;text-align:right;color:${ENCRE};white-space:nowrap">${e(service.sousTotal)}</td>
      </tr>
      ${service.lignes
        .map(
          (ligne) =>
            `<tr><td style="${cellule}padding-left:10px">${e(ligne.nom)}</td><td style="${montant}padding-right:10px">${e(ligne.prix)}</td></tr>`,
        )
        .join('')}
    </table>`,
    )
    .join('')

  const complements = [recap.reprise, recap.abonnement]
    .filter((bloc): bloc is { detail: string; montant: string } => Boolean(bloc))
    .map(
      (bloc) => `<tr><td style="${cellule}">${e(bloc.detail)}</td><td style="${montant}">${e(bloc.montant)}</td></tr>`,
    )
    .join('')

  const totaux = recap.totaux
    .map((total, index) => {
      const dernier = index === recap.totaux.length - 1
      const fond = dernier ? `background:${ENCRE};color:#ffffff;` : ''
      const taille = dernier ? '17px' : '14px'
      const poids = dernier ? '700' : '400'
      return `<tr>
        <td style="${fond}padding:10px;font-size:${taille};font-weight:${poids};color:${dernier ? '#ffffff' : GRIS}">${e(total.libelle)}</td>
        <td style="${fond}padding:10px;font-size:${taille};font-weight:700;text-align:right;white-space:nowrap;color:${dernier ? '#ffffff' : ENCRE}">${e(total.montant)}</td>
      </tr>`
    })
    .join('')

  return `${entete}
    <h2 style="margin:0 0 10px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:${ENCRE};border-bottom:2px solid ${ENCRE};padding-bottom:6px">${t.perimetreRetenu}</h2>
    ${services || `<p style="font-size:14px;color:${GRIS}">${t.aucuneFonction}</p>`}
    ${complements ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${complements}</table>` : ''}
    ${recap.remise ? `<p style="margin:0 0 12px;font-size:14px;color:${CERISE}">${e(recap.remise)}</p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${FILET}">${totaux}</table>
    ${
      recap.notes
        ? `<div style="background:${PALE};padding:14px 16px;margin:0 0 20px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS}">${t.remarques}</p>
      <p style="margin:0;font-size:14px;color:${ENCRE};white-space:pre-line">${e(recap.notes)}</p></div>`
        : ''
    }
    <p style="margin:0;font-size:13px;color:${GRIS}">${t.piedDePage}</p>`
}
