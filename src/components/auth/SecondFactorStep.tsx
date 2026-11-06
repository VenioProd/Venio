import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { ApiError } from '../../lib/api'
import type { LoginResult } from '../../types/auth.types'

interface Props {
  mfaToken: string
  /** Connexion terminée (session posée). */
  onVerified: (result: LoginResult) => void
  /** Jeton expiré ou épuisé : retour à la saisie du mot de passe, avec un message. */
  onRestart: (message?: string) => void
  errorStyle?: React.CSSProperties
}

/** Second temps de la connexion (VENIO-117) : code TOTP ou code de secours. */
export default function SecondFactorStep({ mfaToken, onVerified, onRestart, errorStyle }: Props) {
  const { verifyMfa } = useAuth()
  const { t } = useI18n()
  const [useRecovery, setUseRecovery] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await verifyMfa(mfaToken, useRecovery ? { recoveryCode: value.trim() } : { code: value })
      onVerified(result)
    } catch (err: unknown) {
      const code = err instanceof ApiError ? (err.payload as { code?: string } | null)?.code : undefined
      if (code === 'MFA_TOKEN_INVALID') {
        onRestart(t('security.login.expired'))
        return
      }
      setError((err as Error).message || t('security.login.invalidCode'))
      setValue('')
    } finally {
      setLoading(false)
    }
  }

  const linkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '8px',
  }

  return (
    <form onSubmit={submit} className="portal-list" aria-label={t('security.login.codeTitle')}>
      <p>{t('security.login.codeIntro')}</p>
      {useRecovery ? (
        <input
          className="portal-input"
          type="text"
          autoComplete="one-time-code"
          placeholder={t('security.login.recoveryPlaceholder')}
          aria-label={t('security.login.recoveryPlaceholder')}
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase().slice(0, 11))}
          required
          autoFocus
        />
      ) : (
        <input
          className="portal-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t('security.login.codePlaceholder')}
          aria-label={t('security.login.codePlaceholder')}
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
          required
          autoFocus
        />
      )}
      {error && (
        <div className="admin-error" role="alert" style={errorStyle}>
          {error}
        </div>
      )}
      <button className="portal-button" type="submit" disabled={loading}>
        {loading ? t('security.login.verifying') : t('security.login.verify')}
      </button>
      <button
        type="button"
        style={linkStyle}
        onClick={() => {
          setUseRecovery(!useRecovery)
          setValue('')
          setError('')
        }}
      >
        {useRecovery ? t('security.login.useTotp') : t('security.login.useRecovery')}
      </button>
      <button type="button" style={linkStyle} onClick={() => onRestart()}>
        {t('security.login.back')}
      </button>
    </form>
  )
}
