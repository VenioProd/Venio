import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import cors from 'cors'
import request from 'supertest'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'

/**
 * Appels depuis le site artosera.com : CORS propre à la route, destinataire
 * imposé, Reply-To, et comportement inchangé pour venio.paris. L'application
 * de test reprend le câblage d'index.ts (CORS global + contournement ciblé).
 */
const sendMail = vi.fn()

vi.mock('../lib/email/transport.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
  return { ...actual, getTransporter: () => ({ sendMail }) }
})

const VENIO = 'https://venio.paris'
const SITE = 'https://artosera.com'
const SITE_WWW = 'https://www.artosera.com'

let app: Express
let storageDir: string

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1')

/** Sélection telle que le composeur la poste (données fictives). */
const selection = {
  coeur: [
    { titre: 'Jour 1', items: ['Fiches œuvres', 'Contacts'] },
    { titre: 'Jour 2', items: ['Ventes'] },
  ],
  modules: [
    { id: 'm1', titre: 'Module Alpha', groupe: 'Vendre', choix: 'indispensable' },
    { id: 'm2', titre: 'Module Beta', groupe: 'Vendre', choix: 'indispensable' },
    { id: 'm3', titre: 'Module Gamma', groupe: 'Exposer', choix: 'interessant' },
    { id: 'm4', titre: 'Module Delta', groupe: 'Exposer', choix: 'plus-tard' },
    { id: 'm5', titre: 'Module Epsilon', groupe: 'Gérer', choix: 'pas-pour-nous' },
  ],
  accompagnement: [
    { id: 's1', titre: 'Reprise des données', choix: 'oui' },
    { id: 's2', titre: 'Formation', choix: 'a-discuter' },
    { id: 's3', titre: 'Site de galerie', choix: 'non' },
  ],
  notes: 'Deux lignes\nde remarques.',
}

function siteBody(overrides: Record<string, unknown> = {}) {
  return {
    email: '  Prospect@Exemple-Galerie.FR ',
    galerie: 'Galerie Exemple',
    interlocuteur: 'Prospect Exemple',
    lang: 'fr',
    filename: 'artosera-selection-galerie-exemple.pdf',
    pdfBase64: PDF_BYTES.toString('base64'),
    selection,
    ...overrides,
  }
}

beforeAll(async () => {
  storageDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'artosera-devis-origin-'))
  process.env.ARTOSERA_DEVIS_STORAGE_DIR = storageDir
  process.env.ARTOSERA_DEVIS_BCC = 'contact@venio.paris'
  process.env.SMTP_FROM = 'contact@venio.paris'

  const { default: artoseraDevisRoutes } = await import('../routes/public/artoseraDevis.js')
  const { withArtoseraSiteCorsBypass } = await import('../lib/artosera/origin.js')
  app = express()
  app.set('trust proxy', 1)
  app.use(withArtoseraSiteCorsBypass(cors({ origin: VENIO, credentials: true })))
  app.use('/api/artosera', artoseraDevisRoutes)
  app.get('/api/autre', (_req, res) => res.json({ ok: true }))
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

async function onlyTrace(): Promise<Record<string, unknown>> {
  const [day] = await fsp.readdir(storageDir)
  const [reference] = await fsp.readdir(path.join(storageDir, day))
  return JSON.parse(await fsp.readFile(path.join(storageDir, day, reference, 'devis.json'), 'utf8'))
}

function preflight(origin: string, route = '/api/artosera/devis') {
  return request(app)
    .options(route)
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type')
}

