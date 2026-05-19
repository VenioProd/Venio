import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FinancialChart from './FinancialChart'

const data = [
  { ts: '2026-01-01', value: 100, volume: 10 },
  { ts: '2026-01-02', value: 120, volume: 15 },
  { ts: '2026-01-03', value: 110, volume: 12 },
]

describe('FinancialChart', () => {
  it('affiche le label et le price overlay', () => {
    render(<FinancialChart data={data} label="CA · 30j" currentValue="110€" />)
    expect(screen.getByText(/CA · 30j/)).toBeTruthy()
    expect(screen.getByText('110€')).toBeTruthy()
  })

  it('rend un SVG (recharts)', () => {
    const { container } = render(<FinancialChart data={data} label="X" currentValue="0" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('affiche un état vide si data vide', () => {
    render(<FinancialChart data={[]} label="X" currentValue="0" />)
    expect(screen.getByText(/aucune donnée/i)).toBeTruthy()
  })
})
