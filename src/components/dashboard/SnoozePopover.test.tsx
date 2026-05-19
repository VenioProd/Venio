import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SnoozePopover from './SnoozePopover'

describe('SnoozePopover', () => {
  it('rend les 5 options', () => {
    render(<SnoozePopover onSnooze={() => {}} onClose={() => {}} />)
    expect(screen.getByText('1h')).toBeTruthy()
    expect(screen.getByText(/Ce soir/)).toBeTruthy()
    expect(screen.getByText(/Demain/)).toBeTruthy()
    expect(screen.getByText('Lundi')).toBeTruthy()
    expect(screen.getByText('Custom…')).toBeTruthy()
  })

  it('appelle onSnooze avec date+1h au clic 1h', () => {
    const fn = vi.fn()
    render(<SnoozePopover onSnooze={fn} onClose={() => {}} />)
    fireEvent.click(screen.getByText('1h'))
    expect(fn).toHaveBeenCalledTimes(1)
    const calledWith = fn.mock.calls[0][0] as Date
    expect(calledWith.getTime() - Date.now()).toBeGreaterThan(3500_000)
    expect(calledWith.getTime() - Date.now()).toBeLessThan(3700_000)
  })
})
