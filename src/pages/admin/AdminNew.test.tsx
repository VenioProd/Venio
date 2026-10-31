import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminNew from './AdminNew'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

let currentUser: { _id: string; role: string; permissions?: string[] }
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }))

const mockedApiFetch = vi.mocked(apiFetch)

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminNew />
    </MemoryRouter>,
  )

const fillIdentity = () => {
  fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Camille Durand' } })
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'camille@example.test' } })
}

const lastPayload = () => {
  const { calls } = mockedApiFetch.mock
  return JSON.parse(calls[calls.length - 1]![1]!.body as string)
}

describe('invitation d’un membre', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset()
    mockedApiFetch.mockResolvedValue({ user: { _id: 'new-1' } })
    currentUser = { _id: 'sa-1', role: 'SUPER_ADMIN' }
  })

  it('propose les rôles d’équipe et le commercial externe, jamais super admin ni agent', () => {
    renderPage()
    const roles = screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)
    expect(roles.sort()).toEqual(
      ['ADMIN', 'COMMERCIAL', 'COMMERCIAL_EXTERNE', 'COMPTABLE', 'MANAGER', 'RH', 'STAGIAIRE', 'VIEWER'].sort(),
    )
  })

  it('refuse l’envoi sans nom et met le focus sur le champ à corriger', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(mockedApiFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Le nom est requis.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nom complet/)).toHaveFocus()
  })

  it('envoie fonction, associé et un mot de passe généré pour un commercial', async () => {
    renderPage()
    fillIdentity()
    fireEvent.change(screen.getByLabelText(/Fonction/), { target: { value: 'Directrice commerciale' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Commercial' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Associé/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1))
    expect(mockedApiFetch.mock.calls[0]![0]).toBe('/api/admin/admins')
    expect(lastPayload()).toMatchObject({
      name: 'Camille Durand',
      email: 'camille@example.test',
      role: 'COMMERCIAL',
      title: 'Directrice commerciale',
      jobTitle: 'Directrice commerciale',
      isAssociate: true,
    })
    expect(lastPayload().password).toHaveLength(14)
    expect(lastPayload()).not.toHaveProperty('grantedPermissions')
    expect(await screen.findByText('Compte créé pour Camille Durand')).toBeInTheDocument()
  })

  it('n’envoie pas le statut d’associé après un changement de rôle', async () => {
    renderPage()
    fillIdentity()
    fireEvent.click(screen.getByRole('radio', { name: 'Commercial' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Associé/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Lecture seule' }))
    expect(screen.queryByRole('checkbox', { name: /Associé/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled())
    expect(lastPayload()).not.toHaveProperty('isAssociate')
  })

  it('montre ce que voit un commercial externe, sans droits à régler', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: 'Commercial externe' }))
    expect(screen.getByText('10 %')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Droits' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Ajuster les droits/ })).not.toBeInTheDocument()

    fillIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled())
    expect(lastPayload()).toMatchObject({ role: 'COMMERCIAL_EXTERNE' })
    expect(lastPayload()).not.toHaveProperty('grantedPermissions')
    expect(lastPayload()).not.toHaveProperty('deniedPermissions')
    expect(await screen.findByText(/arrive directement sur son espace commercial/)).toBeInTheDocument()
  })

  it('enregistre l’écart avec le rôle quand le super admin ajuste les droits', async () => {
    renderPage()
    fillIdentity()
    fireEvent.click(screen.getByRole('radio', { name: 'Lecture seule' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Ajuster les droits/ }))
    const crm = screen.getByText('Clients et CRM').closest('li')!
    fireEvent.click(within(crm).getByRole('checkbox', { name: /Gestion du CRM/ }))
    const billing = screen.getByText('Facturation', { selector: '.invite-module__name' }).closest('li')!
    fireEvent.click(within(billing).getByRole('checkbox', { name: /Lecture de la facturation/ }))
    expect(screen.getByText('1 ajout · 1 retrait par rapport au rôle')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled())
    expect(lastPayload()).toMatchObject({
      role: 'VIEWER',
      grantedPermissions: ['manage_crm'],
      deniedPermissions: ['view_billing'],
    })
  })

  it('ne propose pas d’ajuster les droits à qui n’est pas super admin', () => {
    currentUser = { _id: 'adm-1', role: 'ADMIN', permissions: ['manage_admins'] }
    renderPage()
    expect(screen.queryByRole('checkbox', { name: /Ajuster les droits/ })).not.toBeInTheDocument()
  })

  it('affiche l’erreur du serveur et garde le formulaire', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Email already exists'))
    renderPage()
    fillIdentity()
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already exists')
    expect(screen.getByLabelText(/Nom complet/)).toHaveValue('Camille Durand')
  })
})
