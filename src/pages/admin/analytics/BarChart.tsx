import React from 'react'

const BarChart = ({
  data,
  labels,
  colors,
}: {
  data: Record<string, number>
  labels: Record<string, string>
  colors: Record<string, string>
}) => {
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="analytics-bar-chart">
      {entries.map(([key, val]) => (
        <div key={key} className="analytics-bar-row">
          <span className="analytics-bar-label">{labels[key] || key}</span>
          <div className="analytics-bar-track">
            <div
              className="analytics-bar-fill"
              style={{ width: `${(val / max) * 100}%`, background: colors[key] || 'var(--primary)' }}
            />
          </div>
          <span className="analytics-bar-value">{val}</span>
        </div>
      ))}
    </div>
  )
}

export default BarChart
