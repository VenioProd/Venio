import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProposal, saveAnswers, saveSelection, signProposal } from '../../services/quotes'
import type { QuoteProposal, QuoteTotals } from '../../types/quote.types'
import './ClientPortal.css'

type Step = 'cadrage' | 'options' | 'recapitulatif' | 'signature'

const STEPS: { key: Step; label: string }[] = [
  { key: 'cadrage', label: 'Cadrage' },
  { key: 'options', label: 'Options' },
  { key: 'recapitulatif', label: 'Récapitulatif' },
  { key: 'signature', label: 'Signature' },
]

const euros = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

const ClientQuoteProposal = () => {
  const { projectId = '', proposalId = '' } = useParams()
  const [proposal, setProposal] = useState<QuoteProposal | null>(null)
  const [totals, setTotals] = useState<QuoteTotals | null>(null)
  const [step, setStep] = useState<Step>('cadrage')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [signerName, setSignerName] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [signedNumber, setSignedNumber] = useState('')

  useEffect(() => {
    getProposal(projectId, proposalId)
      .then(({ proposal: loaded, totals: loadedTotals }) => {
        setProposal(loaded)
        setTotals(loadedTotals)
        setAnswers(Object.fromEntries(loaded.answers.map((a) => [a.question, a.value])))
      })
      .catch((err: Error) => setError(err.message || 'Proposition indisponible'))
  }, [projectId, proposalId])

  const readOnly = proposal?.status !== 'SENT'

  const missingRequired = useMemo(() => {
    if (!proposal) return []
    return proposal.questions.filter((q) => q.required && !(answers[q._id] ?? '').trim())
  }, [proposal, answers])

  const persistAnswers = useCallback(async () => {
    if (!proposal || readOnly) return
    const payload = proposal.questions.map((q) => ({ question: q._id, value: answers[q._id] ?? '' }))
    const result = await saveAnswers(projectId, proposalId, payload)
    setProposal(result.proposal)
    setTotals(result.totals)
  }, [proposal, readOnly, answers, projectId, proposalId])

  const toggleOption = async (lineId: string) => {
    if (!proposal || readOnly) return
    const current = new Set(proposal.selectedOptionalLineIds)
    if (current.has(lineId)) current.delete(lineId)
    else current.add(lineId)
    const result = await saveSelection(projectId, proposalId, [...current])
    setProposal(result.proposal)
    setTotals(result.totals)
  }

  const goTo = async (next: Step) => {
    setError('')
    if (next === 'signature' && missingRequired.length > 0) {
      setStep('cadrage')
      setError('Répondez à chaque question obligatoire avant de signer.')
      return
    }
    if (step === 'cadrage' && !readOnly) await persistAnswers().catch(() => {})
    setStep(next)
  }

  const handleSign = async () => {
    setError('')
    try {
      const { billingDocument } = await signProposal(projectId, proposalId, signerName.trim())
      setSignedNumber(billingDocument.number)
      const refreshed = await getProposal(projectId, proposalId)
      setProposal(refreshed.proposal)
      setTotals(refreshed.totals)
    } catch (err) {
      setError((err as Error).message || 'Signature impossible')
    }
  }

  if (error && !proposal)
    return (
      <div className="portal-container">
        <p>{error}</p>
      </div>
    )
  if (!proposal)
    return (
      <div className="portal-container">
        <div className="portal-spinner" />
      </div>
    )

  return (
    <div className="portal-container">
      <h1>{proposal.title}</h1>

      {proposal.status === 'SIGNED' && (
        <p role="status">
          Proposition signée par {proposal.signature.signerName} le{' '}
          {proposal.signature.signedAt ? new Date(proposal.signature.signedAt).toLocaleDateString('fr-FR') : ''}
          {signedNumber ? ` — devis ${signedNumber}` : ''}
        </p>
      )}
      {proposal.status === 'EXPIRED' && <p role="status">Cette proposition a expiré.</p>}

      <nav className="portal-list">
        {STEPS.map((entry) => (
          <button key={entry.key} type="button" onClick={() => goTo(entry.key)} aria-current={step === entry.key}>
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {step === 'cadrage' && (
        <section>
          {proposal.questions.map((question) => (
            <label key={question._id} className="portal-list">
              {question.label}
              {question.required && ' *'}
              <input
                className="portal-input"
                value={answers[question._id] ?? ''}
                disabled={readOnly}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [question._id]: e.target.value }))}
                onBlur={() => persistAnswers().catch(() => {})}
              />
            </label>
          ))}
          {missingRequired.length > 0 && (
            <p>
              {missingRequired.length === 1
                ? 'Il reste 1 réponse à compléter.'
                : `Il reste ${missingRequired.length} réponses à compléter.`}
            </p>
          )}
        </section>
      )}

      {step === 'options' && (
        <section>
          {proposal.lines.map((line) => (
            <div key={line._id}>
              {line.isOptional ? (
                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={proposal.selectedOptionalLineIds.includes(line._id)}
                    onChange={() => toggleOption(line._id)}
                  />
                  {line.description} — {euros(line.unitPrice)}
                </label>
              ) : (
                <p>
                  {line.description} — {euros(line.unitPrice)} (inclus)
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {step === 'recapitulatif' && (
        <section>
          <pre>{proposal.specification.content}</pre>
        </section>
      )}

      {step === 'signature' && !readOnly && (
        <section>
          <label>
            Nom du signataire
            <input className="portal-input" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Je reconnais avoir pris connaissance du périmètre et du montant, et j’accepte cette proposition.
          </label>
          <button
            className="portal-button"
            type="button"
            disabled={!consent || signerName.trim().length < 2}
            onClick={handleSign}
          >
            Signer
          </button>
        </section>
      )}

      <p data-testid="quote-total">Total TTC : {totals ? euros(totals.total) : '—'}</p>
    </div>
  )
}

export default ClientQuoteProposal
