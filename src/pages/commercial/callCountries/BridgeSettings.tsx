import { useEffect, useState } from 'react'
import { useI18n, type MessageKey } from '../../../context/I18nContext'
import { createCallsApi, type BridgeProfile } from '../../../services/calls'
import './callCountries.css'

const ERRORS = ['INVALID_PHONE', 'INVALID_CODE', 'CODE_EXPIRED', 'CODE_RATE_LIMITED', 'BRIDGE_NOT_VERIFIED']

function errorKey(err: unknown): MessageKey {
  const payload = (err as { payload?: { code?: string; error?: string } }).payload
  const code = [payload?.code, payload?.error, (err as Error).message].find((value) => ERRORS.includes(value ?? ''))
  return (code ? `callCountries.bridge.error.${code}` : 'callCountries.bridge.error.generic') as MessageKey
}

/**
 * Mode pont dans le profil (lot P, décision 5) : vérifier son portable par un code lu au
 * téléphone, puis y faire passer ses appels. Absent si l'utilisateur n'a pas le poste d'appel.
 */
export default function BridgeSettings({ prefix }: { prefix: string }) {
  const { t } = useI18n()
  const [api] = useState(() => createCallsApi(prefix))
  const [bridge, setBridge] = useState<BridgeProfile | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)

  useEffect(() => {
    let current = true
    Promise.all([api.bridge(), api.config()])
      .then(([profile, config]) => {
        if (!current) return
        setBridge(profile)
        setEnabled(config.enabled)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [api])

  if (!bridge) return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="portal-card call-bridge" aria-labelledby="call-bridge-title" style={{ marginBottom: 24 }}>
      <h2 id="call-bridge-title" style={{ fontSize: 18, margin: 0 }}>
        {t('callCountries.bridge.title')}
      </h2>
      <p style={{ margin: 0 }}>{t('callCountries.bridge.desc')}</p>
      {!enabled && <p role="status">{t('callCountries.bridge.disabled')}</p>}
      <p role="status" style={{ margin: 0 }}>
        {bridge.verified && bridge.phone
          ? t('callCountries.bridge.verified', { phone: bridge.phone })
          : t('callCountries.bridge.notVerified')}
      </p>
      <form
        className="call-bridge-row"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await api.sendBridgeCode(phone)
            setSent(true)
          })
        }}
      >
        <label>
          {t('callCountries.bridge.phone')}
          <input
            className="portal-input"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <button type="submit" className="portal-button secondary" disabled={busy || !enabled || !phone.trim()}>
          {t('callCountries.bridge.sendCode')}
        </button>
      </form>
      {sent && (
        <form
          className="call-bridge-row"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              setBridge(await api.verifyBridgeCode(code.trim()))
              setSent(false)
              setCode('')
            })
          }}
        >
          <p role="status" style={{ flexBasis: '100%', margin: 0 }}>
            {t('callCountries.bridge.codeSent')}
          </p>
          <label>
            {t('callCountries.bridge.code')}
            <input
              className="portal-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button type="submit" className="portal-button" disabled={busy || code.length !== 6}>
            {t('callCountries.bridge.verify')}
          </button>
        </form>
      )}
      <label className="call-pro-check">
        <input
          type="checkbox"
          checked={bridge.enabled}
          disabled={busy || (!bridge.verified && !bridge.enabled)}
          onChange={(event) => {
            const next = event.target.checked
            void run(async () => setBridge(await api.setBridge(next)))
          }}
        />
        <span>{t('callCountries.bridge.enable')}</span>
      </label>
      {error && (
        <p role="alert" className="admin-error" style={{ margin: 0 }}>
          {t(error)}
        </p>
      )}
    </section>
  )
}
