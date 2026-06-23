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
          {/* Accent lime Monolithe (#ccff00) — structure « financial timeline »
             conservée (area + volume + crosshair + grille), glows retirés. */}
          <defs>
            <linearGradient id="dash-fchart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ccff00" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#ccff00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="ts" stroke="#6e6e6e" fontSize={9} tickLine={false} axisLine={false} />
          <YAxis stroke="#6e6e6e" fontSize={9} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: 'rgba(204,255,0,0.5)', strokeDasharray: '3 3' }}
            contentStyle={{
              background: '#141414',
              border: '1px solid rgba(204,255,0,0.4)',
              borderRadius: 0,
              fontSize: 11,
              boxShadow: 'none',
            }}
          />
          <Area type="monotone" dataKey="value" stroke="#ccff00" strokeWidth={1.8} fill="url(#dash-fchart-fill)" />
          {secondarySeries && (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke="#9b9b9b"
              strokeWidth={1.4}
              strokeDasharray="4 2"
              fill="transparent"
            />
          )}
          {merged[0]?.volume !== undefined && (
            <Bar dataKey="volume" fill="rgba(204,255,0,0.28)" radius={[0, 0, 0, 0]} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default FinancialChart
