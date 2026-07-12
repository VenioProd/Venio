import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { publicRoutes, SITE_URL } from './public-routes.js'

const distDir = join(process.cwd(), 'dist')
const failures = []
const indexablePaths = new Set(publicRoutes.map((route) => route.path || '/'))
const maxInitialJavascriptGzip = 450 * 1024
const maxInitialCssGzip = 100 * 1024

if (!existsSync(distDir)) {
  throw new Error('Build frontend missing: run npm run build:test before the public recipe.')
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function htmlFor(route) {
  return readFileSync(join(distDir, route.path.slice(1), 'index.html'), 'utf8')
}

function validateLinks(html, routePath) {
  const hrefs = [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1])
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || /^(?:mailto:|tel:|https?:\/\/|\/assets\/)/.test(href)) continue
    const pathname = href.split(/[?#]/)[0] || '/'
    if (pathname.includes('.') && existsSync(join(distDir, pathname))) continue
    if (!indexablePaths.has(pathname)) failures.push(`${routePath}: broken internal link ${href}`)
  }
}

for (const route of publicRoutes) {
  const path = route.path || '/'
  const html = htmlFor(route)
  validateLinks(html, path)
  if (!/<html[^>]+lang="(?:fr|en)"/i.test(html)) failures.push(`${path}: missing document language`)
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) failures.push(`${path}: expected exactly one h1`)

  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=(?:"[^"]*"|'[^']*')/i.test(image[0])) failures.push(`${path}: image missing alt text`)
  }
  for (const button of html.matchAll(/<button\b[^>]*>/gi)) {
    if (!/\b(?:aria-label|title)=/i.test(button[0]) && !/>\s*[^<\s]/.test(html.slice(button.index))) {
      failures.push(`${path}: unnamed button`)
    }
  }
}

const rootHtml = htmlFor(publicRoutes[0])
const assetUrls = [...rootHtml.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((match) => match[1])
const initialJavascript = assetUrls
  .filter((url) => url.endsWith('.js'))
  .reduce((sum, url) => sum + gzipSync(readFileSync(join(distDir, url))).length, 0)
const initialCss = assetUrls
  .filter((url) => url.endsWith('.css'))
  .reduce((sum, url) => sum + gzipSync(readFileSync(join(distDir, url))).length, 0)

if (initialJavascript > maxInitialJavascriptGzip) {
  failures.push(`performance: initial JavaScript gzip ${initialJavascript} exceeds ${maxInitialJavascriptGzip} bytes`)
}
if (initialCss > maxInitialCssGzip) {
  failures.push(`performance: initial CSS gzip ${initialCss} exceeds ${maxInitialCssGzip} bytes`)
}

const sitemap = readFileSync(join(distDir, 'sitemap.xml'), 'utf8')
for (const route of publicRoutes) {
  const canonical = `${SITE_URL}${route.path || '/'}`
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) failures.push(`sitemap: missing ${canonical}`)
}

// Screenshots are produced by Playwright in test-results/public-captures.
// Cleaning them here prevents a stale local artifact being mistaken for a CI
// capture from the current build.
rmSync(join(process.cwd(), 'test-results', 'public-captures'), { recursive: true, force: true })

if (failures.length) {
  console.error(`Public recipe validation failed:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(
  `Public recipe static checks passed: ${publicRoutes.length} URLs, links/a11y basics, sitemap, metadata and ${Math.round(initialJavascript / 1024)} KiB JS gzip / ${Math.round(initialCss / 1024)} KiB CSS gzip.`,
)
