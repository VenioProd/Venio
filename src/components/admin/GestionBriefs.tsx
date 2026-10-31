import { useState, useEffect } from 'react'
import { fetchBriefs, createBrief, updateBrief, deleteBrief } from '../../services/gestion'
import { apiFetch } from '../../lib/api'
import { useConfirm } from '../../hooks/useConfirm'
import type { MissionBrief, BriefStatus } from '../../types/brief.types'
import { useI18n } from '../../context/I18nContext'
import { translate, type MessageKey } from '../../i18n'
import { formatDate } from '../../i18n/format'

const STATUS_CONFIG: Record<BriefStatus, { labelKey: MessageKey; color: string }> = {
  A_FAIRE: { labelKey: 'compA.briefs.status.todo', color: '#64748b' },
  EN_COURS: { labelKey: 'compA.briefs.status.inProgress', color: 'var(--primary)' },
  EN_REVIEW: { labelKey: 'compA.briefs.status.inReview', color: '#f59e0b' },
  VALIDE: { labelKey: 'compA.briefs.status.valid', color: '#22c55e' },
  LIVRE: { labelKey: 'compA.briefs.status.delivered', color: 'var(--primary)' },
  NON_VALIDE: { labelKey: 'compA.briefs.status.invalid', color: '#ef4444' },
  A_AMELIORER: { labelKey: 'compA.briefs.status.toImprove', color: '#fb923c' },
}

// Statuts que le super admin peut choisir pour valider/évaluer un brief
const ADMIN_STATUS_OPTIONS: { key: BriefStatus; labelKey: MessageKey }[] = [
  { key: 'EN_REVIEW', labelKey: 'compA.briefs.status.inReview' },
  { key: 'VALIDE', labelKey: 'compA.briefs.status.valid' },
  { key: 'NON_VALIDE', labelKey: 'compA.briefs.status.invalid' },
  { key: 'A_AMELIORER', labelKey: 'compA.briefs.status.toImprove' },
]

const ENTITY_OPTIONS = ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO']
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3']
const FORMAT_OPTIONS = ['PDF', 'PPT', 'FIGMA', 'VIDEO', 'WEB', 'AUTRE']

interface Props {
  projects: { _id: string; name: string }[]
  user: any
}

interface Admin {
  _id: string
  name: string
  email: string
}

const emptyForm = {
  project: '',
  destinataire: '',
  entity: 'VENIO',
  briefPriority: 'P2',
  deadline: '',
  intitule: '',
  contexte: '',
  livrablesAttendus: '',
  formatLivrable: [] as string[],
  ressources: '',
  pointsVigilance: '',
  pointIntermediaire: '',
  validationPar: '',
  datesCles: [] as { label: string; date: string }[],
  commentaires: '',
}

