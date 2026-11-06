import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { ApiError } from '../../lib/api'
import SecondFactorStep from './SecondFactorStep'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

const verifyMfa = vi.fn()

describe('SecondFactorStep', () => {
  beforeEach(() => {
    verifyMfa.mockReset()
    vi.mocked(useAuth).mockReturnValue({ verifyMfa } as unknown as ReturnType<typeof useAuth>)
  })

  it('envoie le code à 6 chiffres avec le jeton du premier temps', async () => {
    const onVerified = vi.fn()
    verifyMfa.mockResolvedValue({ user: { role: 'ADMIN' } })
    render(<SecondFactorStep mfaToken="mfa_abc" onVerified={onVerified} onRestart={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '12a3 456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith({ user: { role: 'ADMIN' } }))
    expect(verifyMfa).toHaveBeenCalledWith('mfa_abc', { code: '123456' })
  })

  it('accepte un code de secours', async () => {
    verifyMfa.mockResolvedValue({})
    render(<SecondFactorStep mfaToken="mfa_abc" onVerified={vi.fn()} onRestart={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser un code de secours' }))
    fireEvent.change(screen.getByLabelText('Code de secours (XXXXX-XXXXX)'), { target: { value: 'abcde-12345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    await waitFor(() => expect(verifyMfa).toHaveBeenCalledWith('mfa_abc', { recoveryCode: 'ABCDE-12345' }))
  })

  it('affiche une erreur pour un code faux et revient au mot de passe quand le jeton a expiré', async () => {
    const onRestart = vi.fn()
    verifyMfa.mockRejectedValueOnce(new ApiError(401, 'Code 2FA invalide', { code: 'MFA_CODE_INVALID' }))
    render(<SecondFactorStep mfaToken="mfa_abc" onVerified={vi.fn()} onRestart={onRestart} />)

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Code 2FA invalide')

    verifyMfa.mockRejectedValueOnce(new ApiError(401, 'expiré', { code: 'MFA_TOKEN_INVALID' }))
    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await waitFor(() =>
      expect(onRestart).toHaveBeenCalledWith('La vérification a expiré. Saisissez à nouveau votre mot de passe.'),
    )
  })
})
