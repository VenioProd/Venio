import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InboxFilters from './InboxFilters'

describe('InboxFilters', () => {
  const counts = { all: 10, decision: 3, brief: 2, lead: 3, message: 2, ticket: 0, task: 0, system: 0, pin: 0 }

  it('rend les chips avec compteurs', () => {
    render(<InboxFilters value="all" counts={counts} snoozedCount={3} onChange={() => {}} />)
    expect(screen.getByText('Tout')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText(/Snoozées/)).toBeTruthy()
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
  })

  it('appelle onChange avec le filter au clic', () => {
    const fn = vi.fn()
    render(<InboxFilters value="all" counts={counts} snoozedCount={0} onChange={fn} />)
    fireEvent.click(screen.getByText('Décisions'))
    expect(fn).toHaveBeenCalledWith('decision')
  })
})
