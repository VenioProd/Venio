import { ACCENT, ACCENT_BRIGHT } from '../../../../lib/chartColors'

interface CompletionRingProps {
  percent: number
  size?: number
  strokeWidth?: number
}

/** Anneau de complétion — dégradé cyan ACCENT→ACCENT_BRIGHT avec léger glow. */
export const CompletionRing = ({ percent, size = 96, strokeWidth = 10 }: CompletionRingProps) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const dash = (clamped / 100) * c
  const gradId = 'dev-ring-grad'
  const glowId = 'dev-ring-glow'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Complétion globale ${clamped}%`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ACCENT} />
          <stop offset="100%" stopColor={ACCENT_BRIGHT} />
        </linearGradient>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth={strokeWidth} />
      {clamped > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#${glowId})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink-strong)"
        fontSize={size * 0.22}
        fontWeight={750}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {clamped}%
      </text>
    </svg>
  )
}

export default CompletionRing
