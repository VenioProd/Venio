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

  // Le préheader suit la langue et la nature du récapitulatif : ce sont les
  // seuls indices disponibles, la page ne postant que le récapitulatif
  // structuré. L'objet, lui, reste celui posté par la page.
  const t = LABELS[input.recap?.kind ?? 'devis'][input.recap?.lang ?? 'fr']
  const preheader = `${t.preheader}${input.galerie ? ' — ' + input.galerie : ''} · ${t.pieceJointe}`

  // La sélection est un document Artosera à part entière, en Halo clair ; le
  // devis garde la mise en page Venio et sa cerise. emailLayout insère
  // `title` brut dans son <h1> (send.ts lui passe un objet déjà échappé) :
  // l'objet vient ici d'une route publique, on l'échappe donc avant de le
  // lui confier.
  const html =
    input.recap?.kind === 'selection'
      ? renderSelectionEmail(input.recap, input, preheader)
      : emailLayout({
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

/**
 * Libellés fixes du récapitulatif, selon la nature de l'envoi (devis chiffré
 * ou sélection sans montant) et la langue posée par la page (fr par défaut).
 */
const LABELS = {
  devis: {
    fr: {
      preheader: 'Devis Artosera',
      pieceJointe: 'PDF en pièce jointe.',
      etabliPour: 'Devis établi pour',
      galerieAPreciser: 'Galerie à préciser',
      perimetreRetenu: 'Périmètre retenu',
      aucuneFonction: 'Aucune fonction retenue au-delà du socle compris dans l’abonnement.',
      remarques: 'Remarques et conditions particulières',
      piedDePage:
        'Le devis complet est en pièce jointe. Prix en euros hors taxes, valable 60 jours. Mise en service estimée à treize semaines après signature, reprise des données comprise.',
    },
    en: {
      preheader: 'Artosera quote',
      pieceJointe: 'PDF attached.',
      etabliPour: 'Quote prepared for',
      galerieAPreciser: 'Gallery to be confirmed',
      perimetreRetenu: 'Selected scope',
      aucuneFonction: 'No module selected beyond the core included in the subscription.',
      remarques: 'Notes and special terms',
      piedDePage:
        'The full quote is attached. Prices in euros, excluding VAT, valid for 60 days. Go-live estimated at thirteen weeks after signature, data migration included.',
    },
  },
  // Une sélection n'est pas un devis : ni prix, ni validité, ni engagement.
  selection: {
    fr: {
      preheader: 'Sélection Artosera',
      pieceJointe: 'PDF en pièce jointe.',
      etabliPour: 'Sélection établie pour',
      galerieAPreciser: 'Galerie à préciser',
      perimetreRetenu: 'Modules et services retenus',
      aucuneFonction: 'Aucun module ni service retenu.',
      remarques: 'Remarques',
      piedDePage:
        'Votre sélection complète est en pièce jointe. Nous revenons vers vous avec une proposition chiffrée.',
    },
    en: {
      preheader: 'Artosera selection',
      pieceJointe: 'PDF attached.',
      etabliPour: 'Selection prepared for',
      galerieAPreciser: 'Gallery to be confirmed',
      perimetreRetenu: 'Selected modules and services',
      aucuneFonction: 'No module or service selected.',
      remarques: 'Notes',
      piedDePage: 'Your full selection is attached. We will get back to you with a priced proposal.',
    },
  },
} as const

/**
 * Corps HTML du devis : un tableau par service, puis les totaux. Écrit en
 * tableaux et styles en ligne, seule mise en forme que les clients de
 * messagerie rendent de façon fiable.
 */
function renderDevisRecap(recap: ArtoseraDevisRecap, input: SendArtoseraDevisEmailInput): string {
  const t = LABELS.devis[recap.lang]
  const e = (v: string | undefined) => escapeHtml(v ?? '')
  const cellule = `padding:7px 0;border-bottom:1px solid ${FILET};font-size:14px;color:${ENCRE};`
  const montant = `${cellule}text-align:right;white-space:nowrap;`

  const entete = `
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${GRIS}">${t.etabliPour}</p>
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

/**
 * Jetons Halo clairs, le design de la plateforme Artosera. Les polices sont
 * nommées sans être chargées : un client qui ne les a pas retombe sur Georgia
 * pour la serif et Helvetica/Arial pour le reste. Aucune ressource distante.
 */
const HALO = {
  fond: '#f6f6fa',
  surface: '#ffffff',
  texte: '#303044',
  secondaire: '#716e82',
  filet: '#e8e6ee',
  accent: '#69598f',
  lavis: '#eeebf6',
  sans: "'DM Sans',Helvetica,Arial,sans-serif",
  serif: "'DM Serif Display',Georgia,'Times New Roman',serif",
} as const

/**
 * E-mail complet de la sélection, en Halo clair : mot-symbole « Artosera » en
 * serif, une carte blanche à grands rayons, les réponses en pastilles lavande.
 * Tableaux et styles en ligne, comme le devis ; la colonne de droite porte la
 * réponse posée par la page (« Indispensable », « Oui »…) ou reste vide.
 */
function renderSelectionEmail(
  recap: ArtoseraDevisRecap,
  input: SendArtoseraDevisEmailInput,
  preheader: string,
): string {
  const t = LABELS.selection[recap.lang]
  const e = (v: string | undefined) => escapeHtml(v ?? '')
  const cellule = `padding:10px 0;border-top:1px solid ${HALO.filet};font-family:${HALO.sans};font-size:14px;line-height:1.5;color:${HALO.texte};`
  const pastille = `display:inline-block;padding:3px 10px;border-radius:20px;background:${HALO.lavis};color:${HALO.accent};font-family:${HALO.sans};font-size:12px;line-height:1.5;white-space:nowrap;`

  const services = recap.services
    .map(
      (service) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
            <tr>
              <td style="padding:0 0 8px;font-family:${HALO.sans};font-size:13px;font-weight:600;color:${HALO.accent}">${e(service.titre)}</td>
              <td style="padding:0 0 8px;font-family:${HALO.sans};font-size:12px;text-align:right;color:${HALO.secondaire};white-space:nowrap">${e(service.sousTotal)}</td>
            </tr>
            ${service.lignes
              .map(
                (ligne) =>
                  `<tr><td style="${cellule}">${e(ligne.nom)}</td><td style="${cellule}text-align:right;padding-left:12px">${ligne.prix ? `<span style="${pastille}">${e(ligne.prix)}</span>` : ''}</td></tr>`,
              )
              .join('')}
          </table>`,
    )
    .join('')

  const totaux = recap.totaux
    .map(
      (total) => `<tr>
              <td style="padding:6px 0;font-family:${HALO.sans};font-size:13px;color:${HALO.secondaire}">${e(total.libelle)}</td>
              <td style="padding:6px 0;font-family:${HALO.sans};font-size:14px;font-weight:600;text-align:right;white-space:nowrap;color:${HALO.texte}">${e(total.montant)}</td>
            </tr>`,
    )
    .join('')

  const offre = [recap.offre, recap.engagement].filter(Boolean).map(e).join(' · ')

  return `<!DOCTYPE html>
<html lang="${recap.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${e(input.subject)}</title>
  <style>:root { color-scheme: light only; }</style>
</head>
<body style="margin:0;padding:0;background-color:${HALO.fond};font-family:${HALO.sans};color:${HALO.texte};">
  <span style="display:none;font-size:1px;color:${HALO.fond};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${e(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${HALO.fond};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 8px 24px;font-family:${HALO.serif};font-size:32px;line-height:1.1;letter-spacing:-0.5px;color:${HALO.texte};">Artosera</td>
          </tr>
          <tr>
            <td style="background-color:${HALO.surface};border:1px solid ${HALO.filet};border-radius:20px;padding:32px;">
              <h1 style="margin:0 0 24px;font-family:${HALO.serif};font-size:28px;font-weight:400;line-height:1.2;letter-spacing:-0.5px;color:${HALO.texte};">${e(input.subject)}</h1>
              <p style="margin:0 0 6px;font-family:${HALO.sans};font-size:12px;color:${HALO.secondaire};">${t.etabliPour}</p>
              <p style="margin:0 0 4px;font-family:${HALO.sans};font-size:19px;font-weight:500;letter-spacing:-0.4px;color:${HALO.texte};">${e(input.galerie) || t.galerieAPreciser}</p>
              <p style="margin:0 0 ${offre ? '14px' : '28px'};font-family:${HALO.sans};font-size:13px;color:${HALO.secondaire};">${[e(input.interlocuteur), e(input.to)].filter(Boolean).join(' · ')}</p>
              ${offre ? `<p style="margin:0 0 28px;"><span style="${pastille}">${offre}</span></p>` : ''}
              <h2 style="margin:0 0 16px;font-family:${HALO.sans};font-size:17px;font-weight:500;letter-spacing:-0.4px;color:${HALO.texte};">${t.perimetreRetenu}</h2>
              ${services || `<p style="margin:0 0 20px;font-family:${HALO.sans};font-size:14px;color:${HALO.secondaire};">${t.aucuneFonction}</p>`}
              ${
                totaux
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:${HALO.lavis};border-radius:14px;">
            <tr><td style="padding:12px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totaux}</table></td></tr>
          </table>`
                  : ''
              }
              ${
                recap.notes
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${HALO.filet};border-radius:14px;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 6px;font-family:${HALO.sans};font-size:12px;color:${HALO.secondaire};">${t.remarques}</p>
              <p style="margin:0;font-family:${HALO.sans};font-size:14px;line-height:1.6;color:${HALO.texte};white-space:pre-line;">${e(recap.notes)}</p>
            </td></tr>
          </table>`
                  : ''
              }
              <p style="margin:0;font-family:${HALO.sans};font-size:13px;line-height:1.65;color:${HALO.secondaire};">${t.piedDePage}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0 0;font-family:${HALO.sans};font-size:11px;color:${HALO.secondaire};">
              Venio &mdash; Artosera &middot; <a href="https://venio.paris" style="color:${HALO.accent};text-decoration:none;">venio.paris</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
