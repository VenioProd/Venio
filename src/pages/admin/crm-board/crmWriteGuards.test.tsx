import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmBoard from './index'
import PipelineColumn from './PipelineColumn'
import { apiFetch } from '../../../lib/api'
import { DEFAULT_WORKLIST_THRESHOLDS } from './constants'
import { DEFAULT_FOLLOW_UP } from './worklist/helpers'
import type { Lead } from '../../../types/crm.types'
import { getPermissionsForRole } from '../../../lib/permissions'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'STAGIAIRE' }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: auth.role } }) }))
vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Interaction timeline</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Revenue chain</p> }))

const lead: Lead = { _id: 'lead-1', company: 'Atelier Lumière', status: 'LEAD', budget: 12500 }

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/api/admin/crm/pipeline') return { columns: [{ status: 'LEAD', leads: [lead] }] }
    if (path === '/api/admin/admins') return { users: [] }
    if (path === '/api/admin/crm/worklist')
      return {
        groups: { overdue: [lead], today: [], upcoming: [], drifting: [] },
        counts: { overdue: 1, today: 0, upcoming: 0, drifting: 0 },
        thresholds: DEFAULT_WORKLIST_THRESHOLDS,
        followUp: DEFAULT_FOLLOW_UP,
        lostReasons: [],
      }
    throw new Error(`Unexpected API request: ${path}`)
  })
})

describe('CRM principal — gardes d’écriture', () => {
  it('le rôle STAGIAIRE n’a plus manage_crm dans la matrice', () => {
    expect(getPermissionsForRole('STAGIAIRE')).not.toContain('manage_crm')
    expect(getPermissionsForRole('STAGIAIRE')).toContain('view_crm')
  })

  it('STAGIAIRE ne voit ni « Nouveau lead », ni le lien des réglages, ni les actions de la file', async () => {
    auth.role = 'STAGIAIRE'
    render(
      <MemoryRouter initialEntries={['/admin/crm']}>
        <CrmBoard />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Atelier Lumière')).toBeInTheDocument()
    expect(screen.queryByText('+ Nouveau lead')).toBeNull()
    expect(screen.queryByRole('link', { name: /utomatisation/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Contacté/ })).toBeNull()
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.every(
          ([, opts]) => !opts || (opts as RequestInit).method === undefined || (opts as RequestInit).method === 'GET',
        ),
    ).toBe(true)
  })

  it('un profil avec manage_crm voit « Nouveau lead »', async () => {
    auth.role = 'MANAGER'
    render(
      <MemoryRouter initialEntries={['/admin/crm']}>
        <CrmBoard />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Atelier Lumière')).toBeInTheDocument()
    expect(screen.getByText('+ Nouveau lead')).toBeInTheDocument()
  })

  it('Kanban en lecture seule : carte non déplaçable et sans sélecteur d’attribution', () => {
    const props = {
      admins: [],
      adminsById: {},
      converting: null,
      onUpdateLead: vi.fn(),
      onConvertToClient: vi.fn(),
      onDrop: vi.fn(),
      onDragStart: vi.fn(),
      onOpenDetail: vi.fn(),
    }
    const { container, rerender } = render(
      <PipelineColumn column={{ status: 'LEAD', leads: [lead] }} canManageCrm={false} {...props} />,
    )
    const card = container.querySelector('.crm-card') as HTMLElement
    expect(card.getAttribute('draggable')).toBe('false')
    expect(container.querySelector('.crm-card-assignee .portal-input')).toBeNull()
    rerender(<PipelineColumn column={{ status: 'LEAD', leads: [lead] }} canManageCrm {...props} />)
    expect((container.querySelector('.crm-card') as HTMLElement).getAttribute('draggable')).toBe('true')
    expect(
      container.querySelector('.crm-card-assignee .portal-input, .crm-card-assignee [class*="select"]'),
    ).not.toBeNull()
  })
})
