import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { apiFetch } from '../lib/api'
import { formatMoney } from './admin/accounting/projects/money'
import './PaymentPage.css'

export default function PaymentPage({ result }: { result?: 'success' | 'cancel' }) {
  const { token } = useParams<{ token: string }>()
  return <PaymentContent key={`${token}:${result}`} token={token} result={result} />
}

function PaymentContent({ token, result }: { token?: string; result?: 'success' | 'cancel' }) {
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
      setError(error instanceof Error ? error.message : 'Le paiement est indisponible.')
      sending.current = false
      setPending(false)
    }
  }
  return (
    <main className="payment-page">
      <Helmet>
        <title>Paiement de facture · Venio</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <section className="payment-panel">
        <p>VENIO</p>
        {result === 'success' && (
          <>
            <h1>Paiement transmis</h1>
            <p>La confirmation de votre paiement est en cours. Vous pouvez fermer cette page.</p>
          </>
        )}
        {result === 'cancel' && (
          <>
            <h1>Paiement interrompu</h1>
            <p>Vous pouvez revenir à la facture pour consulter son solde et reprendre le paiement.</p>
            <Link to={`/payer/${token}`}>Revenir à la facture</Link>
          </>
        )}
        {!result && (
          <>
            <h1>Régler votre facture</h1>
            {!invoice && !error && <p role="status">Chargement de la facture…</p>}
            {invoice && (
              <>
                <h2>{invoice.number}</h2>
                <p>{invoice.payerName}</p>
                <p className="payment-amount">{formatMoney(invoice.remainingTtcCents)}</p>
                <p>Montant restant à payer TTC</p>
                <button disabled={pending} onClick={() => void pay()}>
                  {pending ? 'Ouverture du paiement…' : 'Payer par carte'}
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
