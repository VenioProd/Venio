import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { loadLazyMessages } from '../../../i18n'
import type { Subsidiary } from '../../../types/subsidiary.types'
import DossierSections from './DossierSections'
vi.mock('./LegacyResources', () => ({ default: () => <div>Documents & credentials</div> }))
beforeAll(loadLazyMessages)
const sub = {
  _id: 'arrow',
  name: 'Arrow',
  description: 'CRM',
  features: [],
  pricing: [],
  competitors: [],
  objections: [],
  pilotage: { goals: [], scorecard: [], decisions: [], cadence: [] },
} as unknown as Subsidiary
function mount(save = vi.fn().mockResolvedValue(undefined)) {
  return {
    save,
    ...render(
      <MemoryRouter>
        <DossierSections sub={sub} save={save} onChange={vi.fn()} devProjects={[]} leadProjects={['ARROW']} />
      </MemoryRouter>,
    ),
  }
}
describe('Platform dossier', () => {
  it('renders all sections in the requested order with useful empty states', () => {
    mount()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
      'Présentation',
      'Fonctionnalités',
      'Offre & tarifs',
      'Clients signés',
      'Prospects chauds',
      'Concurrents',
      'Argumentaire',
      'Pilotage',
      'Dev tracker',
      'Documents, contacts & accès',
    ])
    expect(screen.getByText('Ajouter la première fonctionnalité avec « Modifier ».')).toBeInTheDocument()
  })
  it('adds, reorders and removes features and saves only that section', async () => {
    const { save } = mount()
    const section = document.getElementById('features')!
    fireEvent.click(within(section).getByRole('button', { name: 'Modifier' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Ajouter une entrée' }))
    fireEvent.change(within(section).getByLabelText('Nom'), { target: { value: 'Export' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Ajouter une entrée' }))
    fireEvent.change(within(section).getAllByLabelText('Nom')[1], { target: { value: 'Import' } })
    fireEvent.click(within(section).getAllByRole('button', { name: 'Monter' })[1])
    expect(within(section).getAllByLabelText('Nom')[0]).toHaveValue('Import')
    fireEvent.click(within(section).getAllByRole('button', { name: 'Supprimer' })[1])
    fireEvent.click(within(section).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        features: [{ name: 'Import', description: '', status: 'PREVUE', category: '' }],
      }),
    )
  })
  it('keeps the draft open and displays save failures', async () => {
    mount(vi.fn().mockRejectedValue(new Error('Erreur serveur')))
    const section = document.getElementById('presentation')!
    fireEvent.click(within(section).getByRole('button', { name: 'Modifier' }))
    fireEvent.change(within(section).getByLabelText('Cible / ICP'), { target: { value: 'PME' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Erreur serveur'))
    expect(within(section).getByLabelText('Cible / ICP')).toHaveValue('PME')
  })
})
