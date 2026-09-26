import { escapeHtml } from '../transport.js'
import {
  MODULE_CHOICES,
  SERVICE_CHOICES,
  SITE_SELECTION_LABELS,
  type ArtoseraSiteSelection,
} from '../../artosera/siteSelection.js'

/**
 * E-mail reçu par Venio quand un prospect envoie sa sélection depuis
 * artosera.com. Lu en interne, auquel on répond d'un clic (Reply-To = prospect).
 *
 * Halo clair, sans aucune ressource distante : il se lit identique images
 * bloquées. Tableaux et styles en ligne pour les clients de messagerie ; la
 * seule règle en <style> resserre les marges sur mobile, et son absence
 * (Gmail sans prise en charge) ne casse rien. Tout ce qui vient du navigateur
 * passe par `escapeHtml`.
 */

export interface SiteSelectionEmailInput {
  selection: ArtoseraSiteSelection
  subject: string
  galerie: string
  interlocuteur: string
  /** Adresse saisie par le prospect, déjà validée ; null si absente ou invalide. */
  replyTo: string | null
  filename: string
  reference: string
  receivedAt: Date
}

const HALO = {
  fond: '#f6f6fa',
  surface: '#ffffff',
  texte: '#303044',
  secondaire: '#6c6a7e',
  filet: '#e6e4ee',
  accent: '#69598f',
  lavis: '#eeebf6',
  sans: "'DM Sans',Helvetica,Arial,sans-serif",
  serif: "'DM Serif Display',Georgia,'Times New Roman',serif",
} as const

/** Pastille par réponse : l'intensité suit l'intérêt exprimé. */
const PASTILLES: Record<string, { fond: string; texte: string }> = {
  indispensable: { fond: HALO.accent, texte: '#ffffff' },
  interessant: { fond: HALO.lavis, texte: HALO.accent },
  'plus-tard': { fond: '#f1f0f4', texte: HALO.secondaire },
  'pas-pour-nous': { fond: '#ffffff', texte: HALO.secondaire },
  oui: { fond: HALO.accent, texte: '#ffffff' },
  'a-discuter': { fond: HALO.lavis, texte: HALO.accent },
  non: { fond: '#ffffff', texte: HALO.secondaire },
}

export function formatReceivedAt(date: Date, lang: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(SITE_SELECTION_LABELS[lang].locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date)
}

