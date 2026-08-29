import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicRoutes } from '../../scripts/public-routes.js'

/**
 * `scripts/public-routes.js` produit le HTML statique servi aux moteurs de
 * recherche et au premier affichage. Il est écrit à la main, séparé des
 * composants : il peut diverger d'eux sans que rien ne le signale.
 *
 * C'est arrivé. La home a été déployée avec le titre, la description et le h1
 * de la version précédente — « Construire ce qui doit exister » — pendant que
 * le composant rendait la nouvelle page. Tests verts, CI verte, déploiement
 * réussi, et les moteurs indexaient l'ancienne home.
 *
 * Ces garde-fous vérifient ce qui est objectivement vérifiable : que les
 * routes prérendues existent, qu'aucune page publique n'est oubliée, et que
 * le titre annoncé aux moteurs est une phrase que la page contient vraiment.
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Route publique → composant de page. */
const ROUTE_TO_PAGE: Record<string, string> = {
  '': 'Home',
  '/services/sites': 'ServicesSites',
  '/au-dela-du-site': 'AuDelaDuSite',
  '/realisations': 'Realisations',
  '/methode': 'Methode',
  '/a-propos': 'APropos',
  '/contact': 'Contact',
  '/legal': 'Legal',
  '/cgu': 'CGU',
  '/cgv': 'CGV',
  '/confidentialite': 'Confidentialite',
}

/**
 * Le h1 prérendu peut volontairement différer de celui affiché : le premier
 * vise la recherche, le second le lecteur. Chaque écart doit être justifié
 * ici — c'est le prix à payer pour que le test reste utile ailleurs.
 */
const H1_ECARTS_ASSUMES: Record<string, string> = {
  '/services/sites': 'La page titre « Sites web » ; le prerender précise « sur mesure » pour la recherche.',
  '/methode':
    'La page titre « Faire avancer un projet, sans brouillard. » ; le prerender annonce « Méthode de travail », plus explicite pour un moteur.',
}

/** Retire le balisage JSX, les accents et la casse pour comparer des phrases. */
const aplatir = (texte: string) =>
  texte
    .replace(/<[^>]*>/g, ' ')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/&nbsp;| /g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

describe('prerender des pages publiques', () => {
  it('ne prérend que des routes réellement servies', () => {
    const app = read('src/App.tsx')
    const inconnues = publicRoutes.map((r) => r.path || '/').filter((path) => !app.includes(`path="${path}"`))

    expect(inconnues, `routes prérendues absentes de App.tsx : ${inconnues.join(', ')}`).toEqual([])
  })

  it('couvre toutes les pages publiques déclarées', () => {
    const app = read('src/App.tsx')
    // Routes de premier niveau, hors redirections, paramètres et espaces privés.
    const declarees = [...app.matchAll(/<Route\s+path="(\/[a-z0-9/-]*)"\s+element=\{<(\w+)/g)]
      .filter(
        ([, path, element]) =>
          element !== 'Navigate' && !path.startsWith('/espace-client') && !path.startsWith('/admin'),
      )
      .map(([, path]) => path)

    const prerendues = new Set(publicRoutes.map((r) => r.path || '/'))
    const oubliees = declarees.filter((p) => !prerendues.has(p))

    expect(oubliees, `pages publiques sans prerender : ${oubliees.join(', ')}`).toEqual([])
  })

  it('annonce aux moteurs un titre que la page contient vraiment', () => {
    const divergences: string[] = []

    for (const route of publicRoutes) {
      const path = route.path || '/'
      if (path in H1_ECARTS_ASSUMES) continue

      const page = ROUTE_TO_PAGE[route.path]
      expect(page, `aucun composant associé à ${path}`).toBeTruthy()

      const source = aplatir(read(`src/pages/${page}.tsx`))
      if (!source.includes(aplatir(route.h1))) {
        divergences.push(`${path} → le prerender annonce « ${route.h1} », absent de ${page}.tsx`)
      }
    }

    expect(divergences, divergences.join('\n')).toEqual([])
  })

  it('renseigne les trois champs indexés, dans des longueurs utilisables', () => {
    for (const route of publicRoutes) {
      const path = route.path || '/'
      expect(route.title?.trim(), `${path} sans titre`).toBeTruthy()
      expect(route.h1?.trim(), `${path} sans h1`).toBeTruthy()
      expect(route.description?.trim(), `${path} sans description`).toBeTruthy()

      // Au-delà d'environ 160 caractères, les moteurs tronquent la description.
      expect(
        route.description.length,
        `${path} : description de ${route.description.length} caractères`,
      ).toBeLessThanOrEqual(200)
      expect(route.description.length, `${path} : description réduite à une ébauche`).toBeGreaterThanOrEqual(30)
    }
  })

  it('garde les écarts assumés justifiés et limités', () => {
    for (const [path, raison] of Object.entries(H1_ECARTS_ASSUMES)) {
      expect(
        publicRoutes.some((r) => (r.path || '/') === path),
        `écart déclaré pour ${path}, route inexistante`,
      ).toBe(true)
      expect(raison.length, `écart non justifié pour ${path}`).toBeGreaterThan(40)
    }
    // Si cette liste s'allonge, c'est que les deux sources divergent pour de bon.
    expect(Object.keys(H1_ECARTS_ASSUMES).length).toBeLessThanOrEqual(3)
  })
})
