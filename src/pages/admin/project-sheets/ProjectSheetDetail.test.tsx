import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { loadLazyMessages } from '../../../i18n'
import { apiFetch } from '../../../lib/api'
import ProjectSheetDetail from './ProjectSheetDetail'
import { META, makeSheet } from './fixtures'
import type { ProjectSheet } from '../../../types/projectSheet.types'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const mockedFetch = vi.mocked(apiFetch)

beforeAll(loadLazyMessages)

let current: ProjectSheet

function route(handlers: Record<string, (options: RequestInit | undefined) => unknown> = {}) {
  mockedFetch.mockImplementation(async (path, options) => {
    const key = (options?.method || 'GET') + ' ' + path
    if (handlers[key]) return handlers[key](options) as never
    if (path === '/api/admin/project-sheets/meta') return META as never
    if (path === '/api/admin/project-sheets/arrow') return { sheet: current } as never
    throw new Error('Appel non prévu : ' + key)
  })
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/admin/projets/fiches/arrow']}>
      <Routes>
        <Route path="/admin/projets/fiches/:slug" element={<ProjectSheetDetail />} />
        <Route path="/admin/projets/fiches" element={<p>Liste</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const section = (id: string) => document.getElementById(id) as HTMLElement
const patchCalls = () => mockedFetch.mock.calls.filter(([, o]) => o?.method === 'PATCH')

beforeEach(() => {
  mockedFetch.mockReset()
  current = makeSheet()
  route()
})

describe('Fiche projet — lecture', () => {
  it('affiche l’en-tête d’identité et un sommaire ancré vers chaque section', async () => {
    mount()
    expect(await screen.findByRole('heading', { level: 1, name: 'Arrow' })).toBeInTheDocument()
    expect(screen.getAllByText('Brouillon à relire').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', 'https://arrow.example.test')
    const toc = screen.getByRole('navigation', { name: 'Sommaire de la fiche' })
    const links = within(toc).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#identite',
      '#oneLiner',
      '#whatWeDo',
      '#audience',
      '#positioning',
      '#brandVoice',
      '#offers',
      '#keyFigures',
      '#stack',
      '#links',
      '#team',
      '#roadmap',
      '#decisions',
      '#prospectFaq',
      '#glossary',
      '#demo',
      '#history',
    ])
    // Chaque ancre pointe vers une section réellement présente, dans le même ordre.
    for (const a of links) expect(document.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      links.map((a) => a.textContent),
    )
    expect(links[2]).toHaveTextContent('Ce qu’on fait (offre, pour qui, problème résolu)')
  })

  it('rend le Markdown, « À compléter » pour les sections vides, les liens calculés et l’historique', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    expect(within(section('whatWeDo')).getByText('les CFA').tagName).toBe('STRONG')
    expect(within(section('offers')).getByRole('cell', { name: '49 €' })).toBeInTheDocument()
    expect(within(section('audience')).getByText('À compléter')).toBeInTheDocument()
    expect(within(section('glossary')).getByText('À compléter')).toBeInTheDocument()
    expect(within(section('stack')).queryByText('À compléter')).toBeNull()
    const links = section('links')
    expect(within(links).getByRole('link', { name: 'Code' })).toHaveAttribute('href', 'https://git.example.test/arrow')
    expect(within(links).getByRole('link', { name: 'CRM : 4 leads ouverts, 2 gagnés' })).toHaveAttribute(
      'href',
      '/admin/crm?project=ARROW',
    )
    expect(within(links).getByRole('link', { name: 'Dev tracker : Arrow dev' })).toHaveAttribute(
      'href',
      '/admin/dev/projects/dp1',
    )
    expect(within(links).queryByText(/Dossier filiale/)).toBeNull()
    expect(within(section('team')).getByText('Camille')).toBeInTheDocument()
    const history = section('history')
    expect(within(history).getByText('Raphael')).toBeInTheDocument()
    expect(within(history).getByText('Champs : Positionnement, Statut')).toBeInTheDocument()
  })

  it('montre le lien vers le dossier filiale quand il est fourni', async () => {
    current = makeSheet({ subsidiaryHref: '/admin/filiales/s1' })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    expect(within(section('links')).getByRole('link', { name: 'Dossier filiale (confidentiel)' })).toHaveAttribute(
      'href',
      '/admin/filiales/s1',
    )
  })

  it('n’interprète pas le HTML saisi dans une section', async () => {
    current = makeSheet({ roadmap: '<script>alert(1)</script> **ok**' })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    expect(section('roadmap').querySelector('script')).toBeNull()
    expect(section('roadmap')).toHaveTextContent('<script>alert(1)</script>')
  })

  it('signale une fiche introuvable', async () => {
    mockedFetch.mockRejectedValue(Object.assign(new Error('Introuvable'), { status: 404 }))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Fiche introuvable.')
  })
})

