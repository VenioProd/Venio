interface SparklineProps {
  values: number[]
  color: string
  width?: number
  height?: number
}

const Sparkline = ({ values, color, width = 100, height = 22 }: SparklineProps) => {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })
  const d = `M ${points.join(' L ')}`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} aria-hidden="true">
      <path
        d={d}
        stroke={color}
        strokeWidth={1.2}
        fill="none"
        style={{ filter: `drop-shadow(0 0 2px ${color}88)` }}
      />
    </svg>
  )
}

export default Sparkline
