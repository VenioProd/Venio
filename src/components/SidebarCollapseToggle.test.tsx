import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SidebarCollapseToggle from './SidebarCollapseToggle'

describe('SidebarCollapseToggle', () => {
  it('rend un bouton avec aria-label "Désépingler" quand expanded', () => {
    render(<SidebarCollapseToggle collapsed={false} onToggle={() => {}} />)
    const btn = screen.getByLabelText(/Désépingler/i)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('rend "Épingler" quand collapsed', () => {
    render(<SidebarCollapseToggle collapsed={true} onToggle={() => {}} />)
    expect(screen.getByLabelText(/^Épingler/i)).toBeTruthy()
  })

  it('appelle onToggle au clic', () => {
    const fn = vi.fn()
    render(<SidebarCollapseToggle collapsed={false} onToggle={fn} />)
    fireEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applique data-collapsed pour CSS', () => {
    const { container } = render(<SidebarCollapseToggle collapsed={true} onToggle={() => {}} />)
    const btn = container.querySelector('button')
    expect(btn?.getAttribute('data-collapsed')).toBe('true')
  })
})
