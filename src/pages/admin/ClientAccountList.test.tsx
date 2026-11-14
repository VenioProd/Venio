import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClientAccountList from './ClientAccountList'

const listAdminClients = vi.hoisted(() => vi.fn())
vi.mock('../../services/adminClients', () => ({ listAdminClients }))
vi.mock('../../lib/exportCsv', () => ({ exportToCsv: vi.fn() }))

const clients = [
  {
    _id: 'c1',
    name: 'Paul Fournier',
    companyName: 'Boulangerie Fournil',
    email: 'paul@fournil.test',
    status: 'ACTIF',
    healthStatus: 'ATTENTION',
    serviceType: 'Site vitrine',
    ownerAdminId: { name: 'Alex Closer' },
  },
  { _id: 'c2', name: 'Léa Marchand', email: 'lea@petale.test', status: 'PROSPECT' },
]

const setup = () =>
  render(
    <MemoryRouter>
      <ClientAccountList />
    </MemoryRouter>,
  )

describe('<ClientAccountList />', () => {
  beforeEach(() => {
    listAdminClients.mockReset()
    listAdminClients.mockResolvedValue({ clients, meta: { page: 1, totalPages: 1, total: 2 } })
  })

  it('liste les comptes à la charte, avec puces d’état et lien vers le détail', async () => {
    setup()
    const link = await screen.findByRole('link', { name: 'Boulangerie Fournil' })
    expect(link).toHaveAttribute('href', '/admin/comptes-clients/c1')
    expect(screen.getByRole('heading', { level: 1, name: 'Comptes clients' })).toBeInTheDocument()
    const row = link.closest('tr') as HTMLElement
    expect(within(row).getByText('Actif')).toBeInTheDocument()
    expect(within(row).getByText('Attention')).toBeInTheDocument()
    expect(within(row).getByText('Alex Closer')).toBeInTheDocument()
    expect(screen.getByText('Non assigné')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nouveau compte/ })).toHaveAttribute(
      'href',
      '/admin/comptes-clients/nouveau',
    )
  })

  it('relance la recherche à chaque saisie et bascule en cartes', async () => {
    setup()
    await screen.findByText('Boulangerie Fournil')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fournil' } })
    await waitFor(() =>
      expect(listAdminClients).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'fournil', page: 1 })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('link', { name: /Boulangerie Fournil/ })).toHaveAttribute(
      'href',
      '/admin/comptes-clients/c1',
    )
  })

  it('affiche l’état vide', async () => {
    listAdminClients.mockResolvedValue({ clients: [], meta: { page: 1, totalPages: 1, total: 0 } })
    setup()
    expect(await screen.findByText('Aucun compte client')).toBeInTheDocument()
  })
})
