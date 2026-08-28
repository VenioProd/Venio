/**
 * Radar de preuve — bloc 04 de la home « Instrument ».
 * Angle : la famille (SaaS édités / sites et plateformes).
 * Rayon : l'état — anneau intérieur pour ce qui tourne, anneau extérieur
 * pour ce qui est en construction.
 * Vue publique du radar : ce qui est volontairement discret n'y figure pas.
 *
 * Le schéma est décoratif ; le registre qui le suit porte la même
 * information en texte et sert de repli sur petit écran.
 */

type Asset = {
  name: string
  sub: string
  deg: number
  ring: 0 | 1
  status: string
}

const SAAS: Asset[] = [
  { name: 'Jiraya', sub: 'formation', deg: -145, ring: 0, status: 'En production' },
  { name: 'LeadForge', sub: 'acquisition', deg: -110, ring: 1, status: 'En construction' },
  { name: 'Lucid', sub: 'comptabilité', deg: -70, ring: 1, status: 'En construction' },
  { name: 'Yumi', sub: 'RH', deg: -35, ring: 0, status: 'En production' },
]

const SITES: Asset[] = [
  { name: 'Decisio', sub: 'juridique', deg: 25, ring: 0, status: 'En ligne' },
  { name: 'Formatio', sub: 'formation', deg: 60, ring: 0, status: 'En ligne' },
  { name: 'Creatio', sub: 'pédagogie', deg: 90, ring: 0, status: 'En ligne' },
  { name: 'Absys', sub: 'client', deg: 120, ring: 0, status: 'En ligne' },
  { name: 'Cauchemar', sub: 'client', deg: 155, ring: 0, status: 'En ligne' },
]

const CX = 450
const CY = 300
const RINGS = [118, 200] as const
const OUT = 200
const CORE = 34
const SPIN = 12

const rad = (deg: number) => (deg * Math.PI) / 180
const at = (deg: number, r: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY + r * Math.sin(rad(deg)) })
const sweepDelay = (deg: number) => `${(((deg + 90 + 360) % 360) / 360) * SPIN - SPIN}s`

const Blip = ({ asset }: { asset: Asset }) => {
  const { x, y } = at(asset.deg, RINGS[asset.ring])
  const cos = Math.cos(rad(asset.deg))
  const far = Math.abs(cos) > 0.25
  const anchor = far ? (cos > 0 ? 'start' : 'end') : 'middle'
  const lx = far ? x + (cos > 0 ? 14 : -14) : x
  const ly = far ? y - 1 : Math.sin(rad(asset.deg)) > 0 ? y + 22 : y - 15
  const delay = sweepDelay(asset.deg)
  const live = asset.ring === 0

  return (
    <g className={live ? 'mh-rd-asset is-live' : 'mh-rd-asset'}>
      <circle className="mh-rd-halo" cx={x} cy={y} r="4" style={{ animationDelay: delay }} />
      <circle className="mh-rd-blip" cx={x} cy={y} r="3.6" style={{ animationDelay: delay }} />
      <text className="mh-rd-name" x={lx} y={ly} textAnchor={anchor} style={{ animationDelay: delay }}>
        {asset.name}
      </text>
      <text className="mh-rd-sub" x={lx} y={ly + 12} textAnchor={anchor}>
        {asset.sub}
      </text>
    </g>
  )
}

const ProofRadar = () => {
  const cone = at(-30, OUT)

  return (
    <div className="mh-radar">
      <figure className="mh-radar-face">
        <figcaption className="mh-radar-cap">
          <span className="mh-mono">Angle : la famille · rayon : l'état</span>
          <span className="mh-mono">Vue publique</span>
        </figcaption>

        <svg
          viewBox="0 0 900 600"
          role="img"
          aria-label="Radar à deux quartiers. En haut, les SaaS édités : Jiraya et Yumi sur l'anneau intérieur, en production ; LeadForge et Lucid sur l'anneau extérieur, en construction. En bas, les sites et plateformes : Decisio, Formatio, Creatio, Absys et Cauchemar, tous en ligne sur l'anneau intérieur."
        >
          <defs>
            <linearGradient id="mh-radar-cone" x1="0" y1="0" x2="1" y2="0">
              <stop className="mh-rd-cone-a" offset="0%" />
              <stop className="mh-rd-cone-b" offset="100%" />
            </linearGradient>
          </defs>

          <circle className="mh-rd-field" cx={CX} cy={CY} r={OUT} />
          {RINGS.map((r) => (
            <circle key={r} className="mh-rd-ring" cx={CX} cy={CY} r={r} />
          ))}
          <line className="mh-rd-divider" x1={CX - OUT} y1={CY} x2={CX - CORE - 6} y2={CY} />
          <line className="mh-rd-divider" x1={CX + CORE + 6} y1={CY} x2={CX + OUT} y2={CY} />

          <g className="mh-radar-sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <path
              d={`M ${CX} ${CY} L ${CX} ${CY - OUT} A ${OUT} ${OUT} 0 0 1 ${cone.x} ${cone.y} Z`}
              fill="url(#mh-radar-cone)"
            />
            <line className="mh-rd-beam" x1={CX} y1={CY} x2={CX} y2={CY - OUT} />
          </g>

          <circle className="mh-rd-core" cx={CX} cy={CY} r={CORE} />
          <text className="mh-rd-core-t" x={CX} y={CY + 4} textAnchor="middle">
            VENIO
          </text>

          <text className="mh-rd-sector" x={CX} y="66" textAnchor="middle">
            SaaS édités
          </text>
          <text className="mh-rd-sector-sub" x={CX} y="80" textAnchor="middle">
            produits qui nous appartiennent
          </text>
          <text className="mh-rd-sector" x={CX} y="536" textAnchor="middle">
            Sites &amp; plateformes
          </text>
          <text className="mh-rd-sector-sub" x={CX} y="550" textAnchor="middle">
            marques maison et clients publiés
          </text>

          {[...SAAS, ...SITES].map((asset) => (
            <Blip key={asset.name} asset={asset} />
          ))}

          <line className="mh-rd-rule" x1="20" y1="578" x2="880" y2="578" />
          <circle className="mh-rd-key mh-rd-key--live" cx="26" cy="594" r="3.4" />
          <text className="mh-rd-legend" x="40" y="598">
            Anneau intérieur — ça tourne aujourd'hui
          </text>
          <circle className="mh-rd-key" cx="446" cy="594" r="3.4" />
          <text className="mh-rd-legend" x="460" y="598">
            Anneau extérieur — en construction
          </text>
        </svg>
      </figure>

      <div className="mh-reg">
        <div className="mh-reg-group">
          <span className="mh-mono mh-reg-title">SaaS édités</span>
          <ul>
            {SAAS.map((asset) => (
              <li key={asset.name} className={asset.ring === 0 ? 'is-live' : ''}>
                <b>{asset.name}</b>
                <span className="mh-reg-sub">{asset.sub}</span>
                <span className="mh-mono mh-reg-status">{asset.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mh-reg-group">
          <span className="mh-mono mh-reg-title">Sites &amp; plateformes</span>
          <ul>
            {SITES.map((asset) => (
              <li key={asset.name} className={asset.ring === 0 ? 'is-live' : ''}>
                <b>{asset.name}</b>
                <span className="mh-reg-sub">{asset.sub}</span>
                <span className="mh-mono mh-reg-status">{asset.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ProofRadar
