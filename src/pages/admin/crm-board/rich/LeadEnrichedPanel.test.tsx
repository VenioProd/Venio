import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import LeadEnrichedPanel from './LeadEnrichedPanel'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../../lib/api', () => ({ apiFetch }))
beforeEach(() => apiFetch.mockReset())

it('affiche l’erreur seule puis permet de recharger les tâches', async () => {
  apiFetch
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [{ _id: 't1', title: 'Rappeler', status: 'TODO' }] })
  render(
    <LeadEnrichedPanel
      lead={{ _id: 'a', company: 'A', status: 'LEAD' }}
      canManageCrm={false}
      onUpdateLead={vi.fn()}
      onLocalChange={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /Tâches/ }))
  expect(await screen.findByText(/Chargement impossible/)).toBeInTheDocument()
  expect(screen.queryByText('Chargement…')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(await screen.findByText('Rappeler')).toBeInTheDocument()
})
