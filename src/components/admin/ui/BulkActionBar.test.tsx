import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BulkActionBar from './BulkActionBar'
import { RowCheckbox, SelectAllCheckbox } from './RowCheckbox'
import { useMultiSelect } from './useMultiSelect'
import { useBulkRunner, type BulkResult } from './useBulkRunner'
import { ToastProvider, useToast } from '../../../context/ToastContext'
import * as api from '../../../lib/api'

type Item = { id: string }
const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))
const getId = (i: Item) => i.id

describe('useMultiSelect', () => {
  it('toggles, selects all on the page and clears', () => {
    const list = items(3)
    const { result } = renderHook(() => useMultiSelect(list, getId))
    act(() => result.current.toggle('i0'))
    expect(result.current.count).toBe(1)
    expect(result.current.someSelected).toBe(true)
    act(() => result.current.toggleAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.count).toBe(3)
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(0)
    act(() => result.current.toggle('i1'))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('selects a range with shift and unchecks one when anchored on a checked row', () => {
    const list = items(6)
    const { result } = renderHook(() => useMultiSelect(list, getId))
    act(() => result.current.toggle('i1'))
    act(() => result.current.toggle('i4', { shift: true }))
    expect([...result.current.selected].sort()).toEqual(['i1', 'i2', 'i3', 'i4'])
    // Maj+clic vers le haut depuis la dernière ligne cliquée (i4).
    act(() => result.current.toggle('i2', { shift: true }))
    expect([...result.current.selected].sort()).toEqual(['i1', 'i2', 'i3', 'i4'])
  })

  it('drops ids that leave the list and supports deselect', () => {
    let list = items(3)
    const { result, rerender } = renderHook(() => useMultiSelect(list, getId))
    act(() => result.current.selectAll())
    list = list.slice(1)
    rerender()
    expect([...result.current.selected].sort()).toEqual(['i1', 'i2'])
    act(() => result.current.deselect(['i1']))
    expect([...result.current.selected]).toEqual(['i2'])
  })

  it('clears on Escape, but not from a text field or when already handled', () => {
    const list = items(2)
    const { result } = renderHook(() => useMultiSelect(list, getId))
    act(() => result.current.toggle('i0'))
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(result.current.count).toBe(1)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(result.current.count).toBe(0)
    input.remove()
  })
})

describe('BulkActionBar', () => {
  it('renders nothing without selection but keeps the live region', () => {
    render(<BulkActionBar count={0} actions={[]} onClear={() => {}} />)
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Aucun élément sélectionné')
  })

  it('exposes a toolbar with count, actions and clear', () => {
    const onDelete = vi.fn()
    const onStatus = vi.fn()
    const onClear = vi.fn()
    render(
      <BulkActionBar
        count={2}
        onClear={onClear}
        actions={[
          { id: 'delete', label: 'Supprimer', danger: true, onSelect: onDelete },
          { kind: 'select', id: 'status', label: 'Statut', options: [{ value: 'A', label: 'Alpha' }], onSelect: onStatus },
        ]}
      />,
    )
    expect(screen.getByRole('toolbar', { name: 'Actions groupées' })).toBeInTheDocument()
    expect(screen.getByText('2 sélectionnés')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 éléments sélectionnés')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onDelete).toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Statut' }), { target: { value: 'A' } })
    expect(onStatus).toHaveBeenCalledWith('A')
    fireEvent.click(screen.getByRole('button', { name: 'Désélectionner' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('disables controls while busy', () => {
    render(<BulkActionBar count={1} busy onClear={() => {}} actions={[{ id: 'a', label: 'Archiver', onSelect: () => {} }]} />)
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Désélectionner' })).toBeDisabled()
  })
})

describe('RowCheckbox / SelectAllCheckbox', () => {
  function Harness() {
    const list = items(4)
    const select = useMultiSelect(list, getId)
    return (
      <table>
        <thead>
          <tr>
            <th>
              <SelectAllCheckbox select={select} />
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((i) => (
            <tr key={i.id}>
              <td>
                <RowCheckbox id={i.id} name={`Ligne ${i.id}`} select={select} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  it('labels each box, selects ranges with shift-click and everything from the header', () => {
    render(<Harness />)
    const row = (n: number) => screen.getByRole('checkbox', { name: `Sélectionner Ligne i${n}` })
    fireEvent.click(row(0))
    fireEvent.click(row(2), { shiftKey: true })
    expect([0, 1, 2, 3].map((n) => (row(n) as HTMLInputElement).checked)).toEqual([true, true, true, false])
    const all = screen.getByRole('checkbox', { name: 'Sélectionner tous les éléments de la page' }) as HTMLInputElement
    expect(all.indeterminate).toBe(true)
    fireEvent.click(all)
    expect([0, 1, 2, 3].every((n) => (row(n) as HTMLInputElement).checked)).toBe(true)
  })
})

describe('useBulkRunner', () => {
  beforeEach(() => vi.restoreAllMocks())

  function Runner({ onDone }: { onDone: (r: BulkResult) => void }) {
    const { run, ConfirmDialog } = useBulkRunner({ endpoint: '/api/x/bulk', onDone })
    const { toasts } = useToast()
    return (
      <>
        <button onClick={() => run(['a', 'b'], 'delete')}>del</button>
        <button onClick={() => run(['a', 'b'], 'update', { status: 'X' })}>upd</button>
        <ul>
          {toasts.map((t) => (
            <li key={t.id}>{`${t.type}:${t.message}`}</li>
          ))}
        </ul>
        {ConfirmDialog}
      </>
    )
  }
  const mount = (onDone = vi.fn()) =>
    render(
      <ToastProvider>
        <Runner onDone={onDone} />
      </ToastProvider>,
    )

  it('asks for confirmation before deleting and does nothing when cancelled', async () => {
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ succeeded: [], failed: [] })
    mount()
    fireEvent.click(screen.getByText('del'))
    expect(await screen.findByText(/Supprimer définitivement 2 éléments/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByText(/Supprimer définitivement/)).toBeNull())
    expect(spy).not.toHaveBeenCalled()
  })

  it('posts after confirmation with an Idempotency-Key and toasts the success', async () => {
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ succeeded: ['a', 'b'], failed: [] })
    const onDone = vi.fn()
    mount(onDone)
    fireEvent.click(screen.getByText('del'))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('/api/x/bulk')
    expect(JSON.parse(opts.body as string)).toEqual({ ids: ['a', 'b'], action: 'delete' })
    expect(opts.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.getByText('success:2 éléments traités')).toBeInTheDocument()
  })

  it('reports partial success with a warning and the first error', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ succeeded: ['a'], failed: [{ id: 'b', error: 'Accès refusé' }] })
    const onDone = vi.fn()
    mount(onDone)
    fireEvent.click(screen.getByText('upd'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.getByText('warning:1 réussi(s), 1 en échec — Accès refusé')).toBeInTheDocument()
  })

  it('reports a network error without calling onDone', async () => {
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new Error('Boom'))
    const onDone = vi.fn()
    mount(onDone)
    fireEvent.click(screen.getByText('upd'))
    expect(await screen.findByText('error:Boom')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
