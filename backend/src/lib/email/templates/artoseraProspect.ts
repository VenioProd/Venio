import { getTransporter, escapeHtml } from '../transport.js'
import { HALO, PASTILLES } from './artoseraSiteSelection.js'
import { MODULE_CHOICES, type SiteSelectionLang } from '../../artosera/siteSelection.js'
import { COMPOSER_CORE, COMPOSER_GUARANTEES, type ComposerResponses } from '../../artosera/composerCatalog.js'

/**
 * Récapitulatif envoyé au prospect qui a composé sa sélection sur artosera.com.
 *
 * Ce mail part vers une adresse saisie par un inconnu : pour que la route ne
 * serve jamais de relais, il est composé ici exclusivement à partir de la
 * liste blanche (`composerCatalog.ts`) et de réponses fermées. Aucun texte
 * libre du navigateur n'y entre, hormis galerie et interlocuteur passés au
 * filtre strict `strictDisplayName` (sinon formule générique). Pas de pièce
 * jointe : le PDF vient du navigateur.
 */

export interface ProspectEmailInput {
  to: string
  lang: SiteSelectionLang
  responses: ComposerResponses
  /** Déjà passés par strictDisplayName ; null → formule générique. */
  galerie: string | null
  interlocuteur: string | null
}

export const PROSPECT_LABELS = {
  fr: {
    subject: 'Votre sélection Artosera',
    preheader: 'Le récapitulatif de votre sélection, et la suite.',
    bonjour: (nom: string | null) => (nom ? `Bonjour ${nom},` : 'Bonjour,'),
    merci: (galerie: string | null) =>
      galerie
        ? `Merci d’avoir composé la sélection de ${galerie}. La voici en résumé ; nous l’avons bien reçue.`
        : 'Merci d’avoir composé votre sélection. La voici en résumé ; nous l’avons bien reçue.',
    coeur: 'Le cœur',
    compris: 'Compris',
    garanties: 'Avec',
    modules: 'Vos modules',
    accompagnement: 'L’accompagnement demandé',
    aucunAccompagnement: 'Aucun accompagnement demandé pour l’instant.',
    choixModule: {
      indispensable: 'Indispensables',
      interessant: 'Intéressants',
      'plus-tard': 'Plus tard',
      'pas-pour-nous': 'Pas pour nous',
    },
    choixService: { oui: 'Oui', 'a-discuter': 'À discuter' },
    suite: 'Nous revenons vers vous rapidement avec une proposition adaptée.',
    page: 'Votre sélection reste enregistrée dans votre navigateur : vous pouvez la modifier ou retélécharger le PDF sur la page',
    pageLien: 'Composer mon Artosera',
    url: 'https://artosera.com/composer.html',
    signature: 'L’équipe Artosera',
    legal:
      'Vous recevez ce message parce que vous avez demandé l’envoi de votre sélection sur artosera.com. Il n’y a pas d’inscription à une liste de diffusion. Pour nous écrire, répondez simplement à ce message.',
  },
  en: {
    subject: 'Your Artosera selection',
    preheader: 'A summary of your selection, and what happens next.',
    bonjour: (nom: string | null) => (nom ? `Hello ${nom},` : 'Hello,'),
    merci: (galerie: string | null) =>
      galerie
        ? `Thank you for composing the selection for ${galerie}. Here is a summary; we have received it.`
        : 'Thank you for composing your selection. Here is a summary; we have received it.',
    coeur: 'The core',
    compris: 'Included',
    garanties: 'With',
    modules: 'Your modules',
    accompagnement: 'Support requested',
    aucunAccompagnement: 'No support requested for now.',
    choixModule: {
      indispensable: 'Essential',
      interessant: 'Interesting',
      'plus-tard': 'Later',
      'pas-pour-nous': 'Not for us',
    },
    choixService: { oui: 'Yes', 'a-discuter': 'To discuss' },
    suite: 'We will get back to you shortly with a tailored proposal.',
    page: 'Your selection stays saved in your browser: you can change it or download the PDF again on the page',
    pageLien: 'Compose my Artosera',
    url: 'https://artosera.com/en/composer.html',
    signature: 'The Artosera team',
    legal:
      'You are receiving this message because you asked for your selection to be sent on artosera.com. You have not been added to any mailing list. To write to us, simply reply to this message.',
  },
} as const

