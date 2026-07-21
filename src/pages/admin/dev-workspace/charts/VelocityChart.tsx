import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ACCENT, ACCENT_BRIGHT, GRID_LINE, INK_MUTED, withAlpha } from '../../../../lib/chartColors'
import type { VelocityPoint } from './aggregate'

interface VelocityTooltipPayload {
  payload?: VelocityPoint
}

const VelocityTooltip = ({ active, payload }: { active?: boolean; payload?: VelocityTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  return (
    <div className="dev-viz-tooltip">
      <strong>{point.label}</strong>
      <span>
        {point.count} issue{point.count > 1 ? 's' : ''} terminée{point.count > 1 ? 's' : ''}
      </span>
    </div>
  )
}

interface VelocityChartProps {
  data: VelocityPoint[]
  height?: number
}

/** Vélocité — aire recharts des issues terminées par jour (14j), dérivée de completedAt. */
export const VelocityChart = ({ data, height = 140 }: VelocityChartProps) => {
  const last = data[data.length - 1]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="dev-velocity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT_BRIGHT} stopOpacity={0.42} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_LINE} strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          stroke={INK_MUTED}
          fontSize={9}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis stroke={INK_MUTED} fontSize={9} tickLine={false} axisLine={false} width={22} allowDecimals={false} />
        <Tooltip content={<VelocityTooltip />} cursor={{ stroke: withAlpha(ACCENT, 0.4), strokeDasharray: '3 3' }} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={ACCENT_BRIGHT}
          strokeWidth={1.6}
          fill="url(#dev-velocity-fill)"
          dot={false}
          activeDot={{ r: 4, fill: ACCENT_BRIGHT, stroke: '#000', strokeWidth: 1 }}
          isAnimationActive={false}
        />
        {last && (
          <ReferenceDot x={last.label} y={last.count} r={4} fill={ACCENT_BRIGHT} stroke="#000" strokeWidth={1.5} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default VelocityChart
