import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

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
}

const FinancialChart = ({ data, label, currentValue, secondarySeries, height = 220 }: FinancialChartProps) => {
  if (data.length === 0) {
    return (
      <div className="dash-fchart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="dash-fchart__label">▸ {label}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune donnée</p>
      </div>
    )
  }

  const merged = secondarySeries ? data.map((d, i) => ({ ...d, secondary: secondarySeries[i]?.value })) : data

  return (
    <div className="dash-fchart" style={{ height }}>
      <div className="dash-fchart__label">▸ {label}</div>
      <div className="dash-fchart__price">{currentValue}</div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dash-fchart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="ts" stroke="#404040" fontSize={9} tickLine={false} axisLine={false} />
          <YAxis stroke="#404040" fontSize={9} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: 'rgba(14,165,233,0.4)', strokeDasharray: '3 3' }}
            contentStyle={{
              background: '#000',
              border: '1px solid rgba(14,165,233,0.4)',
              borderRadius: 6,
              fontSize: 11,
              boxShadow: '0 0 18px rgba(14,165,233,0.3)',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#0ea5e9"
            strokeWidth={1.8}
            fill="url(#dash-fchart-fill)"
            style={{ filter: 'drop-shadow(0 0 4px rgba(14,165,233,0.7))' }}
          />
          {secondarySeries && (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke="#8b5cf6"
              strokeWidth={1.4}
              strokeDasharray="4 2"
              fill="transparent"
              style={{ filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))' }}
            />
          )}
          {merged[0]?.volume !== undefined && (
            <Bar dataKey="volume" fill="rgba(14,165,233,0.4)" radius={[1, 1, 0, 0]} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default FinancialChart
