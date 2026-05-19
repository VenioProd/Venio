import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KpiGrid2x2 from './KpiGrid2x2'

const kpis = [
  { label: 'CA', value: '45k€', accentColor: '#ff0080', accentRgb: '255,0,128' },
  { label: 'Pipeline', value: '128k€', accentColor: '#8b5cf6', accentRgb: '139,92,246' },
  { label: 'Leads', value: 12, accentColor: '#f59e0b', accentRgb: '245,158,11' },
  { label: 'Projets', value: 22, accentColor: '#22c55e', accentRgb: '34,197,94' },
]

describe('KpiGrid2x2', () => {
  it('rend 4 cartes', () => {
    const { container } = render(<KpiGrid2x2 kpis={kpis} />)
    expect(container.querySelectorAll('.dash-kpi')).toHaveLength(4)
  })

  it('passe les props delta à chaque carte', () => {
    const kpisWithDeltas = kpis.map((k, i) => ({
      ...k,
      delta: { value: (i + 1) * 3, direction: 'up' as const },
    }))
    render(<KpiGrid2x2 kpis={kpisWithDeltas} />)
    expect(screen.getByText(/\+12%/)).toBeTruthy()  // 4th card has +12
  })

  it('rend les labels visibles', () => {
    render(<KpiGrid2x2 kpis={kpis} />)
    expect(screen.getByText('CA')).toBeTruthy()
    expect(screen.getByText('Pipeline')).toBeTruthy()
    expect(screen.getByText('Leads')).toBeTruthy()
    expect(screen.getByText('Projets')).toBeTruthy()
  })
})
