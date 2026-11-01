/**
 * ClassWorkspace — page pleine type Notion pour une classe (VENIO, phase 1).
 *
 * Remplace l'ancien drawer à onglets. La classe devient une vraie page :
 *   - bannière de couverture + emoji + titre éditable,
 *   - panneau de propriétés (champs structurés + propriétés libres),
 *   - corps = canvas de blocs (NoteEditor sur la « home note » de la classe),
 *   - sections Étudiants / Séances / Devoirs (réutilisent les onglets existants).
 *
 * L'autosave est optimiste et debouncé, comme l'éditeur de notes.
 */
import { Fragment, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowLeft,
  Trash2,
  ImagePlus,
  X,
  Plus,
  Smile,
  FileText,
  Users,
  Calendar as CalIcon,
  ClipboardList,
  ChevronRight,
} from 'lucide-react'
import {
  getClass,
  deleteClass,
  getClassHome,
  getNote,
  createNote,
  deleteNote,
  CLASS_COLOR_PALETTE,
  type EducationClass,
  type EducationClassProperty,
  type ClassPropertyType,
  type EducationNote,
  type EducationTemplate,
  type NoteBlock,
} from '../../../services/education'
import { useEducationAutosave } from './useEducationAutosave'
import { AutosaveStatus } from './AutosaveStatus'
import { NoteEditor } from './NoteEditor'
import { StudentsTab } from './student-parts'
import { SessionsTab } from './session-parts'
import { AssignmentsTab } from './assignment-parts'
import { CouncilPreparationPanel } from './CouncilPreparationPanel'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { CLASS_STATUS_KEYS } from './eduCLabels'

type WorkspaceTab = 'page' | 'students' | 'sessions' | 'assignments' | 'council'

const COMMON_EMOJIS = [
  '📚',
  '🎓',
  '✏️',
  '🧠',
  '💡',
  '🔬',
  '🧪',
  '🧮',
  '📐',
  '🌍',
  '💻',
  '🎨',
  '🎭',
  '🎼',
  '⚖️',
  '🏛️',
  '📊',
  '📈',
  '🗂️',
  '🚀',
]

const COVER_PRESETS = [
  'linear-gradient(135deg, #22C55E 0%, #0EA5E9 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
  'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
  'linear-gradient(135deg, #14B8A6 0%, #22C55E 100%)',
  'linear-gradient(135deg, #475569 0%, #0F172A 100%)',
]

