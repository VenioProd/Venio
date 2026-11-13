import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead } from '../../../types/crm.types'
import { apiFetch } from '../../../lib/api'
import LeadDetailPage from './LeadDetailPage'

vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => null }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => null }))
vi.mock('../../../lib/api', async () => ({ ...(await vi.importActual<object>('../../../lib/api')), apiFetch: vi.fn() }))

const HOLD = '/api/admin/call-desk/leads/lead1/call-hold'
const requests: { path: string; method: string; headers: Headers; body: unknown }[] = []

const lead: Lead = {
  _id: 'lead1',
  company: 'Atelier Alpha',
  status: 'LEAD',
  contactName: 'Alice',
  externalRep: 'rep1',
  closingHandoff: null,
  callHold: { at: '2026-11-12T10:07:00.000Z', reason: 'OPT_OUT_DETECTED', call: 'call-ext' },
}

function mount(canManageCrm: boolean, onLeadChange = vi.fn()) {
  render(
    <MemoryRouter>
      <LeadDetailPage
        lead={lead}
        admins={[]}
        canManageCrm={canManageCrm}
        converting={null}
        onClose={vi.fn()}
        onLeadChange={onLeadChange}
        onUpdateLead={vi.fn()}
        onConvertToClient={vi.fn()}
      />
    </MemoryRouter>,
  )
  return onLeadChange
}

describe('Retenue sur la fiche d’un externe non transmise', () => {
  beforeEach(() => {
    requests.length = 0
    vi.mocked(apiFetch).mockImplementation((async (path: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET'
      requests.push({
        path,
        method,
        headers: new Headers(options?.headers),
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      })
      if (path === HOLD && method === 'GET')
        return {
          hold: {
            at: '2026-11-12T10:07:00.000Z',
            quote: 'ne me rappelez plus',
            quoteVerified: true,
            analysisErased: false,
            author: { _id: 'rep1', name: 'Camille Externe' },
          },
        }
      if (path === HOLD) return { lead: { _id: 'lead1', callHold: null, doNotCall: false } }
      if (path === '/api/admin/crm/leads/lead1') return { lead: { ...lead, callHold: null } }
      return { duplicates: [] }
    }) as typeof apiFetch)
  })
  afterEach(cleanup)

  it('ouvre la décision sur la seule citation, sans lire les appels, et la trace par une clé d’idempotence', async () => {
    const onLeadChange = mount(true)
    expect(screen.queryByRole('button', { name: 'Ouvrir les appels' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Décider de la retenue' }))

    expect(await screen.findByText('ne me rappelez plus')).toBeInTheDocument()
    expect(screen.getByText(/sur un appel de Camille Externe/)).toBeInTheDocument()
    // Ni l'appel, ni son transcript, ni son analyse ne sont demandés.
    expect(requests.some((item) => item.path.includes('/calls/call-ext'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Lever la retenue' }))
    expect(requests.find((item) => item.method === 'POST')).toBeUndefined()
    expect(await screen.findByText(/reviendra dans la file d’appel/)).toBeInTheDocument()
    fireEvent.click(document.querySelector<HTMLButtonElement>('.confirm-modal__btn--confirm')!)
    await waitFor(() => expect(requests.find((item) => item.method === 'POST')?.body).toEqual({ action: 'DISMISS' }))
    expect(requests.find((item) => item.method === 'POST')!.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(() => expect(onLeadChange).toHaveBeenCalled())
  })

  it('sans droit d’écriture, ni décision ni lecture de la citation', () => {
    mount(false)
    expect(screen.getByText('Fiche retenue.', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Décider de la retenue' })).not.toBeInTheDocument()
    expect(requests.some((item) => item.path === HOLD)).toBe(false)
  })
})
