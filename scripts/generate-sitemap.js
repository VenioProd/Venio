import { writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const siteUrl = 'https://venio.paris'
const currentDate = new Date().toISOString().split('T')[0]

const routes = [
  { path: '', priority: '1.0', changefreq: 'weekly' },
  { path: '/services/communication', priority: '0.9', changefreq: 'monthly' },
  { path: '/services/developpement', priority: '0.9', changefreq: 'monthly' },
  { path: '/services/conseil', priority: '0.9', changefreq: 'monthly' },
  { path: '/poles', priority: '0.8', changefreq: 'monthly' },
  { path: '/realisations', priority: '0.8', changefreq: 'weekly' },
  { path: '/a-propos', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.8', changefreq: 'monthly' }
]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(route => `  <url>
    <loc>${siteUrl}${route.path}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('\n')}
</urlset>`

const publicPath = join(__dirname, '..', 'public', 'sitemap.xml')

try {
  writeFileSync(publicPath, sitemap, 'utf8')
  console.log('✅ Sitemap.xml généré avec succès dans public/')
} catch (error) {
  console.error('❌ Erreur lors de la génération du sitemap:', error.message)
  process.exit(1)
}

