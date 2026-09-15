import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'

/**
 * Le transport nodemailer est remplacé : le test vérifie le contrat de la
 * route et l'enveloppe du message, jamais un envoi réel.
 */
const sendMail = vi.fn()

vi.mock('../lib/email/transport.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
  return { ...actual, getTransporter: () => ({ sendMail }) }
})

let app: Express
let storageDir: string

/** Le plus petit PDF valide : en-tête %PDF- et une fin de fichier. */
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1')

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    to: '  Contact@Galerie-Test.FR ',
    galerie: 'Galerie Test',
    interlocuteur: 'Ana Dupont',
    subject: 'Devis Artosera — Galerie Test',
    body: 'Bonjour Ana,\r\n\r\nVoici le récapitulatif.\r\nPremière année : 12 000 €',
    filename: 'devis-artosera-galerie-test-2026-09-15.pdf',
    pdfBase64: PDF_BYTES.toString('base64'),
    devis: {
      picked: ['inventaire'],
      S: { name: 'Galerie Test' },
      totals: { impl: 9000 },
      tier: 'Atelier',
      year: 12000,
    },
    ...overrides,
  }
}

beforeAll(async () => {
  storageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'artosera-devis-'))
  process.env.ARTOSERA_DEVIS_STORAGE_DIR = storageDir
  process.env.ARTOSERA_DEVIS_BCC = 'contact@venio.paris'
  process.env.SMTP_FROM = 'contact@venio.paris'

  const { default: artoseraDevisRoutes } = await import('../routes/public/artoseraDevis.js')
  app = express()
  app.set('trust proxy', 1)
  // Monté comme en production : le router porte son propre parser JSON.
  app.use('/api/artosera', artoseraDevisRoutes)
})

afterAll(async () => {
  await fsp.rm(storageDir, { recursive: true, force: true })
  delete process.env.ARTOSERA_DEVIS_STORAGE_DIR
  delete process.env.ARTOSERA_DEVIS_BCC
})

beforeEach(() => {
  sendMail.mockReset()
  sendMail.mockResolvedValue({ messageId: '<test@venio.paris>' })
})

afterEach(async () => {
  for (const entry of await fsp.readdir(storageDir)) {
    await fsp.rm(path.join(storageDir, entry), { recursive: true, force: true })
  }
})

async function archivedDirectories(): Promise<string[]> {
  const days = await fsp.readdir(storageDir)
  const out: string[] = []
  for (const day of days) {
    for (const reference of await fsp.readdir(path.join(storageDir, day))) {
      out.push(path.join(storageDir, day, reference))
    }
  }
  return out
}

describe('POST /api/artosera/devis', () => {
  it('envoie le devis à la galerie avec le PDF en pièce jointe, Venio en copie, et archive la trace', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.20')
      .send(validBody())

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })

    expect(sendMail).toHaveBeenCalledTimes(1)
    const message = sendMail.mock.calls[0][0]
    expect(message.to).toBe('contact@galerie-test.fr')
    expect(message.bcc).toEqual(['contact@venio.paris'])
    expect(message.subject).toBe('Devis Artosera — Galerie Test')
    expect(message.text).toContain('Première année : 12 000 €')
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments[0].filename).toBe('devis-artosera-galerie-test-2026-09-15.pdf')
    expect(message.attachments[0].contentType).toBe('application/pdf')
    expect(Buffer.compare(message.attachments[0].content, PDF_BYTES)).toBe(0)

    const [directory] = await archivedDirectories()
    expect(directory).toBeDefined()

    const storedPdf = await fsp.readFile(path.join(directory, 'devis-artosera-galerie-test-2026-09-15.pdf'))
    expect(Buffer.compare(storedPdf, PDF_BYTES)).toBe(0)

    const trace = JSON.parse(await fsp.readFile(path.join(directory, 'devis.json'), 'utf8'))
    expect(trace).toMatchObject({
      to: 'contact@galerie-test.fr',
      galerie: 'Galerie Test',
      interlocuteur: 'Ana Dupont',
      filename: 'devis-artosera-galerie-test-2026-09-15.pdf',
      pdfBytes: PDF_BYTES.length,
      devis: { tier: 'Atelier', year: 12000 },
    })
    expect(trace.reference).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f]{6}$/)
  })

  it('refuse une adresse de destinataire invalide sans rien envoyer ni archiver', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.21')
      .send(validBody({ to: 'pas-une-adresse' }))

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'Adresse e-mail du destinataire invalide.' })
    expect(sendMail).not.toHaveBeenCalled()
    expect(await archivedDirectories()).toEqual([])
  })

  it('refuse un PDF absent et un contenu qui n’est pas un PDF', async () => {
    const missing = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.22')
      .send(validBody({ pdfBase64: '' }))

    expect(missing.status).toBe(400)
    expect(missing.body).toEqual({ ok: false, error: 'Le PDF du devis est absent.' })

    const notAPdf = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.23')
      .send(validBody({ pdfBase64: Buffer.from('MZ ceci est un exécutable').toString('base64') }))

    expect(notAPdf.status).toBe(400)
    expect(notAPdf.body).toEqual({ ok: false, error: 'Le PDF du devis est illisible.' })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('neutralise un nom de fichier hostile et un sujet porteur de saut de ligne', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.24')
      .send(
        validBody({
          filename: '../../../etc/passwd',
          subject: 'Devis Artosera\r\nBcc: victime@example.test',
        }),
      )

    expect(response.status).toBe(200)

    const message = sendMail.mock.calls[0][0]
    expect(message.subject).toBe('Devis Artosera Bcc: victime@example.test')
    expect(message.subject).not.toMatch(/[\r\n]/)
    expect(message.attachments[0].filename).toBe('passwd.pdf')

    // Le PDF reste dans le dossier d'archive : le nom hostile n'a pas voyagé.
    const [directory] = await archivedDirectories()
    expect(path.relative(storageDir, directory).split(path.sep)).toHaveLength(2)
    await expect(fsp.readFile(path.join(directory, 'passwd.pdf'))).resolves.toBeInstanceOf(Buffer)
  })

  it('répond 502 quand l’envoi SMTP échoue, en conservant la trace du devis', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP indisponible'))

    const response = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.25')
      .send(validBody())

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ ok: false, error: 'L’envoi de l’e-mail a échoué. Réessayez dans un instant.' })
    expect(await archivedDirectories()).toHaveLength(1)
  })

  it('refuse un corps JSON non valide', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('X-Forwarded-For', '198.51.100.26')
      .set('Content-Type', 'application/json')
      .send('{"to":')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'Le corps de la requête doit être un JSON valide.' })
    expect(sendMail).not.toHaveBeenCalled()
  })
})
