import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as quotes from '../../services/quotes'
import ClientQuoteProposal from './QuoteProposal'

vi.mock('../../services/quotes')

const proposal = {
  _id: 'q1',
  title: 'Refonte',
  intro: '',
  status: 'SENT' as const,
  expiresAt: null,
  questions: [
    {
      _id: 'question-1',
      type: 'text' as const,
      label: 'Délai ?',
      help: '',
      options: [],
      required: true,
      order: 0,
    },
  ],
  answers: [],
  lines: [
    {
      _id: 'line-1',
      description: 'Conception',
      detail: '',
      quantity: 1,
      unitPrice: 2000,
      taxRate: 20,
      isOptional: false,
      group: '',
      order: 0,
    },
    {
      _id: 'line-2',
      description: 'Rédaction',
      detail: '',
      quantity: 1,
      unitPrice: 600,
      taxRate: 20,
      isOptional: true,
      group: '',
      order: 1,
    },
  ],
  selectedOptionalLineIds: [],
  specification: { content: '' },
  signature: { signedAt: null, signerName: '' },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/projets/p1/propositions/q1']}>
      <Routes>
        <Route path="/espace-client/projets/:projectId/propositions/:proposalId" element={<ClientQuoteProposal />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(quotes.getProposal).mockResolvedValue({
    proposal,
    totals: { subtotal: 2000, taxTotal: 400, total: 2400 },
  })
})

describe('wizard de proposition', () => {
  it('affiche le total renvoyé par le serveur, jamais un calcul local', async () => {
    vi.mocked(quotes.saveSelection).mockResolvedValue({
      proposal: { ...proposal, selectedOptionalLineIds: ['line-2'] },
      totals: { subtotal: 2600, taxTotal: 520, total: 3120 },
    })
    renderPage()

    await screen.findByText('Refonte')
    fireEvent.click(screen.getByRole('button', { name: /options/i }))
    fireEvent.click(await screen.findByLabelText(/Rédaction/))

    await waitFor(() => expect(screen.getByTestId('quote-total')).toHaveTextContent('3 120,00'))
  })

  it('bloque la signature tant qu’une question requise est vide', async () => {
    renderPage()
    await screen.findByText('Refonte')

    fireEvent.click(screen.getByRole('button', { name: /signature/i }))
    expect(await screen.findByText(/question obligatoire/i)).toBeInTheDocument()
    expect(quotes.signProposal).not.toHaveBeenCalled()
  })

  it('ouvre une proposition signée en lecture seule', async () => {
    vi.mocked(quotes.getProposal).mockResolvedValue({
      proposal: {
        ...proposal,
        status: 'SIGNED',
        signature: { signedAt: '2026-07-26T10:00:00.000Z', signerName: 'Jean' },
      },
      totals: { subtotal: 2000, taxTotal: 400, total: 2400 },
    })
    renderPage()

    await screen.findByText(/signée par Jean/i)
    expect(screen.queryByRole('button', { name: /signer/i })).not.toBeInTheDocument()
  })
})
