import nodemailer from 'nodemailer'

export interface EmailResult {
  sent: boolean
  error?: string
}

export function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST || 'smtp.ionos.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    return null
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  })
}

/** URL de base de l'admin — utilisée dans tous les boutons d'email */
export function getAdminBaseUrl(): string {
  if (process.env.ADMIN_LOGIN_URL) {
    return process.env.ADMIN_LOGIN_URL.replace(/\/login\/?$/, '')
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/$/, '')}/admin`
  }
  return 'https://venio.paris/admin'
}

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
