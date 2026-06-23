import React from 'react'

/**
 * Éléments graphiques brutalistes réutilisables (SVG/CSS).
 * Esthétique Monolithe : noir #0a0a0a, traits fins, accent lime #ccff00.
 * Tout est `aria-hidden` et `pointer-events:none` — pure structure, jamais de contenu.
 * Les couleurs sont câblées sur les tokens du thème (var(--border-color), var(--primary)).
 */

type DecoProps = {
  className?: string
  style?: React.CSSProperties
}

/** Grille blueprint plein cadre — colonnes + lignes fines. */
export const GridField: React.FC<DecoProps & { cols?: number; rows?: number }> = ({
  className = '',
  style,
  cols = 12,
  rows = 0,
}) => {
  const colLines = Array.from({ length: cols - 1 }, (_, i) => ((i + 1) / cols) * 100)
  const rowLines = rows > 0 ? Array.from({ length: rows - 1 }, (_, i) => ((i + 1) / rows) * 100) : []
  return (
    <svg
      className={`bd-grid ${className}`}
      style={style}
      aria-hidden="true"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {colLines.map((x) => (
        <line key={`c${x}`} x1={x} y1="0" x2={x} y2="100" />
      ))}
      {rowLines.map((y) => (
        <line key={`r${y}`} x1="0" y1={y} x2="100" y2={y} />
      ))}
    </svg>
  )
}

/** Grain / bruit organique en SVG (feTurbulence) — donne de la matière au noir plat. */
export const GrainOverlay: React.FC<DecoProps & { opacity?: number }> = ({ className = '', style, opacity = 0.05 }) => (
  <svg className={`bd-grain ${className}`} style={{ opacity, ...style }} aria-hidden="true">
    <filter id="bd-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#bd-noise)" />
  </svg>
)

/** Repères de coupe (crop marks) — quatre coins, comme en typographie d'impression. */
export const CropMarks: React.FC<DecoProps> = ({ className = '', style }) => (
  <div className={`bd-crops ${className}`} style={style} aria-hidden="true">
    <span className="bd-crop bd-crop--tl" />
    <span className="bd-crop bd-crop--tr" />
    <span className="bd-crop bd-crop--bl" />
    <span className="bd-crop bd-crop--br" />
  </div>
)

/** Petit viseur / crosshair lime — marque un point précis. */
export const Crosshair: React.FC<DecoProps> = ({ className = '', style }) => (
  <svg className={`bd-cross ${className}`} style={style} aria-hidden="true" viewBox="0 0 24 24">
    <line x1="12" y1="0" x2="12" y2="24" />
    <line x1="0" y1="12" x2="24" y2="12" />
    <circle cx="12" cy="12" r="4" />
  </svg>
)

/**
 * Axe de données — clin d'œil aux timelines financières (style maison).
 * Ligne de base + ticks réguliers + courbe « area » discrète.
 */
export const DataAxis: React.FC<DecoProps & { points?: number[] }> = ({
  className = '',
  style,
  points = [22, 18, 30, 26, 44, 38, 58, 52, 70, 64, 86],
}) => {
  const n = points.length
  const w = 100
  const h = 40
  const coords = points.map((p, i) => [(i / (n - 1)) * w, h - (p / 100) * h] as const)
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w} ${h} L0 ${h} Z`
  return (
    <svg
      className={`bd-axis ${className}`}
      style={style}
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <path className="bd-axis-area" d={area} />
      <path className="bd-axis-line" d={line} />
      {coords.map(([x], i) => (
        <line key={i} className="bd-axis-tick" x1={x} y1={h - 2} x2={x} y2={h} />
      ))}
      <line className="bd-axis-base" x1="0" y1={h} x2={w} y2={h} />
    </svg>
  )
}

/** Bandeau de marqueurs « scanline » horizontaux — texture de section. */
export const ScanField: React.FC<DecoProps> = ({ className = '', style }) => (
  <div className={`bd-scan ${className}`} style={style} aria-hidden="true" />
)
