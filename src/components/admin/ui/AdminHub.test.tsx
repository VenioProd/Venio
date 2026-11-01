import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import HubTabs, { type HubTab } from './HubTabs'
import PageHeader from './PageHeader'

function Location() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="URL">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => navigate(-1)}>Retour</button>
    </>
  )
}

const tabs: HubTab[] = [
  { id: 'one', label: 'Premier', to: '/hub/un', count: 0, content: <p>Contenu un</p> },
  { id: 'secret', label: 'Secret', to: '/hub/secret', allowed: false, content: <p>Contenu interdit</p> },
  { id: 'two', label: 'Second', to: '/hub/deux', count: 12, content: <p>Contenu deux</p> },
  { id: 'three', label: 'Troisième', to: '/hub/trois', content: <p>Contenu trois</p> },
]

function mount(path = '/hub/un?filtre=actif#position') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HubTabs label="Sections" tabs={tabs}>
        {(tablist) => (
          <PageHeader
            eyebrow="Production"
            title="Hub"
            subtitle="Description"
            actions={<button>Créer</button>}
            tabs={tablist}
          />
        )}
      </HubTabs>
      <Location />
    </MemoryRouter>,
  )
}

describe('PageHeader et HubTabs', () => {
  it('affiche le titre, le contexte, les actions et les onglets dans le header', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Hub' })).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Sections' }).closest('header')).toBeInTheDocument()
  })

  it('relie les tabs et panels, conserve le compteur zéro et ne monte que le contenu actif', () => {
    mount()
    const active = screen.getByRole('tab', { name: 'Premier 0' })
    const panel = screen.getByRole('tabpanel')
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(active).toHaveAttribute('tabindex', '0')
    expect(panel.id).toBe(active.getAttribute('aria-controls'))
    expect(panel).toHaveAttribute('aria-labelledby', active.id)
    expect(screen.queryByRole('tab', { name: 'Secret' })).not.toBeInTheDocument()
    expect(screen.queryByText('Contenu interdit')).not.toBeInTheDocument()
    expect(screen.queryByText('Contenu deux')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(3)
    for (const tab of screen.getAllByRole('tab'))
      expect(document.getElementById(tab.getAttribute('aria-controls')!)).toBeInTheDocument()
  })

  it('synchronise clics, URL, paramètres et historique', () => {
    mount()
    fireEvent.click(screen.getByRole('tab', { name: 'Second 12' }))
    expect(screen.getByLabelText('URL')).toHaveTextContent('/hub/deux?filtre=actif#position')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Contenu deux')
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(screen.getByRole('tab', { name: 'Premier 0' })).toHaveAttribute('aria-selected', 'true')
  })

  it('gère flèches, bouclage, Home et End avec focus sur le tab actif', () => {
    mount()
    const first = screen.getByRole('tab', { name: 'Premier 0' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Second 12' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Troisième' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Troisième' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(first).toHaveFocus()
  })

  it('redirige un onglet interdit vers le premier autorisé en gardant les paramètres', () => {
    mount('/hub/secret?filtre=actif#position')
    expect(screen.getByLabelText('URL')).toHaveTextContent('/hub/un?filtre=actif#position')
    expect(screen.queryByText('Contenu interdit')).not.toBeInTheDocument()
  })

  it('ne fait défiler que la barre horizontale lors du focus clavier', () => {
    mount()
    const list = screen.getByRole('tablist')
    const second = screen.getByRole('tab', { name: 'Second 12' })
    Object.defineProperties(list, { clientWidth: { value: 100 }, scrollLeft: { value: 0, writable: true } })
    Object.defineProperties(second, { offsetLeft: { value: 140 }, offsetWidth: { value: 80 } })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Premier 0' }), { key: 'ArrowRight' })
    expect(list.scrollLeft).toBe(120)
  })
})
