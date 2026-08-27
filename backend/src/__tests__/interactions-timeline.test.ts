import { describe, it, expect, vi } from 'vitest'
import { deliveryStatusFrom, renderEmailBody } from '../lib/email/send.js'

describe('deliveryStatusFrom', () => {
  it('rend SENT quand tout est parti', () => {
    expect(
      deliveryStatusFrom([
        { email: 'a@x.fr', name: '', success: true },
        { email: 'b@x.fr', name: '', success: true },
      ]),
    ).toBe('SENT')
  })

  it('rend PARTIAL quand une partie seulement est partie', () => {
    expect(
      deliveryStatusFrom([
        { email: 'a@x.fr', name: '', success: true },
        { email: 'b@x.fr', name: '', success: false, error: 'boom' },
      ]),
    ).toBe('PARTIAL')
  })

  it("rend FAILED quand rien n'est parti", () => {
    expect(deliveryStatusFrom([{ email: 'a@x.fr', name: '', success: false, error: 'boom' }])).toBe('FAILED')
  })

  it('rend FAILED sur une liste vide plutôt que de prétendre au succès', () => {
    expect(deliveryStatusFrom([])).toBe('FAILED')
  })
})

describe('renderEmailBody', () => {
  it("échappe le HTML fourni par l'utilisateur", () => {
    const html = renderEmailBody('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('transforme chaque ligne en paragraphe et garde les lignes vides', () => {
    expect(renderEmailBody('Bonjour\n\nMerci')).toBe('<p>Bonjour</p><br><p>Merci</p>')
  })
})

describe('sendBulkEmail', () => {
  async function withTransport(sendMail: ReturnType<typeof vi.fn>) {
    vi.resetModules()
    vi.doMock('../lib/email/transport.js', async () => {
      const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
      return { ...actual, getTransporter: () => ({ sendMail }) }
    })
    return import('../lib/email/send.js')
  }

  it('poursuit les envois après un échec et rend le détail par adresse', async () => {
    const sendMail = vi.fn(async ({ to }: { to: string }) => {
      if (to === 'b@x.fr') throw new Error('mailbox full')
      return {}
    })
    const { sendBulkEmail } = await withTransport(sendMail)

    const result = await sendBulkEmail({
      subject: 'Relance',
      body: 'Bonjour',
      recipients: [{ email: 'a@x.fr' }, { email: 'b@x.fr' }, { email: 'c@x.fr' }],
    })

    expect(result.total).toBe(3)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results.find((entry) => entry.email === 'b@x.fr')?.error).toBe('mailbox full')
    vi.doUnmock('../lib/email/transport.js')
  })

  it('déduplique les destinataires', async () => {
    const sendMail = vi.fn(async () => ({}))
    const { sendBulkEmail } = await withTransport(sendMail)

    const result = await sendBulkEmail({
      subject: 'Relance',
      body: 'Bonjour',
      recipients: [{ email: 'a@x.fr' }, { email: 'A@X.fr ' }],
    })

    expect(result.total).toBe(1)
    expect(sendMail).toHaveBeenCalledTimes(1)
    vi.doUnmock('../lib/email/transport.js')
  })

  it("lève EmailTransportUnavailableError quand SMTP n'est pas configuré", async () => {
    vi.resetModules()
    vi.doMock('../lib/email/transport.js', async () => {
      const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
      return { ...actual, getTransporter: () => null }
    })
    const { sendBulkEmail, EmailTransportUnavailableError } = await import('../lib/email/send.js')

    await expect(sendBulkEmail({ subject: 'x', body: 'y', recipients: [{ email: 'a@x.fr' }] })).rejects.toBeInstanceOf(
      EmailTransportUnavailableError,
    )
    vi.doUnmock('../lib/email/transport.js')
  })
})