function coverStyle(cover: string, color: string): CSSProperties {
  if (!cover) {
    // Couverture par défaut : dégradé doux dérivé de la couleur de la classe.
    return { background: `linear-gradient(135deg, ${color}33 0%, ${color}11 60%, transparent 100%)` }
  }
  if (/^https?:\/\//.test(cover)) {
    return { backgroundImage: `url("${cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { background: cover }
}

export function ClassWorkspace({
  classId,
  onClose: onExit,
  onChanged,
  templates,
}: {
  classId: string
  onClose: () => void
  onChanged: () => void
  templates?: EducationTemplate[]
  onTemplatesChanged?: () => void
}) {
  const { t } = useI18n()
  const [klass, setKlass] = useState<EducationClass | null>(null)
  const [stats, setStats] = useState<{
    studentCount: number
    sessionCount: number
    assignmentCount: number
    openAssignments: number
  } | null>(null)
  // Pile de navigation : [0] = page racine (classe), puis sous-pages imbriquées.
  const [pageStack, setPageStack] = useState<EducationNote[]>([])
  const [tab, setTab] = useState<WorkspaceTab>('page')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showCover, setShowCover] = useState(false)

  const { stage, restore, flush, discard, status: saveStatus, error: saveError } = useEducationAutosave()
  const onClose = useCallback(async () => {
    if (await flush()) {
      onChanged()
      onExit()
    }
  }, [flush, onChanged, onExit])

  const depth = pageStack.length - 1
  const currentPage = pageStack[pageStack.length - 1] ?? null

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([getClass(classId), getClassHome(classId)])
      setKlass(restore('class', classId, c.class))
      setStats(c.stats)
      setPageStack([restore('note', h.note._id, h.note)])
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : translate('eduC.workspace.loadError'))
    }
  }, [classId, restore])

  useEffect(() => {
    load()
  }, [load])

  // Rafraîchit la classe + stats sans toucher la navigation dans l'arbre.
  const refreshMeta = useCallback(async () => {
    try {
      const c = await getClass(classId)
      setKlass(restore('class', classId, c.class))
      setStats(c.stats)
    } catch {
      /* best-effort */
    }
  }, [classId, restore])

  const patchClass = useCallback(
    (patch: Partial<EducationClass>) => {
      setKlass((prev) => (prev ? { ...prev, ...patch } : prev))
      stage('class', classId, patch)
    },
    [classId, stage],
  )

  const persistPage = useCallback(
    (next: EducationNote) => {
      setPageStack((stack) => stack.map((p) => (p._id === next._id ? next : p)))
      stage('note', next._id, { title: next.title, blocks: next.blocks, emoji: next.emoji })
    },
    [stage],
  )

  async function selectTab(next: WorkspaceTab) {
    if (await flush()) setTab(next)
  }

  // ── Navigation dans l'arbre de sous-pages ────────────────────────────────
  const createSubpage = useCallback(async () => {
    if (!currentPage || !(await flush())) return null
    try {
      const r = await createNote({
        title: translate('eduC.workspace.untitled'),
        parentNote: currentPage._id,
        links: currentPage.links,
        blocks: [
          {
            id: Math.random().toString(36).slice(2, 10),
            type: 'paragraph',
            text: '',
            checked: false,
            level: 1,
            meta: {},
          },
        ],
      })
      return { id: r.note._id, title: r.note.title || translate('eduC.workspace.untitled'), emoji: r.note.emoji }
    } catch {
      return null
    }
  }, [currentPage, flush])

  const openSubpage = useCallback(
    async (childId: string) => {
      if (!(await flush())) return
      try {
        const r = await getNote(childId)
        setPageStack((s) => [...s, restore('note', r.note._id, r.note)])
      } catch {
        alert(translate('eduC.workspace.subpageMissing'))
      }
    },
    [flush, restore],
  )

  async function goToCrumb(index: number) {
    if (!(await flush())) return
    setPageStack((s) => s.slice(0, index + 1))
  }

  async function deleteCurrentSubpage() {
    if (!currentPage || depth === 0) return
    if (!confirm(translate('eduC.workspace.deleteSubpageConfirm'))) return
    try {
      if (!(await flush())) return
      await deleteNote(currentPage._id)
      discard('note', currentPage._id)
      setPageStack((s) => s.slice(0, -1))
    } catch {
      alert(translate('eduC.workspace.deleteFailed'))
    }
  }

  // Mention cliquée : on revient à la racine de la classe et on ouvre la
  // section concernée (les onglets ne sont visibles qu'à la racine).
  async function openMention(refType: string) {
    if (!(await flush())) return
    setPageStack((s) => s.slice(0, 1))
    if (refType === 'student') setTab('students')
    else if (refType === 'session') setTab('sessions')
    else if (refType === 'assignment') setTab('assignments')
    else setTab('page')
  }

  if (loadError) {
    return (
      <div>
        <button className="edu-btn ghost" onClick={onClose}>
          <ArrowLeft size={14} /> {t('common.back')}
        </button>
        <div className="edu-banner-error" role="alert" style={{ marginTop: 16 }}>
          {loadError}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={load}>
            {t('eduC.workspace.retry')}
          </button>
        </div>
      </div>
    )
  }
  if (!klass) {
    return <div className="edu-empty">{t('eduC.workspace.loading')}</div>
  }

  async function handleDelete() {
    if (!confirm(t('eduC.workspace.deleteClassConfirm', { name: klass!.name }))) return
    if (!(await flush())) return
    await deleteClass(classId)
    discard('class', classId)
    for (const page of pageStack) discard('note', page._id)
    onChanged()
    onClose()
  }

  const pageEditor = currentPage && (
    <NoteEditor
      note={currentPage}
      onChange={persistPage}
      templates={templates}
      hideHeader={depth === 0}
      onCreateSubpage={createSubpage}
      onOpenSubpage={openSubpage}
      onOpenMention={(refType) => openMention(refType)}
      onApplyTemplate={(t) => {
        const tplBlocks = Array.isArray((t.body as { blocks?: NoteBlock[] }).blocks)
          ? (t.body as { blocks: NoteBlock[] }).blocks.map((b) => ({
              ...b,
              id: Math.random().toString(36).slice(2, 10),
            }))
          : []
        if (tplBlocks.length === 0 || !currentPage) return
        persistPage({ ...currentPage, blocks: [...currentPage.blocks, ...tplBlocks] })
      }}
      onDelete={
        depth > 0
          ? deleteCurrentSubpage
          : () => {
              /* la page racine ne se supprime pas */
            }
      }
    />
  )

  return (
    <div className="edu-cw">
      {/* Barre d'actions */}
      <div className="edu-cw-topbar">
        <button className="edu-btn ghost" onClick={onClose}>
          <ArrowLeft size={14} /> {t('eduC.shared.classes')}
        </button>
        {depth === 0 && (
          <div className="edu-row" style={{ gap: 6 }}>
            <button className="edu-btn-icon" onClick={handleDelete} title={t('eduC.workspace.deleteClassTitle')}>
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <AutosaveStatus status={saveStatus} error={saveError} onRetry={flush} />

      {/* Fil d'Ariane (dans l'arbre de sous-pages) */}
      {depth > 0 && (
        <div className="edu-cw-breadcrumb">
          {pageStack.map((p, i) => (
            <Fragment key={p._id}>
              {i > 0 && <ChevronRight size={13} className="edu-cw-crumb-sep" />}
              <button className="edu-cw-crumb" onClick={() => goToCrumb(i)} disabled={i === depth}>
                {i === 0
                  ? `${klass.emoji ? klass.emoji + ' ' : ''}${klass.name}`
                  : `${p.emoji ? p.emoji + ' ' : ''}${p.title || t('eduC.workspace.untitled')}`}
              </button>
            </Fragment>
          ))}
        </div>
      )}

      {depth === 0 ? (
        <>
          {/* Couverture */}
          <div className="edu-cw-cover" style={coverStyle(klass.cover, klass.color)}>
            <div className="edu-cw-cover-actions">
              <button className="edu-cw-cover-btn" onClick={() => setShowCover((v) => !v)}>
                <ImagePlus size={13} /> {t('eduC.workspace.cover')}
              </button>
            </div>
            {showCover && (
              <CoverPicker
                current={klass.cover}
                onPick={(cover) => {
                  patchClass({ cover })
                  setShowCover(false)
                }}
                onClose={() => setShowCover(false)}
              />
            )}
          </div>

          {/* En-tête : emoji + titre */}
          <div className="edu-cw-header">
            <div className="edu-cw-emoji-wrap">
              <button
                className="edu-cw-emoji"
                onClick={() => setShowEmoji((v) => !v)}
                title={t('eduC.workspace.chooseEmoji')}
              >
                {klass.emoji || <Smile size={28} strokeWidth={1.5} />}
              </button>
              {showEmoji && (
                <EmojiPicker
                  current={klass.emoji}
                  onPick={(emoji) => {
                    patchClass({ emoji })
                    setShowEmoji(false)
                  }}
                  onClose={() => setShowEmoji(false)}
                />
              )}
            </div>
            <textarea
              className="edu-cw-title"
              value={klass.name}
              rows={1}
              onChange={(e) => patchClass({ name: e.target.value })}
              placeholder={t('eduC.shared.className')}
              aria-label={t('eduC.shared.className')}
            />
          </div>

          {/* Propriétés */}
          <PropertiesPanel klass={klass} stats={stats} onPatch={patchClass} />

          {/* Navigation de sections */}
          <div className="edu-cw-tabs">
            <TabBtn
              icon={FileText}
              label={t('eduC.workspace.tabPage')}
              active={tab === 'page'}
              onClick={() => selectTab('page')}
            />
            <TabBtn
              icon={Users}
              label={t('eduC.shared.students')}
              count={stats?.studentCount}
              active={tab === 'students'}
              onClick={() => selectTab('students')}
            />
            <TabBtn
              icon={CalIcon}
              label={t('eduC.shared.sessions')}
              count={stats?.sessionCount}
              active={tab === 'sessions'}
              onClick={() => selectTab('sessions')}
            />
            <TabBtn
              icon={ClipboardList}
              label={t('eduC.shared.assignments')}
              count={stats?.assignmentCount}
              active={tab === 'assignments'}
              onClick={() => selectTab('assignments')}
            />
            <TabBtn
              icon={FileText}
              label={t('eduC.workspace.tabCouncil')}
              active={tab === 'council'}
              onClick={() => selectTab('council')}
            />
          </div>

          {/* Contenu */}
          <div className="edu-cw-body">
            {tab === 'page' && pageEditor}
            {tab === 'students' && (
              <StudentsTab
                classId={classId}
                onChanged={() => {
                  refreshMeta()
                  onChanged()
                }}
              />
            )}
            {tab === 'sessions' && (
              <SessionsTab
                classId={classId}
                /* tous kinds : SessionsTab filtre pour le form et transmet tout au drawer */
                templates={templates}
                onChanged={() => {
                  refreshMeta()
                  onChanged()
                }}
              />
            )}
            {tab === 'assignments' && (
              <AssignmentsTab
                classId={classId}
                templates={templates?.filter((t) => t.kind === 'assignment')}
                onChanged={() => {
                  refreshMeta()
                  onChanged()
                }}
              />
            )}
            {tab === 'council' && <CouncilPreparationPanel classId={classId} />}
          </div>
        </>
      ) : (
        /* Sous-page : juste le breadcrumb (au-dessus) + l'éditeur avec son en-tête. */
        <div className="edu-cw-body edu-cw-subpage">{pageEditor}</div>
      )}
    </div>
  )
}

function TabBtn({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof FileText
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={`edu-cw-tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={14} /> {label}
      {count != null && count > 0 && <span className="edu-side-badge">{count}</span>}
    </button>
  )
}

/* ─── Panneau de propriétés ─────────────────────────────────────────────── */

function PropertiesPanel({
  klass,
  stats,
  onPatch,
}: {
  klass: EducationClass
  stats: { studentCount: number; sessionCount: number; assignmentCount: number; openAssignments: number } | null
  onPatch: (patch: Partial<EducationClass>) => void
}) {
  const { t } = useI18n()
  function setProp(id: string, patch: Partial<EducationClassProperty>) {
    onPatch({ properties: klass.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }
  function addProp() {
    const np: EducationClassProperty = {
      id: `prop-${Date.now()}`,
      label: t('eduC.workspace.propDefaultLabel'),
      type: 'text',
      value: '',
    }
    onPatch({ properties: [...klass.properties, np] })
  }
  function removeProp(id: string) {
    onPatch({ properties: klass.properties.filter((p) => p.id !== id) })
  }

  return (
    <div className="edu-cw-props">
      <PropRow label={t('eduC.shared.school')}>
        <input
          className="edu-cw-prop-input"
          value={klass.school}
          placeholder="—"
          onChange={(e) => onPatch({ school: e.target.value })}
        />
      </PropRow>
      <PropRow label={t('eduC.shared.level')}>
        <input
          className="edu-cw-prop-input"
          value={klass.level}
          placeholder={t('eduC.shared.levelPlaceholder')}
          onChange={(e) => onPatch({ level: e.target.value })}
        />
      </PropRow>
      <PropRow label={t('eduC.workspace.propProgram')}>
        <input
          className="edu-cw-prop-input"
          value={klass.program}
          placeholder="—"
          onChange={(e) => onPatch({ program: e.target.value })}
        />
      </PropRow>
      <PropRow label={t('eduC.shared.status')}>
        <select
          className="edu-cw-prop-input"
          value={klass.status}
          onChange={(e) => onPatch({ status: e.target.value as EducationClass['status'] })}
        >
          {Object.entries(CLASS_STATUS_KEYS).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </select>
      </PropRow>
      <PropRow label={t('eduC.workspace.propPeriod')}>
        <div className="edu-row" style={{ gap: 6 }}>
          <input
            type="date"
            className="edu-cw-prop-input"
            value={klass.period.start?.slice(0, 10) ?? ''}
            onChange={(e) => onPatch({ period: { ...klass.period, start: e.target.value || null } })}
          />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input
            type="date"
            className="edu-cw-prop-input"
            value={klass.period.end?.slice(0, 10) ?? ''}
            onChange={(e) => onPatch({ period: { ...klass.period, end: e.target.value || null } })}
          />
        </div>
      </PropRow>
      <PropRow label={t('eduC.workspace.propWeeklyHours')}>
        <input
          type="number"
          className="edu-cw-prop-input"
          value={klass.weeklyHours ?? ''}
          placeholder="—"
          onChange={(e) => onPatch({ weeklyHours: e.target.value ? Number(e.target.value) : null })}
        />
      </PropRow>
      <PropRow label={t('eduC.shared.color')}>
        <div className="edu-row" style={{ gap: 5, flexWrap: 'wrap' }}>
          {CLASS_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPatch({ color: c })}
              className="edu-cw-color-dot"
              style={{ background: c, outline: c === klass.color ? '2px solid #fff' : '2px solid transparent' }}
              aria-label={t('eduC.shared.colorAria', { color: c })}
            />
          ))}
        </div>
      </PropRow>

      {/* Propriétés personnalisées */}
      {klass.properties.map((p) => (
        <div className="edu-cw-prop-row edu-cw-prop-custom" key={p.id}>
          <input
            className="edu-cw-prop-label"
            value={p.label}
            placeholder={t('eduC.workspace.propLabelPlaceholder')}
            onChange={(e) => setProp(p.id, { label: e.target.value })}
          />
          <select
            className="edu-cw-prop-type"
            value={p.type}
            onChange={(e) => setProp(p.id, { type: e.target.value as ClassPropertyType })}
          >
            <option value="text">{t('eduC.workspace.propTypeText')}</option>
            <option value="number">{t('eduC.workspace.propTypeNumber')}</option>
            <option value="date">{t('eduC.workspace.propTypeDate')}</option>
            <option value="url">{t('eduC.workspace.propTypeLink')}</option>
            <option value="select">{t('eduC.workspace.propTypeTag')}</option>
            <option value="checkbox">{t('eduC.workspace.propTypeCheckbox')}</option>
          </select>
          <PropValueInput prop={p} onChange={(value) => setProp(p.id, { value })} />
          <button className="edu-btn-icon" onClick={() => removeProp(p.id)} title={t('eduC.shared.remove')}>
            <X size={14} />
          </button>
        </div>
      ))}

      <button className="edu-cw-add-prop" onClick={addProp}>
        <Plus size={13} /> {t('eduC.workspace.addProperty')}
      </button>

      {stats && (
        <div className="edu-cw-stats">
          <span>{t('eduC.workspace.statStudents', { count: stats.studentCount })}</span>
          <span>·</span>
          <span>{t('eduC.workspace.statSessions', { count: stats.sessionCount })}</span>
          <span>·</span>
          <span>{t('eduC.workspace.statOpenAssignments', { count: stats.openAssignments })}</span>
        </div>
      )}
    </div>
  )
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="edu-cw-prop-row">
      <div className="edu-cw-prop-name">{label}</div>
      <div className="edu-cw-prop-val">{children}</div>
    </div>
  )
}

