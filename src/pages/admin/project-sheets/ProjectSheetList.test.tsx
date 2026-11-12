import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { loadLazyMessages } from '../../../i18n'
import { apiFetch } from '../../../lib/api'
import ProjectSheetList from './ProjectSheetList'
import { makeListItem } from './fixtures'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const mockedFetch = vi.mocked(apiFetch)

beforeAll(loadLazyMessages)

function mount() {
  return render(
    <MemoryRouter initialEntries={['/admin/projets/fiches']}>
      <Routes>
        <Route path="/admin/projets/fiches" element={<ProjectSheetList />} />
        <Route path="/admin/projets/fiches/:slug" element={<p>Page fiche</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const SHEETS = [
  makeListItem(),
  makeListItem({
    _id: 'sheet2',
    slug: 'creatio',
    name: 'Creatio',
    reviewStatus: 'TO_COMPLETE',
    status: 'LAUNCHING',
    oneLiner: '',
    referent: null,
  }),
  makeListItem({ _id: 'sheet3', slug: 'decisio', name: 'Decisio', reviewStatus: 'VALIDATED', status: 'PAUSED' }),
]

beforeEach(() => {
  mockedFetch.mockReset()
  mockedFetch.mockResolvedValue({ sheets: SHEETS, canEdit: false })
})

describe('Liste des fiches projets', () => {
  it('affiche l’en-tête, les cartes et les badges de relecture', async () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Ce que fait chaque projet du groupe' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Arrow' })).toBeInTheDocument()
    expect(mockedFetch).toHaveBeenCalledWith('/api/admin/project-sheets')
    const cards = screen.getAllByRole('listitem')
    const arrow = cards.find((c) => within(c).queryByRole('heading', { name: 'Arrow' }))!
    expect(within(arrow).getByText('Brouillon à relire')).toBeInTheDocument()
    expect(within(arrow).getByText('Actif')).toBeInTheDocument()
    expect(within(arrow).getByText('Le CRM des organismes de formation.')).toBeInTheDocument()
    expect(within(arrow).getByText('Référent : Raphael')).toBeInTheDocument()
    expect(within(arrow).getByRole('link')).toHaveAttribute('href', '/admin/projets/fiches/arrow')
    const creatio = cards.find((c) => within(c).queryByRole('heading', { name: 'Creatio' }))!
    expect(within(creatio).getByText('À compléter')).toBeInTheDocument()
    expect(within(creatio).getByText('En lancement')).toBeInTheDocument()
    expect(within(creatio).getByText('Pas de référent')).toBeInTheDocument()
    const decisio = cards.find((c) => within(c).queryByRole('heading', { name: 'Decisio' }))!
    expect(within(decisio).queryByText(/Brouillon|À compléter/)).toBeNull()
  })

  it('recherche avec debounce et montre les extraits trouvés', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Arrow' })
    mockedFetch.mockResolvedValue({
      sheets: [makeListItem({ matches: [{ field: 'offers', excerpt: '… pack Start à 49 € …' }] })],
      canEdit: false,
    })
    const input = screen.getByRole('searchbox', { name: 'Rechercher dans les fiches' })
    fireEvent.change(input, { target: { value: 'tarif' } })
    // Pas d'appel immédiat : le debounce attend ~300 ms.
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockedFetch).toHaveBeenLastCalledWith('/api/admin/project-sheets?q=tarif'), {
      timeout: 2000,
    })
    expect(await screen.findByText('… pack Start à 49 € …')).toBeInTheDocument()
    expect(screen.getByText('Offres et tarifs')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Creatio' })).toBeNull()
  })

  it('n’affiche pas d’extraits hors recherche', async () => {
    mockedFetch.mockResolvedValue({
      sheets: [makeListItem({ matches: [{ field: 'offers', excerpt: 'extrait caché' }] })],
      canEdit: false,
    })
    mount()
    await screen.findByRole('heading', { name: 'Arrow' })
    expect(screen.queryByText('extrait caché')).toBeNull()
  })

  it('demande les fiches archivées via la case dédiée', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Arrow' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Afficher les archivées' }))
    await waitFor(() => expect(mockedFetch).toHaveBeenLastCalledWith('/api/admin/project-sheets?archived=true'))
  })

  it('message dédié quand la recherche ne donne rien', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Arrow' })
    mockedFetch.mockResolvedValue({ sheets: [], canEdit: false })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(
      await screen.findByText('Aucune fiche ne correspond à « zzz ».', undefined, { timeout: 2000 }),
    ).toBeInTheDocument()
  })

  it('masque « Nouvelle fiche » en lecture seule', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Arrow' })
    expect(screen.queryByRole('button', { name: /Nouvelle fiche/ })).toBeNull()
  })

  it('crée une fiche (nom requis) puis ouvre la fiche', async () => {
    mockedFetch.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') return { sheet: { _id: 'n1', slug: 'nouveau-projet', name: 'Nouveau projet' } }
      return { sheets: SHEETS, canEdit: true }
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Nouvelle fiche/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer la fiche' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le nom est obligatoire.')
    expect(mockedFetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false)
    fireEvent.change(screen.getByLabelText('Nom du projet'), { target: { value: 'Nouveau projet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la fiche' }))
    expect(await screen.findByText('Page fiche')).toBeInTheDocument()
    const post = mockedFetch.mock.calls.find(([, o]) => o?.method === 'POST')!
    expect(post[0]).toBe('/api/admin/project-sheets')
    expect(JSON.parse(post[1]!.body as string)).toEqual({ name: 'Nouveau projet' })
  })
})
