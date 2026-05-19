import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TwoColumnGrid from './TwoColumnGrid'

describe('TwoColumnGrid', () => {
  it('rend left et right sur desktop', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1200 })
    window.dispatchEvent(new Event('resize'))
    render(<TwoColumnGrid left={<div>L</div>} right={<div>R</div>} />)
    expect(screen.getByText('L')).toBeTruthy()
    expect(screen.getByText('R')).toBeTruthy()
  })

  it('rend en tabs sur mobile (< 900px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 })
    window.dispatchEvent(new Event('resize'))
    render(<TwoColumnGrid left={<div>L</div>} right={<div>R</div>} />)
    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByText('Analytics')).toBeTruthy()
    // par défaut Action est actif → L visible, R caché
    expect(screen.getByText('L')).toBeTruthy()
    fireEvent.click(screen.getByText('Analytics'))
    expect(screen.getByText('R')).toBeTruthy()
  })
})
