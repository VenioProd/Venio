import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AvatarCropModal from './AvatarCropModal'

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
})

const mockFile = new File([''], 'avatar.jpg', { type: 'image/jpeg' })

describe('AvatarCropModal', () => {
  it('affiche le titre', () => {
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Cadrer la photo')).toBeTruthy()
  })

  it('affiche les boutons Annuler et Confirmer', () => {
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Annuler')).toBeTruthy()
    expect(screen.getByText('Confirmer')).toBeTruthy()
  })

  it('appelle onCancel au clic sur Annuler', () => {
    const onCancel = vi.fn()
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Annuler'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
