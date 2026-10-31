import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { apiFetch } from '../../lib/api'
import '../espace-client/ClientPortal.css'

interface SetupPayload {
  secret: string
  qrDataUrl: string
}

function safeReturnTo(value: string | null): string {
  if (!value?.startsWith('/admin') || value.startsWith('/admin/login') || value.startsWith('/admin/mfa-setup')) {
    return '/admin'
  }
  return value
}

export default function MfaSetup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const { t } = useI18n()
  const [checking, setChecking] = useState(true)
  const [starting, setStarting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [alreadyEnabled, setAlreadyEnabled] = useState(false)
  const [setup, setSetup] = useState<SetupPayload | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  useEffect(() => {
    apiFetch<{ enabled: boolean }>('/api/admin/2fa/status')
      .then(({ enabled }) => setAlreadyEnabled(enabled))
      .catch((err: unknown) => setError((err as Error).message || t('adminAccess.mfa.checkFailed')))
      .finally(() => setChecking(false))
  }, [])

  const startEnrollment = async () => {
    setStarting(true)
    setError('')
    try {
      setSetup(await apiFetch<SetupPayload>('/api/admin/2fa/setup', { method: 'POST' }))
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.mfa.startFailed'))
    } finally {
      setStarting(false)
    }
  }

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault()
    setVerifying(true)
    setError('')
    try {
      const result = await apiFetch<{ enabled: true; recoveryCodes: string[] }>('/api/admin/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setRecoveryCodes(result.recoveryCodes)
      setSetup(null)
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.mfa.invalidCode'))
    } finally {
      setVerifying(false)
    }
  }

  const continueToAdmin = async () => {
    await refreshUser()
    navigate(returnTo, { replace: true })
  }

  if (checking) {
    return <div className="portal-container">{t('adminAccess.mfa.checking')}</div>
  }

  return (
    <main className="portal-container" style={{ maxWidth: 680, margin: '0 auto', paddingTop: 48 }}>
      <section className="portal-card">
        <p style={{ color: 'var(--primary)', fontWeight: 700, margin: 0 }}>{t('adminAccess.mfa.eyebrow')}</p>
        <h1 style={{ margin: '8px 0 12px' }}>{t('adminAccess.mfa.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t('adminAccess.mfa.intro')}</p>

        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}

        {alreadyEnabled && recoveryCodes.length === 0 && (
          <div className="portal-list">
            <p>{t('adminAccess.mfa.alreadyActive')}</p>
            <button className="portal-button" type="button" onClick={continueToAdmin}>
              {t('adminAccess.mfa.continueToVenio')}
            </button>
          </div>
        )}

        {!alreadyEnabled && !setup && recoveryCodes.length === 0 && (
          <button className="portal-button" type="button" onClick={startEnrollment} disabled={starting}>
            {starting ? t('adminAccess.mfa.preparing') : t('adminAccess.mfa.configure')}
          </button>
        )}

        {setup && (
          <form className="portal-list" onSubmit={verifyEnrollment}>
            <img
              src={setup.qrDataUrl}
              alt={t('adminAccess.mfa.qrAlt')}
              width={240}
              height={240}
              style={{ alignSelf: 'center', background: '#fff', borderRadius: 12, padding: 8 }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, overflowWrap: 'anywhere' }}>
              {t('adminAccess.mfa.manualEntry')} <strong>{setup.secret}</strong>
            </p>
            <label htmlFor="mfa-code" style={{ fontWeight: 700 }}>
              {t('adminAccess.mfa.codeLabel')}
            </label>
            <input
              id="mfa-code"
              className="portal-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              minLength={6}
              maxLength={6}
              required
              autoFocus
            />
            <button className="portal-button" type="submit" disabled={verifying || code.length !== 6}>
              {verifying ? t('adminAccess.mfa.verifying') : t('adminAccess.mfa.activate')}
            </button>
          </form>
        )}

        {recoveryCodes.length > 0 && (
          <div className="portal-list">
            <h2>{t('adminAccess.mfa.recoveryTitle')}</h2>
            <p style={{ color: 'var(--text-secondary)' }}>{t('adminAccess.mfa.recoveryHint')}</p>
            <pre style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', whiteSpace: 'pre-wrap' }}>
              {recoveryCodes.join('\n')}
            </pre>
            <button
              className="portal-button"
              type="button"
              onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            >
              {t('adminAccess.mfa.copyCodes')}
            </button>
            <button className="portal-button" type="button" onClick={continueToAdmin}>
              {t('adminAccess.mfa.savedContinue')}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
