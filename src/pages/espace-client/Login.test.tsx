import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import ClientLogin from './Login'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

const login = vi.fn()
const verifyMfa = vi.fn()

function Harness() {
  const { t } = useI18n()
  return (
    <MemoryRouter initialEntries={['/espace-client/login']}>
      <Routes>
        <Route path="/espace-client/login" element={<ClientLogin />} />
        <Route path="/espace-client" element={<p>Tableau de bord client (test)</p>} />
        <Route path="/espace-client/securite" element={<p>{t('security.title')}</p>} />
      </Routes>
    </MemoryRouter>
  )
}

function submit(email: string, password: string) {
  const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
  const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
  fireEvent.change(emailInput, { target: { value: email } })
  fireEvent.change(passwordInput, { target: { value: password } })
  fireEvent.submit(passwordInput.closest('form')!)
}

describe('ClientLogin — 2FA et mot de passe à renforcer', () => {
  beforeEach(() => {
    login.mockReset()
    verifyMfa.mockReset()
    vi.mocked(useAuth).mockReturnValue({ user: null, login, verifyMfa } as unknown as ReturnType<typeof useAuth>)
  })

  it('enchaîne mot de passe, code de secours puis écran Sécurité si le mot de passe est faible', async () => {
    login.mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa_client' })
    verifyMfa.mockResolvedValue({ user: { role: 'CLIENT' }, passwordNeedsUpgrade: true })
    render(<Harness />)
    submit('client@example.test', 'azerty')

    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser un code de secours' }))
    fireEvent.change(screen.getByLabelText('Code de secours (XXXXX-XXXXX)'), { target: { value: 'aaaaa-bbbbb' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByText('Sécurité du compte')).toBeInTheDocument()
    expect(verifyMfa).toHaveBeenCalledWith('mfa_client', { recoveryCode: 'AAAAA-BBBBB' })
  })

  it('se connecte directement sans 2FA', async () => {
    login.mockResolvedValue({ user: { role: 'CLIENT' } })
    render(<Harness />)
    submit('client@example.test', 'Gentiane-Orbite-58')
    expect(await screen.findByText('Tableau de bord client (test)')).toBeInTheDocument()
  })
})
