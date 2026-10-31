import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, apiFetch } from '../lib/api'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import './PublicQuestionnaire.css'

interface Question {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
}

const QUESTION_TYPES = [
  { value: 'rating', labelKey: 'pubForms.builder.typeRating' },
  { value: 'text', labelKey: 'pubForms.builder.typeText' },
  { value: 'multiple_choice', labelKey: 'pubForms.builder.typeChoice' },
] as const satisfies readonly { value: Question['type']; labelKey: MessageKey }[]

const PublicQuestionnaireBuilder = () => {
  const { t } = useI18n()
  const { token } = useParams<{ token: string }>()
  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<Question[]>([{ type: 'rating', label: '', options: [], required: true }])
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ token: string } | null>(null)

  useEffect(() => {
    const validate = async () => {
      try {
        await apiFetch(`/api/questionnaire/create/${token}`)
        setValid(true)
      } catch (err) {
        setError(err instanceof ApiError ? t('pubForms.builder.linkInvalid') : t('pubForms.builder.connectionError'))
      } finally {
        setValidating(false)
      }
    }
    validate()
    // Le message d'erreur est posé une fois, à la validation du lien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const updateQuestion = (i: number, patch: Partial<Question>) => {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }

  const addQuestion = () => {
    setQuestions([...questions, { type: 'text', label: '', options: [], required: true }])
  }

  const removeQuestion = (i: number) => {
    setQuestions(questions.filter((_, idx) => idx !== i))
  }

  const canSubmit = title.trim() && questions.length > 0 && questions.every((q) => q.label.trim())

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError('')

    try {
      const data = await apiFetch<{ token: string }>(`/api/questionnaire/create/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, questions }),
      })

      setCreated({ token: data.token })
    } catch (err: any) {
      setError(err.message || t('pubForms.builder.unexpectedError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (validating) {
    return (
      <div className="pq-page">
        <div className="pq-loading">{t('pubForms.builder.checking')}</div>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="pq-page">
        <div className="pq-form">
          <div className="pq-header">
            <h1 className="pq-title">{t('pubForms.builder.invalidTitle')}</h1>
            <p className="pq-desc">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (created) {
    const publicLink = `${window.location.origin}/questionnaire/${created.token}`
    return (
      <div className="pq-page">
        <div className="pq-form">
          <div className="pq-header">
            <div className="pq-success">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ff0080" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h2>{t('pubForms.builder.createdTitle')}</h2>
              <p>{t('pubForms.builder.createdText')}</p>
            </div>
          </div>
          <div className="pq-section">
            <h3>{t('pubForms.builder.publicLinkHeading')}</h3>
            <div className="pqb-link-box">
              <code className="pqb-link-url">{publicLink}</code>
              <button
                className="pqb-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(publicLink).catch(() => {
                    const input = document.createElement('input')
                    input.value = publicLink
                    document.body.appendChild(input)
                    input.select()
                    document.execCommand('copy')
                    document.body.removeChild(input)
                  })
                }}
              >
                {t('pubForms.builder.copyLink')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pq-page">
      <div className="pq-form pqb-form">
        <div className="pq-header">
          <h1 className="pq-title">{t('pubForms.builder.title')}</h1>
          <p className="pq-desc">{t('pubForms.builder.subtitle')}</p>
        </div>

        {/* Title & Description */}
        <div className="pq-section">
          <h3>{t('pubForms.builder.generalHeading')}</h3>
          <div className="pq-field">
            <label>{t('pubForms.builder.titleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('pubForms.builder.titlePlaceholder')}
            />
          </div>
          <div className="pq-field">
            <label>{t('pubForms.builder.descriptionLabel')}</label>
            <textarea
              className="pqb-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('pubForms.builder.descriptionPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        {/* Questions */}
        <div className="pq-section">
          <h3>{t('pubForms.builder.questionsHeading')}</h3>

          {questions.map((q, i) => (
            <div key={i} className="pqb-question-card">
              <div className="pqb-question-header">
                <span className="pqb-question-num">Q{i + 1}</span>
                <select
                  className="pqb-select"
                  value={q.type}
                  onChange={(e) => updateQuestion(i, { type: e.target.value as any })}
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {t(type.labelKey)}
                    </option>
                  ))}
                </select>
                <label className="pqb-required-toggle">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                  />
                  {t('pubForms.builder.required')}
                </label>
                {questions.length > 1 && (
                  <button className="pqb-remove-btn" onClick={() => removeQuestion(i)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <input
                className="pqb-question-label-input"
                value={q.label}
                onChange={(e) => updateQuestion(i, { label: e.target.value })}
                placeholder={t('pubForms.builder.questionLabelPlaceholder')}
              />

              {q.type === 'multiple_choice' && (
                <div className="pqb-options">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="pqb-option-row">
                      <input
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...q.options]
                          newOpts[oi] = e.target.value
                          updateQuestion(i, { options: newOpts })
                        }}
                        placeholder={t('pubForms.builder.optionPlaceholder', { n: oi + 1 })}
                      />
                      <button
                        className="pqb-remove-opt"
                        onClick={() => updateQuestion(i, { options: q.options.filter((_, j) => j !== oi) })}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <button className="pqb-add-opt" onClick={() => updateQuestion(i, { options: [...q.options, ''] })}>
                    {t('pubForms.builder.addOption')}
                  </button>
                </div>
              )}

              {q.type === 'rating' && <div className="pqb-rating-preview">{t('pubForms.builder.ratingPreview')}</div>}
            </div>
          ))}

          <button className="pqb-add-question" onClick={addQuestion}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('pubForms.builder.addQuestion')}
          </button>
        </div>

        {error && <div className="pq-form-error">{error}</div>}

        <button className="pq-submit" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? t('pubForms.builder.creating') : t('pubForms.builder.create')}
        </button>
      </div>
    </div>
  )
}

export default PublicQuestionnaireBuilder
