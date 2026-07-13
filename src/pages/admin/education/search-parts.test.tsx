import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDownload } from '../../../lib/api'
import { searchEducation } from '../../../services/education'
import { SearchModal } from './search-parts'

vi.mock('../../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api')>()),
  apiDownload: vi.fn(),
}))

vi.mock('../../../services/education', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/education')>()),
  searchEducation: vi.fn(),
}))

const mockedSearchEducation = vi.mocked(searchEducation)
const mockedApiDownload = vi.mocked(apiDownload)

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
    mockedApiDownload.mockReset()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:quickfind-document'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'barème' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le contexte de Barème final' }))
    expect(onPickAssignment).toHaveBeenCalledWith('assignment-1')
  })

  it('downloads an authorized document without replacing its parent action', async () => {
    const onPickAssignment = vi.fn()
    mockedApiDownload.mockResolvedValue({
      blob: new Blob(['support'], { type: 'application/pdf' }),
      filename: 'bareme.pdf',
      contentType: 'application/pdf',
    })
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-download',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Barème final',
            originalName: 'bareme.pdf',
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
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'barème' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Télécharger Barème final' }))
    })
    expect(mockedApiDownload).toHaveBeenCalledWith('/api/admin/education/documents/document-download/download')
    expect(onPickAssignment).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le contexte de Barème final' }))
    expect(onPickAssignment).toHaveBeenCalledWith('assignment-1')
  })

  it('opens an accessible parent note for a document result', async () => {
    const onPickNote = vi.fn()
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-note',
            parentType: 'note',
            parentId: 'note-1',
            title: 'Brief de séance',
            originalName: '',
            mimeType: 'application/pdf',
            size: 1,
            url: '',
            tags: [],
            createdAt: '',
            updatedAt: '',
            parentContext: {
              state: 'available',
              target: { kind: 'note', id: 'note-1', label: 'Préparation' },
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
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={onPickNote}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'brief' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByText(/ouvrir la note.*préparation/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le contexte de Brief de séance' }))
    expect(onPickNote).toHaveBeenCalledWith('note-1')
  })

  it('keeps an inaccessible parent inert while preserving the authorized document download', async () => {
    const onPickClass = vi.fn()
    mockedApiDownload.mockResolvedValue({
      blob: new Blob(['archive']),
      filename: 'archive.pdf',
      contentType: 'application/pdf',
    })
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
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'archive' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByText(/contexte parent indisponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir le contexte de Archive privée' })).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Télécharger Archive privée' }))
    })
    expect(mockedApiDownload).toHaveBeenCalledWith('/api/admin/education/documents/document-2/download')
    expect(onPickClass).not.toHaveBeenCalled()
  })

  it('keeps a missing or unauthorized parent note visibly unavailable and inert', async () => {
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-note-private',
            parentType: 'note',
            parentId: 'private-note',
            title: 'Archive de note',
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
        onPickClass={vi.fn()}
        onPickSession={vi.fn()}
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'archive' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByText(/note parente indisponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir le contexte de Archive de note' })).toBeDisabled()
  })

  it('loads a PDF preview only after the user requests it through the authenticated download route', async () => {
    mockedApiDownload.mockResolvedValue({
      blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
      filename: 'bareme.pdf',
      contentType: 'application/pdf',
    })
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-preview',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Barème final',
            originalName: 'bareme.pdf',
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
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'barème' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(mockedApiDownload).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser Barème final' }))
    })

    expect(mockedApiDownload.mock.calls[0][0]).toBe('/api/admin/education/documents/document-preview/download')
    expect(screen.getByRole('dialog', { name: 'Aperçu : Barème final' })).toBeInTheDocument()
    expect(screen.getByTitle('Aperçu PDF : Barème final')).toHaveAttribute('src', 'blob:quickfind-document')
  })

  it('keeps a clear download fallback for a non-previewable document format', async () => {
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-docx',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Consignes',
            originalName: 'consignes.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'consignes' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(screen.getByText(/aperçu indisponible pour ce format.*téléchargez le fichier/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prévisualiser Consignes' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Télécharger Consignes' })).toBeEnabled()
  })

  it('shows a non-disclosing preview error when the protected route refuses access', async () => {
    mockedApiDownload.mockRejectedValue(new Error('Document introuvable'))
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-refused',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Barème final',
            originalName: 'bareme.pdf',
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
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'barème' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser Barème final' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/impossible de charger l’aperçu/i)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('closes the preview with Escape and revokes its object URL', async () => {
    mockedApiDownload.mockResolvedValue({
      blob: new Blob(['image'], { type: 'image/png' }),
      filename: 'support.png',
      contentType: 'image/png',
    })
    mockedSearchEducation.mockResolvedValue({
      results: {
        ...emptyResults,
        documents: [
          {
            _id: 'document-image',
            parentType: 'assignment',
            parentId: 'assignment-1',
            title: 'Support visuel',
            originalName: 'support.png',
            mimeType: 'image/png',
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
        onPickAssignment={vi.fn()}
        onPickStudent={vi.fn()}
        onPickNote={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/rechercher classes/i), { target: { value: 'support' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser Support visuel' }))
    })

    const dialog = screen.getByRole('dialog', { name: 'Aperçu : Support visuel' })
    expect(screen.getByRole('button', { name: 'Fermer l’aperçu de Support visuel' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Aperçu : Support visuel' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:quickfind-document')
  })
})
