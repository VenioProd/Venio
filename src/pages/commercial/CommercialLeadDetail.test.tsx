import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import CommercialLeadDetail from './CommercialLeadDetail'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const lead = {
  _id: 'lead1',
  company: 'Atelier Alpha',
  contactName: 'Alice',
  contactEmail: '',
  contactPhone: '',
  source: '',
  status: 'DEMO',
  priority: 'NORMALE',
  budget: null,
  nextActionAt: null,
  lastContactAt: null,
  notes: '',
  serviceType: '',
  leadTemperature: 'TIEDE',
  lostReason: '',
  lostComment: '',
  handedOffAt: null as string | null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/commercial/leads/lead1']}>
      <Routes>
        <Route path="/commercial/leads/:id" element={<CommercialLeadDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CommercialLeadDetail', () => {
  beforeEach(() => {
    lead.handedOffAt = null
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith('/ready-to-close') && options?.method === 'POST') {
        lead.handedOffAt = '2026-10-31T10:00:00.000Z'
        return { lead }
      }
      if (path === '/api/commercial/leads/lead1') return { lead: { ...lead }, activities: [], interactions: [] }
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('transmet le dossier au closer après confirmation, puis passe la fiche en lecture seule', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Prêt à closer' }))
    fireEvent.change(screen.getByPlaceholderText(/Contexte pour le closer/), { target: { value: 'Budget validé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la transmission' }))

    expect(await screen.findByText(/Dossier transmis pour closing le/)).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/commercial/leads/lead1/ready-to-close', {
      method: 'POST',
      body: JSON.stringify({ message: 'Budget validé' }),
    })
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prêt à closer' })).not.toBeInTheDocument()
  })

  it('propose l’appel avec la même barre, et garde tel: quand la téléphonie est désactivée', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/commercial/calls/config') return { enabled: false }
      if (path === '/api/commercial/leads/lead1')
        return { lead: { ...lead, contactPhone: '+33612345678' }, activities: [], interactions: [] }
      throw new Error(`Unexpected path: ${path}`)
    })
    renderDetail()
    expect(await screen.findByRole('group', { name: 'Appel téléphonique' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+33612345678')
  })

  it('dit simplement que la fiche n’est plus accessible quand elle a été réattribuée', async () => {
    vi.mocked(apiFetch).mockRejectedValue(Object.assign(new Error('Lead not found'), { status: 404 }))
    renderDetail()
    expect(await screen.findByText(/ne vous est plus attribué/)).toBeInTheDocument()
  })
})
