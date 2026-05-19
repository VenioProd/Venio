import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PeriodSelector from './PeriodSelector'

describe('PeriodSelector', () => {
  it('rend les 4 chips', () => {
    render(<PeriodSelector value="30d" onChange={() => {}} />)
    expect(screen.getByText('7j')).toBeTruthy()
    expect(screen.getByText('30j')).toBeTruthy()
    expect(screen.getByText('90j')).toBeTruthy()
    expect(screen.getByText('YTD')).toBeTruthy()
  })

  it('marque la chip active', () => {
    render(<PeriodSelector value="90d" onChange={() => {}} />)
    const chip90 = screen.getByText('90j')
    expect(chip90.className).toContain('--active')
  })

  it('appelle onChange au clic', () => {
    const fn = vi.fn()
    render(<PeriodSelector value="30d" onChange={fn} />)
    fireEvent.click(screen.getByText('7j'))
    expect(fn).toHaveBeenCalledWith('7d')
  })
})
