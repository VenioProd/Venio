import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { publicRoutes, SITE_URL } from './public-routes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const currentDate = new Date().toISOString().split('T')[0]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicRoutes
  .map(
    (route) => `  <url>
    <loc>${SITE_URL}${route.path}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`

const publicPath = join(__dirname, '..', 'public', 'sitemap.xml')
const distDir = join(__dirname, '..', 'dist')
const distPath = join(distDir, 'sitemap.xml')

try {
  writeFileSync(publicPath, sitemap, 'utf8')
  if (existsSync(distDir)) {
    writeFileSync(distPath, sitemap, 'utf8')
  }
  console.log('✅ Sitemap.xml généré avec succès dans public/')
} catch (error) {
  console.error('❌ Erreur lors de la génération du sitemap:', error.message)
  process.exit(1)
}
