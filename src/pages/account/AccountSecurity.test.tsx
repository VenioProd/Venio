import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import AccountSecurity from './AccountSecurity'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const logout = vi.fn()
let enabled = false

function renderPage(entry = '/espace-client/securite') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AccountSecurity />
    </MemoryRouter>,
  )
}

describe('AccountSecurity', () => {
  beforeEach(() => {
    enabled = false
    logout.mockReset()
    vi.mocked(useAuth).mockReturnValue({
      user: { _id: 'u1', email: 'camille.durand@example.test', name: 'Camille Durand', role: 'CLIENT' },
      logout,
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/auth/2fa/status') {
        return { enabled, pendingSetup: false, recoveryCodesRemaining: enabled ? 10 : 0, required: false }
      }
      if (path === '/api/auth/2fa/setup') {
        return {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Venio:camille',
          qrDataUrl: 'data:image/png;base64,qr',
        }
      }
      if (path === '/api/auth/2fa/confirm') {
        enabled = true
        return { enabled: true, recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }
      }
      if (path === '/api/auth/2fa/disable') {
        enabled = false
        return { enabled: false }
      }
      if (path === '/api/auth/change-password') return { message: 'ok' }
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('signale un mot de passe à renforcer après la connexion', async () => {
    renderPage('/espace-client/securite?renforcer=1')
    expect(await screen.findByText(/ne respecte plus nos règles de sécurité/)).toBeInTheDocument()
  })

  it('refuse localement un mot de passe faible et affiche la jauge', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'ancien' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'durand-2026-x' } })
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0')
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'durand-2026-x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    expect(
      await screen.findByText('Le mot de passe ne doit contenir ni votre e-mail ni votre nom.'),
    ).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  it('change le mot de passe puis déconnecte', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'ancien' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'Gentiane-Orbite-58' } })
    expect(Number(screen.getByRole('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), {
      target: { value: 'Gentiane-Orbite-58' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'ancien', newPassword: 'Gentiane-Orbite-58' }),
    })
  })

  it('active la 2FA : mot de passe, QR et clé, premier code, codes de secours affichés une fois', async () => {
    renderPage()
    expect(await screen.findByTestId('two-factor-state')).toHaveTextContent('Désactivée')
    fireEvent.click(screen.getByRole('button', { name: 'Activer la 2FA' }))
    fireEvent.change(screen.getByLabelText('Confirmez votre mot de passe pour commencer'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByAltText('QR code de configuration de la double authentification')).toBeInTheDocument()
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP')
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et activer' }))

    expect(await screen.findByTestId('recovery-codes')).toHaveTextContent('AAAAA-BBBBB')
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/2fa/setup', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    })
    await waitFor(() => expect(screen.getByTestId('two-factor-state')).toHaveTextContent('Activée'))
  })

  it('désactive la 2FA avec le mot de passe et un code de secours', async () => {
    enabled = true
    renderPage()
    expect(await screen.findByText('Codes de secours restants : 10', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver la 2FA' }))
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres ou code de secours'), {
      target: { value: 'aaaaa-bbbbb' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(await screen.findByText('Double authentification désactivée.')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret', recoveryCode: 'AAAAA-BBBBB' }),
    })
  })
})
