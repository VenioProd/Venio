import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X, FileText, BookOpen, ClipboardList, GraduationCap } from 'lucide-react'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  TEMPLATE_KIND_LABEL,
  type EducationTemplate,
  type EducationTemplateKind,
  type NoteBlock,
  type EducationClass,
} from '../../../services/education'

import { TemplateBodyEditor, TemplatePreview, templateBodyError } from './TemplateBodyEditor'
import { TemplateApplyDrawer } from './TemplateApplyDrawer'

const KIND_ICONS: Record<EducationTemplateKind, typeof FileText> = {
  note: FileText,
  session: BookOpen,
  assignment: ClipboardList,
  class: GraduationCap,
}

export function TemplatesView({
  classes = [],
  onChanged = () => {},
}: {
  classes?: EducationClass[]
  onChanged?: () => void
}) {
  const [applyTemplate, setApplyTemplate] = useState<EducationTemplate | null>(null)
  const [notice, setNotice] = useState('')
  const [templates, setTemplates] = useState<EducationTemplate[]>([])
  const [filter, setFilter] = useState<EducationTemplateKind | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState<EducationTemplateKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await listTemplates()
      setTemplates(r.templates)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les templates')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    if (filter === 'all') return templates
    return templates.filter((t) => t.kind === filter)
  }, [templates, filter])

  const byKind = useMemo(() => {
    const groups: Record<EducationTemplateKind, EducationTemplate[]> = {
      note: [],
      session: [],
      assignment: [],
      class: [],
    }
    for (const t of filtered) groups[t.kind].push(t)
    return groups
  }, [filtered])

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="edu-h1">Templates</h1>
          <p className="edu-sub">Capitalise sur tes formats récurrents : briefs de séance, énoncés, plans de note…</p>
        </div>
        <div className="edu-row" style={{ gap: 6 }}>
          <select
            className="edu-select"
            style={{ width: 170 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as EducationTemplateKind | 'all')}
          >
            <option value="all">Tous</option>
            {(Object.keys(TEMPLATE_KIND_LABEL) as EducationTemplateKind[]).map((k) => (
              <option key={k} value={k}>
                {TEMPLATE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <button className="edu-btn" onClick={() => setShowCreate('note')}>
            <Plus size={14} /> Nouveau template
          </button>
        </div>
      </div>

      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">🧩</div>
          <div>Aucun template pour l'instant.</div>
          <div className="edu-empty-sub">
            Crée des squelettes réutilisables pour tes séances, briefs, énoncés ou plans de note.
          </div>
          <div className="edu-row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="edu-btn ghost" onClick={() => setShowCreate('session')}>
              <BookOpen size={13} /> Modèle de séance
            </button>
            <button className="edu-btn ghost" onClick={() => setShowCreate('assignment')}>
              <ClipboardList size={13} /> Modèle de devoir
            </button>
            <button className="edu-btn" onClick={() => setShowCreate('note')}>
              <FileText size={13} /> Modèle de note
            </button>
          </div>
        </div>
      ) : (
        (Object.keys(TEMPLATE_KIND_LABEL) as EducationTemplateKind[])
          .filter((k) => filter === 'all' || k === filter)
          .map((kind) =>
            byKind[kind].length === 0 ? null : (
              <div key={kind} style={{ marginTop: 18 }}>
                <h2 className="edu-h2" style={{ marginTop: 0 }}>
                  {TEMPLATE_KIND_LABEL[kind]}
                </h2>
                <div className="edu-template-grid">
                  {byKind[kind].map((t) => (
                    <TemplateCard
                      key={t._id}
                      t={t}
                      onOpen={() => setOpenId(t._id)}
                      onApply={() => setApplyTemplate(t)}
                    />
                  ))}
                </div>
              </div>
            ),
          )
      )}

      {applyTemplate && (
        <TemplateApplyDrawer
          template={applyTemplate}
          classes={classes}
          onClose={() => setApplyTemplate(null)}
          onApplied={() => {
            setApplyTemplate(null)
            setNotice('Le contenu a été créé. Il est disponible dans la rubrique correspondante.')
            onChanged()
          }}
        />
      )}
      {showCreate && (
        <TemplateEditorDrawer
          kind={showCreate}
          onClose={() => setShowCreate(null)}
          onSaved={async () => {
            setShowCreate(null)
            await refresh()
            onChanged()
          }}
        />
      )}

      {openId && (
        <TemplateEditorDrawer
          template={templates.find((t) => t._id === openId)}
          kind={templates.find((t) => t._id === openId)?.kind ?? 'note'}
          onClose={() => setOpenId(null)}
          onSaved={async () => {
            setOpenId(null)
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function TemplateCard({ t, onOpen, onApply }: { t: EducationTemplate; onOpen: () => void; onApply: () => void }) {
  const Icon = KIND_ICONS[t.kind]
  return (
    <div className="edu-template-card">
      <div className="edu-template-card-icon">
        <Icon size={16} />
      </div>
      <button className="edu-btn ghost edu-template-card-title" onClick={onOpen}>
        {t.name}
      </button>
      {t.description && <div className="edu-template-card-desc">{t.description}</div>}
      <div className="edu-template-card-meta">
        <span className="edu-pill">{TEMPLATE_KIND_LABEL[t.kind]}</span>
        <button className="edu-btn ghost" onClick={onApply}>
          Utiliser
        </button>
        {t.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="edu-pill"
            style={{ background: 'var(--accent-soft)', color: 'var(--primary-light)' }}
          >
            #{tag}
          </span>
        ))}
      </div>
    </div>
  )
}

interface TemplateEditorDrawerProps {
  template?: EducationTemplate
  kind: EducationTemplateKind
  onClose: () => void
  onSaved: () => void
}

function TemplateEditorDrawer({ template, kind: initialKind, onClose, onSaved }: TemplateEditorDrawerProps) {
  const [kind, setKind] = useState<EducationTemplateKind>(template?.kind ?? initialKind)
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [tags, setTags] = useState((template?.tags ?? []).join(', '))
  const [body, setBody] = useState<Record<string, unknown>>(() => template?.body ?? defaultBodyFor(initialKind))
  const [bodyText, setBodyText] = useState(() => JSON.stringify(body, null, 2))
  const [advancedDirty, setAdvancedDirty] = useState(false)
  function changeBody(next: Record<string, unknown>) {
    setBody(next)
    setBodyText(JSON.stringify(next, null, 2))
    setAdvancedDirty(false)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!template) {
      // Quand on crée et qu'on change le kind, on remet un body de défaut.
      changeBody(defaultBodyFor(kind))
    }
  }, [kind, template])

  function resolvedBody(): Record<string, unknown> {
    let next: unknown = body
    if (advancedDirty) {
      try {
        next = JSON.parse(bodyText)
      } catch {
        throw new Error('Le contenu JSON avancé est invalide.')
      }
    }
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Le contenu doit être un objet.')
    const invalid = templateBodyError(kind, next as Record<string, unknown>)
    if (invalid) throw new Error(invalid)
    return next as Record<string, unknown>
  }

  async function save(duplicate = false) {
    setSaving(true)
    setError(null)
    try {
      const body = resolvedBody()
      const payload = {
        kind,
        name: duplicate ? `${name.trim()} (copie)` : name.trim(),
        description,
        body,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }
      if (template && !duplicate) await updateTemplate(template._id, payload)
      else await createTemplate(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!template) return
    if (!confirm(`Supprimer le template « ${template.name} » ?`)) return
    setSaving(true)
    setError(null)
    try {
      await deleteTemplate(template._id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceOverlayPortal>
      <div
        className="edu-drawer-backdrop"
        onClick={() => {
          if (!saving) onClose()
        }}
      />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {template ? 'Modifier le template' : 'Nouveau template'}
          </h2>
          <div className="edu-row" style={{ gap: 6 }}>
            {template && (
              <button className="edu-btn-icon" title="Supprimer" onClick={remove}>
                <Trash2 size={16} />
              </button>
            )}
            <button
              className="edu-btn-icon"
              onClick={() => {
                if (!saving) onClose()
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Type</label>
            <select
              className="edu-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as EducationTemplateKind)}
              disabled={!!template}
            >
              {(Object.keys(TEMPLATE_KIND_LABEL) as EducationTemplateKind[]).map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="edu-form-group">
            <label>Nom</label>
            <input
              className="edu-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Brief séance 2h"
            />
          </div>
          <div className="edu-form-group">
            <label>Description</label>
            <textarea
              className="edu-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="À quoi sert ce template ?"
            />
          </div>
          <div className="edu-form-group">
            <label>
              Tags <span style={{ color: 'rgba(255,255,255,0.4)' }}>(séparés par des virgules)</span>
            </label>
            <input
              className="edu-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="cours, brief, bts"
            />
          </div>
          <TemplateBodyEditor kind={kind} body={body} onChange={changeBody} />
          <TemplatePreview kind={kind} body={body} />
          <details className="edu-template-advanced">
            <summary>Options avancées — JSON</summary>
            <label className="edu-form-group">
              Contenu avancé
              <textarea
                className="edu-textarea"
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value)
                  setAdvancedDirty(true)
                }}
                spellCheck={false}
                style={{ fontFamily: 'monospace', minHeight: 220 }}
              />
            </label>
            <button
              className="edu-btn ghost"
              onClick={() => {
                try {
                  changeBody(resolvedBody())
                  setError(null)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Contenu invalide')
                }
              }}
            >
              Actualiser le formulaire et l’aperçu
            </button>
          </details>
          {error && (
            <div className="edu-banner-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button
            className="edu-btn ghost"
            disabled={saving}
            onClick={() => {
              if (!saving) onClose()
            }}
          >
            Annuler
          </button>
          {template && (
            <button
              className="edu-btn ghost"
              disabled={saving || !name.trim()}
              onClick={() => {
                void save(true)
              }}
            >
              Dupliquer
            </button>
          )}
          <button
            className="edu-btn"
            disabled={!name.trim() || saving}
            onClick={() => {
              void save()
            }}
          >
            {saving ? 'Enregistrement…' : template ? 'Enregistrer' : 'Créer le template'}
          </button>
        </div>
      </div>
    </WorkspaceOverlayPortal>
  )
}

function defaultBodyFor(kind: EducationTemplateKind): Record<string, unknown> {
  if (kind === 'note') {
    const blocks: NoteBlock[] = [
      { id: 'b1', type: 'heading', text: 'Objectifs', checked: false, level: 2, meta: {} },
      { id: 'b2', type: 'bullet', text: 'Premier objectif…', checked: false, level: 1, meta: {} },
      { id: 'b3', type: 'heading', text: 'Déroulé', checked: false, level: 2, meta: {} },
      { id: 'b4', type: 'paragraph', text: '', checked: false, level: 1, meta: {} },
      { id: 'b5', type: 'heading', text: 'À retenir', checked: false, level: 2, meta: {} },
      { id: 'b6', type: 'callout', text: 'Point clé…', checked: false, level: 1, meta: {} },
    ]
    return { blocks }
  }
  if (kind === 'session') {
    return {
      title: '',
      theme: '',
      agenda: '1. Intro\n2. Théorie\n3. Atelier\n4. Wrap-up',
      objectives: ['Comprendre …', 'Savoir-faire …'],
      durationMin: 120,
    }
  }
  if (kind === 'assignment') {
    return {
      title: '',
      kind: 'DEVOIR',
      instructions: '',
      maxGrade: 20,
      weight: 1,
      expectedDeliverables: ['PDF rédigé', 'Source numérique'],
    }
  }
  return {
    name: '',
    school: '',
    level: '',
    program: '',
    weeklyHours: 4,
  }
}