/** Seuls « Oui » et « À discuter » sont un accompagnement demandé. */
const SERVICE_SHOWN = ['oui', 'a-discuter'] as const

export function renderProspectHtml(input: ProspectEmailInput): string {
  const t = PROSPECT_LABELS[input.lang]
  const e = escapeHtml
  const lang = input.lang
  const sans = `font-family:${HALO.sans};`
  const petit = `${sans}font-size:12px;line-height:1.55;color:${HALO.secondaire};`
  const corps = `${sans}font-size:15px;line-height:1.6;color:${HALO.texte};`
  const h2 = `margin:28px 0 12px;${sans}font-size:17px;font-weight:600;letter-spacing:-0.3px;color:${HALO.texte};`
  const table = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'

  const pastille = (choix: string, libelle: string, compte: number) => {
    const p = PASTILLES[choix]
    const bord = choix === 'pas-pour-nous' ? HALO.filet : p.fond
    return `<span style="display:inline-block;padding:3px 11px;border-radius:20px;border:1px solid ${bord};background-color:${p.fond};color:${p.texte};${sans}font-size:12px;font-weight:600;line-height:1.5;white-space:nowrap;">${libelle}&nbsp;&middot;&nbsp;${compte}</span>`
  }
  const lignes = (titres: string[]) =>
    `<table ${table} style="margin:6px 0 0;">${titres
      .map(
        (titre) =>
          `<tr><td style="padding:8px 0;border-top:1px solid ${HALO.filet};${sans}font-size:14px;line-height:1.5;color:${HALO.texte};">${e(titre)}</td></tr>`,
      )
      .join('')}</table>`

  const modules = MODULE_CHOICES.map((choix) => {
    const titres = input.responses.modules.filter((m) => m.choix === choix).map((m) => m.libelle[lang])
    return titres.length
      ? `<tr><td style="padding:0 0 18px;">${pastille(choix, t.choixModule[choix], titres.length)}${lignes(titres)}</td></tr>`
      : ''
  }).join('')

  const services = SERVICE_SHOWN.map((choix) => {
    const titres = input.responses.services.filter((s) => s.choix === choix).map((s) => s.libelle[lang])
    return titres.length
      ? `<tr><td style="padding:0 0 18px;">${pastille(choix, t.choixService[choix], titres.length)}${lignes(titres)}</td></tr>`
      : ''
  }).join('')

  const coeur = COMPOSER_CORE.map((c) => e(c[lang])).join(' &middot; ')
  const garanties = COMPOSER_GUARANTEES.map((g) => e(g[lang])).join(' &middot; ')

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${t.subject}</title>
  <style>
    :root { color-scheme: light only; }
    @media only screen and (max-width: 600px) {
      .enveloppe { padding: 20px 10px !important; }
      .carte { padding: 22px 18px !important; border-radius: 16px !important; }
      .titre { font-size: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${HALO.fond};${sans}color:${HALO.texte};">
  <div style="display:none;font-size:1px;color:${HALO.fond};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${t.preheader}</div>
  <table ${table} style="background-color:${HALO.fond};">
    <tr>
      <td class="enveloppe" align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0 6px 20px;font-family:${HALO.serif};font-size:30px;line-height:1.1;letter-spacing:-0.5px;color:${HALO.texte};">Artosera</td>
          </tr>
          <tr>
            <td class="carte" style="background-color:${HALO.surface};border:1px solid ${HALO.filet};border-radius:20px;padding:32px;">
              <h1 class="titre" style="margin:0 0 18px;font-family:${HALO.serif};font-size:28px;font-weight:400;line-height:1.2;letter-spacing:-0.5px;color:${HALO.texte};">${t.subject}</h1>
              <p style="margin:0 0 10px;${corps}">${e(t.bonjour(input.interlocuteur))}</p>
              <p style="margin:0 0 4px;${corps}">${e(t.merci(input.galerie))}</p>

              <h2 style="${h2}">${t.coeur} <span style="display:inline-block;margin-left:6px;padding:2px 10px;border-radius:20px;background-color:${HALO.lavis};color:${HALO.accent};${sans}font-size:12px;font-weight:600;vertical-align:middle;">${t.compris}</span></h2>
              <p style="margin:0 0 4px;${sans}font-size:14px;line-height:1.55;color:${HALO.texte};">${coeur}</p>
              <p style="margin:0;${petit}">${t.garanties}&nbsp;: ${garanties}</p>

              ${modules ? `<h2 style="${h2}">${t.modules}</h2><table ${table}>${modules}</table>` : ''}

              <h2 style="${h2}margin-top:10px;">${t.accompagnement}</h2>
              ${services ? `<table ${table}>${services}</table>` : `<p style="margin:0 0 18px;${petit}">${t.aucunAccompagnement}</p>`}

              <table ${table} style="margin:8px 0 0;background-color:${HALO.lavis};border-radius:14px;">
                <tr><td style="padding:16px 18px;${corps}">
                  <p style="margin:0 0 8px;font-weight:600;">${t.suite}</p>
                  <p style="margin:0;${sans}font-size:14px;line-height:1.55;color:${HALO.texte};">${t.page} <a href="${t.url}" style="color:${HALO.accent};text-decoration:underline;">${t.pageLien}</a>.</p>
                </td></tr>
              </table>

              <p style="margin:22px 0 0;${corps}">${t.signature}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;${petit}font-size:11px;text-align:center;">
              ${t.legal}<br>
              Artosera &middot; Venio &middot; <a href="https://artosera.com" style="color:${HALO.accent};text-decoration:none;">artosera.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderProspectText(input: ProspectEmailInput): string {
  const t = PROSPECT_LABELS[input.lang]
  const lang = input.lang
  const out: string[] = [t.bonjour(input.interlocuteur), '', t.merci(input.galerie), '']

  out.push(`${t.coeur.toUpperCase()} (${t.compris})`)
  out.push(COMPOSER_CORE.map((c) => c[lang]).join(' · '))
  out.push(`${t.garanties} : ${COMPOSER_GUARANTEES.map((g) => g[lang]).join(' · ')}`, '')

  const modules = MODULE_CHOICES.flatMap((choix) => {
    const titres = input.responses.modules.filter((m) => m.choix === choix).map((m) => m.libelle[lang])
    return titres.length ? [`${t.choixModule[choix]} (${titres.length})`, ...titres.map((x) => `- ${x}`)] : []
  })
  if (modules.length) out.push(t.modules.toUpperCase(), ...modules, '')

  const services = SERVICE_SHOWN.flatMap((choix) => {
    const titres = input.responses.services.filter((s) => s.choix === choix).map((s) => s.libelle[lang])
    return titres.length ? [`${t.choixService[choix]} (${titres.length})`, ...titres.map((x) => `- ${x}`)] : []
  })
  out.push(t.accompagnement.toUpperCase(), ...(services.length ? services : [t.aucunAccompagnement]), '')

  out.push(t.suite, `${t.page} « ${t.pageLien} » : ${t.url}`, '', t.signature, '', '--', t.legal)
  return out.join('\n')
}

export async function sendArtoseraProspectEmail(
  input: ProspectEmailInput,
  replyTo: string,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  try {
    const info = await transporter.sendMail({
      from: `"Artosera" <${from}>`,
      to: input.to,
      replyTo,
      subject: PROSPECT_LABELS[input.lang].subject,
      text: renderProspectText(input),
      html: renderProspectHtml(input),
      headers: { 'X-Artosera-Selection': 'prospect', 'Auto-Submitted': 'auto-replied' },
    })
    return { sent: true, messageId: typeof info?.messageId === 'string' ? info.messageId : undefined }
  } catch (err) {
    return { sent: false, error: (err as Error)?.message || String(err) }
  }
}
