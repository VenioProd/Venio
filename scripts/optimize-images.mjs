#!/usr/bin/env node
// Generates webp + avif variants for the raster images in public/realisations.
// Run via: npm run images:optimize
import sharp from 'sharp'
import { readdir } from 'fs/promises'
import path from 'path'

const dir = 'public/realisations'
const files = (await readdir(dir)).filter((f) => /\.(jpg|jpeg|png)$/i.test(f))

for (const f of files) {
  const src = path.join(dir, f)
  const base = path.join(dir, path.parse(f).name)
  await sharp(src).webp({ quality: 82 }).toFile(`${base}.webp`)
  await sharp(src).avif({ quality: 70 }).toFile(`${base}.avif`)
  console.log(`OK ${f} -> webp + avif`)
}
