import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import AdminLogin from './AdminLogin'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  apiFetch: vi.fn(),
}))

const login = vi.fn()
const verifyMfa = vi.fn()
const logout = vi.fn()

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<p>Accueil admin</p>} />
        <Route path="/admin/securite" element={<p>Page sécurité</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function submitPassword() {
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'admin@example.test' } })
  fireEvent.change(screen.getByPlaceholderText('Mot de passe'), { target: { value: 'Gentiane-Orbite-58' } })
  fireEvent.submit(screen.getByPlaceholderText('Mot de passe').closest('form')!)
}

describe('AdminLogin — connexion en deux temps', () => {
  beforeEach(() => {
    login.mockReset()
    verifyMfa.mockReset()
    vi.mocked(useAuth).mockReturnValue({ user: null, login, verifyMfa, logout } as unknown as ReturnType<
      typeof useAuth
    >)
  })

  it('demande le code 2FA puis ouvre l’administration', async () => {
    login.mockResolvedValue({ requires2FA: true, mfaRequired: true, mfaToken: 'mfa_tok' })
    verifyMfa.mockResolvedValue({ user: { role: 'ADMIN' } })
    renderLogin()
    submitPassword()

    const codeInput = await screen.findByLabelText('Code à 6 chiffres')
    expect(login).toHaveBeenCalledWith('admin@example.test', 'Gentiane-Orbite-58')
    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByText('Accueil admin')).toBeInTheDocument()
    expect(verifyMfa).toHaveBeenCalledWith('mfa_tok', { code: '123456' })
  })

  it('envoie vers l’écran Sécurité quand le mot de passe est à renforcer', async () => {
    login.mockResolvedValue({ user: { role: 'ADMIN' }, passwordNeedsUpgrade: true })
    renderLogin()
    submitPassword()
    expect(await screen.findByText('Page sécurité')).toBeInTheDocument()
  })

  it('revient à la saisie du mot de passe depuis l’étape du code', async () => {
    login.mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa_tok' })
    renderLogin()
    submitPassword()
    fireEvent.click(await screen.findByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(screen.getByPlaceholderText('Mot de passe')).toBeVisible())
  })
})
