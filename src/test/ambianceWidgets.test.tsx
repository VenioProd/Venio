import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  ClockWidget,
  PomodoroWidget,
  GoalWidget,
  ShortcutsWidget,
} from '../pages/admin/mon-espace/widgets/AmbianceWidgets'

const saveLayout = vi.fn()
const getLayout = vi.fn()
vi.mock('../services/workspace', () => ({
  saveLayout: (...args: unknown[]) => saveLayout(...args),
  getLayout: (...args: unknown[]) => getLayout(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  getLayout.mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null })
  saveLayout.mockImplementation(async (layout) => ({ widgets: [], shortcuts: layout.shortcuts ?? [], dailyGoal: null }))
})

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
  it('ShortcutsWidget charge les raccourcis persistés', async () => {
    getLayout.mockResolvedValue({
      widgets: [],
      shortcuts: [{ label: 'Mon CRM', link: '/admin/crm' }],
      dailyGoal: null,
    })
    render(
      <MemoryRouter>
        <ShortcutsWidget />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mon CRM' })).toHaveAttribute('href', '/admin/crm'))
  })
  it('ShortcutsWidget ajoute et persiste un raccourci', async () => {
    render(
      <MemoryRouter>
        <ShortcutsWidget />
      </MemoryRouter>,
    )
    await screen.findByText('Aucun raccourci configuré')
    fireEvent.change(screen.getByLabelText('Libellé du raccourci'), { target: { value: 'Support' } })
    fireEvent.change(screen.getByLabelText('Lien du raccourci'), { target: { value: '/admin/messages' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un raccourci' }))
    await waitFor(() =>
      expect(saveLayout).toHaveBeenCalledWith({ shortcuts: [{ label: 'Support', link: '/admin/messages' }] }),
    )
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/admin/messages')
  })
  it('ShortcutsWidget refuse les liens externes non HTTPS et protocol-relative', async () => {
    render(
      <MemoryRouter>
        <ShortcutsWidget />
      </MemoryRouter>,
    )
    await screen.findByText('Aucun raccourci configuré')
    fireEvent.change(screen.getByLabelText('Libellé du raccourci'), { target: { value: 'Externe' } })
    fireEvent.change(screen.getByLabelText('Lien du raccourci'), { target: { value: '//example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un raccourci' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('lien interne ou HTTPS valide')
    expect(saveLayout).not.toHaveBeenCalled()
  })
  it('ShortcutsWidget affiche l’erreur de chargement et peut réessayer', async () => {
    getLayout
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ widgets: [], shortcuts: [], dailyGoal: null })
    render(
      <MemoryRouter>
        <ShortcutsWidget />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les raccourcis')
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.getByText('Aucun raccourci configuré')).toBeInTheDocument())
  })
})
