import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const getNotes = vi.fn()
const createNote = vi.fn()
const updateNote = vi.fn()
const deleteNote = vi.fn()
const convertIdea = vi.fn()
vi.mock('../services/workspace', () => ({
  getNotes: (...a: unknown[]) => getNotes(...a),
  createNote: (...a: unknown[]) => createNote(...a),
  updateNote: (...a: unknown[]) => updateNote(...a),
  deleteNote: (...a: unknown[]) => deleteNote(...a),
  convertIdea: (...a: unknown[]) => convertIdea(...a),
}))

import NoteCollectionWidget from '../pages/admin/mon-espace/widgets/NoteCollectionWidget'
import PostItWall from '../pages/admin/mon-espace/widgets/PostItWall'

beforeEach(() => { vi.clearAllMocks(); getNotes.mockResolvedValue([]) })

describe('NoteCollectionWidget', () => {
  it('charge les notes du bon type', async () => {
    getNotes.mockResolvedValue([{ _id: 'n1', type: 'NOTE', title: 'Ma note', content: 'x', order: 0 }])
    render(<NoteCollectionWidget noteType="NOTE" />)
    await waitFor(() => expect(getNotes).toHaveBeenCalledWith('NOTE'))
    expect(screen.getByText('Ma note')).toBeInTheDocument()
  })
  it('IDEA : bouton convertir appelle convertIdea', async () => {
    getNotes.mockResolvedValue([{ _id: 'i1', type: 'IDEA', title: 'Idée', content: '', order: 0, status: 'NEW' }])
    convertIdea.mockResolvedValue({ _id: 't1' })
    render(<NoteCollectionWidget noteType="IDEA" />)
    await waitFor(() => screen.getByText('Idée'))
    fireEvent.click(screen.getByLabelText('Convertir en tâche'))
    await waitFor(() => expect(convertIdea).toHaveBeenCalledWith('i1'))
  })
})

describe('PostItWall', () => {
  it('affiche les post-it', async () => {
    getNotes.mockResolvedValue([{ _id: 'p1', type: 'POSTIT', title: '', content: 'Rappel', color: '#fde68a', order: 0 }])
    render(<PostItWall />)
    await waitFor(() => expect(screen.getByText('Rappel')).toBeInTheDocument())
  })
})
