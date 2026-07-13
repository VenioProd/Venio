import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchEducation } from '../../../services/education'
import { SearchModal } from './search-parts'

vi.mock('../../../services/education', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/education')>()),
  searchEducation: vi.fn(),
}))

const mockedSearchEducation = vi.mocked(searchEducation)

const emptyResults = {
  classes: [],
  students: [],
  sessions: [],
  assignments: [],
  notes: [],
  documents: [],
}

describe('VENIO-50 Quickfind document contexts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedSearchEducation.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the resolved parent context for a document result', async () => {
    const onPickAssignment = vi.fn()
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-1',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Barème final',
            originalName: '',
            mimeType: 'application/pdf',
            size: 1,
            url: '',
            tags: [],
            createdAt: '',
            updatedAt: '',
            parentContext: {
              state: 'available',
              target: { kind: 'assignment', id: 'assignment-1', label: 'Devoir final' },
            },
          },
        ],
      },
    })

    render(
      <SearchModal
        onClose={vi.fn()}
        onPickClass={vi.fn()}
        onPickSession={vi.fn()}
        onPickAssignment={onPickAssignment}
        onPickStudent={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'barème' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le contexte de Barème final' }))
    expect(onPickAssignment).toHaveBeenCalledWith('assignment-1')
  })

  it('keeps a document without an accessible target visibly unavailable and inert', async () => {
    const onPickClass = vi.fn()
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-2',
            parentType: 'class',
            parentId: 'private-class',
            title: 'Archive privée',
            originalName: '',
            mimeType: 'application/pdf',
            size: 1,
            url: '',
            tags: [],
            createdAt: '',
            updatedAt: '',
            parentContext: { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' },
          },
        ],
      },
    })

    render(
      <SearchModal
        onClose={vi.fn()}
        onPickClass={onPickClass}
        onPickSession={vi.fn()}
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'archive' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByText(/contexte parent indisponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /archive privée/i })).toBeDisabled()
    expect(onPickClass).not.toHaveBeenCalled()
  })
})
