import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X, FileText, BookOpen, ClipboardList, GraduationCap } from 'lucide-react'
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  TEMPLATE_KIND_LABEL,
  type EducationTemplate, type EducationTemplateKind,
  type NoteBlock,
} from '../../../services/education'

/**
 * VENIO-29 — Templates pédagogiques réutilisables.
 *
 * Un template encapsule un `body` (Mixed) qu'on pourra appliquer ailleurs :
 *   - note    : { blocks: NoteBlock[] }
 *   - session : { title?, theme?, agenda?, objectives?, durationMin? }
 *   - assignment : { title?, kind?, instructions?, maxGrade?, weight?, expectedDeliverables? }
 *   - class   : { name?, school?, level?, program?, weeklyHours? }
 *
 * On reste conservateur côté UI : un éditeur générique JSON-friendly via textarea
 * pour les types non-note, et l'éditeur de blocs pour les notes.
 */

const KIND_ICONS: Record<EducationTemplateKind, typeof FileText> = {
  note: FileText,
  session: BookOpen,
  assignment: ClipboardList,
  class: GraduationCap,
}

export function TemplatesView() {
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

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    if (filter === 'all') return templates
    return templates.filter((t) => t.kind === filter)
  }, [templates, filter])

  const byKind = useMemo(() => {
    const groups: Record<EducationTemplateKind, EducationTemplate[]> = { note: [], session: [], assignment: [], class: [] }
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
              <option key={k} value={k}>{TEMPLATE_KIND_LABEL[k]}</option>
            ))}
          </select>
          <button className="edu-btn" onClick={() => setShowCreate('note')}>
            <Plus size={14} /> Nouveau template
          </button>
        </div>
      </div>

      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refresh}>Réessayer</button>
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
            <button className="edu-btn ghost" onClick={() => setShowCreate('session')}><BookOpen size={13} /> Modèle de séance</button>
            <button className="edu-btn ghost" onClick={() => setShowCreate('assignment')}><ClipboardList size={13} /> Modèle de devoir</button>
            <button className="edu-btn" onClick={() => setShowCreate('note')}><FileText size={13} /> Modèle de note</button>
          </div>
        </div>
      ) : (
        (Object.keys(TEMPLATE_KIND_LABEL) as EducationTemplateKind[])
          .filter((k) => filter === 'all' || k === filter)
          .map((kind) => byKind[kind].length === 0 ? null : (
            <div key={kind} style={{ marginTop: 18 }}>
              <h2 className="edu-h2" style={{ marginTop: 0 }}>{TEMPLATE_KIND_LABEL[kind]}</h2>
              <div className="edu-template-grid">
                {byKind[kind].map((t) => (
                  <TemplateCard key={t._id} t={t} onOpen={() => setOpenId(t._id)} />
                ))}
              </div>
            </div>
          ))
      )}

      {showCreate && (
        <TemplateEditorDrawer
          kind={showCreate}
          onClose={() => setShowCreate(null)}
          onSaved={async () => { setShowCreate(null); await refresh() }}
        />
      )}

      {openId && (
        <TemplateEditorDrawer
          template={templates.find((t) => t._id === openId)}
          kind={templates.find((t) => t._id === openId)?.kind ?? 'note'}
          onClose={() => setOpenId(null)}
          onSaved={async () => { setOpenId(null); await refresh() }}
        />
      )}
    </div>
  )
}

function TemplateCard({ t, onOpen }: { t: EducationTemplate; onOpen: () => void }) {
  const Icon = KIND_ICONS[t.kind]
  return (
    <div className="edu-template-card" onClick={onOpen}>
      <div className="edu-template-card-icon"><Icon size={16} /></div>
      <div className="edu-template-card-title">{t.name}</div>
      {t.description && <div className="edu-template-card-desc">{t.description}</div>}
      <div className="edu-template-card-meta">
        <span className="edu-pill">{TEMPLATE_KIND_LABEL[t.kind]}</span>
        {t.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="edu-pill" style={{ background: 'var(--accent-soft)', color: 'var(--primary-light)' }}>#{tag}</span>
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
  const [bodyText, setBodyText] = useState(() => JSON.stringify(template?.body ?? defaultBodyFor(initialKind), null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!template) {
      // Quand on crée et qu'on change le kind, on remet un body de défaut.
      setBodyText(JSON.stringify(defaultBodyFor(kind), null, 2))
    }
  }, [kind, template])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      let body: Record<string, unknown>
      try { body = JSON.parse(bodyText) } catch { throw new Error('Le contenu (JSON) est invalide.') }
      const payload = {
        kind,
        name: name.trim(),
        description,
        body,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      }
      if (template) await updateTemplate(template._id, payload)
      else          await createTemplate(payload)
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
    await deleteTemplate(template._id)
    onSaved()
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {template ? 'Modifier le template' : 'Nouveau template'}
          </h2>
          <div className="edu-row" style={{ gap: 6 }}>
            {template && (
              <button className="edu-btn-icon" title="Supprimer" onClick={remove}><Trash2 size={16} /></button>
            )}
            <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
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
                <option key={k} value={k}>{TEMPLATE_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="edu-form-group">
            <label>Nom</label>
            <input className="edu-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Brief séance 2h" />
          </div>
          <div className="edu-form-group">
            <label>Description</label>
            <textarea className="edu-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="À quoi sert ce template ?" />
          </div>
          <div className="edu-form-group">
            <label>Tags <span style={{ color: 'rgba(255,255,255,0.4)' }}>(séparés par des virgules)</span></label>
            <input className="edu-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cours, brief, bts" />
          </div>
          <div className="edu-form-group">
            <label>Corps du template <span style={{ color: 'rgba(255,255,255,0.4)' }}>(JSON)</span></label>
            <textarea
              className="edu-textarea"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              spellCheck={false}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, minHeight: 220 }}
            />
            <small style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5 }}>
              {kindHint(kind)}
            </small>
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Annuler</button>
          <button className="edu-btn" disabled={!name.trim() || saving} onClick={save}>
            {saving ? 'Enregistrement…' : template ? 'Enregistrer' : 'Créer le template'}
          </button>
        </div>
      </div>
    </>
  )
}

function defaultBodyFor(kind: EducationTemplateKind): Record<string, unknown> {
  if (kind === 'note') {
    const blocks: NoteBlock[] = [
      { id: 'b1', type: 'heading',   text: 'Objectifs',  checked: false, level: 2, meta: {} },
      { id: 'b2', type: 'bullet',    text: 'Premier objectif…', checked: false, level: 1, meta: {} },
      { id: 'b3', type: 'heading',   text: 'Déroulé',    checked: false, level: 2, meta: {} },
      { id: 'b4', type: 'paragraph', text: '',           checked: false, level: 1, meta: {} },
      { id: 'b5', type: 'heading',   text: 'À retenir',  checked: false, level: 2, meta: {} },
      { id: 'b6', type: 'callout',   text: 'Point clé…', checked: false, level: 1, meta: {} },
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

function kindHint(kind: EducationTemplateKind): string {
  switch (kind) {
    case 'note':       return 'Format attendu : { "blocks": [{ id, type, text, level?, checked?, meta }] }.'
    case 'session':    return 'Champs supportés : title, theme, agenda, objectives, durationMin.'
    case 'assignment': return 'Champs supportés : title, kind, instructions, maxGrade, weight, expectedDeliverables.'
    case 'class':      return 'Champs supportés : name, school, level, program, weeklyHours.'
  }
}
