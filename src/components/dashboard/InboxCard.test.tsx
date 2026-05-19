import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InboxCard from './InboxCard'
import { InboxItem } from './types'

const item: InboxItem = {
  id: 'decision:1',
  type: 'decision',
  sourceId: '1',
  title: 'Test décision',
  meta: ['Sarah · 2h'],
  urgency: 100,
  tag: { label: 'URG', color: '#ff0080' },
  actions: [
    { kind: 'approve', label: 'A ✓', shortcut: 'a' },
    { kind: 'reject', label: 'R ✗', shortcut: 'r' },
  ],
}

describe('InboxCard', () => {
  it('rend title, meta, tag', () => {
    render(<InboxCard item={item} onAction={() => {}} />)
    expect(screen.getByText('Test décision')).toBeTruthy()
    expect(screen.getByText('Sarah · 2h')).toBeTruthy()
    expect(screen.getByText('URG')).toBeTruthy()
  })

  it('appelle onAction avec le kind au clic sur un bouton', () => {
    const fn = vi.fn()
    render(<InboxCard item={item} onAction={fn} />)
    fireEvent.click(screen.getByText('A ✓'))
    expect(fn).toHaveBeenCalledWith('approve', item)
  })

  it('applique la classe focused quand prop focused=true', () => {
    const { container } = render(<InboxCard item={item} focused onAction={() => {}} />)
    expect(container.querySelector('.ix-card--focused')).toBeTruthy()
  })

  it('applique opacity faible quand snoozedUntil défini', () => {
    const { container } = render(<InboxCard item={{ ...item, snoozedUntil: '2030-01-01' }} onAction={() => {}} />)
    expect(container.querySelector('.ix-card--snoozed')).toBeTruthy()
  })
})