function PropValueInput({ prop, onChange }: { prop: EducationClassProperty; onChange: (v: string) => void }) {
  const { t } = useI18n()
  if (prop.type === 'checkbox') {
    return (
      <label className="edu-cw-prop-value edu-row" style={{ gap: 6 }}>
        <input
          type="checkbox"
          checked={prop.value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {prop.value === 'true' ? t('common.yes') : t('common.no')}
        </span>
      </label>
    )
  }
  const type = prop.type === 'number' ? 'number' : prop.type === 'date' ? 'date' : prop.type === 'url' ? 'url' : 'text'
  return (
    <input
      className="edu-cw-prop-value"
      type={type}
      value={prop.value}
      placeholder={t('eduC.workspace.propValuePlaceholder')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/* ─── Pickers ───────────────────────────────────────────────────────────── */

function EmojiPicker({
  current,
  onPick,
  onClose,
}: {
  current: string
  onPick: (e: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [custom, setCustom] = useState('')
  return (
    <>
      <div className="edu-cw-pop-backdrop" onClick={onClose} aria-hidden />
      <div className="edu-cw-pop" role="dialog">
        <div className="edu-cw-emoji-grid">
          {COMMON_EMOJIS.map((e) => (
            <button key={e} className={`edu-cw-emoji-opt ${current === e ? 'active' : ''}`} onClick={() => onPick(e)}>
              {e}
            </button>
          ))}
        </div>
        <div className="edu-row" style={{ gap: 6, marginTop: 8 }}>
          <input
            className="edu-input"
            style={{ flex: 1 }}
            maxLength={4}
            value={custom}
            placeholder={t('eduC.workspace.pasteEmoji')}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="edu-btn" disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
            OK
          </button>
          {current && (
            <button className="edu-btn ghost" onClick={() => onPick('')}>
              {t('eduC.shared.remove')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function CoverPicker({
  current,
  onPick,
  onClose,
}: {
  current: string
  onPick: (c: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [url, setUrl] = useState(/^https?:\/\//.test(current) ? current : '')
  return (
    <>
      <div className="edu-cw-pop-backdrop" onClick={onClose} aria-hidden />
      <div className="edu-cw-pop edu-cw-pop-cover" role="dialog">
        <div className="edu-cw-cover-grid">
          {COVER_PRESETS.map((c) => (
            <button
              key={c}
              className={`edu-cw-cover-opt ${current === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => onPick(c)}
              aria-label={t('eduC.workspace.cover')}
            />
          ))}
        </div>
        <div className="edu-row" style={{ gap: 6, marginTop: 8 }}>
          <input
            className="edu-input"
            style={{ flex: 1 }}
            value={url}
            placeholder={t('eduC.workspace.imageUrlPlaceholder')}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="edu-btn" disabled={!/^https?:\/\//.test(url)} onClick={() => onPick(url)}>
            OK
          </button>
          {current && (
            <button className="edu-btn ghost" onClick={() => onPick('')}>
              {t('eduC.shared.remove')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default ClassWorkspace
