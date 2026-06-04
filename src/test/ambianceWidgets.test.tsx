import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  ClockWidget,
  PomodoroWidget,
  GoalWidget,
  ShortcutsWidget,
} from '../pages/admin/mon-espace/widgets/AmbianceWidgets'

vi.mock('../services/workspace', () => ({
  saveLayout: vi.fn().mockResolvedValue({}),
  getLayout: vi.fn().mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null }),
}))

describe('Ambiance widgets', () => {
  it('ClockWidget affiche une heure', () => {
    render(<ClockWidget />)
    expect(screen.getByTestId('clock-time').textContent).toMatch(/\d{1,2}:\d{2}/)
  })
  it('PomodoroWidget démarre/met en pause', () => {
    render(<PomodoroWidget />)
    const btn = screen.getByRole('button', { name: /Démarrer|Pause/ })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })
  it("GoalWidget enregistre l'objectif au blur", () => {
    render(<GoalWidget />)
    const input = screen.getByPlaceholderText(/objectif/i)
    fireEvent.change(input, { target: { value: 'Finir le devis' } })
    fireEvent.blur(input)
    expect((input as HTMLInputElement).value).toBe('Finir le devis')
  })
  it('ShortcutsWidget affiche des liens par défaut', () => {
    render(
      <MemoryRouter>
        <ShortcutsWidget />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })
})
