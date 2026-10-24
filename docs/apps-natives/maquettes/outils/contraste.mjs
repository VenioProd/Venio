// Contrôle WCAG AA des 50 combinaisons fond × accent (docs/apps-natives/themes.md).
// Usage : node contraste.mjs   (code de sortie 1 si une combinaison échoue)

const AA = 4.5
const WHITE = '#FFFFFF'

const THEMES = {
  'liquid-glass': {
    ink: '#0D1424',
    backgrounds: {
      mist: { base: '#EEF3F8', dark: false },
      dawn: { base: '#FBF1EC', dark: false },
      lagoon: { base: '#ECF7F5', dark: false },
      lavender: { base: '#F3F0FA', dark: false },
      night: { base: '#0B1220', dark: true },
    },
    accents: { sky: '#0EA5E9', violet: '#7C3AED', mint: '#10B981', coral: '#F97362', amber: '#F59E0B' },
    // Texte courant : encre sur fond clair, blanc sur Nuit (jetons --t1 / --t2 des maquettes).
    text: { light: ['#0D1424', '#3F4B6B'], dark: ['#F5F6FF', '#B6BAD6'] },
    // Accent utilisé comme texte : mélangé à du noir (fond clair) ou du blanc (Nuit).
    accentInk: { light: { with: '#000000', pct: 45 }, dark: { with: '#FFFFFF', pct: 45 } },
    urgent: { base: '#FF453A', ink: { light: '#D70015', dark: '#FF8A82' }, fallbackAccent: 'coral', fallback: '#C81E3A' },
  },
  neon: {
    ink: '#050505',
    backgrounds: {
      black: { base: '#050505', surface: '#14171C' },
      graphite: { base: '#0D1117', surface: '#1F2630' },
      abyss: { base: '#04121F', surface: '#112840' },
      plum: { base: '#12071C', surface: '#26163A' },
      forest: { base: '#03130E', surface: '#112B22' },
    },
    accents: { cyan: '#0EA5E9', magenta: '#FF0080', violet: '#A855F7', acid: '#39FF88', orange: '#FF7A1A' },
    text: { dark: ['#E8EEF5', '#98A4B3'] },
    // Accent utilisé comme texte : éclairci vers le blanc (--accent-hi).
    accentInk: { dark: { with: '#FFFFFF', pct: 30 } },
    urgent: { base: '#FF0080', ink: { dark: '#FF5CAE' }, fallbackAccent: 'magenta', fallback: '#FF3B30' },
  },
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
const mix = (a, b, pctB) => toHex(hex(a).map((v, i) => v * (1 - pctB / 100) + hex(b)[i] * (pctB / 100)))
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const bestOn = (bg, ink) => (ratio(WHITE, bg) >= ratio(ink, bg) ? WHITE : ink)

// Proposition d'ajustement : même teinte et saturation, luminosité déplacée au minimum.
const toHsl = (h) => {
  const [r, g, b] = hex(h).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(hue * 60 + 360) % 360, s, l]
}
const fromHsl = ([h, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255])
}
const suggest = (acc, ink) => {
  const [h, s, l] = toHsl(acc)
  for (let d = 0.005; d < 0.5; d += 0.005)
    for (const nl of [l - d, l + d]) {
      const c = fromHsl([h, s, nl])
      if (ratio(bestOn(c, ink), c) >= AA) return c
    }
}

let failures = 0
const proposals = new Set()
const rows = []
for (const [theme, t] of Object.entries(THEMES)) {
  for (const [bgKey, bg] of Object.entries(t.backgrounds)) {
    const dark = bg.dark ?? true
    const mode = dark ? 'dark' : 'light'
    const [t1, t2] = t.text[mode]
    const inkMix = t.accentInk[mode]
    for (const [accKey, acc] of Object.entries(t.accents)) {
      const onAcc = bestOn(acc, t.ink)
      const accText = mix(acc, inkMix.with, inkMix.pct)
      const surface = bg.surface ?? bg.base
      const urgentIsFallback = accKey === t.urgent.fallbackAccent
      const urgent = urgentIsFallback ? t.urgent.fallback : t.urgent.base
      const urgentText = urgentIsFallback ? mix(urgent, inkMix.with, inkMix.pct) : t.urgent.ink[mode]
      const checks = {
        'texte/fond': ratio(t1, bg.base),
        'texte2/fond': ratio(t2, surface),
        'sur-accent': ratio(onAcc, acc),
        'accent-texte/fond': ratio(accText, surface),
        'urgent-texte/fond': ratio(urgentText, surface),
      }
      const failed = Object.entries(checks).filter(([, v]) => v < AA).map(([k]) => k)
      if (failed.length) failures++
      if (failed.includes('sur-accent')) proposals.add(`${theme} ${accKey}: ${acc} → ${suggest(acc, t.ink)}`)
      rows.push({ theme, bg: bgKey, accent: accKey, onAcc: onAcc === WHITE ? 'blanc' : 'encre', ...Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.toFixed(2)])), echec: failed.join(', ') || '—' })
    }
  }
}

console.table(rows)
for (const p of proposals) console.log('Ajustement proposé —', p)
console.log(failures ? `${failures} combinaison(s) sous ${AA}:1` : `50 combinaisons conformes (≥ ${AA}:1)`)
// Rappel : le texte tertiaire (--t3 / --tx3) est décoratif et n'est pas contrôlé ici.
process.exit(failures ? 1 : 0)
