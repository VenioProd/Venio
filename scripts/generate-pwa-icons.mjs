#!/usr/bin/env node
/**
 * Génère toutes les icônes PWA depuis un logo source.
 *
 * Usage :
 *   node scripts/generate-pwa-icons.mjs [path/to/source.{svg,png}]
 *
 * Source par défaut : public/logo-source.{svg,png}
 * Cible : public/favicon-16x16.png, favicon-32x32.png, favicon-192x192.png,
 *         favicon-512x512.png, apple-touch-icon.png, favicon.svg (si source SVG)
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const publicDir = resolve(root, 'public')

// Trouve la source : argument CLI sinon public/logo-source.{svg,png}
const candidate = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : ['logo-source.svg', 'logo-source.png'].map((name) => resolve(publicDir, name)).find(existsSync)

if (!candidate || !existsSync(candidate)) {
  console.error('❌ Aucun logo source trouvé.')
  console.error('   Placez un fichier dans public/logo-source.svg ou public/logo-source.png')
  console.error('   Ou passez le chemin en argument : node scripts/generate-pwa-icons.mjs path/to/logo.png')
  process.exit(1)
}

console.log(`📥 Source : ${candidate}`)

let sharp
try {
  ;({ default: sharp } = await import('sharp'))
} catch {
  console.error('❌ sharp non installé. Lance : npm i -D sharp')
  process.exit(1)
}

const sizes = [
  { name: 'favicon-16x16.png', size: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'favicon-32x32.png', size: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'favicon-192x192.png', size: 192, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'favicon-512x512.png', size: 512, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'apple-touch-icon.png', size: 180, background: { r: 0, g: 0, b: 0, alpha: 1 } },
]

const isSvg = candidate.toLowerCase().endsWith('.svg')

for (const { name, size, background } of sizes) {
  const out = resolve(publicDir, name)
  await sharp(candidate, { density: 384 })
    .resize(size, size, { fit: 'contain', background })
    .flatten({ background })
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`✅ ${name} (${size}×${size})`)
}

// Si SVG : copie en favicon.svg pour le rel="icon" vectoriel
if (isSvg) {
  const dest = resolve(publicDir, 'favicon.svg')
  copyFileSync(candidate, dest)
  console.log(`✅ favicon.svg (vectoriel)`)
} else {
  // Génère un favicon.svg minimal qui pointe vers le 512
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="/favicon-512x512.png" width="512" height="512"/></svg>`
  writeFileSync(resolve(publicDir, 'favicon.svg'), svg)
  console.log(`✅ favicon.svg (wrapper PNG)`)
}

console.log('\n🎉 Toutes les icônes PWA ont été générées.')
