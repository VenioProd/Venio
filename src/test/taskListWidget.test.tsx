import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getTasks = vi.fn()
const createTask = vi.fn()
const updateTask = vi.fn()
vi.mock('../services/workspace', () => ({ getTasks: (...a: unknown[]) => getTasks(...a), createTask: (...a: unknown[]) => createTask(...a), updateTask: (...a: unknown[]) => updateTask(...a) }))

import TaskListWidget from '../pages/admin/mon-espace/widgets/TaskListWidget'

beforeEach(() => {
  vi.clearAllMocks()
  getTasks.mockResolvedValue([
    { _id: '1', title: 'Tâche perso', status: 'A_FAIRE', priority: 'NORMALE', order: 0, source: 'PERSONAL' },
    { _id: '2', title: 'Tâche projet', status: 'A_FAIRE', priority: 'HAUTE', order: 0, source: 'PROJECT', project: { _id: 'p', name: 'Projet X' } },
  ])
})

describe('TaskListWidget mode=todo', () => {
  it('liste les tâches à faire (perso + projet)', async () => {
    render(<MemoryRouter><TaskListWidget mode="todo" /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Tâche perso')).toBeInTheDocument())
    expect(screen.getByText('Tâche projet')).toBeInTheDocument()
  })
  it("création rapide d'un todo perso", async () => {
    createTask.mockResolvedValue({ _id: '3', title: 'Nouveau', status: 'A_FAIRE', priority: 'NORMALE', order: 0, source: 'PERSONAL' })
    render(<MemoryRouter><TaskListWidget mode="todo" /></MemoryRouter>)
    await waitFor(() => screen.getByPlaceholderText(/Ajouter/i))
    const input = screen.getByPlaceholderText(/Ajouter/i)
    fireEvent.change(input, { target: { value: 'Nouveau' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nouveau' })))
  })
})
