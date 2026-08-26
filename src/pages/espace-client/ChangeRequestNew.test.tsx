import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as changeRequests from '../../services/changeRequests'
import * as api from '../../lib/api'
import ChangeRequestNew from './ChangeRequestNew'

vi.mock('../../services/changeRequests')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/demandes/nouvelle']}>
      <Routes>
        <Route path="/espace-client/demandes/nouvelle" element={<ChangeRequestNew />} />
        <Route path="/espace-client/demandes/:id" element={<p>Détail de la demande</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.apiFetch).mockResolvedValue({ projects: [{ _id: 'p1', name: 'Refonte du site' }] })
  vi.mocked(changeRequests.createChangeRequest).mockResolvedValue({
    changeRequest: { _id: 'cr1' },
  } as unknown as Awaited<ReturnType<typeof changeRequests.createChangeRequest>>)
})

describe('formulaire de nouvelle demande', () => {
  it('n’envoie rien tant que le titre et la description sont vides', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /envoyer la demande/i }))

    expect(changeRequests.createChangeRequest).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/titre/i)
  })

  it('propose les projets du compte et soumet la demande, puis redirige vers le détail', async () => {
    renderPage()
    expect(await screen.findByRole('option', { name: 'Refonte du site' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/titre/i), { target: { value: 'Nouvelle page « Ateliers »' } })
    fireEvent.change(screen.getByLabelText(/décrivez/i), { target: { value: 'Présenter le calendrier.' } })
    fireEvent.change(screen.getByLabelText(/projet/i), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText(/priorité/i), { target: { value: 'HAUTE' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer la demande/i }))

    await waitFor(() => {
      expect(changeRequests.createChangeRequest).toHaveBeenCalledWith({
        title: 'Nouvelle page « Ateliers »',
        description: 'Présenter le calendrier.',
        pageUrl: '',
        projectId: 'p1',
        priority: 'HAUTE',
        files: [],
      })
    })
    expect(await screen.findByText('Détail de la demande')).toBeInTheDocument()
  })
})
