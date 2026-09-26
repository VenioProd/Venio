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

/** Corps tel que le composeur d'artosera.com le poste (contrat `recap`), données fictives. */
function composerBody(lang: 'fr' | 'en') {
  const fr = lang === 'fr'
  return {
    to: 'Prospect@Exemple-Galerie.fr',
    galerie: 'Galerie Exemple',
    interlocuteur: 'Prospect Exemple',
    subject: fr ? 'Ma sélection Artosera · Galerie Exemple' : 'My Artosera selection · Galerie Exemple',
    body: 'Texte libre du navigateur.',
    filename: 'artosera-selection-galerie-exemple-2026-09-26.pdf',
    pdfBase64: PDF_BYTES.toString('base64'),
    devis: { page: 'composer', v: 1, lang, responses: { m1: 'indispensable' } },
    recap: {
      kind: 'selection',
      lang,
      offre: fr ? 'Le cœur compris : 24 fonctions et 4 garanties' : 'The core included: 24 functions and 4 guarantees',
      engagement: '',
      services: [
        {
          titre: fr ? 'Le cœur' : 'The core',
          sousTotal: fr ? 'Compris' : 'Included',
          lignes: [
            { nom: 'Inventaire', prix: fr ? '12 fonctions' : '12 functions' },
            { nom: 'Contacts', prix: fr ? '1 fonction' : '1 function' },
          ],
        },
        {
          titre: fr ? 'Modules indispensables' : 'Essential modules',
          sousTotal: '2',
          lignes: [
            { nom: 'Module Alpha', prix: '' },
            { nom: 'Module Beta', prix: '' },
          ],
        },
        {
          titre: fr ? 'Modules intéressants' : 'Interesting modules',
          sousTotal: '1',
          lignes: [{ nom: 'Module Gamma', prix: '' }],
        },
        {
          titre: fr ? 'Modules pour plus tard' : 'Modules for later',
          sousTotal: '1',
          lignes: [{ nom: 'Module Delta', prix: '' }],
        },
        {
          titre: fr ? 'Modules écartés' : 'Modules set aside',
          sousTotal: '1',
          lignes: [{ nom: 'Module Epsilon', prix: '' }],
        },
        {
          titre: fr ? 'Accompagnement' : 'Onboarding and support',
          sousTotal: fr ? '1 sur 3' : '1 of 3',
          lignes: [
            { nom: 'Reprise des données', prix: fr ? 'Oui' : 'Yes' },
            { nom: 'Formation', prix: fr ? 'À discuter' : 'To discuss' },
            { nom: 'Site de galerie', prix: fr ? 'Non' : 'No' },
          ],
        },
      ],
      totaux: [{ libelle: fr ? 'Modules retenus' : 'Modules selected', montant: fr ? '4 sur 5' : '4 of 5' }],
      notes: 'Une remarque.',
    },
  }
}

describe('corps « recap » du composeur artosera.com', () => {
  it.each(['fr', 'en'] as const)('convertit le recap (%s) vers le gabarit de sélection', async (lang) => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', lang === 'fr' ? '203.0.113.70' : '203.0.113.71')
      .send(composerBody(lang))

    expect(response.status).toBe(200)
    const message = sendMail.mock.calls[0][0]
    expect(message.to).toBe('contact@venio.paris')
    expect(message.replyTo).toBe('prospect@exemple-galerie.fr')
    expect(message.subject).toBe(
      lang === 'fr'
        ? 'Sélection Artosera — Galerie Exemple (2 modules indispensables)'
        : 'Artosera selection — Galerie Exemple (2 essential modules)',
    )
    const text: string = message.text
    const html: string = message.html
    if (lang === 'fr') {
      expect(text).toContain('Indispensables (2)\n- Module Alpha\n- Module Beta')
      expect(text).toContain('Intéressants (1)\n- Module Gamma')
      expect(text).toContain('Plus tard (1)\n- Module Delta')
      expect(text).toContain('Pas pour nous (1)\n- Module Epsilon')
      expect(text).toContain('Oui (1)\n- Reprise des données')
      expect(text).toContain('À discuter (1)\n- Formation')
      expect(text).toContain('Non (1)\n- Site de galerie')
      expect(text).toContain('- Inventaire : 12 fonctions')
    } else {
      expect(text).toContain('Essential (2)\n- Module Alpha\n- Module Beta')
      expect(text).toContain('Not for us (1)\n- Module Epsilon')
      expect(text).toContain('To discuss (1)\n- Formation')
    }
    expect(text).toContain('Une remarque.')
    expect(text).not.toContain('Texte libre du navigateur.')
    // L'en-tête « Qui » montre l'adresse du prospect, jamais la boîte Venio.
    expect(html).toContain('href="mailto:prospect@exemple-galerie.fr"')
    expect(html).not.toContain('contact@venio.paris')
  })

  it('préfère un `choix` explicite posé sur une ligne', async () => {
    const body = composerBody('fr')
    body.recap.services.push({
      titre: 'Autre',
      sousTotal: '',
      lignes: [{ nom: 'Module Zeta', prix: '', choix: 'indispensable' } as never],
    })
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.72')
      .send(body)

    expect(response.status).toBe(200)
    expect(sendMail.mock.calls[0][0].subject).toContain('(3 modules indispensables)')
  })
})