export default function GestionBriefs({ projects, user }: Props) {
  const { t } = useI18n()
  const [briefs, setBriefs] = useState<MissionBrief[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    loadBriefs()
    apiFetch('/api/admin/admins')
      .then((res: any) => {
        setAdmins(Array.isArray(res) ? res : res.admins || [])
      })
      .catch(() => {})
  }, [])

  const loadBriefs = async () => {
    setLoading(true)
    try {
      const data = await fetchBriefs()
      setBriefs(data)
    } catch {
      /* */
    }
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!form.project || !form.destinataire || !form.intitule || !form.deadline) return
    try {
      await createBrief(form as any)
      setForm({ ...emptyForm })
      setShowForm(false)
      await loadBriefs()
    } catch {
      /* */
    }
  }

  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')

  const handleStatusChange = async (briefId: string, statut: BriefStatus) => {
    try {
      await updateBrief(briefId, { statut })
      await loadBriefs()
    } catch {
      /* */
    }
  }

  const handleSaveComment = async (briefId: string) => {
    try {
      await updateBrief(briefId, { commentaires: commentText })
      setEditingComment(null)
      await loadBriefs()
    } catch {
      /* */
    }
  }

  const handleDelete = async (briefId: string) => {
    if (!(await confirm({ message: t('compA.briefs.deleteConfirm'), title: t('compA.briefs.deleteTitle') }))) return
    try {
      await deleteBrief(briefId)
      await loadBriefs()
    } catch {
      /* */
    }
  }

  const toggleFormat = (fmt: string) => {
    setForm((prev) => ({
      ...prev,
      formatLivrable: prev.formatLivrable.includes(fmt)
        ? prev.formatLivrable.filter((f) => f !== fmt)
        : [...prev.formatLivrable, fmt],
    }))
  }

  const getName = (val: any) => {
    if (typeof val === 'object' && val?.name) return val.name
    return ''
  }

  const getProjectName = (val: any) => {
    if (typeof val === 'object' && val?.name) return val.name
    return ''
  }

  const formatShortDate = (d: string | null) => {
    if (!d) return '—'
    return formatDate(d, { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  if (loading) return <div className="gestion-loading">{t('common.loading')}</div>

  return (
    <div className="gestion-briefs">
      {ConfirmDialog}
      {isSuperAdmin && (
        <div className="gestion-briefs-actions">
          <button className="gestion-export-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? t('common.cancel') : t('compA.briefs.new')}
          </button>
        </div>
      )}

      {showForm && (
        <div className="gestion-brief-form">
          <h3>{t('compA.briefs.formTitle')}</h3>
          <div className="gestion-brief-form-grid">
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fProject')}</label>
              <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                <option value="">{t('compA.briefs.select')}</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fRecipient')}</label>
              <select value={form.destinataire} onChange={(e) => setForm({ ...form, destinataire: e.target.value })}>
                <option value="">{t('compA.briefs.select')}</option>
                {admins.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fEntity')}</label>
              <select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })}>
                {ENTITY_OPTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fPriority')}</label>
              <select value={form.briefPriority} onChange={(e) => setForm({ ...form, briefPriority: e.target.value })}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fDeadline')}</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fMilestone')}</label>
              <input
                type="date"
                value={form.pointIntermediaire}
                onChange={(e) => setForm({ ...form, pointIntermediaire: e.target.value })}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fTitle')}</label>
              <input
                type="text"
                value={form.intitule}
                onChange={(e) => setForm({ ...form, intitule: e.target.value })}
                placeholder={t('compA.briefs.fTitlePlaceholder')}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fContext')}</label>
              <textarea
                value={form.contexte}
                onChange={(e) => setForm({ ...form, contexte: e.target.value })}
                rows={3}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fDeliverables')}</label>
              <textarea
                value={form.livrablesAttendus}
                onChange={(e) => setForm({ ...form, livrablesAttendus: e.target.value })}
                rows={3}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fFormat')}</label>
              <div className="gestion-brief-formats">
                {FORMAT_OPTIONS.map((f) => (
                  <label key={f} className="gestion-brief-checkbox">
                    <input type="checkbox" checked={form.formatLivrable.includes(f)} onChange={() => toggleFormat(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fResources')}</label>
              <textarea
                value={form.ressources}
                onChange={(e) => setForm({ ...form, ressources: e.target.value })}
                rows={2}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>{t('compA.briefs.fWatchPoints')}</label>
              <textarea
                value={form.pointsVigilance}
                onChange={(e) => setForm({ ...form, pointsVigilance: e.target.value })}
                rows={2}
              />
            </div>
            <div className="gestion-brief-field">
              <label>{t('compA.briefs.fValidatedBy')}</label>
              <select value={form.validationPar} onChange={(e) => setForm({ ...form, validationPar: e.target.value })}>
                <option value="">—</option>
                {admins
                  .filter((a) => a._id !== form.destinataire)
                  .map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <button className="gestion-export-btn" onClick={handleSubmit} style={{ marginTop: 16 }}>
            {t('compA.briefs.create')}
          </button>
        </div>
      )}

      {/* Brief list */}
      {briefs.length === 0 ? (
        <div className="gestion-empty-state">
          <p>{t('compA.briefs.empty')}</p>
        </div>
      ) : (
        <div className="gestion-briefs-list">
          {briefs.map((brief) => {
            const isExpanded = expandedId === brief._id
            const sc = STATUS_CONFIG[brief.statut] || STATUS_CONFIG.A_FAIRE
            return (
              <div key={brief._id} className="gestion-brief-card">
                <div className="gestion-brief-card-header" onClick={() => setExpandedId(isExpanded ? null : brief._id)}>
                  <div className="gestion-brief-card-left">
                    <span className="gestion-brief-status-badge" style={{ background: sc.color }}>
                      {t(sc.labelKey)}
                    </span>
                    <span className="gestion-brief-priority-badge">{brief.briefPriority}</span>
                    <strong>{brief.intitule}</strong>
                  </div>
                  <div className="gestion-brief-card-right">
                    <span className="gestion-brief-entity">{brief.entity}</span>
                    <span>{getProjectName(brief.project)}</span>
                    <span>→ {getName(brief.destinataire)}</span>
                    <span>{formatShortDate(brief.deadline)}</span>
                    <span className="gestion-brief-expand">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="gestion-brief-card-body">
                    {brief.contexte && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sContext')}</strong> {brief.contexte}
                      </div>
                    )}
                    {brief.livrablesAttendus && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sDeliverables')}</strong> {brief.livrablesAttendus}
                      </div>
                    )}
                    {brief.formatLivrable.length > 0 && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sFormat')}</strong> {brief.formatLivrable.join(', ')}
                      </div>
                    )}
                    {brief.ressources && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sResources')}</strong> {brief.ressources}
                      </div>
                    )}
                    {brief.pointsVigilance && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sWatchPoints')}</strong> {brief.pointsVigilance}
                      </div>
                    )}
                    {brief.pointIntermediaire && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sMilestone')}</strong> {formatShortDate(brief.pointIntermediaire)}
                      </div>
                    )}
                    {getName(brief.validationPar) && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sValidatedBy')}</strong> {getName(brief.validationPar)}
                      </div>
                    )}
                    {brief.commentaires && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sComments')}</strong> {brief.commentaires}
                      </div>
                    )}
                    {brief.datesCles.length > 0 && (
                      <div className="gestion-brief-section">
                        <strong>{t('compA.briefs.sKeyDates')}</strong>
                        {brief.datesCles.map((d, i) => (
                          <span key={i} className="gestion-brief-date-cle">
                            {d.label}: {formatShortDate(d.date)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Commentaires — éditable par le destinataire */}
                    {!isSuperAdmin && (
                      <div className="gestion-brief-section" style={{ marginTop: 12 }}>
                        <strong>{t('compA.briefs.sMyComments')}</strong>
                        {editingComment === brief._id ? (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              className="gestion-brief-comment-input"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              rows={4}
                              placeholder={t('compA.briefs.commentPlaceholder')}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button className="gestion-export-btn" onClick={() => handleSaveComment(brief._id)}>
                                {t('common.save')}
                              </button>
                              <button className="gestion-delete-btn" onClick={() => setEditingComment(null)}>
                                {t('common.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 6 }}>
                            <p style={{ color: 'var(--text-muted)', whiteSpace: 'pre-line', margin: '0 0 8px' }}>
                              {brief.commentaires || t('compA.briefs.noComment')}
                            </p>
                            <button
                              className="gestion-export-btn"
                              onClick={() => {
                                setEditingComment(brief._id)
                                setCommentText(brief.commentaires || '')
                              }}
                              style={{ fontSize: 12, padding: '4px 12px' }}
                            >
                              {t('common.edit')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isSuperAdmin && (
                      <div className="gestion-brief-card-actions">
                        <select
                          className="gestion-inline-select"
                          value={brief.statut}
                          onChange={(e) => handleStatusChange(brief._id, e.target.value as BriefStatus)}
                          style={{ color: sc.color }}
                        >
                          {/* Show current status if not in admin options */}
                          {!ADMIN_STATUS_OPTIONS.some((o) => o.key === brief.statut) && (
                            <option value={brief.statut}>{t(sc.labelKey)}</option>
                          )}
                          {ADMIN_STATUS_OPTIONS.map(({ key, labelKey }) => (
                            <option key={key} value={key}>
                              {t(labelKey)}
                            </option>
                          ))}
                        </select>
                        <button className="gestion-delete-btn" onClick={() => handleDelete(brief._id)}>
                          {t('common.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