describe('Fiche projet — lecture seule', () => {
  it('n’affiche aucun bouton d’édition ni d’ajout d’accès quand canEdit est faux', async () => {
    current = makeSheet({ canEdit: false })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ajouter un accès démo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
    expect(screen.getByText('Lecture seule')).toBeInTheDocument()
    expect(mockedFetch.mock.calls.some(([p]) => p === '/api/admin/project-sheets/meta')).toBe(false)
  })
})

describe('Fiche projet — édition par section', () => {
  it('envoie uniquement les champs de la section et baseUpdatedAt, puis remplace la fiche', async () => {
    const updated = makeSheet({ positioning: 'Le plus simple du marché', updatedAt: '2026-11-02T08:00:00.000Z' })
    route({ 'PATCH /api/admin/project-sheets/sheet1': () => ({ sheet: updated }) })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    const positioning = section('positioning')
    fireEvent.click(within(positioning).getByRole('button', { name: /Modifier/ }))
    expect(
      within(positioning).getByText('Ne saisissez jamais de secret (mot de passe, clé, jeton) dans une fiche.'),
    ).toBeInTheDocument()
    const textarea = within(positioning).getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Le **plus simple** du marché' } })
    expect(within(positioning).getByLabelText('Aperçu')).toHaveTextContent('Le plus simple du marché')
    fireEvent.click(within(positioning).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    const [path, options] = patchCalls()[0]
    expect(path).toBe('/api/admin/project-sheets/sheet1')
    expect(JSON.parse(options!.body as string)).toEqual({
      positioning: 'Le **plus simple** du marché',
      baseUpdatedAt: '2026-11-01T10:00:00.000Z',
    })
    await waitFor(() => expect(within(section('positioning')).queryByRole('textbox')).toBeNull())
    expect(within(section('positioning')).getByText('Le plus simple du marché')).toBeInTheDocument()
  })

  it('affiche le message de conflit sur 409 SHEET_CONFLICT et ne ferme pas l’éditeur', async () => {
    route({
      'PATCH /api/admin/project-sheets/sheet1': () => {
        throw Object.assign(new Error('Conflit'), {
          status: 409,
          payload: { error: 'Conflit', code: 'SHEET_CONFLICT' },
        })
      },
    })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    const audience = section('audience')
    fireEvent.click(within(audience).getByRole('button', { name: /Modifier/ }))
    fireEvent.change(within(audience).getByRole('textbox'), { target: { value: 'Les CFA' } })
    fireEvent.click(within(audience).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(audience).findByRole('alert')).toHaveTextContent(
      'La fiche a été modifiée entre-temps, rechargez.',
    )
    expect(within(audience).getByRole('textbox')).toHaveValue('Les CFA')
    expect(within(audience).getByRole('button', { name: 'Recharger la fiche' })).toBeInTheDocument()
  })

  it('« En une phrase » : texte simple limité à 300 caractères', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    fireEvent.click(within(section('oneLiner')).getByRole('button', { name: /Modifier/ }))
    expect(within(section('oneLiner')).getByRole('textbox')).toHaveAttribute('maxlength', '300')
  })

  it('Annuler ferme l’éditeur sans appel PATCH', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    const brand = section('brandVoice')
    fireEvent.click(within(brand).getByRole('button', { name: /Modifier/ }))
    fireEvent.click(within(brand).getByRole('button', { name: 'Annuler' }))
    expect(within(brand).queryByRole('textbox')).toBeNull()
    expect(patchCalls()).toHaveLength(0)
  })

  it('l’équipe s’édite avec les membres de /meta et envoie referent + team', async () => {
    route({ 'PATCH /api/admin/project-sheets/sheet1': () => ({ sheet: current }) })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    const team = section('team')
    await waitFor(() => expect(mockedFetch.mock.calls.some(([p]) => p === '/api/admin/project-sheets/meta')).toBe(true))
    fireEvent.click(within(team).getByRole('button', { name: /Modifier/ }))
    fireEvent.change(await within(team).findByLabelText('Référent'), { target: { value: 'u2' } })
    fireEvent.click(within(team).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(JSON.parse(patchCalls()[0][1]!.body as string)).toEqual({
      referent: 'u2',
      team: [{ user: 'u2', role: 'Produit' }],
      baseUpdatedAt: '2026-11-01T10:00:00.000Z',
    })
  })

  it('les liens envoient links + devProject', async () => {
    route({ 'PATCH /api/admin/project-sheets/sheet1': () => ({ sheet: current }) })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Arrow' })
    const links = section('links')
    await waitFor(() => expect(mockedFetch.mock.calls.some(([p]) => p === '/api/admin/project-sheets/meta')).toBe(true))
    fireEvent.click(within(links).getByRole('button', { name: /Modifier/ }))
    fireEvent.change(within(links).getByLabelText('Projet du dev tracker'), { target: { value: '' } })
    fireEvent.click(within(links).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(JSON.parse(patchCalls()[0][1]!.body as string)).toEqual({
      links: [{ type: 'repo', label: 'Code', url: 'https://git.example.test/arrow' }],
      devProject: null,
      baseUpdatedAt: '2026-11-01T10:00:00.000Z',
    })
  })
})
