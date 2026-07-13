import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
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
      .catch((err: unknown) => setError((err as Error).message || 'Impossible de vérifier la MFA'))
      .finally(() => setChecking(false))
  }, [])

  const startEnrollment = async () => {
    setStarting(true)
    setError('')
    try {
      setSetup(await apiFetch<SetupPayload>('/api/admin/2fa/setup', { method: 'POST' }))
    } catch (err: unknown) {
      setError((err as Error).message || "Impossible de démarrer l'activation MFA")
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
      setError((err as Error).message || 'Code MFA invalide')
    } finally {
      setVerifying(false)
    }
  }

  const continueToAdmin = async () => {
    await refreshUser()
    navigate(returnTo, { replace: true })
  }

  if (checking) {
    return <div className="portal-container">Vérification de la sécurité…</div>
  }

  return (
    <main className="portal-container" style={{ maxWidth: 680, margin: '0 auto', paddingTop: 48 }}>
      <section className="portal-card">
        <p style={{ color: 'var(--primary)', fontWeight: 700, margin: 0 }}>Sécurité du compte</p>
        <h1 style={{ margin: '8px 0 12px' }}>Activez l’authentification MFA</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Votre rôle protège des données sensibles. Scannez le QR code avec votre application d’authentification, puis
          saisissez le code à 6 chiffres. Cette étape ne vous sera demandée qu’une fois.
        </p>

        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}

        {alreadyEnabled && recoveryCodes.length === 0 && (
          <div className="portal-list">
            <p>La MFA est déjà active sur votre compte.</p>
            <button className="portal-button" type="button" onClick={continueToAdmin}>
              Continuer vers Venio
            </button>
          </div>
        )}

        {!alreadyEnabled && !setup && recoveryCodes.length === 0 && (
          <button className="portal-button" type="button" onClick={startEnrollment} disabled={starting}>
            {starting ? 'Préparation…' : 'Configurer la MFA'}
          </button>
        )}

        {setup && (
          <form className="portal-list" onSubmit={verifyEnrollment}>
            <img
              src={setup.qrDataUrl}
              alt="QR code de configuration MFA Venio"
              width={240}
              height={240}
              style={{ alignSelf: 'center', background: '#fff', borderRadius: 12, padding: 8 }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, overflowWrap: 'anywhere' }}>
              Saisie manuelle : <strong>{setup.secret}</strong>
            </p>
            <label htmlFor="mfa-code" style={{ fontWeight: 700 }}>
              Code à 6 chiffres
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
              {verifying ? 'Vérification…' : 'Activer la MFA'}
            </button>
          </form>
        )}

        {recoveryCodes.length > 0 && (
          <div className="portal-list">
            <h2>Conservez vos codes de récupération</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Ils ne seront affichés qu’une fois. Stockez-les dans votre gestionnaire de mots de passe.
            </p>
            <pre style={{ padding: 16, borderRadius: 12, background: 'var(--bg-secondary)', whiteSpace: 'pre-wrap' }}>
              {recoveryCodes.join('\n')}
            </pre>
            <button
              className="portal-button"
              type="button"
              onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            >
              Copier les codes
            </button>
            <button className="portal-button" type="button" onClick={continueToAdmin}>
              J’ai sauvegardé mes codes — continuer
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
