import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import DecisionsDigest from './DecisionsDigest'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
const fetchMock = vi.mocked(apiFetch)
const mount = () =>
  render(
    <MemoryRouter>
      <DecisionsDigest />
    </MemoryRouter>,
  )

beforeEach(() => vi.resetAllMocks())

describe('DecisionsDigest', () => {
  it('charge uniquement les décisions en attente et donne accès à la liste complète', async () => {
    fetchMock.mockResolvedValue({ decisions: [{ _id: 'd1', title: 'Budget novembre', priority: 'URGENTE' }] })
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('Chargement')
    expect(await screen.findByRole('link', { name: 'Budget novembre' })).toHaveAttribute('href', '/admin/decisions')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/decisions?status=PENDING')
    expect(screen.getByRole('link', { name: 'Toutes les décisions' })).toHaveAttribute('href', '/admin/decisions')
    expect(screen.getByRole('heading', { name: 'À arbitrer (1)' })).toBeInTheDocument()
    expect(screen.getByText('Urgente')).toBeInTheDocument()
  })

  it('affiche un état vide', async () => {
    fetchMock.mockResolvedValue({ decisions: [] })
    mount()
    expect(await screen.findByText('Aucune décision en attente.')).toBeInTheDocument()
  })

  it('permet de relancer une requête en échec', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ decisions: [] })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger')
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.getByText('Aucune décision en attente.')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
