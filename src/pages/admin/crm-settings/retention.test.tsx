import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSettings from './index'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: auth.role } }) }))

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string) => {
    if (url === '/api/admin/crm/settings')
      return { settings: { retentionMonths: 36, retentionPurgeEnabled: false, weeklyReportRecipients: [] } }
    if (url === '/api/admin/admins') return { users: [] }
    return {}
  })
})

const patches = () =>
  apiFetch.mock.calls
    .filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PATCH')
    .map(([, opts]) => JSON.parse(String((opts as RequestInit).body)))

const renderPage = () =>
  render(
    <MemoryRouter>
      <CrmSettings />
    </MemoryRouter>,
  )

describe('réglages CRM — conservation des données', () => {
  it('ADMIN : règle la durée (bornée) et active la purge', async () => {
    auth.role = 'ADMIN'
    renderPage()
    const months = await screen.findByLabelText('Durée de conservation')
    expect(months).toHaveValue(36)
    fireEvent.change(months, { target: { value: '3' } })
    fireEvent.blur(months)
    expect(patches()).toEqual([])
    fireEvent.change(months, { target: { value: '24' } })
    fireEvent.blur(months)
    await waitFor(() => expect(patches()).toEqual([{ retentionMonths: 24 }]))
    fireEvent.click(screen.getByLabelText('Anonymisation automatique'))
    await waitFor(() => expect(patches()).toContainEqual({ retentionPurgeEnabled: true }))
  })

  it('MANAGER : lecture seule', async () => {
    auth.role = 'MANAGER'
    renderPage()
    expect(await screen.findByLabelText('Durée de conservation')).toBeDisabled()
    expect(screen.getByLabelText('Anonymisation automatique')).toBeDisabled()
  })
})
