import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import PipelineColumn from './PipelineColumn'
import LeadDetailModal from './LeadDetailModal'
import { formatMoney } from '../../../i18n/format'
import type { Lead } from '../../../types/crm.types'

vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Interaction timeline</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Revenue chain</p> }))

const lead: Lead = { _id: 'lead-1', company: 'Atelier Lumière', status: 'LEAD', budget: 12500 }
const callbacks = () => ({
  onUpdateLead: vi.fn().mockResolvedValue(undefined),
  onConvertToClient: vi.fn(),
  onDrop: vi.fn(),
  onDragStart: vi.fn(),
  onOpenDetail: vi.fn(),
})

describe('présentation du pipeline Système', () => {
  it('totalise les budgets connus et ouvre le détail sans modifier le lead', () => {
    const handlers = callbacks()
    render(
      <PipelineColumn
        column={{ status: 'LEAD', leads: [lead, { ...lead, _id: 'lead-2', company: 'Studio Horizon', budget: null }] }}
        admins={[]}
        adminsById={{}}
        canManageCrm
        converting={null}
        {...handlers}
      />,
    )
    expect(
      screen.getByTitle(`Budget total : ${formatMoney(12500, 'EUR', { maximumFractionDigits: 0 })}`, {
        normalizer: (value) => value,
      }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: lead.company }))
    expect(handlers.onOpenDetail).toHaveBeenCalledWith(lead)
    expect(handlers.onUpdateLead).not.toHaveBeenCalled()
    expect(handlers.onConvertToClient).not.toHaveBeenCalled()
  })

  it('explique les colonnes vides', () => {
    render(
      <PipelineColumn
        column={{ status: 'QUALIFIED', leads: [] }}
        admins={[]}
        adminsById={{}}
        canManageCrm={false}
        converting={null}
        {...callbacks()}
      />,
    )
    expect(screen.getByText('Aucune opportunité à cette étape.')).toBeInTheDocument()
  })

  it('nomme le drawer, conserve ses contenus et rend le focus à sa fermeture', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(
      <MemoryRouter>
        <LeadDetailModal
          lead={lead}
          admins={[]}
          canManageCrm={false}
          converting={null}
          onClose={onClose}
          onLeadChange={vi.fn()}
          onUpdateLead={vi.fn()}
          onConvertToClient={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('dialog', { name: /Atelier Lumière/ })).toHaveFocus()
    expect(screen.getByText('Interaction timeline')).toBeInTheDocument()
    expect(screen.getByText('Revenue chain')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
