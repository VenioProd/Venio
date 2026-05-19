import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InboxStream from './InboxStream'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api')

const mockedFetch = vi.mocked(apiFetch)

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('InboxStream', () => {
  it('fetch /api/admin/inbox au montage', async () => {
    mockedFetch.mockResolvedValueOnce({ items: [], counts: { all: 0 }, snoozedCount: 0 })
    render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('/api/admin/inbox?includeSnoozed=false'))
  })

  it('rend les cartes des items reçus', async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [{
        id: 'decision:1', type: 'decision', sourceId: '1', title: 'Hello',
        meta: ['m'], urgency: 50, tag: { label: 'URG', color: '#ff0080' }, actions: [],
      }],
      counts: { all: 1, decision: 1 },
      snoozedCount: 0,
    })
    render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())
  })

  it('change le focus avec ↓ et ↑', async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [
        { id: 'a', type: 'decision', sourceId: '1', title: 'A', meta: [], urgency: 50, tag: { label: 'X', color: '#000' }, actions: [] },
        { id: 'b', type: 'decision', sourceId: '2', title: 'B', meta: [], urgency: 40, tag: { label: 'X', color: '#000' }, actions: [] },
      ],
      counts: { all: 2 }, snoozedCount: 0,
    })
    const { container } = render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(container.querySelector('.ix-card--focused')?.getAttribute('data-id')).toBe('b')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(container.querySelector('.ix-card--focused')?.getAttribute('data-id')).toBe('a')
  })
})
