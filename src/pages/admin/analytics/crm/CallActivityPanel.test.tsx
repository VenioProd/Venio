import { render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../../lib/api'
import CallActivityPanel from './CallActivityPanel'

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }))

const days = Array.from({ length: 14 }, (_, index) => ({
  day: `2026-11-${String(index + 1).padStart(2, '0')}`,
  calls: index === 13 ? 8 : index === 12 ? 4 : 0,
  reached: index === 13 ? 3 : index === 12 ? 1 : 0,
}))

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockResolvedValue({ days, calls: 12, reached: 4, reachedRate: 33 })
})

it('lit l’activité de l’entité choisie et la dit jour par jour', async () => {
  const view = render(<CallActivityPanel entity="ARROW" />)
  const chart = await screen.findByRole('list', {
    name: 'Appels par jour sur 14 jours : 12 au total, dont 4 décrochés',
  })
  expect(apiFetch).toHaveBeenCalledWith('/api/admin/crm/pilotage/call-activity?entity=ARROW')
  expect(within(chart).getAllByRole('listitem')).toHaveLength(14)
  expect(within(chart).getByText(/14 novembre : 8 appels, 3 décrochés$/)).toBeInTheDocument()
  expect(screen.getByText('33 %')).toBeInTheDocument()

  vi.mocked(apiFetch).mockResolvedValue({
    days: days.map((row) => ({ ...row, calls: 0, reached: 0 })),
    calls: 0,
    reached: 0,
    reachedRate: null,
  })
  view.rerender(<CallActivityPanel entity="" />)
  expect(await screen.findByText('Aucun appel consigné sur les 14 derniers jours.')).toBeInTheDocument()
  expect(apiFetch).toHaveBeenLastCalledWith('/api/admin/crm/pilotage/call-activity')
})
