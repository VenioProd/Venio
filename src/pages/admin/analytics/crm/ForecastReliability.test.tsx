import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ForecastSection from './ForecastSection'

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'COMMERCIAL' } }) }))
vi.mock('../../../../services/pilotage', () => ({
  fetchPilotage: vi.fn().mockResolvedValue({ pipeline: { reliable: false, cohortSize: 3 } }),
  fetchForecast: vi.fn().mockResolvedValue({
    months: [],
    totals: { openCount: 0, wonCount: 0 },
    overdue: { count: 0 },
    unscheduled: { count: 0 },
  }),
}))

it('avertit dans les prévisions quand la cohorte est insuffisante', async () => {
  render(<ForecastSection />)
  expect(await screen.findByRole('note')).toHaveTextContent('3 leads seulement')
})
