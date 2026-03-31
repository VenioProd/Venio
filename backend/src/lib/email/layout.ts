import { escapeHtml } from './transport.js'

const BRAND = '#0ea5e9'

/**
 * Layout HTML partagé pour tous les emails Venio.
 * Design light épuré, compatible Gmail, Outlook, Apple Mail.
 */
export function emailLayout({ title, preheader, body, ctaUrl, ctaLabel, ctaColor }: {
  title: string
  preheader?: string
  body: string
  ctaUrl?: string
  ctaLabel?: string
  ctaColor?: string
}): string {
  const appName = process.env.APP_NAME || 'Venio'
  const year = new Date().getFullYear()
  const btnColor = ctaColor || BRAND

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${BRAND};width:36px;height:36px;border-radius:8px;text-align:center;vertical-align:middle;">
                    <span style="color:#fff;font-size:17px;font-weight:800;line-height:36px;">V</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#0f172a;font-size:19px;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(appName)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <!-- Titre -->
                <tr>
                  <td style="padding:32px 32px 0 32px;">
                    <h1 style="margin:0;color:#0f172a;font-size:19px;font-weight:700;line-height:1.4;">${title}</h1>
                    <div style="margin-top:12px;height:2px;width:40px;background:${btnColor};border-radius:1px;"></div>
                  </td>
                </tr>
                <!-- Contenu -->
                <tr>
                  <td style="padding:20px 32px 8px 32px;color:#475569;font-size:15px;line-height:1.7;">
                    ${body}
                  </td>
                </tr>
                ${ctaUrl && ctaLabel ? `
                <!-- Bouton -->
                <tr>
                  <td style="padding:16px 32px 32px 32px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:${btnColor};border-radius:8px;">
                          <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 0 0 0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                ${escapeHtml(appName)} &mdash; Gestion de projets &amp; CRM<br>
                <a href="https://venio.paris" style="color:${BRAND};text-decoration:none;">venio.paris</a>
              </p>
              <p style="margin:6px 0 0 0;color:#cbd5e1;font-size:11px;">
                &copy; ${year} ${escapeHtml(appName)}. Tous droits r&eacute;serv&eacute;s.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Bloc highlight pour mettre en valeur des infos */
export function highlightBlock(content: string, borderColor?: string): string {
  return `<div style="margin:16px 0;padding:14px 18px;background:#f1f5f9;border-left:3px solid ${borderColor || BRAND};border-radius:0 6px 6px 0;">
    ${content}
  </div>`
}

/** Ligne label: valeur */
export function infoLine(label: string, value: string): string {
  return `<p style="margin:5px 0;font-size:14px;"><span style="color:#64748b;">${escapeHtml(label)} :</span> <strong style="color:#0f172a;">${escapeHtml(value)}</strong></p>`
}
