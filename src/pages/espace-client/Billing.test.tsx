import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as quotes from '../../services/quotes'
import ClientBilling from './Billing'

vi.mock('../../services/quotes')

beforeEach(() => vi.resetAllMocks())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/projets/p1/facturation']}>
      <Routes>
        <Route path="/espace-client/projets/:projectId/facturation" element={<ClientBilling />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('vitrine facturation', () => {
  it('liste les documents avec un lien de téléchargement', async () => {
    vi.mocked(quotes.listBillingDocuments).mockResolvedValue({
      documents: [
        {
          _id: 'd1',
          type: 'INVOICE',
          number: 'FAC-001',
          status: 'PAID',
          total: 1200,
          currency: 'EUR',
          issuedAt: '2026-07-01T00:00:00.000Z',
          dueAt: null,
        },
      ],
    })
    vi.mocked(quotes.billingPdfUrl).mockReturnValue('/api/projects/p1/billing/d1/pdf')

    renderPage()

    expect(await screen.findByText('FAC-001')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /télécharger/i })).toHaveAttribute(
      'href',
      '/api/projects/p1/billing/d1/pdf',
    )
  })

  it('affiche un message quand il n’y a aucun document', async () => {
    vi.mocked(quotes.listBillingDocuments).mockResolvedValue({ documents: [] })
    renderPage()
    expect(await screen.findByText(/aucun document/i)).toBeInTheDocument()
  })
})
