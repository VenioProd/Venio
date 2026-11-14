import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import ExternalSales from './ExternalSales'

vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api')), apiFetch: vi.fn() }))

const totals = { collectedHtCents: 0, dueCents: 0, paidCents: 0 }
const lead = (id: string, callList: string, handedOff = false) => ({
  _id: id,
  company: `Fiche ${id}`,
  contactName: '',
  status: 'CONTACTED',
  callList,
  closingHandoff: handedOff ? { at: '2026-11-12T10:00:00+01:00' } : null,
  assignedTo: null,
  updatedAt: '2026-11-12T10:00:00+01:00',
})

it('partenaires : listes d’appel du commercial choisi (fiches, transmises) et règles du volet', async () => {
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === '/api/admin/external-sales/reps')
      return {
        rateBp: 1000,
        reps: [
          {
            _id: 'r1',
            name: 'Anna Externe',
            email: 'anna@x.test',
            isActive: true,
            leads: 4,
            handedOff: 1,
            won: 0,
            lost: 0,
            conversionRate: 0,
            ...totals,
          },
        ],
      }
    if (path === '/api/admin/external-sales/reps/r1')
      return {
        rep: { _id: 'r1', name: 'Anna Externe' },
        leads: [lead('1', 'Artisans'), lead('2', 'Artisans', true), lead('3', ''), lead('4', 'Boulangeries')],
        commissions: [],
        totals,
      }
    if (path === '/api/admin/external-sales/reps/r1/activity') return { activities: [] }
    throw new Error(`Unexpected API request: ${path}`)
  }) as typeof apiFetch)
  render(
    <MemoryRouter>
      <ExternalSales />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Anna Externe' }))
  const lists = await screen.findByRole('region', { name: /Listes d’appel/ })
  const rows = within(lists)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )
  // Par nom, les fiches hors liste en dernier.
  expect(rows).toEqual([
    ['Artisans', '2', '1'],
    ['Boulangeries', '1', '0'],
    ['Fiches hors liste', '1', '0'],
  ])
  const aside = screen.getByRole('complementary', { name: 'Règles des commerciaux externes' })
  expect(aside).toHaveTextContent('Passage au closer')
  expect(aside).toHaveTextContent(/10 % du HT encaissé/)
})
