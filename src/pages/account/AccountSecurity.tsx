import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import { passwordIssue } from '../../lib/passwordPolicy'
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter'

interface TwoFactorStatus {
  enabled: boolean
  pendingSetup: boolean
  recoveryCodesRemaining: number
  required: boolean
}

interface SetupPayload {
  secret: string
  otpauthUri: string
  qrDataUrl?: string
}

type Panel = 'idle' | 'password' | 'scan' | 'disable' | 'regenerate'

const cardStyle: React.CSSProperties = {
  background: 'var(--surface, rgba(255,255,255,0.04))',
  border: '1px solid var(--border, rgba(127,127,127,0.25))',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
}
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const formStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }

/**
 * Écran « Sécurité » du compte (VENIO-117), commun à l'administration et à
 * l'espace client : changement de mot de passe avec jauge, activation et
 * désactivation de la 2FA TOTP, codes de secours.
 */
export default function AccountSecurity() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mustUpgrade = searchParams.get('renforcer') === '1'
  const identity = { email: user?.email, name: user?.name }
  const loginPath =
    user?.role && (isAdminRole(user.role) || user.role === 'COMMERCIAL_EXTERNE')
      ? '/admin/login'
      : '/espace-client/login'

  // ── Mot de passe ──
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setPasswordError('')
    const issue = passwordIssue(passwords.next, identity)
    if (issue) return setPasswordError(t(`security.issue.${issue}` as 'security.issue.tooShort'))
    if (passwords.next !== passwords.confirm) return setPasswordError(t('security.password.mismatch'))
    setPasswordSaving(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      })
      // Le serveur révoque toutes les sessions : on repart de la connexion,
      // qui affiche la confirmation.
      await logout()
      navigate(`${loginPath}?passwordChanged=1`, { replace: true })
    } catch (err: unknown) {
      setPasswordError((err as Error).message || t('security.password.failed'))
    } finally {
      setPasswordSaving(false)
    }
  }

  // ── 2FA ──
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [panel, setPanel] = useState<Panel>('idle')
  const [setup, setSetup] = useState<SetupPayload | null>(null)
  const [factorPassword, setFactorPassword] = useState('')
  const [factorCode, setFactorCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [factorError, setFactorError] = useState('')
  const [factorNotice, setFactorNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const loadStatus = () =>
    apiFetch<TwoFactorStatus>('/api/auth/2fa/status')
      .then(setStatus)
      .catch(() => setFactorError(t('security.twoFactor.loadError')))

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetFactorForm = (next: Panel = 'idle') => {
    setPanel(next)
    setFactorPassword('')
    setFactorCode('')
    setFactorError('')
  }

  const run = async (action: () => Promise<void>) => {
    setFactorError('')
    setFactorNotice('')
    setBusy(true)
    try {
      await action()
    } catch (err: unknown) {
      setFactorError((err as Error).message || t('security.twoFactor.error'))
    } finally {
      setBusy(false)
    }
  }

  const startSetup = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      const payload = await apiFetch<SetupPayload>('/api/auth/2fa/setup', {
        method: 'POST',
        body: JSON.stringify({ password: factorPassword }),
      })
      setSetup(payload)
      resetFactorForm('scan')
    })
  }

  const confirmSetup = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      const payload = await apiFetch<{ recoveryCodes: string[] }>('/api/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: factorCode }),
      })
      setSetup(null)
      setRecoveryCodes(payload.recoveryCodes)
      setFactorNotice(t('security.twoFactor.activated'))
      resetFactorForm()
      await loadStatus()
    })
  }

  const factorBody = () => {
    const value = factorCode.trim()
    return /^\d{6}$/.test(value) ? { code: value } : { recoveryCode: value }
  }

  const disable = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      await apiFetch('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: factorPassword, ...factorBody() }),
      })
      setRecoveryCodes([])
      setFactorNotice(t('security.twoFactor.disabledDone'))
      resetFactorForm()
      await loadStatus()
    })
  }

  const regenerate = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      const payload = await apiFetch<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery-codes', {
        method: 'POST',
        body: JSON.stringify({ password: factorPassword, code: factorCode.trim() }),
      })
      setRecoveryCodes(payload.recoveryCodes)
      resetFactorForm()
      await loadStatus()
    })
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const passwordInput = (label: string, value: string, onChange: (value: string) => void, autoComplete: string) => (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        className="portal-input"
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )

  const codeInput = (label: string) => (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        className="portal-input"
        type="text"
        autoComplete="one-time-code"
        value={factorCode}
        onChange={(event) => setFactorCode(event.target.value.toUpperCase().slice(0, 11))}
        required
      />
    </label>
  )

  return (
    <div className="account-security" style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 4 }}>{t('security.title')}</h1>
      <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>{t('security.subtitle')}</p>

      {mustUpgrade && (
        <div role="alert" className="admin-error" style={{ marginBottom: 24 }}>
          {t('security.upgradeBanner')}
        </div>
      )}

      <section style={cardStyle} aria-labelledby="security-password-heading">
        <h2 id="security-password-heading" style={{ fontSize: 18, marginTop: 0 }}>
          {t('security.password.heading')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('security.password.rules')}</p>
        <form onSubmit={changePassword} style={formStyle}>
          {passwordInput(
            t('security.password.current'),
            passwords.current,
            (current) => setPasswords({ ...passwords, current }),
            'current-password',
          )}
          <div>
            {passwordInput(
              t('security.password.new'),
              passwords.next,
              (next) => setPasswords({ ...passwords, next }),
              'new-password',
            )}
            <PasswordStrengthMeter password={passwords.next} identity={identity} />
          </div>
          {passwordInput(
            t('security.password.confirm'),
            passwords.confirm,
            (confirm) => setPasswords({ ...passwords, confirm }),
            'new-password',
          )}
          {passwordError && (
            <div role="alert" className="admin-error">
              {passwordError}
            </div>
          )}
          <button className="portal-button" type="submit" disabled={passwordSaving}>
            {passwordSaving ? t('security.password.saving') : t('security.password.submit')}
          </button>
        </form>
      </section>

      <section style={cardStyle} aria-labelledby="security-2fa-heading">
        <h2 id="security-2fa-heading" style={{ fontSize: 18, marginTop: 0 }}>
          {t('security.twoFactor.heading')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('security.twoFactor.intro')}</p>
        {status && (
          <p>
            <strong data-testid="two-factor-state">
              {status.enabled ? t('security.twoFactor.enabled') : t('security.twoFactor.disabled')}
            </strong>
            {status.required && <span> · {t('security.twoFactor.required')}</span>}
            {status.enabled && (
              <span> · {t('security.twoFactor.recoveryLeft', { count: status.recoveryCodesRemaining })}</span>
            )}
          </p>
        )}
        {factorNotice && <p style={{ color: 'var(--good, #22c55e)' }}>{factorNotice}</p>}

        {recoveryCodes.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 16 }} aria-labelledby="security-recovery-heading">
            <h3 id="security-recovery-heading" style={{ marginTop: 0 }}>
              {t('security.twoFactor.recoveryTitle')}
            </h3>
            <p style={{ fontSize: 14 }}>{t('security.twoFactor.recoveryIntro')}</p>
            <ul
              data-testid="recovery-codes"
              style={{ fontFamily: 'monospace', columns: 2, listStyle: 'none', padding: 0, fontSize: 15 }}
            >
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="portal-button" onClick={copyCodes}>
                {copied ? t('security.twoFactor.recoveryCopied') : t('security.twoFactor.recoveryCopy')}
              </button>
              <button type="button" className="portal-button" onClick={() => setRecoveryCodes([])}>
                {t('security.twoFactor.recoveryDone')}
              </button>
            </div>
          </div>
        )}

        {status && !status.enabled && panel === 'idle' && (
          <button type="button" className="portal-button" onClick={() => resetFactorForm('password')}>
            {t('security.twoFactor.enable')}
          </button>
        )}

        {panel === 'password' && (
          <form onSubmit={startSetup} style={formStyle}>
            {passwordInput(
              t('security.twoFactor.passwordPrompt'),
              factorPassword,
              setFactorPassword,
              'current-password',
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="portal-button" type="submit" disabled={busy}>
                {t('security.twoFactor.start')}
              </button>
              <button type="button" className="portal-button" onClick={() => resetFactorForm()}>
                {t('security.twoFactor.cancel')}
              </button>
            </div>
          </form>
        )}

        {panel === 'scan' && setup && (
          <form onSubmit={confirmSetup} style={formStyle}>
            <p style={{ fontSize: 14 }}>{t('security.twoFactor.scan')}</p>
            {setup.qrDataUrl && (
              <img
                src={setup.qrDataUrl}
                alt={t('security.twoFactor.qrAlt')}
                width={200}
                height={200}
                style={{ background: '#fff', padding: 8, borderRadius: 8 }}
              />
            )}
            <div style={fieldStyle}>
              <span>{t('security.twoFactor.secret')}</span>
              <code data-testid="totp-secret" style={{ wordBreak: 'break-all', userSelect: 'all' }}>
                {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
              </code>
            </div>
            <details>
              <summary>{t('security.twoFactor.uri')}</summary>
              <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{setup.otpauthUri}</code>
            </details>
            <label style={fieldStyle}>
              <span>{t('security.twoFactor.code')}</span>
              <input
                className="portal-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={factorCode}
                onChange={(event) => setFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
              />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="portal-button" type="submit" disabled={busy || factorCode.length !== 6}>
                {t('security.twoFactor.confirm')}
              </button>
              <button
                type="button"
                className="portal-button"
                onClick={() => {
                  setSetup(null)
                  resetFactorForm()
                }}
              >
                {t('security.twoFactor.cancel')}
              </button>
            </div>
          </form>
        )}

        {status?.enabled && panel === 'idle' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="portal-button" onClick={() => resetFactorForm('regenerate')}>
              {t('security.twoFactor.regenerate')}
            </button>
            <button type="button" className="portal-button" onClick={() => resetFactorForm('disable')}>
              {t('security.twoFactor.disable')}
            </button>
          </div>
        )}

        {(panel === 'disable' || panel === 'regenerate') && (
          <form onSubmit={panel === 'disable' ? disable : regenerate} style={formStyle}>
            <p style={{ fontSize: 14 }}>
              {panel === 'disable' ? t('security.twoFactor.disableHint') : t('security.twoFactor.regenerateHint')}
            </p>
            {passwordInput(t('security.twoFactor.password'), factorPassword, setFactorPassword, 'current-password')}
            {codeInput(panel === 'disable' ? t('security.twoFactor.codeOrRecovery') : t('security.twoFactor.code'))}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="portal-button" type="submit" disabled={busy}>
                {t('security.twoFactor.validate')}
              </button>
              <button type="button" className="portal-button" onClick={() => resetFactorForm()}>
                {t('security.twoFactor.cancel')}
              </button>
            </div>
          </form>
        )}

        {factorError && (
          <div role="alert" className="admin-error" style={{ marginTop: 12 }}>
            {factorError}
          </div>
        )}
      </section>
    </div>
  )
}
