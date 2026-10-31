import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { apiFetch } from '../lib/api'
import { useI18n } from '../context/I18nContext'
import { formatMoney } from '../i18n/format'
import './PaymentPage.css'

export default function PaymentPage({ result }: { result?: 'success' | 'cancel' }) {
  const { token } = useParams<{ token: string }>()
  return <PaymentContent key={`${token}:${result}`} token={token} result={result} />
}

function PaymentContent({ token, result }: { token?: string; result?: 'success' | 'cancel' }) {
  const { t } = useI18n()
  const [invoice, setInvoice] = useState<{ number: string; payerName: string; remainingTtcCents: number } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const sending = useRef(false)
  useEffect(() => {
    if (result || !token) return
    const controller = new AbortController()
    void apiFetch<{ number: string; payerName: string; remainingTtcCents: number }>(
      `/api/public/pay/${encodeURIComponent(token)}`,
      { signal: controller.signal, credentials: 'omit' },
    )
      .then(setInvoice)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
    return () => controller.abort()
  }, [token, result])
  const pay = async () => {
    if (!token || sending.current) return
    sending.current = true
    setPending(true)
    setError('')
    try {
      const response = await apiFetch<{ url: string }>(`/api/public/pay/${encodeURIComponent(token)}/checkout`, {
        method: 'POST',
        credentials: 'omit',
      })
      window.location.assign(response.url)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('pubForms.payment.unavailable'))
      sending.current = false
      setPending(false)
    }
  }
  return (
    <main className="payment-page">
      <Helmet>
        <title>{t('pubForms.payment.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <section className="payment-panel">
        <p>VENIO</p>
        {result === 'success' && (
          <>
            <h1>{t('pubForms.payment.sentTitle')}</h1>
            <p>{t('pubForms.payment.sentText')}</p>
          </>
        )}
        {result === 'cancel' && (
          <>
            <h1>{t('pubForms.payment.cancelledTitle')}</h1>
            <p>{t('pubForms.payment.cancelledText')}</p>
            <Link to={`/payer/${token}`}>{t('pubForms.payment.backToInvoice')}</Link>
          </>
        )}
        {!result && (
          <>
            <h1>{t('pubForms.payment.payTitle')}</h1>
            {!invoice && !error && <p role="status">{t('pubForms.payment.loadingInvoice')}</p>}
            {invoice && (
              <>
                <h2>{invoice.number}</h2>
                <p>{invoice.payerName}</p>
                <p className="payment-amount">{formatMoney(invoice.remainingTtcCents / 100)}</p>
                <p>{t('pubForms.payment.remaining')}</p>
                <button disabled={pending} onClick={() => void pay()}>
                  {pending ? t('pubForms.payment.opening') : t('pubForms.payment.payByCard')}
                </button>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}
