import { getTransporter, escapeHtml } from './transport.js'
import { emailLayout } from './layout.js'

export interface BulkEmailRecipient {
  email: string
  name?: string
}

export interface BulkEmailDelivery {
  email: string
  name: string
  success: boolean
  error?: string
}

export interface SendBulkEmailInput {
  subject: string
  /** Corps en texte brut ; chaque ligne devient un paragraphe. */
  body: string
  recipients: BulkEmailRecipient[]
  senderName?: string
  ctaUrl?: string
  ctaLabel?: string
}

export interface SendBulkEmailResult {
  results: BulkEmailDelivery[]
  sent: number
  failed: number
  total: number
}

export type DeliveryStatus = 'SENT' | 'PARTIAL' | 'FAILED'

/** Levée quand SMTP n'est pas configuré : l'appelant répond 503, il n'y a rien à journaliser. */
export class EmailTransportUnavailableError extends Error {
  constructor() {
    super('SMTP non configuré (SMTP_USER / SMTP_PASS)')
    this.name = 'EmailTransportUnavailableError'
  }
}

export function renderEmailBody(body: string): string {
  return body
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br>'))
    .join('')
}

export function deliveryStatusFrom(results: BulkEmailDelivery[]): DeliveryStatus {
  const sent = results.filter((result) => result.success).length
  if (sent === 0) return 'FAILED'
  return sent === results.length ? 'SENT' : 'PARTIAL'
}

/**
 * Envoie un même message à plusieurs destinataires, un par un, et rend le
 * résultat adresse par adresse. Un échec n'interrompt pas les suivants : le
 * journal doit pouvoir dire qui a reçu et qui n'a pas reçu.
 *
 * Chemin d'envoi unique de l'application — l'EmailComposer et le journal des
 * échanges passent tous deux par ici.
 */
export async function sendBulkEmail(input: SendBulkEmailInput): Promise<SendBulkEmailResult> {
  const transporter = getTransporter()
  if (!transporter) throw new EmailTransportUnavailableError()

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const senderName = input.senderName || `L'équipe ${appName}`

  // Déduplication sur l'adresse, en gardant le premier nom rencontré.
  const unique = new Map<string, BulkEmailRecipient>()
  for (const recipient of input.recipients) {
    const email = String(recipient.email || '')
      .toLowerCase()
      .trim()
    if (email && !unique.has(email)) unique.set(email, { email, name: recipient.name || '' })
  }

  const html = emailLayout({
    title: escapeHtml(input.subject),
    body: renderEmailBody(input.body),
    ctaUrl: input.ctaUrl || undefined,
    ctaLabel: input.ctaLabel || undefined,
  })
  const plainText = `${input.body}\n\n— ${senderName}, ${appName}`

  const results: BulkEmailDelivery[] = []
  for (const recipient of unique.values()) {
    try {
      await transporter.sendMail({
        from: `"${appName}" <${from}>`,
        to: recipient.email,
        subject: `[${appName}] ${input.subject}`,
        text: plainText,
        html,
      })
      results.push({ email: recipient.email, name: recipient.name || '', success: true })
    } catch (err) {
      results.push({
        email: recipient.email,
        name: recipient.name || '',
        success: false,
        error: (err as Error).message || String(err),
      })
    }
  }

  return {
    results,
    sent: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    total: results.length,
  }
}
