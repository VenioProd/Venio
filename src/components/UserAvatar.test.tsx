import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserAvatar from './UserAvatar'

describe('UserAvatar', () => {
  it('affiche l\'initiale quand avatarUrl est absent', () => {
    render(<UserAvatar name="Alice Dupont" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('affiche l\'initiale quand avatarUrl est chaîne vide', () => {
    render(<UserAvatar name="Bob Martin" avatarUrl="" />)
    expect(screen.getByText('B')).toBeTruthy()
  })

  it('affiche une image quand avatarUrl est fourni', () => {
    render(<UserAvatar name="Claire" avatarUrl="/api/avatars/abc.jpg" />)
    const img = screen.getByRole('img')
    expect(img).toBeTruthy()
    expect((img as HTMLImageElement).src).toContain('/api/avatars/abc.jpg')
  })

  it('utilise la taille par défaut 36', () => {
    const { container } = render(<UserAvatar name="Denis" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('36px')
  })

  it('respecte la prop size', () => {
    const { container } = render(<UserAvatar name="Eva" size={80} />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('80px')
  })
})
