import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import LeadDetailPage from './LeadDetailPage'

vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => null }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => null }))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ duplicates: [] }) }))
it('confirme archivage et suppression avant de modifier les données', async () => {
  const update = vi.fn().mockResolvedValue(undefined)
  const remove = vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <LeadDetailPage
        lead={{ _id: 'a', company: 'Atelier', status: 'LEAD' }}
        admins={[]}
        canManageCrm
        converting={null}
        onClose={vi.fn()}
        onLeadChange={vi.fn()}
        onUpdateLead={update}
        onDeleteLead={remove}
        onConvertToClient={vi.fn()}
      />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }))
  fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }))
  fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith('a', { archivedAt: expect.any(String) }))
  fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }))
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
  await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('a'))
})
