import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import './ClientPortal.css'

const INVITATION_STORAGE_KEY = 'venio-project-invitation-token'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

type AcceptState = 'loading' | 'accepting' | 'success' | 'error'

function readInvitationToken(): string | null {
  const fragmentToken = window.location.hash.slice(1)
  if (TOKEN_RE.test(fragmentToken)) {
    sessionStorage.setItem(INVITATION_STORAGE_KEY, fragmentToken)
    // The fragment is not sent over HTTP. Remove it promptly so it is not
    // copied into browser history, screenshots, or a later pasted address.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    return fragmentToken
  }
  const stored = sessionStorage.getItem(INVITATION_STORAGE_KEY)
  return stored && TOKEN_RE.test(stored) ? stored : null
}

export default function ProjectInvitationAccept() {
  const { t } = useI18n()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [token] = useState<string | null>(readInvitationToken)
  const [state, setState] = useState<AcceptState>('loading')
  const [message, setMessage] = useState('')
  const attemptedToken = useRef<string | null>(null)

  const accept = useCallback(
    async (invitationToken: string) => {
      if (attemptedToken.current === invitationToken) return
      attemptedToken.current = invitationToken
      // Keep it in component memory for a manual retry, but never retain it in
      // web storage after an authenticated acceptance attempt.
      sessionStorage.removeItem(INVITATION_STORAGE_KEY)
      setState('accepting')
      setMessage('')
      try {
        const result = await apiFetch<{ projectId: string }>('/api/projects/invitations/accept', {
          method: 'POST',
          body: JSON.stringify({ token: invitationToken }),
        })
        setState('success')
        setMessage(t('client.invitation.accepted'))
        navigate(`/espace-client/projets/${result.projectId}`, { replace: true })
      } catch (err: unknown) {
        setState('error')
        setMessage(err instanceof Error && err.message ? err.message : t('client.invitation.acceptError'))
      }
    },
    [navigate, t],
  )

  useEffect(() => {
    if (loading || !token || !user || user.role !== 'CLIENT') return
    const timer = window.setTimeout(() => void accept(token), 0)
    return () => window.clearTimeout(timer)
  }, [accept, loading, token, user])

  if (loading) {
    return (
      <div className="portal-container">
        <div className="portal-card">
          <p>{t('client.invitation.checking')}</p>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="portal-container">
        <div className="portal-card">
          <h1>{t('client.invitation.invalidTitle')}</h1>
          <p>{t('client.invitation.invalidBody')}</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/espace-client/login?returnTo=%2Fespace-client%2Finvitation" replace />
  }

  if (user.role !== 'CLIENT') {
    return (
      <div className="portal-container">
        <div className="portal-card">
          <h1>{t('client.invitation.clientRequiredTitle')}</h1>
          <p>{t('client.invitation.clientRequiredBody')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <h1>{t('client.invitation.title')}</h1>
        {state === 'accepting' && <p>{t('client.invitation.accepting')}</p>}
        {state === 'success' && <p>{message}</p>}
        {state === 'error' && (
          <>
            <p role="alert">{message}</p>
            <button
              type="button"
              className="portal-button"
              onClick={() => {
                attemptedToken.current = null
                if (token) void accept(token)
              }}
            >
              {t('client.invitation.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
