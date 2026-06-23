// Génère public/og-image.png (1200×630) — visuel de partage social, style Monolithe.
// Lancer : node scripts/generate-og.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <line x1="400" y1="0" x2="400" y2="630" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>
  <line x1="800" y1="0" x2="800" y2="630" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <rect x="66" y="74" width="40" height="6" fill="#ccff00"/>
    <text x="116" y="98" font-size="40" font-weight="900" fill="#ccff00" letter-spacing="4">VENIO</text>
    <text x="60" y="300" font-size="98" font-weight="900" fill="#ffffff" letter-spacing="-5">CONSTRUIRE</text>
    <text x="60" y="402" font-size="98" font-weight="900" letter-spacing="-5" xml:space="preserve"><tspan fill="#ffffff">CE QUI </tspan><tspan fill="#ccff00">DOIT</tspan></text>
    <text x="60" y="504" font-size="98" font-weight="900" fill="#ffffff" letter-spacing="-5">EXISTER</text>
    <text x="66" y="588" font-size="30" font-weight="400" fill="#9b9b9b">Sites web sur mesure · Conseil · Marque — Studio digital à Paris</text>
  </g>
</svg>`

await sharp(Buffer.from(svg)).png().toFile(join(__dirname, '..', 'public', 'og-image.png'))
console.log('✅ public/og-image.png généré (1200×630)')
