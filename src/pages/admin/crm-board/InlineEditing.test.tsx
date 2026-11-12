import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import RichLeadTable from './rich/RichLeadTable'
import LeadCard from './LeadCard'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ items: [] }) }))
const lead = { _id: 'lead', company: 'Atelier', status: 'LEAD', priority: 'BASSE' }
it('édite le statut, la priorité et le responsable en ligne sans ouvrir la fiche', () => {
  const update = vi.fn().mockResolvedValue(undefined)
  const open = vi.fn()
  localStorage.clear()
  render(
    <MemoryRouter>
      <RichLeadTable
        leads={[lead]}
        admins={[{ _id: 'admin', name: 'Admin', role: 'ADMIN', email: 'admin@example.test' }]}
        adminsById={{}}
        canManageCrm
        project=""
        onProjectChange={vi.fn()}
        onOpenLead={open}
        onReload={vi.fn()}
        onError={vi.fn()}
        onUpdateLead={update}
      />
    </MemoryRouter>,
  )
  // La priorité n'est pas une colonne par défaut : on l'affiche avant de l'éditer.
  fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
  fireEvent.click(within(document.querySelector<HTMLElement>('.rich-colpn')!).getByLabelText(/Priorité/))
  fireEvent.change(screen.getByRole('combobox', { name: 'Statut — Atelier' }), { target: { value: 'CONTACTED' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Priorité — Atelier' }), { target: { value: 'HAUTE' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Commercial — Atelier' }), { target: { value: 'admin' } })
  expect(update.mock.calls).toEqual([
    ['lead', { status: 'CONTACTED' }],
    ['lead', { priority: 'HAUTE' }],
    ['lead', { assignedTo: 'admin' }],
  ])
  expect(open).not.toHaveBeenCalled()
})
it('déplace une carte avec son menu au clavier sans glisser', () => {
  const update = vi.fn().mockResolvedValue(undefined)
  render(
    <LeadCard
      lead={lead}
      admins={[]}
      adminsById={{}}
      canManageCrm
      converting={null}
      onUpdateLead={update}
      onConvertToClient={vi.fn()}
      onOpenDetail={vi.fn()}
      onDragStart={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Actions pour Atelier' }))
  const select = screen.getByRole('combobox', { name: 'Statut' })
  fireEvent.keyDown(select, { key: 'ArrowDown' })
  fireEvent.keyDown(select, { key: 'Enter' })
  expect(update).toHaveBeenCalledExactlyOnceWith('lead', { status: 'QUALIFIED' })
})
