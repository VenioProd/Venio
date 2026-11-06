import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmSettings from './index'

const apiFetch = vi.fn()
const auth = vi.hoisted(() => ({ role: 'ADMIN' }))
vi.mock('../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', role: auth.role } }) }))

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `id${n}`,
  email: `user${n}@exemple.test`,
  reason: 'MANUAL',
  createdAt: '2026-03-04T10:00:00.000Z',
  createdBy: { id: 'u1', name: 'Alice' },
  ...extra,
})

let listings: Array<{ url: string }>

beforeEach(() => {
  listings = []
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    if (url === '/api/admin/crm/settings') return { settings: { retentionMonths: 36, weeklyReportRecipients: [] } }
    if (url === '/api/admin/admins') return { users: [] }
    if (url.startsWith('/api/admin/crm/suppression') && (!opts || !opts.method)) {
      listings.push({ url })
      const page = Number(new URL(url, 'http://x').searchParams.get('page'))
      return page === 2
        ? { entries: [row(26)], total: 26, page: 2, pages: 2 }
        : { entries: [row(1), row(2, { reason: 'UNSUBSCRIBE', createdBy: null })], total: 26, page: 1, pages: 2 }
    }
    return {}
  })
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <CrmSettings />
    </MemoryRouter>,
  )

const writes = () =>
  apiFetch.mock.calls.filter(([url, opts]) => url.startsWith('/api/admin/crm/suppression') && (opts as RequestInit | undefined)?.method)

describe('réglages CRM — liste « ne pas contacter »', () => {
  it('affiche le tableau, la mention sur les leads et le nom de l’auteur', async () => {
    auth.role = 'ADMIN'
    renderPage()
    expect(await screen.findByText('user1@exemple.test')).toBeInTheDocument()
    expect(screen.getByText('user2@exemple.test')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Désinscription')).toBeInTheDocument()
    expect(screen.getByText(/ne modifie pas l’opposition/)).toBeInTheDocument()
    expect(screen.getByText('26 adresse(s)')).toBeInTheDocument()
  })

  it('recherche par adresse et pagine', async () => {
    renderPage()
    await screen.findByText('user1@exemple.test')
    fireEvent.change(screen.getByLabelText('Rechercher une adresse'), { target: { value: ' user ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    await waitFor(() => expect(listings[listings.length - 1].url).toContain('q=user'))
    fireEvent.click(await screen.findByRole('button', { name: 'Suivant' }))
    expect(await screen.findByText('user26@exemple.test')).toBeInTheDocument()
    expect(listings[listings.length - 1].url).toContain('page=2')
  })

  it('ADMIN : ajoute une adresse avec sa raison', async () => {
    renderPage()
    await screen.findByText('user1@exemple.test')
    fireEvent.change(screen.getByLabelText('Adresse à ne pas contacter'), { target: { value: 'nouveau@exemple.test' } })
    fireEvent.change(screen.getByLabelText('Raison de l’ajout'), { target: { value: 'OPPOSITION' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    const [url, opts] = writes()[0]
    expect(url).toBe('/api/admin/crm/suppression')
    expect((opts as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((opts as RequestInit).body))).toEqual({ email: 'nouveau@exemple.test', reason: 'OPPOSITION' })
    expect(await screen.findByText('Adresse ajoutée à la liste.')).toBeInTheDocument()
  })

  it('ADMIN : le retrait passe par une confirmation qui rappelle les leads', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer user1@exemple.test' }))
    expect(writes()).toHaveLength(0)
    const dialog = await screen.findByText(/pourra de nouveau recevoir/)
    expect(dialog.textContent).toContain('user1@exemple.test')
    expect(dialog.textContent).toContain('n’est pas modifiée')
    fireEvent.click(screen.getByRole('button', { name: 'Retirer de la liste' }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0][0]).toBe('/api/admin/crm/suppression/id1')
    expect((writes()[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('annuler la confirmation n’appelle rien', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer user1@exemple.test' }))
    const dialog = (await screen.findByText(/pourra de nouveau recevoir/)).closest('[role="dialog"]') ?? document.body
    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Annuler' }))
    expect(writes()).toHaveLength(0)
  })

  it('MANAGER : lecture seule, ni ajout ni retrait', async () => {
    auth.role = 'MANAGER'
    renderPage()
    expect(await screen.findByText('user1@exemple.test')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull()
    expect(screen.queryByLabelText('Adresse à ne pas contacter')).toBeNull()
    expect(screen.getByText(/Consultation uniquement : seuls les administrateurs du CRM/)).toBeInTheDocument()
  })
})
