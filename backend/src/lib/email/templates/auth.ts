import { getTransporter, escapeHtml, getAdminBaseUrl } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email avec les identifiants de connexion admin.
 */
export async function sendAdminCredentials({ to, name, email, password }: { to: string; name: string; email: string; password: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const loginUrl = process.env.ADMIN_LOGIN_URL || `${getAdminBaseUrl()}/login`

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Vos identifiants d'accès administrateur`,
      text: [
        `Bonjour ${name},`,
        '',
        `Un compte administrateur a été créé pour vous sur ${appName}.`,
        '',
        'Vos identifiants de connexion :',
        `  Email    : ${email}`,
        `  Mot de passe : ${password}`,
        '',
        `Connexion : ${loginUrl}`,
        '',
        'Nous vous recommandons de modifier ce mot de passe après votre première connexion.',
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Un compte administrateur a été créé pour vous sur <strong>${escapeHtml(appName)}</strong>.</p>`,
        '<p><strong>Vos identifiants de connexion :</strong></p>',
        '<ul>',
        `<li>Email : <code>${escapeHtml(email)}</code></li>`,
        `<li>Mot de passe : <code>${escapeHtml(password)}</code></li>`,
        '</ul>',
        `<p>Connexion : <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
        '<p>Nous vous recommandons de modifier ce mot de passe après votre première connexion.</p>',
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de test (vérification SMTP).
 */
export async function sendTestEmail(to: string): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Email de test`,
      text: `Ceci est un email de test envoyé depuis ${appName}. Si vous le recevez, la configuration SMTP fonctionne.`,
      html: `<p>Ceci est un email de test envoyé depuis <strong>${escapeHtml(appName)}</strong>.</p><p>Si vous le recevez, la configuration SMTP fonctionne.</p>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de reinitialisation de mot de passe.
 */
export async function sendPasswordResetEmail({ to, name, resetUrl }: { to: string; name: string; resetUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configure (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Reinitialisation de votre mot de passe`,
      text: [
        `Bonjour ${name},`,
        '',
        `Vous avez demande la reinitialisation de votre mot de passe sur ${appName}.`,
        '',
        `Cliquez sur le lien suivant pour definir un nouveau mot de passe :`,
        resetUrl,
        '',
        `Ce lien est valable pendant 1 heure.`,
        '',
        `Si vous n'avez pas fait cette demande, ignorez cet email.`,
        '',
        `— L'equipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Vous avez demande la reinitialisation de votre mot de passe sur <strong>${escapeHtml(appName)}</strong>.</p>`,
        `<p><a href="${escapeHtml(resetUrl)}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Reinitialiser mon mot de passe</a></p>`,
        `<p style="color: #666; font-size: 13px;">Ce lien est valable pendant 1 heure.</p>`,
        `<p style="color: #666; font-size: 13px;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>`,
        `<p>— L'equipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de bienvenue au nouveau client.
 */
export async function sendWelcomeEmail({ to, name, email, loginUrl }: { to: string; name: string; email: string; loginUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Bienvenue chez ${appName} !`,
      text: [
        `Bonjour ${name},`,
        '',
        `Bienvenue chez ${appName} ! Votre compte a été créé avec succès.`,
        '',
        `Votre identifiant de connexion : ${email}`,
        '',
        `Accéder à votre espace : ${loginUrl}`,
        '',
        `Si vous avez des questions, n'hésitez pas à nous contacter.`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Bienvenue chez <strong>${escapeHtml(appName)}</strong> ! Votre compte a été créé avec succès.</p>`,
        `<p>Votre identifiant de connexion : <code>${escapeHtml(email)}</code></p>`,
        `<p><a href="${escapeHtml(loginUrl)}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Accéder à mon espace</a></p>`,
        `<p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
