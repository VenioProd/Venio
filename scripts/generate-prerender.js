import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicRoutes, SITE_URL } from './public-routes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const templatePath = join(distDir, 'index.html')

if (!existsSync(templatePath)) {
  throw new Error('Build frontend missing: run vite build before generating prerendered pages.')
}

const template = readFileSync(templatePath, 'utf8')
const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  )
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const removeHeadTag = (html, tag, attr, value) =>
  html.replace(new RegExp(`\\s*<${tag}\\b(?=[^>]*\\b${attr}=["']${escapeRegExp(value)}["'])[^>]*>`, 'gi'), '')

function removeStaticSeo(html) {
  let cleaned = html.replace(/<title>[\s\S]*?<\/title>/i, '')
  cleaned = removeHeadTag(cleaned, 'meta', 'name', 'description')
  cleaned = removeHeadTag(cleaned, 'link', 'rel', 'canonical')
  for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:locale']) {
    cleaned = removeHeadTag(cleaned, 'meta', 'property', property)
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    cleaned = removeHeadTag(cleaned, 'meta', 'name', name)
  }
  cleaned = cleaned.replace(/\s*<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
  return cleaned
}

function renderPage(route) {
  const canonical = `${SITE_URL}${route.path || '/'}`
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)
  const h1 = escapeHtml(route.h1)
  const content = escapeHtml(route.content)
  // Keep this as JSON, rather than HTML-escaping it: search engines parse the
  // script body as JSON-LD. Escaping `<` prevents a closing script injection.
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: route.title,
    description: route.description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Venio', url: SITE_URL },
  }).replace(/</g, '\\u003c')

  const head = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Venio" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}/og-image.png" />
    <meta property="og:locale" content="fr_FR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE_URL}/og-image.png" />
    <script type="application/ld+json">${structuredData}</script>`
  const body = `<main id="prerendered-public-content"><h1>${h1}</h1><p>${content}</p><p><a href="/contact">Parlons de votre projet</a></p></main>`

  return removeStaticSeo(template)
    .replace('</head>', `${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

for (const route of publicRoutes) {
  if (!route.path) continue
  const routeDir = join(distDir, route.path.slice(1))
  rmSync(routeDir, { recursive: true, force: true })
  mkdirSync(routeDir, { recursive: true })
  writeFileSync(join(routeDir, 'index.html'), renderPage(route), 'utf8')
}

// Root has no subdirectory, so replace the build output after every route page is rendered.
writeFileSync(templatePath, renderPage(publicRoutes[0]), 'utf8')

// Netlify-style static hosts honor this rule; the Express server also serves
// the exact route files explicitly (see backend/src/index.ts).
const redirectsPath = join(distDir, '_redirects')
if (existsSync(join(root, 'public', '_redirects'))) cpSync(join(root, 'public', '_redirects'), redirectsPath)

console.log(`Prerendered ${publicRoutes.length} public routes.`)
