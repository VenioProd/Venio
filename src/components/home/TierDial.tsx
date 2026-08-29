import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { type VenioIconName } from '../VenioIcon'

/**
 * Cadran des cinq paliers — bloc 03 de la home « Instrument ».
 * Une graduation par palier sur un arc, un seul palier détaillé à la fois.
 * Le panneau ne montre que des données réelles : le nom du palier, son
 * accroche, sa cible et ce qui est inclus. Aucun prix, aucun délai.
 *
 * Clavier : le groupe se comporte comme un groupe de boutons radio —
 * flèches pour changer de graduation, Origine / Fin pour aller aux extrêmes.
 */

export type HomeTier = {
  num: string
  name: string
  icon: VenioIconName
  tag: string
  pourQui: string
  incl: string[]
  featured: boolean
}

/* Géométrie : les cinq graduations sont sur le même cercle, sinon
   l'arc se redimensionne en silence. Centre bas, ouverture symétrique. */
const CX = 450
const CY = 831.3
const RADIUS = 700
const SPAN = 33.85

const rad = (deg: number) => (deg * Math.PI) / 180
const at = (deg: number, r: number) => ({
  x: CX + r * Math.sin(rad(deg)),
  y: CY - r * Math.cos(rad(deg)),
})

type Mark = {
  deg: number
  point: { x: number; y: number }
  tickEnd: { x: number; y: number }
  label: { x: number; y: number }
  anchor: 'start' | 'middle' | 'end'
  arc: string | null
}

const buildMarks = (count: number): Mark[] => {
  const start = at(-SPAN, RADIUS)
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? 0 : -SPAN + (i * 2 * SPAN) / (count - 1)
    const point = at(deg, RADIUS)
    const sin = Math.sin(rad(deg))
    return {
      deg,
      point,
      tickEnd: at(deg, RADIUS + 16),
      label: at(deg, RADIUS + 52),
      anchor: sin < -0.3 ? 'end' : sin > 0.3 ? 'start' : 'middle',
      arc: i === 0 ? null : `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${point.x} ${point.y}`,
    }
  })
}

const TierDial = ({ tiers }: { tiers: HomeTier[] }) => {
  const marks = useMemo(() => buildMarks(tiers.length), [tiers.length])
  const initial = Math.max(
    0,
    tiers.findIndex((t) => t.featured),
  )
  const [active, setActive] = useState(initial)
  const hits = useRef<(SVGCircleElement | null)[]>([])
  const scroller = useRef<HTMLDivElement | null>(null)

  /* Sur petit écran l'arc défile : on amène la graduation active au centre. */
  useEffect(() => {
    const box = scroller.current
    const hit = hits.current[active]
    if (!box || !hit || box.scrollWidth <= box.clientWidth) return
    const boxRect = box.getBoundingClientRect()
    const hitRect = hit.getBoundingClientRect()
    const left = box.scrollLeft + (hitRect.left + hitRect.width / 2 - boxRect.left) - boxRect.width / 2
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
  }, [active])

  const move = (index: number) => {
    setActive(index)
    hits.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    const last = tiers.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else if (event.key === 'Enter' || event.key === ' ') next = index
    if (next === null) return
    event.preventDefault()
    move(next)
  }

  const tier = tiers[active]
  const mark = marks[active]

  return (
    <div className="mh-dial">
      <div className="mh-dial-scroll" ref={scroller}>
        <div className="mh-dial-face">
          <svg viewBox="-116 62 1132 274" aria-hidden="true" focusable="false">
            <path
              className="mh-dial-track"
              d={`M ${marks[0].point.x} ${marks[0].point.y} A ${RADIUS} ${RADIUS} 0 0 1 ${marks[marks.length - 1].point.x} ${marks[marks.length - 1].point.y}`}
            />
            {mark.arc && <path key={active} className="mh-dial-live" pathLength={1} d={mark.arc} />}

            {marks.map((m, i) => (
              <g key={tiers[i].num}>
                <line
                  className={`mh-dial-tick${i === active ? ' is-on' : ''}`}
                  x1={m.point.x}
                  y1={m.point.y}
                  x2={m.tickEnd.x}
                  y2={m.tickEnd.y}
                />
                <text
                  className={`mh-dial-label${i === active ? ' is-on' : ''}`}
                  x={m.label.x}
                  y={m.label.y}
                  textAnchor={m.anchor}
                >
                  {tiers[i].num} · {tiers[i].name.toLowerCase()}
                </text>
              </g>
            ))}

            <circle className="mh-dial-halo" cx={mark.point.x} cy={mark.point.y} r="13" />
            <circle className="mh-dial-marker" cx={mark.point.x} cy={mark.point.y} r="4.5" />

            <line
              className="mh-dial-axis"
              x1={marks[0].point.x}
              y1="298"
              x2={marks[marks.length - 1].point.x}
              y2="298"
            />
            <line className="mh-dial-axis" x1={marks[0].point.x} y1="293" x2={marks[0].point.x} y2="303" />
            <line
              className="mh-dial-axis"
              x1={marks[marks.length - 1].point.x}
              y1="293"
              x2={marks[marks.length - 1].point.x}
              y2="303"
            />
            <text className="mh-dial-scale" x={marks[0].point.x} y="320">
              Être trouvé
            </text>
            <text className="mh-dial-scale" x={marks[marks.length - 1].point.x} y="320" textAnchor="end">
              Faire tourner l'activité
            </text>
          </svg>

          {/* Les cibles interactives sont dans un calque séparé pour rester
            hors du SVG décoratif et garder une sémantique lisible. */}
          <svg
            className="mh-dial-hits"
            viewBox="-116 62 1132 274"
            role="radiogroup"
            aria-label="Cinq formules de sites web"
          >
            {marks.map((m, i) => (
              <circle
                key={tiers[i].num}
                ref={(node) => {
                  hits.current[i] = node
                }}
                className="mh-dial-hit"
                cx={m.point.x}
                cy={m.point.y}
                r="30"
                role="radio"
                aria-checked={i === active}
                aria-label={`Formule ${tiers[i].num} — ${tiers[i].name}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => move(i)}
                onKeyDown={(event) => onKeyDown(event, i)}
              />
            ))}
          </svg>
        </div>
      </div>

      <div className="mh-tier">
        <div className="mh-tier-main">
          <span className="mh-mono mh-tier-num">
            Formule {tier.num}
            {tier.featured ? ' — la plus choisie' : ''}
          </span>
          <h3 className="mh-tier-name">{tier.name}</h3>
          <p className="mh-tier-tag">{tier.tag}</p>
          <p className="mh-tier-who">{tier.pourQui}</p>
        </div>

        <div className="mh-tier-side">
          <span className="mh-mono mh-tier-side-label">Ce qui est inclus</span>
          <ul className="mh-tier-incl">
            {tier.incl.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link className="mh-tier-go" to="/contact" data-analytics-cta="home_dial_chiffrage">
            Demander un chiffrage <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default TierDial
