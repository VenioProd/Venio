import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientDocuments from './Documents'
import * as clientVaultService from '../../services/clientVault'
import { apiFetch } from '../../lib/api'

vi.mock('../../services/clientVault')
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  return { ...actual, apiFetch: vi.fn() }
})

const documents = [
  {
    id: '1',
    source: 'BILLING' as const,
    type: 'FACTURE' as const,
    title: 'FAC-001',
    project: { id: 'p1', name: 'Site vitrine' },
    date: '2026-08-01T00:00:00.000Z',
    size: null,
    mimeType: null,
    downloadUrl: '/api/projects/p1/billing/1/pdf',
  },
  {
    id: '2',
    source: 'PROJECT_ITEM' as const,
    type: 'LIVRABLE' as const,
    title: 'Maquette v1',
    project: { id: 'p1', name: 'Site vitrine' },
    date: '2026-08-05T00:00:00.000Z',
    size: 2048,
    mimeType: 'application/pdf',
    downloadUrl: '/api/projects/p1/items/2/download',
  },
]

beforeEach(() => {
  vi.mocked(clientVaultService.listClientDocuments).mockResolvedValue({ documents })
  vi.mocked(apiFetch).mockResolvedValue({ projects: [{ _id: 'p1', name: 'Site vitrine' } as never] })
})

describe('Documents (Mes documents)', () => {
  it('affiche la liste chargée', async () => {
    render(
      <MemoryRouter>
        <ClientDocuments />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('filtre par type', async () => {
    render(
      <MemoryRouter>
        <ClientDocuments />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Tous les types'), { target: { value: 'LIVRABLE' } })

    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument()
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('filtre par recherche texte', async () => {
    render(
      <MemoryRouter>
        <ClientDocuments />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('Rechercher un document...'), { target: { value: 'maquette' } })

    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument()
    expect(screen.getByText('Maquette v1')).toBeInTheDocument()
  })

  it('affiche des liens de téléchargement corrects par source', async () => {
    render(
      <MemoryRouter>
        <ClientDocuments />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('FAC-001')).toBeInTheDocument())

    const links = screen.getAllByText('Télécharger') as HTMLAnchorElement[]
    expect(links[0].getAttribute('href')).toBe('/api/projects/p1/billing/1/pdf')
    expect(links[1].getAttribute('href')).toBe('/api/projects/p1/items/2/download')
  })

  it("affiche l'état vide quand la liste est vide", async () => {
    vi.mocked(clientVaultService.listClientDocuments).mockResolvedValue({ documents: [] })
    render(
      <MemoryRouter>
        <ClientDocuments />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Aucun document pour le moment')).toBeInTheDocument())
  })
})