describe('codes d’erreur', () => {
  it('renvoie un code stable et un message anglais quand lang vaut "en"', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.80')
      .send({ ...composerBody('en'), pdfBase64: '' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, code: 'missing_pdf', error: 'The PDF is missing.' })
  })

  it('garde le français par défaut, code compris', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.81')
      .send({ ...composerBody('fr'), recap: undefined })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      ok: false,
      code: 'invalid_selection',
      error: 'La sélection est vide ou illisible.',
    })
  })

  it('code les refus émis avant lecture du corps (JSON invalide, quota)', async () => {
    const malformed = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.82')
      .set('Content-Type', 'application/json')
      .send('{"to":')
    expect(malformed.status).toBe(400)
    expect(malformed.body.code).toBe('malformed_json')

    const ip = '203.0.113.83'
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/artosera/devis')
        .set('Origin', SITE)
        .set('X-Forwarded-For', ip)
        .send(composerBody('fr'))
    }
    const limited = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', ip)
      .send(composerBody('fr'))
    expect(limited.status).toBe(429)
    expect(limited.body).toMatchObject({ ok: false, code: 'rate_limited' })
  })
})

/** Réponses telles que le composeur les pose dans `devis.responses`. */
const RESPONSES = {
  facturation: 'indispensable',
  coffre: 'indispensable',
  'mode-foire': 'interessant',
  mouvements: 'plus-tard',
  'artsy-artnet': 'pas-pour-nous',
  'reprise-donnees': 'oui',
  formation: 'a-discuter',
  'site-galerie': 'non',
}

function prospectBody(overrides: Record<string, unknown> = {}, lang: 'fr' | 'en' = 'fr') {
  const base = composerBody(lang)
  return {
    ...base,
    to: 'Ana@Exemple-Galerie.fr',
    interlocuteur: 'Ana Exemple',
    website: '',
    devis: { ...base.devis, responses: RESPONSES },
    ...overrides,
  }
}

function mailTo(address: string) {
  return sendMail.mock.calls.map((c) => c[0]).find((m) => m.to === address)
}

