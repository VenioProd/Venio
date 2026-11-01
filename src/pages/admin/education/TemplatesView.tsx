import PageHeader from '../../../components/admin/ui/PageHeader'
import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X, FileText, BookOpen, ClipboardList, GraduationCap } from 'lucide-react'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type EducationTemplate,
  type EducationTemplateKind,
  type NoteBlock,
  type EducationClass,
} from '../../../services/education'

import { TemplateBodyEditor, TemplatePreview, templateBodyError } from './TemplateBodyEditor'
import { TemplateApplyDrawer } from './TemplateApplyDrawer'

const TEMPLATE_KINDS: EducationTemplateKind[] = ['session', 'assignment', 'note', 'class']

const KIND_LABEL_KEYS = {
  session: 'eduA.templates.kind.session',
  assignment: 'eduA.templates.kind.assignment',
  note: 'eduA.templates.kind.note',
  class: 'eduA.templates.kind.class',
} as const satisfies Record<EducationTemplateKind, MessageKey>

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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('eduA.templates.loadError'))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    if (filter === 'all') return templates
    return templates.filter((tpl) => tpl.kind === filter)
  }, [templates, filter])

  const byKind = useMemo(() => {
    const groups: Record<EducationTemplateKind, EducationTemplate[]> = {
      note: [],
      session: [],
      assignment: [],
      class: [],
    }
    for (const tpl of filtered) groups[tpl.kind].push(tpl)
    return groups
  }, [filtered])

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <PageHeader
          eyebrow={t('adminOps.zone.education')}
          title={t('eduA.templates.title')}
          subtitle={<>{t('eduA.templates.subtitle')}</>}
          actions={
            <>
              <div className="edu-row" style={{ gap: 6 }}>
                <select
                  className="edu-select"
                  style={{ width: 170 }}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as EducationTemplateKind | 'all')}
                >
                  <option value="all">{t('eduA.templates.filterAll')}</option>
                  {TEMPLATE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(KIND_LABEL_KEYS[k])}
                    </option>
                  ))}
                </select>
                <button className="edu-btn" onClick={() => setShowCreate('note')}>
                  <Plus size={14} /> {t('eduA.templates.new')}
                </button>
              </div>
            </>
          }
        />
      </div>

      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refresh}>
            {t('eduA.common.retry')}
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">🧩</div>
          <div>{t('eduA.templates.emptyTitle')}</div>
          <div className="edu-empty-sub">{t('eduA.templates.emptyText')}</div>
          <div className="edu-row" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="edu-btn ghost" onClick={() => setShowCreate('session')}>
              <BookOpen size={13} /> {t('eduA.templates.emptySession')}
            </button>
            <button className="edu-btn ghost" onClick={() => setShowCreate('assignment')}>
              <ClipboardList size={13} /> {t('eduA.templates.emptyAssignment')}
            </button>
            <button className="edu-btn" onClick={() => setShowCreate('note')}>
              <FileText size={13} /> {t('eduA.templates.emptyNote')}
            </button>
          </div>
        </div>
      ) : (
        TEMPLATE_KINDS.filter((k) => filter === 'all' || k === filter).map((kind) =>
          byKind[kind].length === 0 ? null : (
            <div key={kind} style={{ marginTop: 18 }}>
              <h2 className="edu-h2" style={{ marginTop: 0 }}>
                {t(KIND_LABEL_KEYS[kind])}
              </h2>
              <div className="edu-template-grid">
                {byKind[kind].map((tpl) => (
                  <TemplateCard
                    key={tpl._id}
                    t={tpl}
                    onOpen={() => setOpenId(tpl._id)}
                    onApply={() => setApplyTemplate(tpl)}
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
            setNotice(t('eduA.templates.applied'))
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
          template={templates.find((tpl) => tpl._id === openId)}
          kind={templates.find((tpl) => tpl._id === openId)?.kind ?? 'note'}
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

function TemplateCard({ t: tpl, onOpen, onApply }: { t: EducationTemplate; onOpen: () => void; onApply: () => void }) {
  const { t } = useI18n()
  const Icon = KIND_ICONS[tpl.kind]
  return (
    <div className="edu-template-card">
      <div className="edu-template-card-icon">
        <Icon size={16} />
      </div>
      <button className="edu-btn ghost edu-template-card-title" onClick={onOpen}>
        {tpl.name}
      </button>
      {tpl.description && <div className="edu-template-card-desc">{tpl.description}</div>}
      <div className="edu-template-card-meta">
        <span className="edu-pill">{t(KIND_LABEL_KEYS[tpl.kind])}</span>
        <button className="edu-btn ghost" onClick={onApply}>
          {t('eduA.templates.use')}
        </button>
        {tpl.tags.slice(0, 3).map((tag) => (
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
  const { t } = useI18n()
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
        throw new Error(t('eduA.templates.invalidJson'))
      }
    }
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error(t('eduA.templates.mustBeObject'))
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
        name: duplicate ? t('eduA.templates.copyName', { name: name.trim() }) : name.trim(),
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
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!template) return
    if (!confirm(t('eduA.templates.deleteConfirm', { name: template.name }))) return
    setSaving(true)
    setError(null)
    try {
      await deleteTemplate(template._id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduA.common.deleteFailed'))
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
            {template ? t('eduA.templates.edit') : t('eduA.templates.new')}
          </h2>
          <div className="edu-row" style={{ gap: 6 }}>
            {template && (
              <button className="edu-btn-icon" title={t('common.delete')} onClick={remove}>
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
            <label>{t('eduA.templates.type')}</label>
            <select
              className="edu-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as EducationTemplateKind)}
              disabled={!!template}
            >
              {TEMPLATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(KIND_LABEL_KEYS[k])}
                </option>
              ))}
            </select>
          </div>
          <div className="edu-form-group">
            <label>{t('eduA.templates.name')}</label>
            <input
              className="edu-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('eduA.templates.namePlaceholder')}
            />
          </div>
          <div className="edu-form-group">
            <label>{t('eduA.templates.description')}</label>
            <textarea
              className="edu-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('eduA.templates.descriptionPlaceholder')}
            />
          </div>
          <div className="edu-form-group">
            <label>
              {t('eduA.templates.tags')}{' '}
              <span style={{ color: 'var(--text-muted)' }}>{t('eduA.templates.tagsHint')}</span>
            </label>
            <input
              className="edu-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('eduA.templates.tagsPlaceholder')}
            />
          </div>
          <TemplateBodyEditor kind={kind} body={body} onChange={changeBody} />
          <TemplatePreview kind={kind} body={body} />
          <details className="edu-template-advanced">
            <summary>{t('eduA.templates.advanced')}</summary>
            <label className="edu-form-group">
              {t('eduA.templates.advancedContent')}
              <textarea
                className="edu-textarea"
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value)
                  setAdvancedDirty(true)
                }}
                spellCheck={false}
                style={{ fontFamily: 'var(--font-mono)', minHeight: 220 }}
              />
            </label>
            <button
              className="edu-btn ghost"
              onClick={() => {
                try {
                  changeBody(resolvedBody())
                  setError(null)
                } catch (err) {
                  setError(err instanceof Error ? err.message : t('eduA.templates.invalidContent'))
                }
              }}
            >
              {t('eduA.templates.refreshPreview')}
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
            {t('common.cancel')}
          </button>
          {template && (
            <button
              className="edu-btn ghost"
              disabled={saving || !name.trim()}
              onClick={() => {
                void save(true)
              }}
            >
              {t('eduA.templates.duplicate')}
            </button>
          )}
          <button
            className="edu-btn"
            disabled={!name.trim() || saving}
            onClick={() => {
              void save()
            }}
          >
            {saving ? t('eduA.common.saving') : template ? t('common.save') : t('eduA.templates.createTemplate')}
          </button>
        </div>
      </div>
    </WorkspaceOverlayPortal>
  )
}

function defaultBodyFor(kind: EducationTemplateKind): Record<string, unknown> {
  if (kind === 'note') {
    const blocks: NoteBlock[] = [
      {
        id: 'b1',
        type: 'heading',
        text: translate('eduA.templates.default.objectives'),
        checked: false,
        level: 2,
        meta: {},
      },
      {
        id: 'b2',
        type: 'bullet',
        text: translate('eduA.templates.default.firstObjective'),
        checked: false,
        level: 1,
        meta: {},
      },
      {
        id: 'b3',
        type: 'heading',
        text: translate('eduA.templates.default.agenda'),
        checked: false,
        level: 2,
        meta: {},
      },
      { id: 'b4', type: 'paragraph', text: '', checked: false, level: 1, meta: {} },
      {
        id: 'b5',
        type: 'heading',
        text: translate('eduA.templates.default.keyTakeaways'),
        checked: false,
        level: 2,
        meta: {},
      },
      {
        id: 'b6',
        type: 'callout',
        text: translate('eduA.templates.default.keyPoint'),
        checked: false,
        level: 1,
        meta: {},
      },
    ]
    return { blocks }
  }
  if (kind === 'session') {
    return {
      title: '',
      theme: '',
      agenda: translate('eduA.templates.default.sessionAgenda'),
      objectives: [
        translate('eduA.templates.default.objectiveUnderstand'),
        translate('eduA.templates.default.objectiveSkill'),
      ],
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
      expectedDeliverables: [
        translate('eduA.templates.default.deliverablePdf'),
        translate('eduA.templates.default.deliverableSource'),
      ],
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
