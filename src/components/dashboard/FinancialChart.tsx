import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { ACCENT, categoricalAt, withAlpha } from '../../lib/chartColors'

export interface FinancialChartDatum {
  ts: string
  value: number
  volume?: number
}

interface FinancialChartProps {
  data: FinancialChartDatum[]
  label: string
  currentValue: string
  secondarySeries?: Array<{ ts: string; value: number }>
  height?: number
  timeline?: boolean
  formatValue?: (value: number) => string
}

const FinancialChart = ({
  data,
  label,
  currentValue,
  secondarySeries,
  height = 220,
  timeline = false,
  formatValue,
}: FinancialChartProps) => {
  const accent = timeline ? '#0ea5e9' : ACCENT
  if (data.length === 0) {
    return (
      <div className="dash-fchart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="dash-fchart__label">▸ {label}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune donnée</p>
      </div>
    )
  }

  const merged = secondarySeries ? data.map((d, i) => ({ ...d, secondary: secondarySeries[i]?.value })) : data
  // Les volumes restent dans le quart bas du graphique pour ne pas masquer la courbe.
  const volumeCeiling = Math.max(1, ...data.map((d) => d.volume ?? 0)) * 4

  return (
    <div className="dash-fchart" style={{ height }}>
      <div className="dash-fchart__label">▸ {label}</div>
      <div className="dash-fchart__price">{currentValue}</div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dash-fchart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="ts" stroke="#404040" fontSize={9} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#404040"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={timeline ? 80 : 40}
            tickFormatter={formatValue}
          />
          {timeline && <YAxis yAxisId="volume" orientation="right" hide domain={[0, volumeCeiling]} />}
          <Tooltip
            cursor={{ stroke: withAlpha(accent, 0.4), strokeDasharray: '3 3' }}
            formatter={(value, name) => {
              if (name === 'volume') return [value, timeline ? 'Éléments attendus' : name]
              return [formatValue ? formatValue(Number(value)) : value, timeline ? 'TTC attendu' : name]
            }}
            contentStyle={{
              background: '#000',
              border: `1px solid ${withAlpha(accent, 0.4)}`,
              borderRadius: timeline ? 0 : 6,
              fontSize: 11,
              boxShadow: timeline ? 'none' : `0 0 18px ${withAlpha(accent, 0.3)}`,
            }}
          />
          <Area
            type={timeline ? 'stepAfter' : 'monotone'}
            dataKey="value"
            stroke={accent}
            strokeWidth={1.8}
            fill="url(#dash-fchart-fill)"
            style={timeline ? undefined : { filter: `drop-shadow(0 0 4px ${withAlpha(accent, 0.7)})` }}
          />
          {secondarySeries && (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke={categoricalAt(3)}
              strokeWidth={1.4}
              strokeDasharray="4 2"
              fill="transparent"
              style={{ filter: `drop-shadow(0 0 3px ${withAlpha(categoricalAt(3), 0.6)})` }}
            />
          )}
          {merged[0]?.volume !== undefined && (
            <Bar
              dataKey="volume"
              yAxisId={timeline ? 'volume' : 0}
              fill={withAlpha(accent, 0.4)}
              radius={timeline ? 0 : [1, 1, 0, 0]}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default FinancialChart
