import { useState, useEffect, useCallback } from 'react'
import { apiDownload, apiFetch } from '../../lib/api'
import { useConfirm } from '../../hooks/useConfirm'
import { useI18n } from '../../context/I18nContext'
import { formatDate } from '../../i18n/format'
import type { MessageKey } from '../../i18n'

interface Question {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
}

interface QuestionnaireListItem {
  _id: string
  title: string
  description: string
  active: boolean
  token: string
  questionCount: number
  responseCount: number
  createdAt: string
}

interface QResponse {
  _id: string
  respondentName: string
  respondentEmail: string
  formation: string
  answers: { questionIndex: number; value: string }[]
  submittedAt: string
}

interface QuestionnaireFull {
  _id: string
  title: string
  description: string
  active: boolean
  token: string
  questions: Question[]
  responses: QResponse[]
}

type View = 'list' | 'create' | 'detail'

const QUESTION_TYPES: { value: string; labelKey: MessageKey }[] = [
  { value: 'rating', labelKey: 'compA.qualiopi.typeRating' },
  { value: 'text', labelKey: 'compA.qualiopi.typeText' },
  { value: 'multiple_choice', labelKey: 'compA.qualiopi.typeChoice' },
]

const QualiopiQuestionnaires = () => {
  const { t } = useI18n()
  const [view, setView] = useState<View>('list')
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireListItem[]>([])
  const [selected, setSelected] = useState<QuestionnaireFull | null>(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formQuestions, setFormQuestions] = useState<Question[]>([
    { type: 'rating', label: '', options: [], required: true },
  ])
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiFetch<QuestionnaireListItem[]>('/api/admin/qualiopi-questionnaires')
      setQuestionnaires(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openDetail = async (id: string) => {
    try {
      const data = await apiFetch<QuestionnaireFull>(`/api/admin/qualiopi-questionnaires/${id}`)
      setSelected(data)
      setView('detail')
    } catch (err) {
      console.error(err)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setFormTitle('')
    setFormDesc('')
    setFormQuestions([{ type: 'rating', label: '', options: [], required: true }])
    setView('create')
  }

  const openEdit = (q: QuestionnaireFull) => {
    setEditingId(q._id)
    setFormTitle(q.title)
    setFormDesc(q.description)
    setFormQuestions(q.questions.map((qu) => ({ ...qu })))
    setView('create')
  }

  const addQuestion = () => {
    setFormQuestions([...formQuestions, { type: 'text', label: '', options: [], required: true }])
  }

  const removeQuestion = (i: number) => {
    setFormQuestions(formQuestions.filter((_, idx) => idx !== i))
  }

  const updateQuestion = (i: number, patch: Partial<Question>) => {
    setFormQuestions(formQuestions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }

  const handleSave = async () => {
    if (!formTitle.trim() || formQuestions.some((q) => !q.label.trim())) return

    try {
      if (editingId) {
        await apiFetch(`/api/admin/qualiopi-questionnaires/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: formTitle, description: formDesc, questions: formQuestions }),
        })
      } else {
        await apiFetch('/api/admin/qualiopi-questionnaires', {
          method: 'POST',
          body: JSON.stringify({ title: formTitle, description: formDesc, questions: formQuestions }),
        })
      }
      await loadList()
      setView('list')
    } catch (err) {
      console.error(err)
    }
  }

  const toggleActive = async (id: string, active: boolean) => {
    await apiFetch(`/api/admin/qualiopi-questionnaires/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !active }),
    })
    await loadList()
    if (selected?._id === id) setSelected({ ...selected, active: !active })
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: t('compA.qualiopi.deleteConfirm'), title: t('compA.qualiopi.deleteTitle') }))) return
    await apiFetch(`/api/admin/qualiopi-questionnaires/${id}`, { method: 'DELETE' })
    await loadList()
    if (selected?._id === id) {
      setSelected(null)
      setView('list')
    }
  }

  const deleteResponse = async (qId: string, rId: string) => {
    if (
      !(await confirm({ message: t('compA.qualiopi.deleteResponseConfirm'), title: t('compA.qualiopi.deleteTitle') }))
    )
      return
    await apiFetch(`/api/admin/qualiopi-questionnaires/${qId}/responses/${rId}`, { method: 'DELETE' })
    openDetail(qId)
  }

  const downloadPdf = async (qId: string, rId: string, name: string) => {
    try {
      const { blob, filename } = await apiDownload(`/api/admin/qualiopi-questionnaires/${qId}/responses/${rId}/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename ?? `questionnaire_${name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  const getPublicLink = (token: string) => `${window.location.origin}/questionnaire/${token}`

  const [copied, setCopied] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  // ── Creation links state ──
  const [showCreationLinks, setShowCreationLinks] = useState(false)
  const [creationLinks, setCreationLinks] = useState<
    { _id: string; token: string; label: string; active: boolean; createdAt: string }[]
  >([])
  const [creationLabel, setCreationLabel] = useState('')
  const [creationLoading, setCreationLoading] = useState(false)
  const [copiedCreation, setCopiedCreation] = useState<string | null>(null)

  const loadCreationLinks = useCallback(async () => {
    try {
      setCreationLoading(true)
      const data = await apiFetch<any[]>('/api/admin/qualiopi-questionnaires/creation-links')
      setCreationLinks(data)
    } catch (err) {
      console.error(err)
    } finally {
      setCreationLoading(false)
    }
  }, [])

  const generateCreationLink = async () => {
    try {
      await apiFetch('/api/admin/qualiopi-questionnaires/creation-links', {
        method: 'POST',
        body: JSON.stringify({ label: creationLabel || undefined }),
      })
      setCreationLabel('')
      await loadCreationLinks()
    } catch (err) {
      console.error(err)
    }
  }

  const deleteCreationLink = async (id: string) => {
    if (!(await confirm({ message: t('compA.qualiopi.deleteLinkConfirm'), title: t('compA.qualiopi.deleteTitle') })))
      return
    try {
      await apiFetch(`/api/admin/qualiopi-questionnaires/creation-links/${id}`, { method: 'DELETE' })
      await loadCreationLinks()
    } catch (err) {
      console.error(err)
    }
  }

  const getCreationLink = (token: string) => `${window.location.origin}/questionnaire/creer/${token}`

  const copyCreationLink = async (token: string) => {
    const link = getCreationLink(token)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const input = document.createElement('input')
      input.value = link
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopiedCreation(token)
    setTimeout(() => setCopiedCreation(null), 2000)
  }

  useEffect(() => {
    if (showCreationLinks) loadCreationLinks()
  }, [showCreationLinks, loadCreationLinks])

  const copyLink = async (token: string) => {
    const link = getPublicLink(token)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Fallback for non-HTTPS contexts
      const input = document.createElement('input')
      input.value = link
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Stats for detail view
  const getStats = (q: QuestionnaireFull) => {
    const ratings: number[][] = q.questions.map(() => [])
    q.responses.forEach((r) => {
      r.answers.forEach((a) => {
        if (q.questions[a.questionIndex]?.type === 'rating') {
          const val = parseInt(a.value)
          if (!isNaN(val)) ratings[a.questionIndex].push(val)
        }
      })
    })
    return q.questions.map((qu, i) => {
      if (qu.type !== 'rating') return null
      const vals = ratings[i]
      if (vals.length === 0) return { avg: 0, count: 0 }
      return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }
    })
  }

  // ── LIST VIEW ──
  if (view === 'list') {
    return (
      <div className="qq-container">
        {ConfirmDialog}
        <div className="qq-header">
          <h2 className="qq-title">{t('compA.qualiopi.title')}</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="qq-create-btn"
              style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '2px solid rgba(14, 165, 233, 0.3)',
                color: 'var(--primary)',
              }}
              onClick={() => setShowCreationLinks(!showCreationLinks)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {t('compA.qualiopi.creationLink')}
            </button>
            <button className="qq-create-btn" onClick={openCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('compA.qualiopi.new')}
            </button>
          </div>
        </div>

        {/* Creation links panel */}
        {showCreationLinks && (
          <div
            style={{
              padding: '20px',
              marginBottom: '16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(14, 165, 233, 0.15)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}
            >
              <h3 className="qq-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
                {t('compA.qualiopi.creationLinks')}
              </h3>
              <button className="qq-icon-btn" onClick={() => setShowCreationLinks(false)} title={t('common.close')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '2px solid rgba(14, 165, 233, 0.25)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                value={creationLabel}
                onChange={(e) => setCreationLabel(e.target.value)}
                placeholder={t('compA.qualiopi.labelPlaceholder')}
              />
              <button className="qq-create-btn" onClick={generateCreationLink} style={{ whiteSpace: 'nowrap' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('compA.qualiopi.generate')}
              </button>
            </div>

            {creationLoading ? (
              <div className="qq-loading">{t('common.loading')}</div>
            ) : creationLinks.length === 0 ? (
              <div
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', padding: '12px 0' }}
              >
                {t('compA.qualiopi.noCreationLink')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {creationLinks.map((link) => (
                  <div key={link._id} className="qq-link-box">
                    <span className="qq-link-label">{link.label}</span>
                    <code className="qq-link-url">{getCreationLink(link.token)}</code>
                    <button className="qq-copy-btn" onClick={() => copyCreationLink(link.token)}>
                      {copiedCreation === link.token ? t('compA.qualiopi.copied') : t('compA.qualiopi.copy')}
                    </button>
                    <button
                      className="qq-icon-btn qq-icon-btn-danger"
                      onClick={() => deleteCreationLink(link._id)}
                      title={t('common.delete')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="qq-loading">{t('common.loading')}</div>
        ) : questionnaires.length === 0 ? (
          <div className="qq-empty">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1.5"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <p>{t('compA.qualiopi.emptyTitle')}</p>
            <p className="qq-empty-sub">{t('compA.qualiopi.emptySub')}</p>
          </div>
        ) : (
          <div className="qq-list">
            {questionnaires.map((q) => (
              <div key={q._id} className="qq-card" onClick={() => openDetail(q._id)}>
                <div className="qq-card-left">
                  <div className="qq-card-title">{q.title}</div>
                  <div className="qq-card-meta">
                    {t('compA.qualiopi.cardMeta', {
                      questions: q.questionCount,
                      responses: q.responseCount,
                      date: formatDate(q.createdAt),
                    })}
                  </div>
                </div>
                <div className="qq-card-right" onClick={(e) => e.stopPropagation()}>
                  <span className={`qq-badge ${q.active ? 'qq-badge-active' : 'qq-badge-inactive'}`}>
                    {q.active ? t('compA.qualiopi.active') : t('compA.qualiopi.inactive')}
                  </span>
                  <button
                    className="qq-icon-btn"
                    onClick={() => toggleActive(q._id, q.active)}
                    title={q.active ? t('compA.qualiopi.deactivate') : t('compA.qualiopi.activate')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {q.active ? (
                        <>
                          <path d="M18.36 6.64A9 9 0 0 1 20.77 15" />
                          <path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" />
                          <line x1="2" y1="2" x2="22" y2="22" />
                        </>
                      ) : (
                        <>
                          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                          <path d="M12 6v6l4 2" />
                        </>
                      )}
                    </svg>
                  </button>
                  <button
                    className="qq-icon-btn qq-icon-btn-danger"
                    onClick={() => handleDelete(q._id)}
                    title={t('common.delete')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── CREATE / EDIT VIEW ──
  if (view === 'create') {
    return (
      <div className="qq-container">
        <button className="qq-back" onClick={() => setView('list')}>
          {t('compA.qualiopi.back')}
        </button>
        <h2 className="qq-title">{editingId ? t('compA.qualiopi.editTitle') : t('compA.qualiopi.new')}</h2>

        <div className="qq-form">
          <div className="qq-field">
            <label>{t('compA.taskBoard.fTitle')}</label>
            <input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder={t('compA.qualiopi.titlePlaceholder')}
            />
          </div>
          <div className="qq-field">
            <label>{t('compA.qualiopi.descriptionLabel')}</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder={t('compA.qualiopi.descriptionPlaceholder')}
              rows={2}
            />
          </div>

          <h3 className="qq-section-title">{t('compA.qualiopi.questions')}</h3>

          {formQuestions.map((q, i) => (
            <div key={i} className="qq-question-card">
              <div className="qq-question-header">
                <span className="qq-question-num">Q{i + 1}</span>
                <select value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as any })}>
                  {QUESTION_TYPES.map((qt) => (
                    <option key={qt.value} value={qt.value}>
                      {t(qt.labelKey)}
                    </option>
                  ))}
                </select>
                <label className="qq-required-toggle">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                  />
                  {t('compA.qualiopi.required')}
                </label>
                {formQuestions.length > 1 && (
                  <button className="qq-remove-q" onClick={() => removeQuestion(i)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <input
                className="qq-question-label"
                value={q.label}
                onChange={(e) => updateQuestion(i, { label: e.target.value })}
                placeholder={t('compA.qualiopi.questionPlaceholder')}
              />
              {q.type === 'multiple_choice' && (
                <div className="qq-options">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="qq-option-row">
                      <input
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...q.options]
                          newOpts[oi] = e.target.value
                          updateQuestion(i, { options: newOpts })
                        }}
                        placeholder={t('compA.qualiopi.optionPlaceholder', { n: oi + 1 })}
                      />
                      <button
                        className="qq-remove-opt"
                        onClick={() => updateQuestion(i, { options: q.options.filter((_, j) => j !== oi) })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button className="qq-add-opt" onClick={() => updateQuestion(i, { options: [...q.options, ''] })}>
                    {t('compA.qualiopi.addOption')}
                  </button>
                </div>
              )}
              {q.type === 'rating' && <div className="qq-rating-preview">{t('compA.qualiopi.ratingPreview')}</div>}
            </div>
          ))}

          <button className="qq-add-question" onClick={addQuestion}>
            {t('compA.qualiopi.addQuestion')}
          </button>

          <div className="qq-form-actions">
            <button className="qq-cancel" onClick={() => setView('list')}>
              {t('common.cancel')}
            </button>
            <button
              className="qq-save"
              onClick={handleSave}
              disabled={!formTitle.trim() || formQuestions.some((q) => !q.label.trim())}
            >
              {editingId ? t('common.save') : t('compA.qualiopi.create')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── DETAIL VIEW ──
  if (view === 'detail' && selected) {
    const stats = getStats(selected)
    return (
      <div className="qq-container">
        {ConfirmDialog}
        <button
          className="qq-back"
          onClick={() => {
            setView('list')
            setSelected(null)
          }}
        >
          {t('compA.qualiopi.back')}
        </button>

        <div className="qq-detail-header">
          <div>
            <h2 className="qq-title">{selected.title}</h2>
            {selected.description && <p className="qq-desc">{selected.description}</p>}
          </div>
          <div className="qq-detail-actions">
            <button className="qq-edit-btn" onClick={() => openEdit(selected)}>
              {t('common.edit')}
            </button>
            <button
              className={`qq-toggle-btn ${selected.active ? '' : 'inactive'}`}
              onClick={() => toggleActive(selected._id, selected.active)}
            >
              {selected.active ? t('compA.qualiopi.deactivate') : t('compA.qualiopi.activate')}
            </button>
          </div>
        </div>

        {/* Link */}
        <div className="qq-link-box">
          <span className="qq-link-label">{t('compA.qualiopi.publicLink')}</span>
          <code className="qq-link-url">{getPublicLink(selected.token)}</code>
          <button className="qq-copy-btn" onClick={() => copyLink(selected.token)}>
            {copied ? t('compA.qualiopi.copied') : t('compA.qualiopi.copy')}
          </button>
        </div>

        {/* Stats */}
        {selected.responses.length > 0 && (
          <div className="qq-stats">
            <div className="qq-stat-card">
              <div className="qq-stat-value">{selected.responses.length}</div>
              <div className="qq-stat-label">{t('compA.qualiopi.responses')}</div>
            </div>
            {stats.map(
              (s, i) =>
                s && (
                  <div key={i} className="qq-stat-card">
                    <div className="qq-stat-value">
                      {s.avg.toFixed(1)}
                      <span className="qq-stat-unit">/5</span>
                    </div>
                    <div className="qq-stat-label">{selected.questions[i].label.substring(0, 30)}</div>
                  </div>
                ),
            )}
          </div>
        )}

        {/* Responses */}
        <h3 className="qq-section-title">{t('compA.qualiopi.responsesCount', { n: selected.responses.length })}</h3>

        {selected.responses.length === 0 ? (
          <div className="qq-empty-responses">{t('compA.qualiopi.noResponse')}</div>
        ) : (
          <div className="qq-responses">
            {selected.responses.map((r) => (
              <div key={r._id} className="qq-response-card">
                <div className="qq-response-header">
                  <div className="qq-response-info">
                    <span className="qq-response-name">{r.respondentName}</span>
                    <span className="qq-response-email">{r.respondentEmail}</span>
                    {r.formation && <span className="qq-response-formation">{r.formation}</span>}
                  </div>
                  <div className="qq-response-meta">
                    <span className="qq-response-date">
                      {formatDate(r.submittedAt, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <button
                      className="qq-dl-btn"
                      onClick={() => downloadPdf(selected._id, r._id, r.respondentName)}
                      title={t('compA.qualiopi.downloadPdf')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      PDF
                    </button>
                    <button
                      className="qq-icon-btn qq-icon-btn-danger"
                      onClick={() => deleteResponse(selected._id, r._id)}
                      title={t('common.delete')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="qq-response-answers">
                  {selected.questions.map((q, qi) => {
                    const ans = r.answers.find((a) => a.questionIndex === qi)
                    return (
                      <div key={qi} className="qq-answer">
                        <div className="qq-answer-label">{q.label}</div>
                        {q.type === 'rating' ? (
                          <div className="qq-answer-rating">
                            {'★'.repeat(parseInt(ans?.value || '0') || 0)}
                            {'☆'.repeat(5 - (parseInt(ans?.value || '0') || 0))}
                          </div>
                        ) : (
                          <div className="qq-answer-text">{ans?.value || '—'}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

export default QualiopiQuestionnaires
