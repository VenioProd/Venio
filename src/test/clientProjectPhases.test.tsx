import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClientProjectPhases from '../pages/espace-client/ClientProjectPhases'
import type { ProjectPhase } from '../types/project.types'

const phase = (overrides: Partial<ProjectPhase> = {}): ProjectPhase => ({
  _id: 'phase-1',
  title: 'Maquettes',
  description: 'Les 5 pages sont prêtes.',
  order: 0,
  dueAt: null,
  status: 'EN_ATTENTE_VALIDATION',
  requiresClientValidation: true,
  linkedItems: [],
  validation: { validatedByName: '', validatedAt: null, comment: '' },
  revisionRequests: [],
  ...overrides,
})

function renderTimeline(phases: ProjectPhase[], accessRole: 'OWNER' | 'EDITOR' | 'VIEWER' = 'OWNER') {
  const onValidate = vi.fn().mockResolvedValue(undefined)
  const onRequestRevision = vi.fn().mockResolvedValue(undefined)
  render(
    <ClientProjectPhases
      phases={phases}
      accessRole={accessRole}
      onDownloadItem={vi.fn()}
      onValidate={onValidate}
      onRequestRevision={onRequestRevision}
    />,
  )
  return { onValidate, onRequestRevision }
}

describe('ClientProjectPhases', () => {
  it('affiche un état vide sans étape', () => {
    renderTimeline([])
    expect(screen.getByText('Le déroulé du projet apparaîtra ici.')).toBeInTheDocument()
  })

  it('affiche les libellés de statut et la mention de validation', () => {
    renderTimeline([
      phase({
        _id: 'p1',
        title: 'Cadrage',
        status: 'TERMINEE',
        validation: { validatedByName: 'Claire Corbel', validatedAt: '2026-08-12T14:32:00.000Z', comment: '' },
      }),
      phase({ _id: 'p2', title: 'Maquettes' }),
      phase({ _id: 'p3', title: 'Développement', status: 'A_VENIR', requiresClientValidation: false }),
    ])

    expect(screen.getByText('Terminée')).toBeInTheDocument()
    expect(screen.getByText('En attente de votre validation')).toBeInTheDocument()
    expect(screen.getByText('À venir')).toBeInTheDocument()
    expect(screen.getByText(/Validée par Claire Corbel le 12 août 2026/)).toBeInTheDocument()
  })

  it('signale qu’une étape à venir est bloquée par un jalon client non validé', () => {
    renderTimeline([
      phase({ _id: 'p1', title: 'Maquettes' }),
      phase({ _id: 'p2', title: 'Développement', order: 1, status: 'A_VENIR', requiresClientValidation: false }),
    ])
    expect(screen.getByText('Se débloque à la validation de « Maquettes »')).toBeInTheDocument()
  })

  it('valide l’étape après confirmation pour le propriétaire', async () => {
    const { onValidate } = renderTimeline([phase()])

    fireEvent.change(screen.getByPlaceholderText('Votre commentaire (obligatoire pour des retouches)'), {
      target: { value: 'Parfait' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette étape' }))
    const confirmButton = await screen.findByRole('button', { name: 'Valider' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(onValidate).toHaveBeenCalledWith('phase-1', 'Parfait'))
  })

  it('n’autorise les retouches qu’avec un commentaire', async () => {
    const { onRequestRevision } = renderTimeline([phase()])

    const button = screen.getByRole('button', { name: 'Demander des retouches' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Votre commentaire (obligatoire pour des retouches)'), {
      target: { value: 'Header trop dense' },
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    await waitFor(() => expect(onRequestRevision).toHaveBeenCalledWith('phase-1', 'Header trop dense'))
  })

  it('limite un EDITOR aux retouches et un VIEWER à la lecture', () => {
    const { unmount } = render(
      <ClientProjectPhases
        phases={[phase()]}
        accessRole="EDITOR"
        onDownloadItem={vi.fn()}
        onValidate={vi.fn()}
        onRequestRevision={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Valider cette étape' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander des retouches' })).toBeInTheDocument()
    expect(screen.getByText('En attente de validation par le propriétaire du projet')).toBeInTheDocument()
    unmount()

    renderTimeline([phase()], 'VIEWER')
    expect(screen.queryByRole('button', { name: 'Valider cette étape' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demander des retouches' })).not.toBeInTheDocument()
    expect(screen.getByText('En attente de validation par le propriétaire du projet')).toBeInTheDocument()
  })

  it('affiche les demandes de retouches non résolues', () => {
    renderTimeline([
      phase({
        status: 'EN_COURS',
        revisionRequests: [
          {
            _id: 'r1',
            requestedByName: 'Claire Corbel',
            comment: 'Header trop dense',
            createdAt: '2026-08-20T09:00:00.000Z',
            resolvedAt: null,
          },
          {
            _id: 'r2',
            requestedByName: 'Claire Corbel',
            comment: 'Déjà traitée',
            createdAt: '2026-08-18T09:00:00.000Z',
            resolvedAt: '2026-08-19T09:00:00.000Z',
          },
        ],
      }),
    ])

    expect(screen.getByText('Header trop dense')).toBeInTheDocument()
    expect(screen.queryByText('Déjà traitée')).not.toBeInTheDocument()
  })
})
