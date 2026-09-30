import { useId } from 'react'
import '../../styles/monolithe-home.css'

/**
 * Radar de preuve : ce que Venio a construit et fait tourner.
 * Angle : la famille (nos logiciels / nos sites), lue depuis le haut, dans le
 * sens des aiguilles. Rayon : l'état — anneau extérieur pour ce qui est en
 * ligne, anneau intérieur pour ce qui est en construction.
 * Le faisceau tourne ; quand il passe sur un projet, une onde en part.
 * Arr0w et Virendys n'y figurent pas : discrétion assumée.
 *
 * Le schéma est décoratif (un seul aria-label) ; les deux listes à côté
 * portent la même information en texte, et servent de repli sans animation.
 * Composant autonome : sa feuille (.mh-radar…) ne dépend d'aucune page.
 */

type Asset = {
  name: string
  sub: string
  /** Angle en degrés depuis le haut, sens horaire. */
  deg: number
  ring: 0 | 1
  status: string
}

const SAAS: Asset[] = [
  { name: 'Jiraya', sub: 'formation', deg: -145, ring: 0, status: 'En ligne' },
  { name: 'LeadForge', sub: 'acquisition', deg: -110, ring: 1, status: 'En construction' },
  { name: 'Lucid', sub: 'comptabilité', deg: -70, ring: 1, status: 'En construction' },
  { name: 'Yumi', sub: 'RH', deg: -35, ring: 0, status: 'En ligne' },
]

const SITES: Asset[] = [
  { name: 'Decisio', sub: 'juridique', deg: 25, ring: 0, status: 'En ligne' },
  { name: 'Formatio', sub: 'formation', deg: 60, ring: 0, status: 'En ligne' },
  { name: 'Creatio', sub: 'pédagogie', deg: 90, ring: 0, status: 'En ligne' },
  { name: 'Absys', sub: 'client', deg: 120, ring: 0, status: 'En ligne' },
  { name: 'Cauchemar', sub: 'client', deg: 155, ring: 0, status: 'En ligne' },
]

const C = 200
const SPIN = 6 // secondes par tour : doit rester égal à l'animation CSS
const R_LIVE = 150
const R_WIP = 85

const at = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) }
}

const Blip = ({ asset }: { asset: Asset }) => {
  const wip = asset.ring === 1
  const { x, y } = at(asset.deg, wip ? R_WIP : R_LIVE)
  const right = Math.sin((asset.deg * Math.PI) / 180) >= 0
  // L'onde part quand le faisceau passe : retard = part du tour déjà parcourue.
  const delay = `${((((asset.deg % 360) + 360) % 360) / 360) * SPIN}s`

  return (
    <g>
      <circle className="mh-rd-ping" cx={x} cy={y} r="5" style={{ animationDelay: delay }} />
      <circle className={wip ? 'mh-rd-blip is-wip' : 'mh-rd-blip'} cx={x} cy={y} r={wip ? 4 : 4.5} />
      <text
        className={wip ? 'mh-rd-name is-wip' : 'mh-rd-name'}
        x={x + (right ? 10 : -10)}
        y={y + 4}
        textAnchor={right ? 'start' : 'end'}
      >
        {asset.name}
      </text>
    </g>
  )
}

const Register = ({ title, assets }: { title: string; assets: Asset[] }) => (
  <div className="mh-rd-group">
    <h4 className="mh-rd-title">{title}</h4>
    <ul>
      {assets.map((asset) => (
        <li key={asset.name} className={asset.ring === 1 ? 'is-wip' : undefined}>
          {asset.name}
          <span>
            {asset.sub} · {asset.status.toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  </div>
)

const ProofRadar = () => {
  // Un id par instance : deux radars sur une page ne partagent pas leur dégradé.
  const gradient = `mh-rd-sweep-${useId().replace(/:/g, '')}`

  return (
    <div className="mh-radar">
      <div className="mh-radar-face">
        <svg
          viewBox="0 0 400 400"
          role="img"
          aria-label="Ce que Venio a construit. Nos logiciels : Jiraya et Yumi sont en ligne, LeadForge et Lucid en construction. Nos sites : Decisio, Formatio, Creatio, Absys et Cauchemar sont tous en ligne."
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
              <stop className="mh-rd-cone-a" offset="0" />
              <stop className="mh-rd-cone-b" offset="1" />
            </linearGradient>
          </defs>

          {[60, 110, 160, 190].map((r) => (
            <circle key={r} className="mh-rd-ring" cx={C} cy={C} r={r} />
          ))}
          <line className="mh-rd-axis" x1={C} y1="10" x2={C} y2="390" />
          <line className="mh-rd-axis" x1="10" y1={C} x2="390" y2={C} />
          <text className="mh-rd-lbl" x="206" y="148">
            En construction
          </text>
          <text className="mh-rd-lbl" x="206" y="46">
            En ligne
          </text>

          <g className="mh-rd-sweep">
            <path
              d="M200 200 L200 10 A190 190 0 0 1 334.4 65.6 Z"
              fill={`url(#${gradient})`}
              transform="rotate(-45 200 200)"
            />
            <line className="mh-rd-beam" x1={C} y1={C} x2={C} y2="10" />
          </g>

          {[...SAAS, ...SITES].map((asset) => (
            <Blip key={asset.name} asset={asset} />
          ))}
          <circle className="mh-rd-core" cx={C} cy={C} r="3" />
        </svg>
      </div>

      <div className="mh-rd-lists">
        <Register title="Nos logiciels" assets={SAAS} />
        <Register title="Nos sites" assets={SITES} />
      </div>
    </div>
  )
}

export default ProofRadar
