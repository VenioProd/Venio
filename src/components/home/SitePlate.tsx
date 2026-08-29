/**
 * Élévation cotée d'un site — schéma du bloc « Relevé ».
 * Un dessin technique, pas un graphique : il ne porte aucune donnée
 * mesurée, seulement les trois cotes du relevé, numérotées 01 à 03.
 * Les couleurs viennent toutes de la feuille (classes CSS), jamais d'attributs.
 */

const BADGES: { n: string; cx: number; cy: number }[] = [
  { n: '01', cx: 322, cy: 318 },
  { n: '02', cx: 56, cy: 30 },
  { n: '03', cx: 363, cy: 32 },
]

const SitePlate = () => (
  <figure className="mh-plate">
    <figcaption className="mh-plate-cap">
      <span className="mh-mono">Un site Venio</span>
      <span className="mh-mono">01 · 02 · 03</span>
    </figcaption>

    <svg
      viewBox="0 0 600 336"
      role="img"
      aria-label="Schéma d'un site web, annoté de trois repères : le design est dessiné pour vous, le code vous appartient, rien n'est bloqué techniquement."
    >
      {/* ─── l'objet mesuré ─── */}
      <rect className="mh-pl-frame" x="96" y="52" width="452" height="200" rx="5" />
      <rect className="mh-pl-node" x="112" y="68" width="420" height="18" rx="5" />
      <circle className="mh-pl-dot" cx="506" cy="77" r="2.6" />
      <circle className="mh-pl-dot" cx="516" cy="77" r="2.6" />
      <circle className="mh-pl-dot" cx="526" cy="77" r="2.6" />
      <rect className="mh-pl-node mh-pl-node--live" x="112" y="98" width="262" height="62" rx="5" />
      <rect className="mh-pl-node" x="386" y="98" width="146" height="62" rx="5" />
      <rect className="mh-pl-node" x="112" y="172" width="132" height="62" rx="5" />
      <rect className="mh-pl-node" x="256" y="172" width="132" height="62" rx="5" />
      <rect className="mh-pl-node" x="400" y="172" width="132" height="62" rx="5" />

      {/* ─── repère 01 : le design ─── */}
      <line className="mh-pl-ext" x1="96" y1="256" x2="96" y2="300" />
      <line className="mh-pl-ext" x1="548" y1="256" x2="548" y2="300" />
      <line className="mh-pl-dim" x1="96" y1="288" x2="274" y2="288" />
      <line className="mh-pl-dim" x1="370" y1="288" x2="548" y2="288" />
      <path className="mh-pl-arrow" d="M 96 288 l 9 -3.6 v 7.2 z" />
      <path className="mh-pl-arrow" d="M 548 288 l -9 -3.6 v 7.2 z" />
      <text className="mh-pl-t mh-pl-t--live" x="322" y="292" textAnchor="middle">
        Dessiné pour vous
      </text>

      {/* ─── repère 02 : le code vous appartient ─── */}
      <line className="mh-pl-ext" x1="92" y1="52" x2="44" y2="52" />
      <line className="mh-pl-ext" x1="92" y1="252" x2="44" y2="252" />
      <line className="mh-pl-dim" x1="56" y1="52" x2="56" y2="104" />
      <line className="mh-pl-dim" x1="56" y1="200" x2="56" y2="252" />
      <path className="mh-pl-arrow" d="M 56 52 l -3.6 9 h 7.2 z" />
      <path className="mh-pl-arrow" d="M 56 252 l -3.6 -9 h 7.2 z" />
      <text className="mh-pl-t" x="56" y="152" textAnchor="middle" transform="rotate(-90 56 152)">
        Le code est à vous
      </text>

      {/* ─── repère 03 : aucune limite technique ─── */}
      <circle className="mh-pl-anchor" cx="322" cy="77" r="3.2" />
      <path className="mh-pl-lead" d="M 322 77 V 32 H 352" />
      <text className="mh-pl-t" x="378" y="36">
        Rien n’est bloqué
      </text>

      {/* ─── repères, keyés sur les relevés ─── */}
      {BADGES.map((b) => (
        <g key={b.n}>
          <circle className="mh-pl-badge" cx={b.cx} cy={b.cy} r="9.5" />
          <text className="mh-pl-t mh-pl-t--badge" x={b.cx} y={b.cy + 3.4} textAnchor="middle">
            {b.n}
          </text>
        </g>
      ))}
    </svg>
  </figure>
)

export default SitePlate
