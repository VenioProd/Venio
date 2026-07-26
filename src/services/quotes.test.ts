import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as api from '../lib/api'
import { saveSelection, signProposal, billingPdfUrl } from './quotes'

vi.mock('../lib/api')

beforeEach(() => vi.resetAllMocks())

describe('service quotes', () => {
  it('n’envoie que les identifiants retenus, jamais de montant', async () => {
    vi.mocked(api.apiFetch).mockResolvedValue({ proposal: {}, totals: { subtotal: 0, taxTotal: 0, total: 0 } } as never)
    await saveSelection('p1', 'q1', ['line-a'])

    expect(api.apiFetch).toHaveBeenCalledWith('/api/projects/p1/proposals/q1/selection', {
      method: 'PATCH',
      body: JSON.stringify({ selectedOptionalLineIds: ['line-a'] }),
    })
  })

  it('transmet le consentement à la signature', async () => {
    vi.mocked(api.apiFetch).mockResolvedValue({ billingDocument: {} } as never)
    await signProposal('p1', 'q1', 'Jean Client')

    expect(api.apiFetch).toHaveBeenCalledWith('/api/projects/p1/proposals/q1/sign', {
      method: 'POST',
      body: JSON.stringify({ signerName: 'Jean Client', consent: true }),
    })
  })

  it('construit l’URL de téléchargement du PDF', () => {
    expect(billingPdfUrl('p1', 'd1')).toBe('/api/projects/p1/billing/d1/pdf')
  })
})
