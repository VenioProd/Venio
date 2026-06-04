import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/workspace', () => ({
  getLayout: vi.fn().mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null }),
  saveLayout: vi.fn().mockResolvedValue({ widgets: [], shortcuts: [], dailyGoal: null }),
  getOverview: vi.fn().mockResolvedValue({ kpis: [], overdue: [], week: [], pinned: [], activity: [] }),
  getTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  convertIdea: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Raphaël', role: 'COMMERCIAL' } }),
}))

import MonEspace from '../pages/admin/mon-espace/index'

beforeEach(() => vi.clearAllMocks())

describe('MonEspace', () => {
  it('affiche la salutation et applique un layout par défaut quand vide', async () => {
    render(<MemoryRouter><MonEspace /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Raphaël/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Personnaliser/i })).toBeInTheDocument()
  })
})
