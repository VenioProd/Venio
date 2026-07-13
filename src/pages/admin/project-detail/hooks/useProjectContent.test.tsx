import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiUpload } from '../../../../lib/api'
import { useProjectContent } from './useProjectContent'

vi.mock('../../../../lib/api', () => ({
  apiDownload: vi.fn(),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}))

describe('useProjectContent', () => {
  const confirm = vi.fn()
  const ensurePermission = vi.fn()
  const load = vi.fn()
  const setError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ensurePermission.mockReturnValue(true)
    load.mockResolvedValue(undefined)
    confirm.mockResolvedValue(true)
    vi.mocked(apiFetch).mockResolvedValue({})
    vi.mocked(apiUpload).mockResolvedValue({})
  })

  function renderContentHook(canEditContent = true) {
    return renderHook(() =>
      useProjectContent({
        projectId: 'project-1',
        canEditContent,
        canViewContent: true,
        confirm,
        ensurePermission,
        load,
        setError,
      }),
    )
  }

  it('uploads item data with the existing endpoint and resets the content form', async () => {
    const { result } = renderContentHook()
    const file = new File(['brief'], 'brief.pdf', { type: 'application/pdf' })

    act(() => {
      result.current.setItemForm({ ...result.current.itemForm, section: 'section-1', title: 'Brief client' })
      result.current.setSelectedFile(file)
    })

    await act(async () => {
      await result.current.handleAddItem({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(apiUpload).toHaveBeenCalledWith('/api/admin/projects/project-1/items', expect.any(FormData))
    const formData = vi.mocked(apiUpload).mock.calls[0][1] as FormData
    expect(formData.get('section')).toBe('section-1')
    expect(formData.get('title')).toBe('Brief client')
    expect(formData.get('file')).toBe(file)
    expect(load).toHaveBeenCalledOnce()
    expect(result.current.itemForm).toMatchObject({ title: '', type: 'LIVRABLE', status: 'EN_ATTENTE' })
    expect(result.current.selectedFile).toBeNull()
  })

  it('keeps the existing permission guard before creating a section', async () => {
    ensurePermission.mockReturnValue(false)
    const { result } = renderContentHook(false)

    await act(async () => {
      await result.current.handleAddSection({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(ensurePermission).toHaveBeenCalledWith(false, 'Accès en lecture seule.')
    expect(apiFetch).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })

  it('confirms and deletes an item through the unchanged API route', async () => {
    const { result } = renderContentHook()

    await act(async () => {
      await result.current.handleDeleteItem('item-1')
    })

    expect(confirm).toHaveBeenCalledWith({ message: 'Supprimer cet élément ?', title: 'Suppression' })
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/projects/project-1/items/item-1', { method: 'DELETE' })
    expect(load).toHaveBeenCalledOnce()
  })
})
