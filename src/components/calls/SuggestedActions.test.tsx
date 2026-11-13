import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api'
import type { ActionChoices, AnalysisReview, ApplyInput, CallAnalysis } from '../../services/callInsights'
import AnalysisReviewPanel from './AnalysisReviewPanel'
import SuggestedActions from './SuggestedActions'
import { analysisFixture } from './callInsights.fixtures'

const analysis: CallAnalysis = {
  ...structuredClone(analysisFixture.analysis),
}
analysis.output!.actions = [
  { id: 's1', type: 'SEQUENCE', label: 'Inscrire à Relance devis', dueAt: null, reason: 'Pas prête à signer' },
  {
    id: 'h1',
    type: 'HANDOFF',
    label: 'Confier la fiche au bon interlocuteur',
    dueAt: null,
    reason: 'Demande un devis',
  },
]

const teamChoices: ActionChoices = {
  handoff: 'MEMBER',
  teamOnly: [],
  sequences: [
    { _id: 'seq1', name: 'Relance devis', status: 'ACTIVE' },
    { _id: 'seq2', name: 'Nurturing', status: 'DRAFT' },
  ],
  suggestedSequences: { s1: 'seq1' },
  members: [{ _id: 'm1', name: 'Marc Petit' }],
}
const repChoices: ActionChoices = {
  handoff: 'CLOSER',
  teamOnly: ['SEQUENCE'],
  sequences: [],
  suggestedSequences: {},
  members: [],
}

function mount(choices: ActionChoices, onApply = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AnalysisReviewPanel
      analysis={structuredClone(analysis)}
      current={{}}
      onApply={onApply}
      onReject={vi.fn()}
      actionChoices={choices}
    />,
  )
  return onApply
}

const actionItem = (label: string) => screen.getByText(label).closest('li') as HTMLElement
const accept = (item: HTMLElement) => fireEvent.click(within(item).getByRole('button', { name: /Accepter/ }))
const sent = (onApply: ReturnType<typeof vi.fn>) => (onApply.mock.calls[0]![0] as ApplyInput).actions

describe('SuggestedActions : séquence et passage de main', () => {
  it('équipe : séquence préremplie, membre à choisir avant d’accepter, choix envoyés', async () => {
    const onApply = mount(teamChoices)
    const sequence = actionItem('Inscrire à Relance devis')
    expect(within(sequence).getByLabelText('Séquence')).toHaveValue('seq1')
    accept(sequence)

    const handoff = actionItem('Confier la fiche au bon interlocuteur')
    const acceptHandoff = within(handoff).getByRole('button', { name: /Accepter/ })
    expect(acceptHandoff).toBeDisabled()
    fireEvent.change(within(handoff).getByLabelText('Passer la main à'), { target: { value: 'm1' } })
    fireEvent.click(acceptHandoff)

    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(sent(onApply)).toEqual([
      { id: 's1', action: 'ACCEPT', sequenceId: 'seq1' },
      { id: 'h1', action: 'ACCEPT', assigneeId: 'm1' },
    ])
  })

  it('externe : séquence réservée à l’équipe, passage au closer sans choix', async () => {
    const onApply = mount(repChoices)
    const sequence = actionItem('Inscrire à Relance devis')
    expect(within(sequence).getByText(/revient à l’équipe/)).toBeInTheDocument()
    expect(within(sequence).getByRole('button', { name: /Accepter/ })).toBeDisabled()
    const handoff = actionItem('Confier la fiche au bon interlocuteur')
    expect(within(handoff).getByText(/transmet la fiche au closer/)).toBeInTheDocument()
    accept(handoff)
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(sent(onApply)).toEqual([
      { id: 's1', action: 'IGNORE' },
      { id: 'h1', action: 'ACCEPT' },
    ])
  })

  it('refus d’inscription du serveur : motif lisible', async () => {
    const failure = new ApiError(409, 'refus', { code: 'SEQUENCE_NOT_ALLOWED', reason: 'CONSENT_WITHDRAWN', id: 's1' })
    mount(teamChoices, vi.fn().mockRejectedValue(failure))
    accept(actionItem('Inscrire à Relance devis'))
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Inscription impossible : le consentement a été retiré. Ignorez l’action.',
    )
  })

  it('lecture : ce que l’action a produit', () => {
    const review: AnalysisReview = {
      by: 'u1',
      at: '2026-11-13T10:00:00.000Z',
      decisions: [
        {
          path: 'actions.s1',
          action: 'ACCEPT',
          before: null,
          after: { sequenceName: 'Relance devis', enrollment: { status: 'REFUSED', reason: 'SUPPRESSED' } },
        },
        { path: 'actions.h1', action: 'ACCEPT', before: null, after: { assignedTo: 'm1', assigneeName: 'Marc Petit' } },
      ],
    }
    render(
      <SuggestedActions
        actions={analysis.output!.actions}
        state={{}}
        onChange={vi.fn()}
        review={review}
        readOnly
        choices={teamChoices}
      />,
    )
    expect(
      screen.getByText('Inscription à « Relance devis » refusée : l’adresse est dans la liste « ne pas contacter »'),
    ).toBeInTheDocument()
    expect(screen.getByText('Main passée à Marc Petit')).toBeInTheDocument()
  })
})
