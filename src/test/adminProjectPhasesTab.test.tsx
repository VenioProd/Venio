import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProjectPhasesTab from '../pages/admin/project-detail/ProjectPhasesTab'
import type { ProjectItem, ProjectPhase } from '../types/project.types'

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Maquettes',
  description: '',
  order: 0,
  dueAt: null,
  status: 'EN_COURS',
  requiresClientValidation: true,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

const items: ProjectItem[] = [
  { _id: 'item-1', type: 'MAQUETTE', title: 'Maquettes desktop', isVisible: true, isDownloadable: true },
  { _id: 'item-2', type: 'NOTE', title: 'Note interne', isVisible: false, isDownloadable: false },
]

function renderTab(phases: ProjectPhase[], canManagePhases = true) {
  const handlers = {
    onSubmitPhase: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
    onStartEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onDeletePhase: vi.fn(),
    onTransition: vi.fn(),
    onMovePhase: vi.fn(),
    onResolveRevision: vi.fn(),
  }
  render(
    <ProjectPhasesTab
      phases={phases}
      items={items}
      phaseForm={{ title: '', description: '', dueAt: '', requiresClientValidation: false, linkedItems: [] }}
      setPhaseForm={vi.fn()}
      editingPhaseId={null}
      canManagePhases={canManagePhases}
      {...handlers}
    />,
  )
  return handlers
}

describe('ProjectPhasesTab', () => {
  it('propose les transitions correspondant au statut', () => {
    const { onTransition } = renderTab([phase()])

    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Demander la validation client' }))
    expect(onTransition).toHaveBeenCalledWith('phase-1', 'request-validation')
  })

  it('propose Démarrer sur une étape à venir et Annuler la demande en attente', () => {
    const { onTransition } = renderTab([
      phase({ _id: 'p1', title: 'Cadrage', status: 'A_VENIR' }),
      phase({ _id: 'p2', title: 'Maquettes', order: 1, status: 'EN_ATTENTE_VALIDATION' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Démarrer' }))
    expect(onTransition).toHaveBeenCalledWith('p1', 'start')

    fireEvent.click(screen.getByRole('button', { name: 'Annuler la demande' }))
    expect(onTransition).toHaveBeenCalledWith('p2', 'cancel-validation-request')
  })

  it('affiche la mention de validation et fige les actions d’édition', () => {
    renderTab([
      phase({
        status: 'TERMINEE',
        validation: { validatedByName: 'Claire Corbel', validatedAt: '2026-08-12T14:32:00.000Z', comment: '' },
      }),
    ])

    expect(screen.getByText(/Validée par Claire Corbel le 12 août 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Rouvrir' })).not.toBeInTheDocument()
  })

  it('réordonne via les boutons monter/descendre', () => {
    const { onMovePhase } = renderTab([
      phase({ _id: 'p1', title: 'Cadrage' }),
      phase({ _id: 'p2', title: 'Maquettes', order: 1 }),
    ])

    fireEvent.click(screen.getAllByRole('button', { name: 'Descendre' })[0])
    expect(onMovePhase).toHaveBeenCalledWith('p1', 1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Monter' })[1])
    expect(onMovePhase).toHaveBeenCalledWith('p2', -1)
  })

  it('liste les demandes de retouches ouvertes avec leur bouton de traitement', () => {
    const { onResolveRevision } = renderTab([
      phase({
        revisionRequests: [
          {
            _id: 'rev-1',
            requestedByName: 'Claire Corbel',
            comment: 'Header trop dense',
            createdAt: '2026-08-20T09:00:00.000Z',
            resolvedAt: null,
          },
        ],
      }),
    ])

    expect(screen.getByText('Header trop dense')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Marquer traitée' }))
    expect(onResolveRevision).toHaveBeenCalledWith('phase-1', 'rev-1')
  })

  it('liste aussi les demandes traitées, avec leur état et sans bouton de traitement', () => {
    renderTab([
      phase({
        revisionRequests: [
          {
            _id: 'rev-1',
            requestedByName: 'Claire Corbel',
            comment: 'Header trop dense',
            createdAt: '2026-08-20T09:00:00.000Z',
            resolvedAt: null,
          },
          {
            _id: 'rev-2',
            requestedByName: 'Claire Corbel',
            comment: 'Logo trop petit',
            createdAt: '2026-08-18T09:00:00.000Z',
            resolvedAt: '2026-08-19T09:00:00.000Z',
          },
        ],
      }),
    ])

    expect(screen.getByText('Header trop dense')).toBeInTheDocument()
    expect(screen.getByText('Logo trop petit')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
    expect(screen.getByText('Traitée le 19 août 2026')).toBeInTheDocument()
    // Le bouton n'existe que pour la demande encore ouverte.
    expect(screen.getAllByRole('button', { name: 'Marquer traitée' })).toHaveLength(1)
  })

  it('avertit quand un livrable lié est masqué au client', () => {
    renderTab([phase({ linkedItems: [{ _id: 'item-2', title: 'Note interne', type: 'NOTE', isVisible: false }] })])
    // Deux occurrences attendues : la liste des livrables liés de l'étape et le
    // sélecteur du formulaire, qui listent tous deux l'item masqué.
    expect(screen.getAllByText(/Masqué au client/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Note interne/).length).toBeGreaterThanOrEqual(1)
  })

  it('masque le formulaire et les actions sans manage_phases', () => {
    renderTab([phase()], false)
    expect(screen.queryByLabelText('Titre de l’étape')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander la validation client' })).not.toBeInTheDocument()
  })
})
