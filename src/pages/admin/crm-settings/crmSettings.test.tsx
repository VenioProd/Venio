import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSettings from './index'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: auth.role } }) }))

const settings = {
  autoAssignRoundRobin: false,
  autoQualifyEnabled: false,
  coldLeadAlertEnabled: true,
  overdueAlertEnabled: true,
  weeklyReportEnabled: false,
  weeklyReportRecipients: [],
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <CrmSettings />
    </MemoryRouter>,
  )

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/admin/crm/settings') return { settings }
    if (url === '/api/admin/admins') return { users: [] }
    return {}
  })
})

const writes = () => apiFetch.mock.calls.filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PATCH')

describe('réglages CRM — gardes de rôle', () => {
  it.each(['MANAGER', 'COMMERCIAL', 'STAGIAIRE'])('%s : lecture seule avec bandeau, contrôles désactivés, aucun PATCH', async (role) => {
    auth.role = role
    renderPage()
    expect(await screen.findByText(/Lecture seule/)).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) expect(box).toBeDisabled()
    fireEvent.click(boxes[0])
    expect(writes()).toEqual([])
  })

  it.each(['ADMIN', 'SUPER_ADMIN'])('%s : modifiable, sans bandeau', async (role) => {
    auth.role = role
    renderPage()
    await screen.findAllByRole('checkbox')
    expect(screen.queryByText(/Lecture seule/)).toBeNull()
    const boxes = screen.getAllByRole('checkbox')
    const target = boxes.find((b) => !(b as HTMLInputElement).disabled)
    expect(target).toBeDefined()
    fireEvent.click(target as HTMLElement)
    await waitFor(() => expect(writes().length).toBe(1))
  })
})
