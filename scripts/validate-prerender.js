import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publicRoutes, SITE_URL } from './public-routes.js'

const distDir = join(process.cwd(), 'dist')
const failures = []
const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  )
const count = (html, pattern) => html.match(pattern)?.length ?? 0

for (const route of publicRoutes) {
  const file = join(distDir, route.path.slice(1), 'index.html')
  if (!existsSync(file)) {
    failures.push(`${route.path || '/'}: missing ${file}`)
    continue
  }
  const html = readFileSync(file, 'utf8')
  const canonical = `${SITE_URL}${route.path || '/'}`
  for (const expected of [
    escapeHtml(route.title),
    escapeHtml(route.description),
    `<h1>${escapeHtml(route.h1)}</h1>`,
    `href="${canonical}"`,
    'application/ld+json',
    'id="prerendered-public-content"',
  ]) {
    if (!html.includes(expected)) failures.push(`${route.path || '/'}: missing ${expected}`)
  }

  for (const [label, pattern] of [
    ['title tag', /<title>/g],
    ['description meta tag', /<meta\s+name="description"/g],
    ['canonical link tag', /<link\s+rel="canonical"/g],
    ['og:title tag', /<meta\s+property="og:title"/g],
    ['twitter:title tag', /<meta\s+name="twitter:title"/g],
    ['JSON-LD script', /<script type="application\/ld\+json">/g],
  ]) {
    const occurrences = count(html, pattern)
    if (occurrences !== 1) failures.push(`${route.path || '/'}: expected one ${label}, found ${occurrences}`)
  }

  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  try {
    const parsed = JSON.parse(jsonLd ?? '')
    if (parsed.url !== canonical) failures.push(`${route.path || '/'}: JSON-LD url mismatch`)
    if (parsed.name !== route.title) failures.push(`${route.path || '/'}: JSON-LD name mismatch`)
  } catch {
    failures.push(`${route.path || '/'}: invalid JSON-LD`)
  }
}

const sitemap = readFileSync(join(distDir, 'sitemap.xml'), 'utf8')
for (const route of publicRoutes) {
  const loc = `${SITE_URL}${route.path || '/'}`
  if (!sitemap.includes(`<loc>${loc}</loc>`)) failures.push(`sitemap.xml: missing ${loc}`)
}

if (failures.length) {
  console.error(`Prerender validation failed:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`Validated ${publicRoutes.length} prerendered public routes.`)
