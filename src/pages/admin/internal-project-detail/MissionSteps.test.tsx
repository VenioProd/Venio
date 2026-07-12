import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MissionSteps from './MissionSteps'
import type { Mission } from './types'

const mission: Mission = {
  _id: 'mission-1',
  title: 'Concevoir la page',
  description: '',
  assignedTo: [{ _id: 'member-1', name: 'Ada Lovelace', email: 'ada@example.test' }],
  participants: [],
  status: 'EN_COURS',
  progress: 25,
  dueDate: null,
  steps: [
    {
      _id: 'step-1',
      title: 'Préparer la maquette',
      description: '',
      done: false,
      waitingReview: false,
      assignedTo: 'member-1',
    },
  ],
  deliverables: [],
  files: [],
  createdBy: { name: 'Admin' },
  createdAt: '2026-07-12T00:00:00.000Z',
}

function renderSteps(isSuperAdmin: boolean, missionOverride: Partial<Mission> = {}) {
  const onRequestReview = vi.fn()
  const onValidateStep = vi.fn()
  const onDeleteStep = vi.fn()

  render(
    <MissionSteps
      mission={{ ...mission, ...missionOverride }}
      isSuperAdmin={isSuperAdmin}
      expandedStep={null}
      setExpandedStep={vi.fn()}
      stepInputs={{}}
      setStepInputs={vi.fn()}
      stepAssigneeInputs={{}}
      setStepAssigneeInputs={vi.fn()}
      onToggleStep={vi.fn()}
      onAddStep={vi.fn()}
      onDeleteStep={onDeleteStep}
      onStepDescriptionUpdate={vi.fn()}
      onRequestReview={onRequestReview}
      onValidateStep={onValidateStep}
    />,
  )

  return { onDeleteStep, onRequestReview, onValidateStep }
}

describe('MissionSteps permissions', () => {
  it('lets a non-super-admin request review without exposing validation or deletion', () => {
    const { onRequestReview } = renderSteps(false)

    fireEvent.click(screen.getByRole('button', { name: 'Vérification' }))

    expect(onRequestReview).toHaveBeenCalledWith('mission-1', 'step-1')
    expect(screen.queryByRole('button', { name: /valider/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '✕' })).not.toBeInTheDocument()
  })

  it('reserves validation and deletion of a waiting step to a super-admin', () => {
    const { onDeleteStep, onValidateStep } = renderSteps(true, {
      steps: [{ ...mission.steps[0], waitingReview: true }],
    })

    fireEvent.click(screen.getByRole('button', { name: /valider/i }))
    fireEvent.click(screen.getByRole('button', { name: '✕' }))

    expect(onValidateStep).toHaveBeenCalledWith('mission-1', 'step-1')
    expect(onDeleteStep).toHaveBeenCalledWith('mission-1', expect.objectContaining({ _id: 'mission-1' }), 'step-1')
  })
})