export function renderSiteSelectionHtml(input: SiteSelectionEmailInput): string {
  const { selection } = input
  const t = SITE_SELECTION_LABELS[selection.lang]
  const e = escapeHtml
  const sans = `font-family:${HALO.sans};`
  const petit = `${sans}font-size:12px;line-height:1.5;color:${HALO.secondaire};`
  const corps = `${sans}font-size:14px;line-height:1.55;color:${HALO.texte};`
  const h2 = `margin:28px 0 12px;${sans}font-size:17px;font-weight:600;letter-spacing:-0.3px;color:${HALO.texte};`
  const table = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'

  const pastille = (choix: string, libelle: string, compte: number) => {
    const p = PASTILLES[choix]
    return `<span style="display:inline-block;padding:3px 11px;border-radius:20px;border:1px solid ${choix === 'pas-pour-nous' || choix === 'non' ? HALO.filet : p.fond};background-color:${p.fond};color:${p.texte};${sans}font-size:12px;font-weight:600;line-height:1.5;white-space:nowrap;">${e(libelle)}&nbsp;&middot;&nbsp;${compte}</span>`
  }

  const lignes = (items: { titre: string; detail?: string }[]) =>
    items.length
      ? `<table ${table} style="margin:6px 0 0;">${items
          .map(
            (item) =>
              `<tr><td class="ligne" style="padding:8px 0;border-top:1px solid ${HALO.filet};${corps}">${e(item.titre)}</td><td class="detail" style="padding:8px 0 8px 12px;border-top:1px solid ${HALO.filet};${petit}text-align:right;">${e(item.detail ?? '')}</td></tr>`,
          )
          .join('')}</table>`
      : `<p style="margin:6px 0 0;${petit}">${t.aucun}</p>`

  const groupe = (choix: string, libelle: string, items: { titre: string; detail?: string }[]) =>
    `<tr><td style="padding:0 0 18px;">${pastille(choix, libelle, items.length)}${lignes(items)}</td></tr>`

  const modules = MODULE_CHOICES.map((choix) =>
    groupe(
      choix,
      t.choixModule[choix],
      selection.modules.filter((m) => m.choix === choix).map((m) => ({ titre: m.titre, detail: m.groupe })),
    ),
  ).join('')

  const accompagnement = SERVICE_CHOICES.map((choix) =>
    groupe(
      choix,
      t.choixService[choix],
      selection.accompagnement.filter((s) => s.choix === choix).map((s) => ({ titre: s.titre })),
    ),
  ).join('')

  const coeur = selection.coeur.length
    ? selection.coeur
        .map(
          (g) =>
            `<tr><td style="padding:8px 0;border-top:1px solid ${HALO.filet};">${g.titre ? `<p style="margin:0 0 2px;${sans}font-size:13px;font-weight:600;color:${HALO.texte};">${e(g.titre)}</p>` : ''}<p style="margin:0;${petit}">${g.items.map(e).join(' &middot; ')}</p></td></tr>`,
        )
        .join('')
    : ''

  const email = input.replyTo
    ? `<a href="mailto:${e(input.replyTo)}" style="color:${HALO.accent};text-decoration:underline;">${e(input.replyTo)}</a>`
    : `<span style="color:${HALO.secondaire};">${t.emailAbsent}</span>`

  const qui = (
    [
      [t.galerie, input.galerie ? e(input.galerie) : `<span style="color:${HALO.secondaire};">${t.nonPrecise}</span>`],
      [
        t.interlocuteur,
        input.interlocuteur ? e(input.interlocuteur) : `<span style="color:${HALO.secondaire};">${t.nonPrecise}</span>`,
      ],
      [t.email, email],
      [t.langue, t.langues[selection.lang]],
      [t.date, e(formatReceivedAt(input.receivedAt, selection.lang))],
    ] as const
  )
    .map(
      ([label, valeur]) =>
        `<tr><td class="label" width="120" style="padding:5px 12px 5px 0;${petit}vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:5px 0;${corps}">${valeur}</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="${selection.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${e(input.subject)}</title>
  <style>
    :root { color-scheme: light only; }
    @media only screen and (max-width: 600px) {
      .enveloppe { padding: 20px 10px !important; }
      .carte { padding: 22px 18px !important; border-radius: 16px !important; }
      .titre { font-size: 24px !important; }
      .label { width: 96px !important; }
      .detail { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${HALO.fond};${sans}color:${HALO.texte};">
  <div style="display:none;font-size:1px;color:${HALO.fond};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${t.preheader} &mdash; ${input.galerie ? e(input.galerie) : t.nonPrecise}</div>
  <table ${table} style="background-color:${HALO.fond};">
    <tr>
      <td class="enveloppe" align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0 6px 20px;">
              <table ${table}><tr>
                <td style="font-family:${HALO.serif};font-size:30px;line-height:1.1;letter-spacing:-0.5px;color:${HALO.texte};">Artosera</td>
                <td align="right" style="${petit}text-transform:uppercase;letter-spacing:.12em;color:${HALO.accent};">${t.titre}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td class="carte" style="background-color:${HALO.surface};border:1px solid ${HALO.filet};border-radius:20px;padding:32px;">
              <h1 class="titre" style="margin:0 0 8px;font-family:${HALO.serif};font-size:28px;font-weight:400;line-height:1.2;letter-spacing:-0.5px;color:${HALO.texte};">${input.galerie ? e(input.galerie) : t.nonPrecise}</h1>
              <p style="margin:0 0 22px;${corps}color:${HALO.secondaire};">${t.intro}</p>

              <table ${table} style="background-color:${HALO.lavis};border-radius:14px;">
                <tr><td style="padding:14px 18px;">
                  <p style="margin:0 0 6px;${sans}font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:${HALO.accent};">${t.qui}</p>
                  <table ${table}>${qui}</table>
                </td></tr>
              </table>

              <h2 style="${h2}">${t.coeur} <span style="display:inline-block;margin-left:6px;padding:2px 10px;border-radius:20px;background-color:${HALO.lavis};color:${HALO.accent};${sans}font-size:12px;font-weight:600;vertical-align:middle;">${t.compris}</span></h2>
              ${coeur ? `<table ${table}>${coeur}</table>` : ''}

              <h2 style="${h2}">${t.modules}</h2>
              <table ${table}>${modules}</table>

              <h2 style="${h2}margin-top:10px;">${t.accompagnement}</h2>
              <table ${table}>${accompagnement}</table>
              ${
                selection.notes
                  ? `<h2 style="${h2}margin-top:10px;">${t.remarques}</h2>
              <table ${table} style="border:1px solid ${HALO.filet};border-radius:14px;">
                <tr><td style="padding:14px 18px;${corps}white-space:pre-line;">${e(selection.notes)}</td></tr>
              </table>`
                  : ''
              }

              <table ${table} style="margin:26px 0 0;border-top:1px solid ${HALO.filet};">
                <tr><td style="padding:14px 0 0;${petit}">${t.pieceJointe}&nbsp;: <strong style="color:${HALO.texte};font-weight:600;">${e(input.filename)}</strong></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 0 0;${petit}font-size:11px;">
              ${t.reference} ${e(input.reference)} &middot; Venio &mdash; Artosera
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Version texte : mêmes blocs, dans le même ordre. */
export function renderSiteSelectionText(input: SiteSelectionEmailInput): string {
  const { selection } = input
  const t = SITE_SELECTION_LABELS[selection.lang]
  const out: string[] = []

  out.push(`${t.titre} — ${input.galerie || t.nonPrecise}`, '', t.intro, '')
  out.push(`${t.qui.toUpperCase()}`)
  out.push(`${t.galerie} : ${input.galerie || t.nonPrecise}`)
  out.push(`${t.interlocuteur} : ${input.interlocuteur || t.nonPrecise}`)
  out.push(`${t.email} : ${input.replyTo || t.emailAbsent}`)
  out.push(`${t.langue} : ${t.langues[selection.lang]}`)
  out.push(`${t.date} : ${formatReceivedAt(input.receivedAt, selection.lang)}`, '')

  out.push(`${t.coeur.toUpperCase()} (${t.compris})`)
  for (const g of selection.coeur) out.push(`- ${[g.titre, g.items.join(', ')].filter(Boolean).join(' : ')}`)
  out.push('')

  out.push(t.modules.toUpperCase())
  for (const choix of MODULE_CHOICES) {
    const items = selection.modules.filter((m) => m.choix === choix)
    out.push(`${t.choixModule[choix]} (${items.length})`)
    for (const m of items) out.push(`- ${m.titre}${m.groupe ? ` (${m.groupe})` : ''}`)
  }
  out.push('')

  out.push(t.accompagnement.toUpperCase())
  for (const choix of SERVICE_CHOICES) {
    const items = selection.accompagnement.filter((s) => s.choix === choix)
    out.push(`${t.choixService[choix]} (${items.length})`)
    for (const s of items) out.push(`- ${s.titre}`)
  }

  if (selection.notes) out.push('', t.remarques.toUpperCase(), selection.notes)

  out.push('', `${t.pieceJointe} : ${input.filename}`, `${t.reference} ${input.reference}`)
  return out.join('\n')
}
