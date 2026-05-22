import { useState, useEffect, useCallback } from 'react'
import { apiDownload, apiFetch } from '../../lib/api'
import { useConfirm } from '../../hooks/useConfirm'

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

const QUESTION_TYPES = [
  { value: 'rating', label: 'Note /5' },
  { value: 'text', label: 'Texte libre' },
  { value: 'multiple_choice', label: 'Choix multiples' },
]

const QualiopiQuestionnaires = () => {
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

  useEffect(() => { loadList() }, [loadList])

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
    setFormQuestions(formQuestions.map((q, idx) => idx === i ? { ...q, ...patch } : q))
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
    if (!await confirm({ message: 'Supprimer ce questionnaire et toutes ses reponses ?', title: 'Suppression' })) return
    await apiFetch(`/api/admin/qualiopi-questionnaires/${id}`, { method: 'DELETE' })
    await loadList()
    if (selected?._id === id) { setSelected(null); setView('list') }
  }

  const deleteResponse = async (qId: string, rId: string) => {
    if (!await confirm({ message: 'Supprimer cette reponse ?', title: 'Suppression' })) return
    await apiFetch(`/api/admin/qualiopi-questionnaires/${qId}/responses/${rId}`, { method: 'DELETE' })
    openDetail(qId)
  }

  const downloadPdf = async (qId: string, rId: string, name: string) => {
    try {
      const { blob } = await apiDownload(`/api/admin/qualiopi-questionnaires/${qId}/responses/${rId}/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `questionnaire_${name.replace(/\s+/g, '_')}.pdf`
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
  const [creationLinks, setCreationLinks] = useState<{ _id: string; token: string; label: string; active: boolean; createdAt: string }[]>([])
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
    if (!await confirm({ message: 'Supprimer ce lien de creation ?', title: 'Suppression' })) return
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
          <h2 className="qq-title">Questionnaires de satisfaction</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="qq-create-btn" style={{ background: 'rgba(255, 0, 128, 0.1)', border: '2px solid rgba(255, 0, 128, 0.3)', color: '#ff0080' }} onClick={() => setShowCreationLinks(!showCreationLinks)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              Lien de creation
            </button>
            <button className="qq-create-btn" onClick={openCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau questionnaire
            </button>
          </div>
        </div>

        {/* Creation links panel */}
        {showCreationLinks && (
          <div style={{ padding: '20px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,0,128,0.15)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="qq-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>Liens de creation</h3>
              <button className="qq-icon-btn" onClick={() => setShowCreationLinks(false)} title="Fermer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '2px solid rgba(255, 0, 128, 0.25)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                value={creationLabel}
                onChange={(e) => setCreationLabel(e.target.value)}
                placeholder="Label (optionnel)"
              />
              <button className="qq-create-btn" onClick={generateCreationLink} style={{ whiteSpace: 'nowrap' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Generer
              </button>
            </div>

            {creationLoading ? (
              <div className="qq-loading">Chargement...</div>
            ) : creationLinks.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', padding: '12px 0' }}>
                Aucun lien de creation
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {creationLinks.map((link) => (
                  <div key={link._id} className="qq-link-box">
                    <span className="qq-link-label">{link.label}</span>
                    <code className="qq-link-url">{getCreationLink(link.token)}</code>
                    <button
                      className="qq-copy-btn"
                      onClick={() => copyCreationLink(link.token)}
                    >
                      {copiedCreation === link.token ? '✓ Copie !' : 'Copier'}
                    </button>
                    <button className="qq-icon-btn qq-icon-btn-danger" onClick={() => deleteCreationLink(link._id)} title="Supprimer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="qq-loading">Chargement...</div>
        ) : questionnaires.length === 0 ? (
          <div className="qq-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <p>Aucun questionnaire cree</p>
            <p className="qq-empty-sub">Creez votre premier questionnaire de satisfaction</p>
          </div>
        ) : (
          <div className="qq-list">
            {questionnaires.map((q) => (
              <div key={q._id} className="qq-card" onClick={() => openDetail(q._id)}>
                <div className="qq-card-left">
                  <div className="qq-card-title">{q.title}</div>
                  <div className="qq-card-meta">
                    {q.questionCount} question(s) · {q.responseCount} reponse(s)
                    · {new Date(q.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div className="qq-card-right" onClick={(e) => e.stopPropagation()}>
                  <span className={`qq-badge ${q.active ? 'qq-badge-active' : 'qq-badge-inactive'}`}>
                    {q.active ? 'Actif' : 'Inactif'}
                  </span>
                  <button className="qq-icon-btn" onClick={() => toggleActive(q._id, q.active)} title={q.active ? 'Desactiver' : 'Activer'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {q.active
                        ? <><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><line x1="2" y1="2" x2="22" y2="22"/></>
                        : <><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></>
                      }
                    </svg>
                  </button>
                  <button className="qq-icon-btn qq-icon-btn-danger" onClick={() => handleDelete(q._id)} title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
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
        <button className="qq-back" onClick={() => setView('list')}>← Retour</button>
        <h2 className="qq-title">{editingId ? 'Modifier le questionnaire' : 'Nouveau questionnaire'}</h2>

        <div className="qq-form">
          <div className="qq-field">
            <label>Titre</label>
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Ex: Satisfaction formation React" />
          </div>
          <div className="qq-field">
            <label>Description (optionnel)</label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Decrivez le questionnaire..." rows={2} />
          </div>

          <h3 className="qq-section-title">Questions</h3>

          {formQuestions.map((q, i) => (
            <div key={i} className="qq-question-card">
              <div className="qq-question-header">
                <span className="qq-question-num">Q{i + 1}</span>
                <select value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as any })}>
                  {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="qq-required-toggle">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                  Obligatoire
                </label>
                {formQuestions.length > 1 && (
                  <button className="qq-remove-q" onClick={() => removeQuestion(i)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
              <input
                className="qq-question-label"
                value={q.label}
                onChange={(e) => updateQuestion(i, { label: e.target.value })}
                placeholder="Intitule de la question..."
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
                        placeholder={`Option ${oi + 1}`}
                      />
                      <button className="qq-remove-opt" onClick={() => updateQuestion(i, { options: q.options.filter((_, j) => j !== oi) })}>×</button>
                    </div>
                  ))}
                  <button className="qq-add-opt" onClick={() => updateQuestion(i, { options: [...q.options, ''] })}>+ Ajouter une option</button>
                </div>
              )}
              {q.type === 'rating' && (
                <div className="qq-rating-preview">★★★★★ (Note de 1 a 5)</div>
              )}
            </div>
          ))}

          <button className="qq-add-question" onClick={addQuestion}>+ Ajouter une question</button>

          <div className="qq-form-actions">
            <button className="qq-cancel" onClick={() => setView('list')}>Annuler</button>
            <button className="qq-save" onClick={handleSave} disabled={!formTitle.trim() || formQuestions.some((q) => !q.label.trim())}>
              {editingId ? 'Enregistrer' : 'Creer le questionnaire'}
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
        <button className="qq-back" onClick={() => { setView('list'); setSelected(null) }}>← Retour</button>

        <div className="qq-detail-header">
          <div>
            <h2 className="qq-title">{selected.title}</h2>
            {selected.description && <p className="qq-desc">{selected.description}</p>}
          </div>
          <div className="qq-detail-actions">
            <button className="qq-edit-btn" onClick={() => openEdit(selected)}>Modifier</button>
            <button className={`qq-toggle-btn ${selected.active ? '' : 'inactive'}`} onClick={() => toggleActive(selected._id, selected.active)}>
              {selected.active ? 'Desactiver' : 'Activer'}
            </button>
          </div>
        </div>

        {/* Link */}
        <div className="qq-link-box">
          <span className="qq-link-label">Lien public :</span>
          <code className="qq-link-url">{getPublicLink(selected.token)}</code>
          <button className="qq-copy-btn" onClick={() => copyLink(selected.token)}>{copied ? '✓ Copie !' : 'Copier'}</button>
        </div>

        {/* Stats */}
        {selected.responses.length > 0 && (
          <div className="qq-stats">
            <div className="qq-stat-card">
              <div className="qq-stat-value">{selected.responses.length}</div>
              <div className="qq-stat-label">Reponses</div>
            </div>
            {stats.map((s, i) => s && (
              <div key={i} className="qq-stat-card">
                <div className="qq-stat-value">{s.avg.toFixed(1)}<span className="qq-stat-unit">/5</span></div>
                <div className="qq-stat-label">{selected.questions[i].label.substring(0, 30)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Responses */}
        <h3 className="qq-section-title">Reponses ({selected.responses.length})</h3>

        {selected.responses.length === 0 ? (
          <div className="qq-empty-responses">Aucune reponse pour le moment</div>
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
                    <span className="qq-response-date">{new Date(r.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <button className="qq-dl-btn" onClick={() => downloadPdf(selected._id, r._id, r.respondentName)} title="Telecharger PDF">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      PDF
                    </button>
                    <button className="qq-icon-btn qq-icon-btn-danger" onClick={() => deleteResponse(selected._id, r._id)} title="Supprimer">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
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