describe('CORS de POST /api/artosera/devis', () => {
  it.each([SITE, SITE_WWW])('accepte le préflight de %s, sans credentials', async (origin) => {
    const response = await preflight(origin)

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(origin)
    expect(response.headers['access-control-allow-methods']).toBe('POST')
    expect(response.headers['access-control-allow-headers']).toMatch(/content-type/i)
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    expect(response.headers.vary).toMatch(/origin/i)
  })

  it('refuse le préflight d’une autre origine', async () => {
    const response = await preflight('https://evil.example')

    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example')
    expect(response.headers['access-control-allow-origin']).toBe(VENIO)
  })

  it('refuse un sous-domaine ou un schéma voisin d’artosera.com', async () => {
    for (const origin of ['http://artosera.com', 'https://artosera.com.evil.example', 'https://shop.artosera.com']) {
      const response = await preflight(origin)
      expect(response.headers['access-control-allow-origin']).toBe(VENIO)
    }
  })

  it('n’ouvre pas les autres routes à artosera.com', async () => {
    const response = await request(app).get('/api/autre').set('Origin', SITE)

    expect(response.headers['access-control-allow-origin']).toBe(VENIO)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('garde le CORS global pour venio.paris sur la route', async () => {
    const response = await preflight(VENIO)

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(VENIO)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('rend une erreur de validation lisible par le site', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.9')
      .send(siteBody({ pdfBase64: '' }))

    expect(response.status).toBe(400)
    expect(response.headers['access-control-allow-origin']).toBe(SITE)
    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe('envoi depuis artosera.com', () => {
  it('impose contact@venio.paris comme destinataire et met l’adresse du prospect en Reply-To', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.10')
      .send(siteBody())

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(response.headers['access-control-allow-origin']).toBe(SITE)

    expect(sendMail).toHaveBeenCalledTimes(1)
    const message = sendMail.mock.calls[0][0]
    expect(message.to).toBe('contact@venio.paris')
    expect(message.replyTo).toBe('prospect@exemple-galerie.fr')
    // Aucune copie : ni au prospect, ni en doublon vers contact@.
    expect(message.bcc).toBeUndefined()
    expect(JSON.stringify(message)).not.toContain('"to":"prospect@')
    expect(message.subject).toBe('Sélection Artosera — Galerie Exemple (2 modules indispensables)')
    expect(message.html).toContain('href="mailto:prospect@exemple-galerie.fr"')
    expect(message.html).toContain('Indispensables&nbsp;&middot;&nbsp;2')
    expect(message.html).toContain('À discuter&nbsp;&middot;&nbsp;1')
    expect(message.html).not.toMatch(/<img|https?:\/\/(?!venio\.paris)[^"']*\.(png|jpe?g|gif|svg)/i)
    expect(message.text).toContain('Indispensables (2)\n- Module Alpha (Vendre)\n- Module Beta (Vendre)')
    expect(message.text).toContain('E-mail : prospect@exemple-galerie.fr')
    expect(message.attachments[0].filename).toBe('artosera-selection-galerie-exemple.pdf')

    const trace = await onlyTrace()
    expect(trace).toMatchObject({
      to: 'contact@venio.paris',
      replyTo: 'prospect@exemple-galerie.fr',
      origin: SITE,
      subject: 'Sélection Artosera — Galerie Exemple (2 modules indispensables)',
      selection: { lang: 'fr', notes: 'Deux lignes\nde remarques.' },
    })
  })

  it('ignore objet, corps et récapitulatif postés : tout est composé côté serveur', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE_WWW)
      .set('X-Forwarded-For', '203.0.113.11')
      .send(
        siteBody({
          subject: 'Objet libre',
          body: 'Corps libre https://spam.example',
          recap: { kind: 'devis', services: [{ titre: 'X', lignes: [{ nom: 'Y', prix: '99 €' }] }] },
        }),
      )

    expect(response.status).toBe(200)
    const message = sendMail.mock.calls[0][0]
    expect(message.subject).toBe('Sélection Artosera — Galerie Exemple (2 modules indispensables)')
    expect(message.text).not.toContain('spam.example')
    expect(message.html).not.toContain('spam.example')
    expect(message.html).not.toContain('99 €')
  })

  it('refuse une sélection vide ou aux choix inconnus', async () => {
    for (const [ip, bad] of [
      ['203.0.113.14', undefined],
      ['203.0.113.15', { modules: [{ titre: 'X', choix: 'peut-etre' }], accompagnement: [] }],
    ] as const) {
      const response = await request(app)
        .post('/api/artosera/devis')
        .set('Origin', SITE)
        .set('X-Forwarded-For', ip)
        .send(siteBody({ selection: bad }))
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('La sélection est vide ou illisible.')
    }
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('échappe tout contenu saisi dans le HTML du mail', async () => {
    const xss = '<img src=x onerror=alert(1)>"\'&'
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.16')
      .send(
        siteBody({
          galerie: xss,
          interlocuteur: xss,
          email: 'a"><script>@x.fr',
          selection: {
            coeur: [{ titre: xss, items: [xss] }],
            modules: [{ titre: xss, groupe: xss, choix: 'indispensable' }],
            accompagnement: [{ titre: xss, choix: 'oui' }],
            notes: xss,
          },
        }),
      )

    expect(response.status).toBe(200)
    const html: string = sendMail.mock.calls[0][0].html
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;')
  })

  it('rédige les libellés en anglais quand lang vaut "en"', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.17')
      .send(siteBody({ lang: 'en', galerie: '' }))

    expect(response.status).toBe(200)
    const message = sendMail.mock.calls[0][0]
    expect(message.subject).toBe('Artosera selection — Not specified (2 essential modules)')
    expect(message.html).toContain('Essential&nbsp;&middot;&nbsp;2')
    expect(message.html).toContain('To discuss&nbsp;&middot;&nbsp;1')
    expect(message.html).toContain('<html lang="en">')
  })

  it('envoie quand même, sans Reply-To prospect, si l’adresse saisie est invalide ou absente', async () => {
    for (const [ip, to] of [
      ['203.0.113.12', 'pas-une-adresse'],
      ['203.0.113.13', undefined],
    ] as const) {
      sendMail.mockClear()
      const response = await request(app)
        .post('/api/artosera/devis')
        .set('Origin', SITE)
        .set('X-Forwarded-For', ip)
        .send(siteBody({ email: to }))

      expect(response.status).toBe(200)
      const message = sendMail.mock.calls[0][0]
      expect(message.to).toBe('contact@venio.paris')
      expect(message.replyTo).toBe('contact@venio.paris')
    }
  })

  it('limite le site à 5 envois par heure et par IP', async () => {
    const ip = '203.0.113.50'
    for (let i = 0; i < 5; i += 1) {
      const ok = await request(app)
        .post('/api/artosera/devis')
        .set('Origin', SITE)
        .set('X-Forwarded-For', ip)
        .send(siteBody())
      expect(ok.status).toBe(200)
    }
    const blocked = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', ip)
      .send(siteBody())

    expect(blocked.status).toBe(429)
    expect(blocked.headers['access-control-allow-origin']).toBe(SITE)
    expect(sendMail).toHaveBeenCalledTimes(5)
  })
})

describe('envoi depuis venio.paris (inchangé)', () => {
  it('envoie à l’adresse postée, Venio en copie cachée, sans Reply-To prospect', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', VENIO)
      .set('X-Forwarded-For', '203.0.113.20')
      .send(
        siteBody({
          to: 'Contact@Galerie-Test.FR',
          subject: 'Devis Artosera — Galerie Test',
          body: 'Bonjour,\nVoici le devis.',
          recap: { services: [{ titre: 'Le bureau', lignes: [{ nom: 'Inventaire', prix: '800 €' }] }] },
        }),
      )

    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe(VENIO)
    expect(response.headers['access-control-allow-credentials']).toBe('true')

    const message = sendMail.mock.calls[0][0]
    expect(message.to).toBe('contact@galerie-test.fr')
    expect(message.bcc).toEqual(['contact@venio.paris'])
    expect(message.replyTo).toBe('contact@venio.paris')
    expect(message.html).toContain('Devis établi pour')

    const trace = await onlyTrace()
    expect(trace).toMatchObject({ to: 'contact@galerie-test.fr', replyTo: null, origin: null })
  })

  it('n’applique pas le quota horaire du site à venio.paris', async () => {
    const ip = '203.0.113.60'
    for (let i = 0; i < 6; i += 1) {
      const response = await request(app)
        .post('/api/artosera/devis')
        .set('Origin', VENIO)
        .set('X-Forwarded-For', ip)
        .send(siteBody({ to: 'contact@galerie-test.fr', subject: 'Devis', body: 'Bonjour.' }))
      expect(response.status).toBe(200)
    }
  })
})

describe('gabarit de la sélection du site', () => {
  it('rend un HTML et un texte stables (snapshot)', async () => {
    const { normalizeSiteSelection, siteSelectionSubject } = await import('../lib/artosera/siteSelection.js')
    const { renderSiteSelectionHtml, renderSiteSelectionText } =
      await import('../lib/email/templates/artoseraSiteSelection.js')
    const normalized = normalizeSiteSelection(selection, 'fr')
    expect(normalized).not.toBeNull()
    if (!normalized) return
    const input = {
      selection: normalized,
      subject: siteSelectionSubject(normalized, 'Galerie Exemple'),
      galerie: 'Galerie Exemple',
      interlocuteur: 'Prospect Exemple',
      replyTo: 'prospect@exemple-galerie.fr',
      filename: 'artosera-selection-galerie-exemple.pdf',
      reference: '2026-09-26-120000-abcdef',
      receivedAt: new Date('2026-09-26T10:00:00Z'),
    }
    expect(renderSiteSelectionHtml(input)).toMatchSnapshot()
    expect(renderSiteSelectionText(input)).toMatchSnapshot()
  })
})
