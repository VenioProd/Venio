import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../../lib/api'
import { useI18n } from '../../../../context/I18nContext'
import { ACCOUNTING, ActionForm, errorText } from './shared'

export default function InvoicePaymentLink({ invoiceId }: { invoiceId: string }) {
  const { t } = useI18n()
  const path = `${ACCOUNTING}/invoices/${invoiceId}/payment-link`
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const load = useCallback(
    () =>
      apiFetch<{ url: string | null }>(path).then((data) => {
        setUrl(data.url)
        setLoaded(true)
        setCopied(false)
        setError('')
      }),
    [path],
  )
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  return (
    <div className="pf-record">
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">{t('accProjects.paymentLink.loading')}</p>}
      {loaded && !url && (
        <ActionForm
          label={t('accProjects.paymentLink.create')}
          retryable={false}
          submit={() => apiFetch(path, { method: 'POST' })}
          onSaved={load}
        />
      )}
      {url && (
        <>
          <label className="pf-field">
            {t('accProjects.paymentLink.label')}
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
          </label>
          <button
            className="portal-button secondary"
            onClick={async () => {
              try {
                const fresh = await apiFetch<{ url: string | null }>(path)
                setUrl(fresh.url)
                if (!fresh.url) throw new Error(t('accProjects.paymentLink.inactive'))
                await navigator.clipboard.writeText(fresh.url)
                setCopied(true)
              } catch (error) {
                setError(errorText(error))
              }
            }}
          >
            {t('accProjects.paymentLink.copy')}
          </button>
          {copied && <p role="status">{t('accProjects.paymentLink.copied')}</p>}
          <ActionForm
            label={t('accProjects.paymentLink.revoke')}
            retryable={false}
            submit={() => apiFetch(path, { method: 'DELETE' })}
            onSaved={load}
          />
        </>
      )}
    </div>
  )
}
