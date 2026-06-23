import { useState, useEffect } from 'react'
import { fetchBriefs, createBrief, updateBrief, deleteBrief } from '../../services/gestion'
import { apiFetch } from '../../lib/api'
import { useConfirm } from '../../hooks/useConfirm'
import type { MissionBrief, BriefStatus } from '../../types/brief.types'

const STATUS_CONFIG: Record<BriefStatus, { label: string; color: string }> = {
  A_FAIRE: { label: 'A faire', color: '#64748b' },
  EN_COURS: { label: 'En cours', color: 'var(--primary)' },
  EN_REVIEW: { label: 'En review', color: '#f59e0b' },
  VALIDE: { label: 'Valide', color: '#22c55e' },
  LIVRE: { label: 'Livre', color: 'var(--primary)' },
  NON_VALIDE: { label: 'Non valide', color: '#ef4444' },
  A_AMELIORER: { label: 'A ameliorer', color: '#fb923c' },
}

// Statuts que le super admin peut choisir pour valider/évaluer un brief
const ADMIN_STATUS_OPTIONS: { key: BriefStatus; label: string }[] = [
  { key: 'EN_REVIEW', label: 'En review' },
  { key: 'VALIDE', label: 'Valide' },
  { key: 'NON_VALIDE', label: 'Non valide' },
  { key: 'A_AMELIORER', label: 'A ameliorer' },
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
    if (!(await confirm({ message: 'Supprimer ce brief ?', title: 'Suppression' }))) return
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

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  if (loading) return <div className="gestion-loading">Chargement...</div>

  return (
    <div className="gestion-briefs">
      {ConfirmDialog}
      {isSuperAdmin && (
        <div className="gestion-briefs-actions">
          <button className="gestion-export-btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Annuler' : '+ Nouveau brief'}
          </button>
        </div>
      )}

      {showForm && (
        <div className="gestion-brief-form">
          <h3>Nouveau brief de mission</h3>
          <div className="gestion-brief-form-grid">
            <div className="gestion-brief-field">
              <label>Projet *</label>
              <select value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}>
                <option value="">Selectionner...</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>Destinataire *</label>
              <select value={form.destinataire} onChange={(e) => setForm({ ...form, destinataire: e.target.value })}>
                <option value="">Selectionner...</option>
                {admins.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>Entite</label>
              <select value={form.entity} onChange={(e) => setForm({ ...form, entity: e.target.value })}>
                {ENTITY_OPTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>Priorite</label>
              <select value={form.briefPriority} onChange={(e) => setForm({ ...form, briefPriority: e.target.value })}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="gestion-brief-field">
              <label>Deadline *</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="gestion-brief-field">
              <label>Point intermediaire</label>
              <input
                type="date"
                value={form.pointIntermediaire}
                onChange={(e) => setForm({ ...form, pointIntermediaire: e.target.value })}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>Intitule de la mission *</label>
              <input
                type="text"
                value={form.intitule}
                onChange={(e) => setForm({ ...form, intitule: e.target.value })}
                placeholder="Ex: Maquettes site vitrine"
              />
            </div>
            <div className="gestion-brief-field full">
              <label>Contexte</label>
              <textarea
                value={form.contexte}
                onChange={(e) => setForm({ ...form, contexte: e.target.value })}
                rows={3}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>Livrables attendus</label>
              <textarea
                value={form.livrablesAttendus}
                onChange={(e) => setForm({ ...form, livrablesAttendus: e.target.value })}
                rows={3}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>Format livrable</label>
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
              <label>Ressources / References</label>
              <textarea
                value={form.ressources}
                onChange={(e) => setForm({ ...form, ressources: e.target.value })}
                rows={2}
              />
            </div>
            <div className="gestion-brief-field full">
              <label>Points de vigilance</label>
              <textarea
                value={form.pointsVigilance}
                onChange={(e) => setForm({ ...form, pointsVigilance: e.target.value })}
                rows={2}
              />
            </div>
            <div className="gestion-brief-field">
              <label>Validation par</label>
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
            Creer le brief
          </button>
        </div>
      )}

      {/* Brief list */}
      {briefs.length === 0 ? (
        <div className="gestion-empty-state">
          <p>Aucun brief de mission</p>
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
                      {sc.label}
                    </span>
                    <span className="gestion-brief-priority-badge">{brief.briefPriority}</span>
                    <strong>{brief.intitule}</strong>
                  </div>
                  <div className="gestion-brief-card-right">
                    <span className="gestion-brief-entity">{brief.entity}</span>
                    <span>{getProjectName(brief.project)}</span>
                    <span>→ {getName(brief.destinataire)}</span>
                    <span>{formatDate(brief.deadline)}</span>
                    <span className="gestion-brief-expand">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="gestion-brief-card-body">
                    {brief.contexte && (
                      <div className="gestion-brief-section">
                        <strong>Contexte :</strong> {brief.contexte}
                      </div>
                    )}
                    {brief.livrablesAttendus && (
                      <div className="gestion-brief-section">
                        <strong>Livrables :</strong> {brief.livrablesAttendus}
                      </div>
                    )}
                    {brief.formatLivrable.length > 0 && (
                      <div className="gestion-brief-section">
                        <strong>Format :</strong> {brief.formatLivrable.join(', ')}
                      </div>
                    )}
                    {brief.ressources && (
                      <div className="gestion-brief-section">
                        <strong>Ressources :</strong> {brief.ressources}
                      </div>
                    )}
                    {brief.pointsVigilance && (
                      <div className="gestion-brief-section">
                        <strong>Points de vigilance :</strong> {brief.pointsVigilance}
                      </div>
                    )}
                    {brief.pointIntermediaire && (
                      <div className="gestion-brief-section">
                        <strong>Point intermediaire :</strong> {formatDate(brief.pointIntermediaire)}
                      </div>
                    )}
                    {getName(brief.validationPar) && (
                      <div className="gestion-brief-section">
                        <strong>Validation par :</strong> {getName(brief.validationPar)}
                      </div>
                    )}
                    {brief.commentaires && (
                      <div className="gestion-brief-section">
                        <strong>Commentaires :</strong> {brief.commentaires}
                      </div>
                    )}
                    {brief.datesCles.length > 0 && (
                      <div className="gestion-brief-section">
                        <strong>Dates cles :</strong>
                        {brief.datesCles.map((d, i) => (
                          <span key={i} className="gestion-brief-date-cle">
                            {d.label}: {formatDate(d.date)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Commentaires — éditable par le destinataire */}
                    {!isSuperAdmin && (
                      <div className="gestion-brief-section" style={{ marginTop: 12 }}>
                        <strong>Mes commentaires / livrables :</strong>
                        {editingComment === brief._id ? (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              className="gestion-brief-comment-input"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              rows={4}
                              placeholder="Decrivez vos livrables, liens, remarques..."
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button className="gestion-export-btn" onClick={() => handleSaveComment(brief._id)}>
                                Enregistrer
                              </button>
                              <button className="gestion-delete-btn" onClick={() => setEditingComment(null)}>
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 6 }}>
                            <p style={{ color: 'var(--text-muted)', whiteSpace: 'pre-line', margin: '0 0 8px' }}>
                              {brief.commentaires || '(aucun commentaire)'}
                            </p>
                            <button
                              className="gestion-export-btn"
                              onClick={() => {
                                setEditingComment(brief._id)
                                setCommentText(brief.commentaires || '')
                              }}
                              style={{ fontSize: 12, padding: '4px 12px' }}
                            >
                              Modifier
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
                            <option value={brief.statut}>{sc.label}</option>
                          )}
                          {ADMIN_STATUS_OPTIONS.map(({ key, label }) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button className="gestion-delete-btn" onClick={() => handleDelete(brief._id)}>
                          Supprimer
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
