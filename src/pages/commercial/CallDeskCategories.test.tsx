import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import { CallDesk } from './CommercialCalls'
import { commercialDesk } from './callDesk'
import { teamDesk } from '../admin/crm-board/teamDeskApi'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Alex' } }) }))
vi.mock('../../services/externalSales', async (original) => {
  const actual = await original<typeof import('../../services/externalSales')>()
  return {
    ...actual,
    commercialApi: {
      ...actual.commercialApi,
      callSettings: vi.fn(async () => settings),
      callFilters: vi.fn(async () => ({ lists: [], projects: [] })),
      callQueue: vi.fn(async () => ({ leads: [lead('rep1', 'Atelier Rita')], nextCursor: null })),
    },
  }
})
vi.mock('@twilio/voice-sdk', () => ({ Device: class {} }))

const PREFIX = '/api/admin/call-desk'
const settings = { projects: [], scriptTags: [], defaultRegion: 'FR', outcomes: [] }
const lead = (id: string, company: string) => ({
  _id: id,
  company,
  contactName: '',
  contactEmail: '',
  contactPhone: '+33612345678',
  source: '',
  extraInfo: {},
  lastCallOutcome: null,
  nextActionAt: null,
})
const requests: string[] = []

beforeEach(() => {
  requests.length = 0
  localStorage.clear()
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    requests.push(path)
    if (path === `${PREFIX}/calls/settings`) return settings
    if (path === `${PREFIX}/calls/filters`) return { lists: [], projects: [] }
    if (path === `${PREFIX}/calls/config`) return { enabled: false }
    if (path === `${PREFIX}/session`)
      return { day: '2026-11-14', calls: 5, reached: 2, meetings: 1, conversionRate: 50, targetConversionRate: 40 }
    if (path === '/api/commercial/session')
      return { day: '2026-11-14', calls: 7, reached: 4, meetings: 1, conversionRate: 25, targetConversionRate: 40 }
    if (path.startsWith(`${PREFIX}/calls/queue`)) {
      const never = path.includes('category=never')
      return {
        leads: never ? [lead('l2', 'Brasserie Neuve')] : [lead('l1', 'Atelier Alpha'), lead('l2', 'Brasserie Neuve')],
        nextCursor: null,
        counts: { all: 2, callback: 1, never: 1, other: 0 },
      }
    }
    return {}
  }) as typeof apiFetch)
})
afterEach(cleanup)

const renderDesk = (desk = teamDesk) =>
  render(
    <MemoryRouter>
      <CallDesk desk={desk} />
    </MemoryRouter>,
  )

describe('Catégories de la file et séance du poste d’appel', () => {
  it('équipe : gélules comptées, file relue par catégorie, séance du jour', async () => {
    renderDesk()
    await screen.findByRole('button', { name: /Atelier Alpha/ })
    const cats = screen.getByRole('group', { name: 'Catégorie de la file' })
    expect(within(cats).getByRole('button', { name: 'Toute la file 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(cats).getByRole('button', { name: 'Rappels dus 1' })).toBeInTheDocument()

    fireEvent.click(within(cats).getByRole('button', { name: 'Jamais appelées 1' }))
    await waitFor(() => expect(requests[requests.length - 1]).toContain('category=never'))
    expect(requests[requests.length - 1]).toContain('mine=1')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Atelier Alpha/ })).toBeNull())
    expect(within(cats).getByRole('button', { name: 'Jamais appelées 1' })).toHaveAttribute('aria-pressed', 'true')

    const today = screen.getByRole('region', { name: 'Aujourd’hui' })
    expect(await within(today).findByText('5')).toBeInTheDocument()
    expect(within(today).getByRole('img', { name: '50 % de conversion, objectif 40 %' })).toBeInTheDocument()
  })

  it('commercial externe : sa séance du jour, lue sur son routeur, sans gélules de catégorie', async () => {
    renderDesk(commercialDesk)
    await screen.findByText('Atelier Rita')
    expect(screen.queryByRole('group', { name: 'Catégorie de la file' })).toBeNull()
    const today = screen.getByRole('region', { name: 'Aujourd’hui' })
    expect(await within(today).findByText('7')).toBeInTheDocument()
    expect(within(today).getByRole('img', { name: '25 % de conversion, objectif 40 %' })).toBeInTheDocument()
    expect(requests).toContain('/api/commercial/session')
    expect(requests.some((path) => path.startsWith(PREFIX))).toBe(false)
  })
})
