import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashKpiCard from './DashKpiCard'

describe('DashKpiCard', () => {
  it('affiche label, value, et la couleur accent en CSS variable', () => {
    const { container } = render(
      <DashKpiCard label="CA" value="45k€" accentColor="#ff0080" accentRgb="255, 0, 128" />
    )
    expect(screen.getByText('CA')).toBeTruthy()
    expect(screen.getByText('45k€')).toBeTruthy()
    const card = container.querySelector('.dash-kpi') as HTMLElement
    expect(card.style.getPropertyValue('--dash-kpi-accent')).toBe('#ff0080')
    expect(card.style.getPropertyValue('--dash-kpi-accent-rgb')).toBe('255, 0, 128')
  })

  it('affiche delta positif en vert', () => {
    render(<DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" delta={{ value: 12, direction: 'up' }} />)
    const delta = screen.getByText(/\+12%/)
    expect(delta.className).toContain('dash-kpi__delta')
    expect(delta.className).not.toContain('--neg')
  })

  it('affiche delta négatif en rouge', () => {
    render(<DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" delta={{ value: -3, direction: 'down' }} />)
    const delta = screen.getByText(/-3%/)
    expect(delta.className).toContain('dash-kpi__delta--neg')
  })

  it('affiche objectif en barre de progression', () => {
    render(<DashKpiCard label="CA" value="45k€" accentColor="#0ea5e9" accentRgb="14,165,233" objective={{ current: 45000, target: 60000, label: 'obj' }} />)
    expect(screen.getByText(/obj/)).toBeTruthy()
    expect(screen.getByText(/75%/)).toBeTruthy()
  })

  it('affiche une sparkline quand fournie', () => {
    const { container } = render(
      <DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" sparkline={[1,2,3,4,5]} />
    )
    expect(container.querySelector('.dash-kpi__sparkline svg')).toBeTruthy()
  })

  it('wrap dans un Link si to fourni', () => {
    render(
      <MemoryRouter>
        <DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" to="/x" />
      </MemoryRouter>
    )
    const link = screen.getByText('A').closest('a')
    expect(link?.getAttribute('href')).toBe('/x')
  })
})
