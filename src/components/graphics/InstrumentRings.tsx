import './graphics.css'

/**
 * Anneaux de mesure gradués, en fond de hero. Décor pur : aria-hidden, aucune
 * information. L'anneau extérieur tourne lentement, l'intérieur en sens
 * inverse (graphics.css). Le parent doit être `position: relative` avec
 * `overflow: hidden` : le composant se pose en absolu, à droite, sous le contenu.
 */

const C = 340

type Tick = {
  x1: number
  y1: number
  x2: number
  y2: number
  major: boolean
  label?: { x: number; y: number; text: string }
}

const buildTicks = (): Tick[] => {
  const ticks: Tick[] = []
  for (let a = 0; a < 360; a += 3) {
    const major = a % 30 === 0
    const rad = (a * Math.PI) / 180
    const r2 = major ? 302 : 312
    const round = (n: number) => Math.round(n * 10) / 10
    ticks.push({
      x1: round(C + 320 * Math.sin(rad)),
      y1: round(C - 320 * Math.cos(rad)),
      x2: round(C + r2 * Math.sin(rad)),
      y2: round(C - r2 * Math.cos(rad)),
      major,
      label: major
        ? {
            x: round(C + 288 * Math.sin(rad)),
            y: round(C - 288 * Math.cos(rad) + 3),
            text: String(a).padStart(3, '0'),
          }
        : undefined,
    })
  }
  return ticks
}

export interface InstrumentRingsProps {
  /** Classe ajoutée, par exemple pour repositionner les anneaux. */
  className?: string
}

const TICKS = buildTicks()

const InstrumentRings = ({ className }: InstrumentRingsProps) => {
  const ticks = TICKS

  return (
    <svg
      className={className ? `vn-rings ${className}` : 'vn-rings'}
      viewBox="0 0 680 680"
      aria-hidden="true"
      focusable="false"
    >
      <g className="vn-rings__out">
        <circle className="vn-rings__edge" cx={C} cy={C} r="320" />
        {ticks.map((t) => (
          <line
            key={`${t.x1}-${t.y1}`}
            className={t.major ? 'vn-rings__tick vn-rings__tick--major' : 'vn-rings__tick'}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
          />
        ))}
        {ticks.map(
          (t) =>
            t.label && (
              <text key={t.label.text} className="vn-rings__label" x={t.label.x} y={t.label.y} textAnchor="middle">
                {t.label.text}
              </text>
            ),
        )}
      </g>
      <g className="vn-rings__in">
        <circle className="vn-rings__dots" cx={C} cy={C} r="230" />
        <circle className="vn-rings__dash" cx={C} cy={C} r="150" />
        <path className="vn-rings__arc" d="M340 90 A250 250 0 0 1 590 340" />
      </g>
      <line className="vn-rings__cross" x1="340" y1="300" x2="340" y2="380" />
      <line className="vn-rings__cross" x1="300" y1="340" x2="380" y2="340" />
      <circle className="vn-rings__core" cx={C} cy={C} r="3" />
    </svg>
  )
}

export default InstrumentRings
