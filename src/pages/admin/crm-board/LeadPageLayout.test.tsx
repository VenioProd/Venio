import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../../../lib/api'
import type { Lead } from '../../../types/crm.types'
import LeadDetailPage from './LeadDetailPage'

vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Journal</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Chaîne</p> }))
vi.mock('../../../lib/api', async () => ({ ...(await vi.importActual<object>('../../../lib/api')), apiFetch: vi.fn() }))

beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation((async () => ({ duplicates: [], calls: [] })) as typeof apiFetch)
})
afterEach(cleanup)

function mount(lead: Partial<Lead>, props: { canManageCrm?: boolean; search?: string } = {}) {
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={[`/admin/crm/leads/a${props.search ?? ''}`]}>
      <LeadDetailPage
        lead={{ _id: 'a', company: 'Atelier Lumière', status: 'DEMO', ...lead }}
        admins={[]}
        canManageCrm={props.canManageCrm ?? true}
        converting={null}
        onClose={onClose}
        onLeadChange={vi.fn()}
        onUpdateLead={vi.fn().mockResolvedValue(undefined)}
        onConvertToClient={vi.fn()}
      />
    </MemoryRouter>,
  )
  return onClose
}

it('nomme l’écran d’origine dans le bouton de retour, pipeline par défaut, file de travail si elle a ouvert la fiche', () => {
  const onClose = mount({})
  fireEvent.click(screen.getByRole('button', { name: 'Retour : Pipeline' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  cleanup()
  mount({}, { search: '?from=semaine' })
  expect(screen.getByRole('button', { name: 'Retour : Cette semaine' })).toBeInTheDocument()
})

it('ouvre l’historique et place le focus dans le journal quand on clique sur « Consigner un échange »', async () => {
  mount({})
  expect(screen.getByRole('tab', { name: 'Appels et analyses' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Consigner un échange' }))
  expect(await screen.findByText('Journal')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Historique' })).toHaveAttribute('aria-selected', 'true')
})

it('annonce une fiche transmise au closer et garde tous les onglets d’avant', () => {
  mount({ closingHandoff: { at: '2026-11-12T10:00:00.000Z' } })
  expect(screen.getByText('Fiche transmise au closer', { selector: 'strong' })).toBeInTheDocument()
  for (const name of ['Appels et analyses', 'Historique', 'Séquences', 'Détails', 'Données personnelles'])
    expect(screen.getByRole('tab', { name })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Chaîne commerciale' })).toBeInTheDocument()
})

it('range convertir en client, données personnelles et copie dans le menu, flèches et Échap comprises', () => {
  mount({ status: 'WON' })
  const trigger = screen.getByRole('button', { name: 'Autres actions' })
  fireEvent.click(trigger)
  const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
  expect(items).toEqual(
    expect.arrayContaining(['Convertir en client', 'Données personnelles', 'Copier les infos de contact', 'Archiver']),
  )
  const first = screen.getAllByRole('menuitem')[0]!
  expect(first).toHaveFocus()
  fireEvent.keyDown(first, { key: 'ArrowDown' })
  expect(screen.getAllByRole('menuitem')[1]).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(trigger).toHaveFocus()
})

it('sans droit d’écriture : ni Appeler, ni Écrire, ni archivage, mais la fiche reste lisible', () => {
  mount({ contactPhone: '+33612345678' }, { canManageCrm: false })
  expect(screen.queryByRole('button', { name: 'Appeler' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Écrire' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Autres actions' }))
  expect(screen.queryByRole('menuitem', { name: 'Archiver' })).toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Données personnelles' })).toBeInTheDocument()
})
