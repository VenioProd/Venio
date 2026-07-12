import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'ADMIN', permissions: [] },
  }),
}))

const mockedApiFetch = vi.mocked(apiFetch)

const dashboard = {
  myTasks: [],
  myBriefs: [],
  overdueTasks: [],
  tasksByStatus: {},
  activeProjectCount: 2,
  totalRevenue: 0,
  pipelineValue: 0,
  pendingDecisionCount: 0,
  staleProjectCount: 0,
  hotLeads: [],
  recentProjects: [],
  generatedAt: '2026-07-12T09:30:00.000Z',
  cockpitMeta: {
    source: 'api/admin/dashboard',
    generatedAt: '2026-07-12T09:30:00.000Z',
    freshnessSlaMinutes: 5,
    staleProjectThresholdDays: 14,
    hotLeadFollowUpHours: 48,
  },
}

describe('VENIO-102 — cockpit frais et préférences non PII', () => {
  beforeEach(() => {
    localStorage.clear()
    mockedApiFetch.mockReset()
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/api/admin/dashboard') return Promise.resolve(dashboard)
      if (path === '/api/admin/internal-projects') return Promise.resolve({ projects: [] })
      return Promise.resolve({ missions: [] })
    })
  })

  it('shows source/freshness, keeps a calm cockpit quiet, and persists display-only preferences', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Mode calme')).toBeInTheDocument())
    expect(screen.getByText(/source api\/admin\/dashboard/i)).toBeInTheDocument()
    expect(screen.queryByText('Tâches en retard')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Raccourcis' }))

    expect(JSON.parse(localStorage.getItem('venio-admin-command-dashboard-prefs-v1') || '{}')).toEqual({
      density: 'compact',
      showContext: true,
      showShortcuts: false,
    })
  })
})
