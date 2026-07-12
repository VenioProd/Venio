import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, apiFetch } from '../lib/api'
import './PublicQuestionnaire.css'

interface Question {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
}

interface QuestionnaireData {
  _id: string
  title: string
  description: string
  questions: Question[]
}

const PublicQuestionnaire = () => {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<QuestionnaireData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [formation, setFormation] = useState('')
  const [answers, setAnswers] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    apiFetch<QuestionnaireData>(`/api/questionnaire/${token}`)
      .then((d) => setData(d))
      .catch((err: unknown) => setError(err instanceof ApiError ? 'Questionnaire introuvable' : (err as Error).message))
      .finally(() => setLoading(false))
  }, [token])

  const setAnswer = (i: number, val: string) => {
    setAnswers(new Map(answers.set(i, val)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || submitting) return

    setSubmitting(true)
    try {
      await apiFetch(`/api/questionnaire/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respondentName: name,
          respondentEmail: email,
          formation,
          answers: Array.from(answers.entries()).map(([questionIndex, value]) => ({ questionIndex, value })),
        }),
      })

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading)
    return (
      <div className="pq-page">
        <div className="pq-loading">Chargement...</div>
      </div>
    )
  if (error && !data)
    return (
      <div className="pq-page">
        <div className="pq-error">{error}</div>
      </div>
    )

  if (submitted) {
    return (
      <div className="pq-page">
        <div className="pq-success">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h2>Merci pour votre retour !</h2>
          <p>Votre reponse a bien ete enregistree.</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="pq-page">
      <form className="pq-form" onSubmit={handleSubmit}>
        <div className="pq-header">
          <h1 className="pq-title">{data.title}</h1>
          {data.description && <p className="pq-desc">{data.description}</p>}
        </div>

        {error && <div className="pq-form-error">{error}</div>}

        <div className="pq-section">
          <h3>Vos informations</h3>
          <div className="pq-field">
            <label>Nom complet *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom et prenom" />
          </div>
          <div className="pq-field">
            <label>Email *</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
            />
          </div>
          <div className="pq-field">
            <label>Formation concernee</label>
            <input value={formation} onChange={(e) => setFormation(e.target.value)} placeholder="Nom de la formation" />
          </div>
        </div>

        <div className="pq-section">
          <h3>Questions</h3>
          {data.questions.map((q, i) => (
            <div key={i} className="pq-question">
              <div className="pq-question-label">
                {q.label} {q.required && <span className="pq-required">*</span>}
              </div>

              {q.type === 'rating' && (
                <div className="pq-rating">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`pq-star ${parseInt(answers.get(i) || '0') >= v ? 'active' : ''}`}
                      onClick={() => setAnswer(i, String(v))}
                    >
                      ★
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'text' && (
                <textarea
                  value={answers.get(i) || ''}
                  onChange={(e) => setAnswer(i, e.target.value)}
                  placeholder="Votre reponse..."
                  rows={3}
                  required={q.required}
                />
              )}

              {q.type === 'multiple_choice' && (
                <div className="pq-choices">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`pq-choice ${answers.get(i) === opt ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name={`q-${i}`}
                        value={opt}
                        checked={answers.get(i) === opt}
                        onChange={() => setAnswer(i, opt)}
                        required={q.required && !answers.has(i)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="submit" className="pq-submit" disabled={submitting}>
          {submitting ? 'Envoi en cours...' : 'Envoyer mes reponses'}
        </button>
      </form>
    </div>
  )
}

export default PublicQuestionnaire
