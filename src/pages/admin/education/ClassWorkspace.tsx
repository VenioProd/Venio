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
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  updateClass,
  deleteClass,
  getClassHome,
  updateNote,
  getNote,
  createNote,
  deleteNote,
  CLASS_STATUS_LABEL,
  CLASS_COLOR_PALETTE,
  type EducationClass,
  type EducationClassProperty,
  type ClassPropertyType,
  type EducationNote,
  type EducationTemplate,
  type NoteBlock,
} from '../../../services/education'
import { NoteEditor } from './NoteEditor'
import { StudentsTab } from './student-parts'
import { SessionsTab } from './session-parts'
import { AssignmentsTab } from './assignment-parts'

type WorkspaceTab = 'page' | 'students' | 'sessions' | 'assignments'

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
  onClose,
  onChanged,
  templates,
}: {
  classId: string
  onClose: () => void
  onChanged: () => void
  templates?: EducationTemplate[]
  onTemplatesChanged?: () => void
}) {
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

  const classTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const depth = pageStack.length - 1
  const currentPage = pageStack[pageStack.length - 1] ?? null

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([getClass(classId), getClassHome(classId)])
      setKlass(c.class)
      setStats(c.stats)
      setPageStack([h.note])
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger la classe')
    }
  }, [classId])

  useEffect(() => {
    load()
  }, [load])

  // Rafraîchit la classe + stats sans toucher la navigation dans l'arbre.
  const refreshMeta = useCallback(async () => {
    try {
      const c = await getClass(classId)
      setKlass(c.class)
      setStats(c.stats)
    } catch {
      /* best-effort */
    }
  }, [classId])

  // ── Autosave classe (optimiste + debounce) ──────────────────────────────
  const patchClass = useCallback(
    (patch: Partial<EducationClass>) => {
      setKlass((prev) => (prev ? { ...prev, ...patch } : prev))
      if (classTimer.current) clearTimeout(classTimer.current)
      classTimer.current = setTimeout(async () => {
        try {
          await updateClass(classId, patch)
          onChanged()
        } catch {
          /* best-effort, l'état local reste affiché */
        }
      }, 500)
    },
    [classId, onChanged],
  )

  // ── Autosave de la page courante (racine ou sous-page) ───────────────────
  const persistPage = useCallback((next: EducationNote) => {
    setPageStack((stack) => stack.map((p, i) => (i === stack.length - 1 ? next : p)))
    if (pageTimer.current) clearTimeout(pageTimer.current)
    pageTimer.current = setTimeout(async () => {
      try {
        await updateNote(next._id, { title: next.title, blocks: next.blocks, emoji: next.emoji })
      } catch {
        /* best-effort */
      }
    }, 600)
  }, [])

  // ── Navigation dans l'arbre de sous-pages ────────────────────────────────
  const createSubpage = useCallback(async () => {
    if (!currentPage) return null
    try {
      const r = await createNote({
        title: 'Sans titre',
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
      return { id: r.note._id, title: r.note.title || 'Sans titre', emoji: r.note.emoji }
    } catch {
      return null
    }
  }, [currentPage])

  const openSubpage = useCallback(async (childId: string) => {
    try {
      const r = await getNote(childId)
      setPageStack((s) => [...s, r.note])
    } catch {
      alert('Cette sous-page est introuvable (peut-être supprimée).')
    }
  }, [])

  function goToCrumb(index: number) {
    setPageStack((s) => s.slice(0, index + 1))
  }

  async function deleteCurrentSubpage() {
    if (!currentPage || depth === 0) return
    if (!confirm('Supprimer cette sous-page et son contenu ?')) return
    try {
      await deleteNote(currentPage._id)
      setPageStack((s) => s.slice(0, -1))
    } catch {
      alert('Suppression impossible.')
    }
  }

  // Mention cliquée : on revient à la racine de la classe et on ouvre la
  // section concernée (les onglets ne sont visibles qu'à la racine).
  function openMention(refType: string) {
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
          <ArrowLeft size={14} /> Retour
        </button>
        <div className="edu-banner-error" role="alert" style={{ marginTop: 16 }}>
          {loadError}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={load}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }
  if (!klass) {
    return <div className="edu-empty">Chargement de la classe…</div>
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la classe "${klass!.name}" ? Étudiants, séances et devoirs liés seront aussi archivés.`))
      return
    await deleteClass(classId)
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
          <ArrowLeft size={14} /> Classes
        </button>
        {depth === 0 && (
          <div className="edu-row" style={{ gap: 6 }}>
            <button className="edu-btn-icon" onClick={handleDelete} title="Supprimer la classe">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Fil d'Ariane (dans l'arbre de sous-pages) */}
      {depth > 0 && (
        <div className="edu-cw-breadcrumb">
          {pageStack.map((p, i) => (
            <Fragment key={p._id}>
              {i > 0 && <ChevronRight size={13} className="edu-cw-crumb-sep" />}
              <button className="edu-cw-crumb" onClick={() => goToCrumb(i)} disabled={i === depth}>
                {i === 0
                  ? `${klass.emoji ? klass.emoji + ' ' : ''}${klass.name}`
                  : `${p.emoji ? p.emoji + ' ' : ''}${p.title || 'Sans titre'}`}
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
                <ImagePlus size={13} /> Couverture
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
              <button className="edu-cw-emoji" onClick={() => setShowEmoji((v) => !v)} title="Choisir un emoji">
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
              placeholder="Nom de la classe"
              aria-label="Nom de la classe"
            />
          </div>

          {/* Propriétés */}
          <PropertiesPanel klass={klass} stats={stats} onPatch={patchClass} />

          {/* Navigation de sections */}
          <div className="edu-cw-tabs">
            <TabBtn icon={FileText} label="Page" active={tab === 'page'} onClick={() => setTab('page')} />
            <TabBtn
              icon={Users}
              label="Étudiants"
              count={stats?.studentCount}
              active={tab === 'students'}
              onClick={() => setTab('students')}
            />
            <TabBtn
              icon={CalIcon}
              label="Séances"
              count={stats?.sessionCount}
              active={tab === 'sessions'}
              onClick={() => setTab('sessions')}
            />
            <TabBtn
              icon={ClipboardList}
              label="Devoirs"
              count={stats?.assignmentCount}
              active={tab === 'assignments'}
              onClick={() => setTab('assignments')}
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
                onChanged={() => {
                  refreshMeta()
                  onChanged()
                }}
              />
            )}
            {tab === 'assignments' && (
              <AssignmentsTab
                classId={classId}
                onChanged={() => {
                  refreshMeta()
                  onChanged()
                }}
              />
            )}
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
  function setProp(id: string, patch: Partial<EducationClassProperty>) {
    onPatch({ properties: klass.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  }
  function addProp() {
    const np: EducationClassProperty = { id: `prop-${Date.now()}`, label: 'Propriété', type: 'text', value: '' }
    onPatch({ properties: [...klass.properties, np] })
  }
  function removeProp(id: string) {
    onPatch({ properties: klass.properties.filter((p) => p.id !== id) })
  }

  return (
    <div className="edu-cw-props">
      <PropRow label="École">
        <input
          className="edu-cw-prop-input"
          value={klass.school}
          placeholder="—"
          onChange={(e) => onPatch({ school: e.target.value })}
        />
      </PropRow>
      <PropRow label="Niveau">
        <input
          className="edu-cw-prop-input"
          value={klass.level}
          placeholder="BAC+1, M1…"
          onChange={(e) => onPatch({ level: e.target.value })}
        />
      </PropRow>
      <PropRow label="Programme">
        <input
          className="edu-cw-prop-input"
          value={klass.program}
          placeholder="—"
          onChange={(e) => onPatch({ program: e.target.value })}
        />
      </PropRow>
      <PropRow label="Statut">
        <select
          className="edu-cw-prop-input"
          value={klass.status}
          onChange={(e) => onPatch({ status: e.target.value as EducationClass['status'] })}
        >
          {Object.entries(CLASS_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </PropRow>
      <PropRow label="Période">
        <div className="edu-row" style={{ gap: 6 }}>
          <input
            type="date"
            className="edu-cw-prop-input"
            value={klass.period.start?.slice(0, 10) ?? ''}
            onChange={(e) => onPatch({ period: { ...klass.period, start: e.target.value || null } })}
          />
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>→</span>
          <input
            type="date"
            className="edu-cw-prop-input"
            value={klass.period.end?.slice(0, 10) ?? ''}
            onChange={(e) => onPatch({ period: { ...klass.period, end: e.target.value || null } })}
          />
        </div>
      </PropRow>
      <PropRow label="Heures / sem.">
        <input
          type="number"
          className="edu-cw-prop-input"
          value={klass.weeklyHours ?? ''}
          placeholder="—"
          onChange={(e) => onPatch({ weeklyHours: e.target.value ? Number(e.target.value) : null })}
        />
      </PropRow>
      <PropRow label="Couleur">
        <div className="edu-row" style={{ gap: 5, flexWrap: 'wrap' }}>
          {CLASS_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPatch({ color: c })}
              className="edu-cw-color-dot"
              style={{ background: c, outline: c === klass.color ? '2px solid #fff' : '2px solid transparent' }}
              aria-label={`Couleur ${c}`}
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
            placeholder="Libellé"
            onChange={(e) => setProp(p.id, { label: e.target.value })}
          />
          <select
            className="edu-cw-prop-type"
            value={p.type}
            onChange={(e) => setProp(p.id, { type: e.target.value as ClassPropertyType })}
          >
            <option value="text">Texte</option>
            <option value="number">Nombre</option>
            <option value="date">Date</option>
            <option value="url">Lien</option>
            <option value="select">Étiquette</option>
            <option value="checkbox">Case</option>
          </select>
          <PropValueInput prop={p} onChange={(value) => setProp(p.id, { value })} />
          <button className="edu-btn-icon" onClick={() => removeProp(p.id)} title="Retirer">
            <X size={14} />
          </button>
        </div>
      ))}

      <button className="edu-cw-add-prop" onClick={addProp}>
        <Plus size={13} /> Ajouter une propriété
      </button>

      {stats && (
        <div className="edu-cw-stats">
          <span>
            {stats.studentCount} étudiant{stats.studentCount > 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {stats.sessionCount} séance{stats.sessionCount > 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {stats.openAssignments} devoir{stats.openAssignments > 1 ? 's' : ''} ouvert
            {stats.openAssignments > 1 ? 's' : ''}
          </span>
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
  if (prop.type === 'checkbox') {
    return (
      <label className="edu-cw-prop-value edu-row" style={{ gap: 6 }}>
        <input
          type="checkbox"
          checked={prop.value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{prop.value === 'true' ? 'Oui' : 'Non'}</span>
      </label>
    )
  }
  const type = prop.type === 'number' ? 'number' : prop.type === 'date' ? 'date' : prop.type === 'url' ? 'url' : 'text'
  return (
    <input
      className="edu-cw-prop-value"
      type={type}
      value={prop.value}
      placeholder="Valeur…"
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
            placeholder="Coller un emoji"
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className="edu-btn" disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
            OK
          </button>
          {current && (
            <button className="edu-btn ghost" onClick={() => onPick('')}>
              Retirer
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
              aria-label="Couverture"
            />
          ))}
        </div>
        <div className="edu-row" style={{ gap: 6, marginTop: 8 }}>
          <input
            className="edu-input"
            style={{ flex: 1 }}
            value={url}
            placeholder="URL d'image…"
            onChange={(e) => setUrl(e.target.value)}
          />
          <button className="edu-btn" disabled={!/^https?:\/\//.test(url)} onClick={() => onPick(url)}>
            OK
          </button>
          {current && (
            <button className="edu-btn ghost" onClick={() => onPick('')}>
              Retirer
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default ClassWorkspace
