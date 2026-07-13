import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import MfaSetup from './MfaSetup'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

describe('MfaSetup', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ refreshUser: vi.fn() } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.endsWith('/status')) return { enabled: false }
      if (path.endsWith('/setup')) return { secret: 'BASE32SECRET', qrDataUrl: 'data:image/png;base64,qr' }
      if (path.endsWith('/verify')) return { enabled: true, recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('guides enrollment from QR generation through one-time recovery codes', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/mfa-setup']}>
        <MfaSetup />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Configurer la MFA' }))
    expect(await screen.findByAltText('QR code de configuration MFA Venio')).toBeInTheDocument()
    expect(screen.getByText('BASE32SECRET')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activer la MFA' }))

    expect(await screen.findByText(/AAAAA-BBBBB/)).toHaveTextContent('CCCCC-DDDDD')
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code: '123456' }),
    })
  })
})