describe('récapitulatif au prospect', () => {
  beforeEach(async () => {
    const { resetProspectQuota } = await import('../lib/artosera/prospectQuota.js')
    resetProspectQuota()
  })

  it('envoie le mail interne puis le récapitulatif au prospect, sans pièce jointe ni texte libre', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.90')
      .send(
        prospectBody({
          subject: 'SUJET-LIBRE',
          body: 'CORPS-LIBRE',
          recap: { ...composerBody('fr').recap, notes: 'NOTES-LIBRES', offre: 'OFFRE-LIBRE' },
        }),
      )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[0][0].to).toBe('contact@venio.paris')

    const mail = mailTo('ana@exemple-galerie.fr')
    expect(mail).toBeDefined()
    expect(mail.subject).toBe('Votre sélection Artosera')
    expect(mail.replyTo).toBe('contact@venio.paris')
    expect(mail.attachments).toBeUndefined()
    expect(mail.bcc).toBeUndefined()
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('Bonjour Ana Exemple,')
      expect(part).toContain('Galerie Exemple')
      expect(part).toContain('Facturation complète')
      expect(part).toContain('Le coffre')
      expect(part).toContain('Reprise des données')
      expect(part).toContain('https://artosera.com/composer.html')
      for (const libre of [
        'SUJET-LIBRE',
        'CORPS-LIBRE',
        'NOTES-LIBRES',
        'OFFRE-LIBRE',
        'Module Alpha',
        'Une remarque',
      ]) {
        expect(part).not.toContain(libre)
      }
    }
    // « Non » n'est pas un accompagnement demandé.
    expect(mail.text).not.toContain('Nouveau site de la galerie')
    expect(mail.text).toContain('Indispensables (2)\n- Facturation complète\n- Le coffre')
    expect(mail.text).toContain('À discuter (1)\n- Formation')
    expect(mail.text).toContain('parce que vous avez demandé')
  })

  it('rédige le récapitulatif en anglais quand recap.lang vaut "en"', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.91')
      .send(prospectBody({}, 'en'))

    expect(response.status).toBe(200)
    const mail = mailTo('ana@exemple-galerie.fr')
    expect(mail.subject).toBe('Your Artosera selection')
    expect(mail.html).toContain('<html lang="en">')
    expect(mail.html).toContain('https://artosera.com/en/composer.html')
    expect(mail.text).toContain('Essential (2)\n- Full invoicing\n- The Vault')
    expect(mail.text).toContain('Hello Ana Exemple,')
  })

  it('ignore les identifiants hors liste blanche et les réponses hors de leur type', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.92')
      .send(
        prospectBody({
          devis: {
            responses: {
              facturation: 'oui',
              formation: 'indispensable',
              'module-pirate': 'indispensable',
              '<b>x</b>': 'oui',
              coffre: 'interessant',
              __proto__: { coffre: 'indispensable' },
            },
          },
        }),
      )

    expect(response.status).toBe(200)
    const mail = mailTo('ana@exemple-galerie.fr')
    expect(mail.text).toContain('Intéressants (1)\n- Le coffre')
    expect(mail.text).not.toContain('Facturation complète')
    expect(mail.text).not.toContain('Formation')
    expect(mail.text).not.toContain('module-pirate')
    expect(mail.html).not.toContain('pirate')
    expect(mail.text).toContain('Aucun accompagnement demandé')
  })

  it('n’envoie rien au prospect si aucune réponse ne passe la liste blanche', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.93')
      .send(prospectBody({ devis: { responses: { inconnu: 'indispensable' } } }))

    expect(response.status).toBe(200)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].to).toBe('contact@venio.paris')
  })

  it('retombe sur une formule générique si galerie ou interlocuteur ne passent pas le filtre strict', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.94')
      .send(prospectBody({ galerie: 'Gagnez sur www.spam.example', interlocuteur: 'x'.repeat(81) }))

    expect(response.status).toBe(200)
    const mail = mailTo('ana@exemple-galerie.fr')
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('Bonjour,')
      expect(part).toContain('Merci d’avoir composé votre sélection.')
      expect(part).not.toContain('spam')
      expect(part).not.toContain('xxxxxxxx')
    }
  })

  it('n’envoie qu’un récapitulatif par adresse et par 24 h ; le mail interne part toujours', async () => {
    const first = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.95')
      .send(prospectBody())
    expect(first.status).toBe(200)
    expect(sendMail).toHaveBeenCalledTimes(2)

    sendMail.mockClear()
    const second = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.96')
      .send(prospectBody({ to: '  ANA@exemple-galerie.FR ' }))

    expect(second.status).toBe(200)
    expect(second.body).toEqual({ ok: true })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].to).toBe('contact@venio.paris')
  })

  it('libère l’adresse après 24 h', async () => {
    const { reserveProspectEmail } = await import('../lib/artosera/prospectQuota.js')
    const t0 = Date.UTC(2026, 8, 26)
    expect(reserveProspectEmail('a@b.fr', t0)).toBe(true)
    expect(reserveProspectEmail('A@B.fr', t0 + 23 * 3600_000)).toBe(false)
    expect(reserveProspectEmail('a@b.fr', t0 + 24 * 3600_000)).toBe(true)
  })

  it('pot de miel rempli : 200 ok, aucun envoi, aucune archive', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', SITE)
      .set('X-Forwarded-For', '203.0.113.97')
      .send(prospectBody({ website: 'https://spam.example' }))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(sendMail).not.toHaveBeenCalled()
    expect(await fsp.readdir(storageDir)).toEqual([])
  })

  it('n’envoie rien au prospect depuis venio.paris', async () => {
    const response = await request(app)
      .post('/api/artosera/devis')
      .set('Origin', VENIO)
      .set('X-Forwarded-For', '203.0.113.98')
      .send(prospectBody({ subject: 'Devis', body: 'Bonjour.' }))

    expect(response.status).toBe(200)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].to).toBe('ana@exemple-galerie.fr')
    expect(sendMail.mock.calls[0][0].attachments).toHaveLength(1)
  })

  it('rend un HTML et un texte stables (snapshot)', async () => {
    const { parseComposerResponses } = await import('../lib/artosera/composerCatalog.js')
    const { renderProspectHtml, renderProspectText } = await import('../lib/email/templates/artoseraProspect.js')
    const input = {
      to: 'ana@exemple-galerie.fr',
      lang: 'fr' as const,
      responses: parseComposerResponses({ responses: RESPONSES }),
      galerie: 'Galerie Exemple',
      interlocuteur: 'Ana Exemple',
    }
    expect(renderProspectHtml(input)).toMatchSnapshot()
    expect(renderProspectText(input)).toMatchSnapshot()
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
