import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { LeadRevenueResponse } from '../types/pilotage.types'

const services = vi.hoisted(() => ({
  fetchLeadRevenue: vi.fn(),
  fetchProjectCandidates: vi.fn(),
  linkProjectToLead: vi.fn(),
  unlinkProjectFromLead: vi.fn(),
  fetchPilotage: vi.fn(),
}))
vi.mock('../services/pilotage', () => services)

import RevenueChain from '../components/admin/RevenueChain'

function revenue(overrides: Partial<LeadRevenueResponse> = {}): LeadRevenueResponse {
  return {
    lead: { _id: 'l1', company: 'Acme', budget: 20000 },
    projects: [{ _id: 'p1', name: 'Refonte', status: 'EN_COURS', createdAt: '2026-08-01T00:00:00.000Z' }],
    proposals: [],
    documents: [
      {
        _id: 'd1',
        type: 'QUOTE',
        number: 'DEV-001',
        status: 'ACCEPTED',
        total: 14000,
        currency: 'EUR',
        issuedAt: '2026-08-02T00:00:00.000Z',
        paidAt: null,
        project: 'p1',
      },
      {
        _id: 'd2',
        type: 'INVOICE',
        number: 'FA-001',
        status: 'PAID',
        total: 7000,
        currency: 'EUR',
        issuedAt: '2026-08-10T00:00:00.000Z',
        paidAt: '2026-08-20T00:00:00.000Z',
        project: 'p1',
      },
    ],
    summary: { signed: 14000, collected: 7000, documents: 2 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  services.fetchLeadRevenue.mockResolvedValue(revenue())
  services.fetchProjectCandidates.mockResolvedValue({ candidates: [] })
  services.linkProjectToLead.mockResolvedValue({})
  services.unlinkProjectFromLead.mockResolvedValue({})
})

describe('RevenueChain', () => {
  it("montre le budget annoncé, le signé et l'encaissé séparément", async () => {
    const { container } = render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('Refonte')

    // Les mêmes montants figurent aussi sur les lignes de documents : on lit
    // le bandeau de synthèse, pas la page entière.
    const summary = within(container.querySelector('.revenue-summary') as HTMLElement)
    expect(summary.getByText('20 000 €')).toBeInTheDocument()
    expect(summary.getByText('14 000 €')).toBeInTheDocument()
    expect(summary.getByText('7 000 €')).toBeInTheDocument()
  })

  it('liste les devis et factures du projet', async () => {
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('DEV-001')
    expect(screen.getByText('FA-001')).toBeInTheDocument()
    expect(screen.getByText('Devis')).toBeInTheDocument()
    expect(screen.getByText('Facture')).toBeInTheDocument()
  })

  it("dit clairement qu'aucun projet n'est rattaché", async () => {
    services.fetchLeadRevenue.mockResolvedValue(
      revenue({ projects: [], documents: [], summary: { signed: 0, collected: 0, documents: 0 } }),
    )
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText(/Aucun projet rattaché/)
  })

  it('propose les projets libres et en rattache un', async () => {
    services.fetchProjectCandidates.mockResolvedValue({
      candidates: [{ _id: 'p9', name: 'Site vitrine', status: 'EN_ATTENTE', createdAt: '2026-07-01T00:00:00.000Z' }],
    })
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('Refonte')

    fireEvent.click(screen.getByRole('button', { name: 'Rattacher un projet existant' }))
    await screen.findByText('Site vitrine')

    fireEvent.click(screen.getByRole('button', { name: 'Rattacher' }))
    await waitFor(() => expect(services.linkProjectToLead).toHaveBeenCalledWith('l1', 'p9'))
  })

  it("explique qu'il faut d'abord convertir le lead en client", async () => {
    services.fetchProjectCandidates.mockResolvedValue({ candidates: [], reason: 'NO_CLIENT_ACCOUNT' })
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('Refonte')

    fireEvent.click(screen.getByRole('button', { name: 'Rattacher un projet existant' }))
    await screen.findByText(/convertissez-le d'abord/)
  })

  it('détache un projet', async () => {
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('Refonte')

    fireEvent.click(screen.getByRole('button', { name: 'Détacher' }))
    await waitFor(() => expect(services.unlinkProjectFromLead).toHaveBeenCalledWith('l1', 'p1'))
  })

  it('masque toute action en lecture seule', async () => {
    render(<RevenueChain leadId="l1" canManage={false} />)
    await screen.findByText('Refonte')

    expect(screen.queryByRole('button', { name: 'Détacher' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rattacher un projet existant' })).not.toBeInTheDocument()
  })

  it("affiche l'erreur plutôt qu'un bloc vide", async () => {
    services.fetchLeadRevenue.mockRejectedValue(new Error('Boom'))
    render(<RevenueChain leadId="l1" canManage />)
    await screen.findByText('Boom')
  })
})
