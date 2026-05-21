import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pin, Archive, Trash2, Plus, GripVertical,
  Type, Heading1, Heading2, Heading3, ListChecks, List, ListOrdered,
  Quote, Code, Lightbulb, Minus, Link2, FileText, ChevronRight, Sparkles,
} from 'lucide-react'
import {
  formatRelative,
  type EducationNote, type NoteBlock, type NoteBlockType,
  type NoteLinkType, type EducationTemplate,
} from '../../../services/education'

/**
 * VENIO-28 — Block editor type Notion.
 * Améliorations vs V2 :
 *   - Slash menu (`/`) pour choisir le type de bloc.
 *   - Markdown shortcuts (#, ##, ###, - [ ], -, 1., >, ```, ---) à la frappe.
 *   - Drag handle natif pour réordonner les blocs.
 *   - Raccourcis clavier : Enter pour bloc suivant, Backspace vide pour fusion,
 *     Cmd/Ctrl+Shift+↑/↓ pour réordonner, Up/Down pour naviguer.
 *
 * Le composant reste contrôlé : c'est l'appelant (`NotesView`) qui persiste.
 */

export interface NoteEditorProps {
  note: EducationNote
  onChange: (n: EducationNote) => void
  onDelete: () => void
  templates?: EducationTemplate[]
  onApplyTemplate?: (template: EducationTemplate) => void
  backlinks?: BacklinkEntry[]
}

export interface BacklinkEntry {
  type: NoteLinkType
  refId: string
  label: string
  meta?: string
  onOpen?: () => void
}

interface BlockTypeDescriptor {
  type: NoteBlockType
  label: string
  hint: string
  icon: typeof Type
  keywords: string[]
  level?: number
}

const BLOCK_TYPES: BlockTypeDescriptor[] = [
  { type: 'paragraph', label: 'Texte',     hint: 'Paragraphe simple',         icon: Type,        keywords: ['p', 'texte', 'paragraph'] },
  { type: 'heading',   label: 'Titre H1',  hint: 'Section principale',        icon: Heading1,    keywords: ['h1', 'titre'], level: 1 },
  { type: 'heading',   label: 'Titre H2',  hint: 'Sous-section',              icon: Heading2,    keywords: ['h2', 'sous-titre'], level: 2 },
  { type: 'heading',   label: 'Titre H3',  hint: 'Petit titre',               icon: Heading3,    keywords: ['h3'], level: 3 },
  { type: 'checklist', label: 'À faire',   hint: 'Case à cocher',             icon: ListChecks,  keywords: ['todo', 'tache', 'check', 'cocher'] },
  { type: 'bullet',    label: 'Liste',     hint: 'Liste à puces',             icon: List,        keywords: ['liste', 'puces', 'bullet'] },
  { type: 'numbered',  label: 'Numéro',    hint: 'Liste numérotée',           icon: ListOrdered, keywords: ['numero', 'ordered'] },
  { type: 'quote',     label: 'Citation',  hint: 'Bloc de citation',          icon: Quote,       keywords: ['quote', 'citation'] },
  { type: 'callout',   label: 'Encadré',   hint: 'Astuce ou attention',       icon: Lightbulb,   keywords: ['callout', 'encadre', 'tip'] },
  { type: 'code',      label: 'Code',      hint: 'Bloc de code monospace',    icon: Code,        keywords: ['code'] },
  { type: 'divider',   label: 'Séparateur',hint: 'Trait horizontal',          icon: Minus,       keywords: ['divider', 'hr', 'separateur'] },
  { type: 'link',      label: 'Lien',      hint: 'URL en clair',              icon: Link2,       keywords: ['link', 'url', 'lien'] },
]

function descriptorFor(b: NoteBlock): BlockTypeDescriptor {
  if (b.type === 'heading') {
    const lvl = Math.min(Math.max(b.level || 1, 1), 3)
    return BLOCK_TYPES.find((t) => t.type === 'heading' && t.level === lvl) ?? BLOCK_TYPES[1]
  }
  return BLOCK_TYPES.find((t) => t.type === b.type) ?? BLOCK_TYPES[0]
}

function makeBlockId() { return Math.random().toString(36).slice(2, 10) }

function emptyBlock(type: NoteBlockType = 'paragraph', level = 1): NoteBlock {
  return { id: makeBlockId(), type, text: '', checked: false, level, meta: {} }
}

/** Tente d'interpréter un raccourci markdown en début de ligne. */
function detectMarkdownShortcut(text: string): { match: string; type: NoteBlockType; level?: number; checked?: boolean } | null {
  const trimmed = text.replace(/ /g, ' ')
  if (trimmed === '# ')      return { match: trimmed, type: 'heading', level: 1 }
  if (trimmed === '## ')     return { match: trimmed, type: 'heading', level: 2 }
  if (trimmed === '### ')    return { match: trimmed, type: 'heading', level: 3 }
  if (trimmed === '- [] ' || trimmed === '- [ ] ' || trimmed === '[] ' || trimmed === '[ ] ') {
    return { match: trimmed, type: 'checklist', checked: false }
  }
  if (trimmed === '- [x] ' || trimmed === '[x] ') {
    return { match: trimmed, type: 'checklist', checked: true }
  }
  if (trimmed === '- ' || trimmed === '* ') return { match: trimmed, type: 'bullet' }
  if (trimmed === '1. ' || trimmed === '1) ') return { match: trimmed, type: 'numbered' }
  if (trimmed === '> ')      return { match: trimmed, type: 'quote' }
  if (trimmed === '``` ' || trimmed === '```\n') return { match: trimmed, type: 'code' }
  if (trimmed === '--- ' || trimmed === '---\n') return { match: trimmed, type: 'divider' }
  if (trimmed === '/!\\ ' || trimmed === '!! ') return { match: trimmed, type: 'callout' }
  return null
}

export function NoteEditor({ note, onChange, onDelete, templates, onApplyTemplate, backlinks }: NoteEditorProps) {
  const [slashFor, setSlashFor] = useState<{ idx: number; query: string } | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  function update(patch: Partial<EducationNote>) { onChange({ ...note, ...patch }) }
  function updateBlock(idx: number, patch: Partial<NoteBlock>) {
    const blocks = note.blocks.map((b, i) => i === idx ? { ...b, ...patch } : b)
    update({ blocks })
  }
  function setBlockType(idx: number, type: NoteBlockType, level?: number) {
    updateBlock(idx, { type, level: level ?? note.blocks[idx].level ?? 1 })
  }
  function insertBlockAfter(idx: number, type: NoteBlockType = 'paragraph', level = 1) {
    const blocks = [...note.blocks]
    const nb = emptyBlock(type, level)
    blocks.splice(idx + 1, 0, nb)
    update({ blocks })
    setTimeout(() => textareaRefs.current[nb.id]?.focus(), 0)
  }
  function removeBlock(idx: number) {
    if (note.blocks.length <= 1) {
      // Vide : on garde un bloc paragraph vide.
      update({ blocks: [emptyBlock('paragraph')] })
      return
    }
    const blocks = note.blocks.filter((_, i) => i !== idx)
    update({ blocks })
    setTimeout(() => {
      const target = blocks[Math.max(0, idx - 1)]
      if (target) textareaRefs.current[target.id]?.focus()
    }, 0)
  }
  function moveBlock(from: number, to: number) {
    if (to < 0 || to >= note.blocks.length || from === to) return
    const blocks = [...note.blocks]
    const [b] = blocks.splice(from, 1)
    blocks.splice(to, 0, b)
    update({ blocks })
  }

  function autoresize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function onBlockChange(idx: number, value: string) {
    // Markdown shortcuts uniquement quand on est à la fin et que le bloc est vide hors préfixe.
    const shortcut = detectMarkdownShortcut(value)
    if (shortcut) {
      const next: Partial<NoteBlock> = { type: shortcut.type, text: '' }
      if (shortcut.level !== undefined) next.level = shortcut.level
      if (shortcut.checked !== undefined) next.checked = shortcut.checked
      updateBlock(idx, next)
      return
    }
    updateBlock(idx, { text: value })
  }

  function onBlockKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) {
    const b = note.blocks[idx]
    // Slash menu : ouvre quand on tape `/` au début du bloc.
    if (e.key === '/' && b.text === '') {
      e.preventDefault()
      setSlashFor({ idx, query: '' })
      return
    }
    if (slashFor && slashFor.idx === idx) {
      if (e.key === 'Escape') { setSlashFor(null); return }
      if (e.key === 'Backspace' && slashFor.query === '') { setSlashFor(null); return }
      if (e.key.length === 1) {
        setSlashFor({ idx, query: slashFor.query + e.key })
        e.preventDefault()
        return
      }
      if (e.key === 'Backspace') {
        setSlashFor({ idx, query: slashFor.query.slice(0, -1) })
        e.preventDefault()
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Pour les listes / checklists, on continue le même type.
      const continueTypes: NoteBlockType[] = ['bullet', 'numbered', 'checklist']
      if (continueTypes.includes(b.type) && b.text === '') {
        // Liste vide → on bascule en paragraph et insère après.
        updateBlock(idx, { type: 'paragraph', checked: false })
        return
      }
      if (continueTypes.includes(b.type)) {
        insertBlockAfter(idx, b.type, b.level)
        return
      }
      insertBlockAfter(idx, 'paragraph')
      return
    }
    if (e.key === 'Backspace' && b.text === '') {
      e.preventDefault()
      removeBlock(idx)
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      moveBlock(idx, e.key === 'ArrowUp' ? idx - 1 : idx + 1)
      return
    }
    if (e.key === 'ArrowUp' && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault()
      const prev = note.blocks[idx - 1]
      if (prev) textareaRefs.current[prev.id]?.focus()
      return
    }
    if (e.key === 'ArrowDown' && (e.currentTarget.selectionEnd ?? 0) === b.text.length) {
      e.preventDefault()
      const next = note.blocks[idx + 1]
      if (next) textareaRefs.current[next.id]?.focus()
      return
    }
  }

  function pickFromSlash(descriptor: BlockTypeDescriptor) {
    if (!slashFor) return
    setBlockType(slashFor.idx, descriptor.type, descriptor.level)
    setSlashFor(null)
  }

  // Quand on change d'active block, on resize tous les textareas (au mount aussi).
  useEffect(() => {
    Object.values(textareaRefs.current).forEach((el) => { if (el) autoresize(el) })
  }, [note.blocks])

  const filteredSlashOptions = useMemo(() => {
    if (!slashFor) return BLOCK_TYPES
    const q = slashFor.query.toLowerCase().trim()
    if (!q) return BLOCK_TYPES
    return BLOCK_TYPES.filter((t) =>
      t.label.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.includes(q))
    )
  }, [slashFor])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="edu-note-title"
          value={note.title}
          placeholder="Sans titre"
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="edu-row" style={{ gap: 4 }}>
          {templates && templates.length > 0 && (
            <button
              className="edu-btn-icon"
              title="Insérer depuis un template"
              onClick={() => setShowTemplates((v) => !v)}
              aria-expanded={showTemplates}
            >
              <Sparkles size={16} color={showTemplates ? 'var(--primary)' : undefined} />
            </button>
          )}
          <button className="edu-btn-icon" title="Épingler" onClick={() => update({ pinned: !note.pinned })}>
            <Pin size={16} color={note.pinned ? 'var(--primary)' : undefined} />
          </button>
          <button className="edu-btn-icon" title="Archiver" onClick={() => update({ archived: !note.archived })}>
            <Archive size={16} color={note.archived ? '#F59E0B' : undefined} />
          </button>
          <button className="edu-btn-icon" title="Supprimer" onClick={onDelete}><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="edu-note-meta">Mis à jour {formatRelative(note.updatedAt)}</div>

      {showTemplates && templates && (
        <TemplatePicker
          templates={templates.filter((t) => t.kind === 'note')}
          onPick={(t) => {
            if (onApplyTemplate) onApplyTemplate(t)
            setShowTemplates(false)
          }}
        />
      )}

      {note.blocks.map((b, i) => {
        const desc = descriptorFor(b)
        const Icon = desc.icon
        return (
          <div
            key={b.id}
            className={`edu-block ${draggingIdx === i ? 'is-dragging' : ''}`}
            draggable={false}
            onDragOver={(e) => { if (draggingIdx !== null) e.preventDefault() }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggingIdx === null) return
              moveBlock(draggingIdx, i)
              setDraggingIdx(null)
            }}
          >
            <button
              className="edu-block-handle-btn"
              draggable
              onDragStart={() => setDraggingIdx(i)}
              onDragEnd={() => setDraggingIdx(null)}
              onClick={() => insertBlockAfter(i, 'paragraph')}
              title="Glisser pour réordonner, cliquer pour ajouter un bloc"
              aria-label="Réordonner le bloc"
              type="button"
            >
              <GripVertical size={14} />
            </button>
            <button
              className="edu-block-type-btn"
              type="button"
              onClick={() => {
                // Mini-cycle entre paragraph et descriptor courant pour vite changer.
                if (b.type === 'paragraph') setSlashFor({ idx: i, query: '' })
                else setBlockType(i, 'paragraph')
              }}
              title={`Type : ${desc.label} (clique pour changer)`}
            >
              <Icon size={14} />
            </button>

            {b.type === 'checklist' && (
              <input
                type="checkbox"
                className="edu-block-checkbox"
                checked={b.checked}
                onChange={(e) => updateBlock(i, { checked: e.target.checked })}
                aria-label="Cocher"
              />
            )}

            {b.type === 'divider' ? (
              <div className="edu-block-divider" aria-hidden />
            ) : (
              <div className="edu-block-input-wrap">
                <textarea
                  ref={(el) => { textareaRefs.current[b.id] = el }}
                  className={`edu-block-input ${b.type === 'heading' ? `heading-${Math.min(Math.max(b.level || 1, 1), 3)}` : b.type === 'code' ? 'code' : b.type === 'quote' ? 'quote' : b.type === 'callout' ? 'callout' : b.type === 'checklist' && b.checked ? 'checked' : ''}`}
                  value={b.text}
                  placeholder={placeholderFor(b)}
                  onChange={(e) => { onBlockChange(i, e.target.value); autoresize(e.currentTarget) }}
                  onKeyDown={(e) => onBlockKeyDown(e, i)}
                  onFocus={() => { /* No-op, but keep focus stable */ }}
                  rows={1}
                  spellCheck
                />
                {slashFor && slashFor.idx === i && (
                  <SlashMenu
                    query={slashFor.query}
                    options={filteredSlashOptions}
                    onPick={pickFromSlash}
                    onClose={() => setSlashFor(null)}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      <button className="edu-btn ghost edu-block-add" onClick={() => insertBlockAfter(note.blocks.length - 1)}>
        <Plus size={13} /> Ajouter un bloc
      </button>

      <BacklinksPanel backlinks={backlinks} />
    </div>
  )
}

function placeholderFor(b: NoteBlock): string {
  switch (b.type) {
    case 'heading':   return b.level === 1 ? 'Titre…' : b.level === 2 ? 'Sous-titre…' : 'Petit titre…'
    case 'checklist': return 'À faire…'
    case 'bullet':    return 'Élément de liste…'
    case 'numbered':  return 'Élément numéroté…'
    case 'quote':     return 'Citation…'
    case 'callout':   return 'Astuce, attention, idée…'
    case 'code':      return 'Code…'
    case 'link':      return 'URL ou texte de lien…'
    default:          return "Écris quelque chose, ou tape « / » pour les commandes…"
  }
}

interface SlashMenuProps {
  query: string
  options: BlockTypeDescriptor[]
  onPick: (d: BlockTypeDescriptor) => void
  onClose: () => void
}

function SlashMenu({ query, options, onPick, onClose }: SlashMenuProps) {
  const [active, setActive] = useState(0)
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const opt = options[active]
        if (opt) onPick(opt)
        return
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active, options, onClose, onPick])

  if (options.length === 0) {
    return (
      <div className="edu-slash-menu" role="listbox">
        <div className="edu-slash-empty">Aucun type ne correspond à « /{query} »</div>
      </div>
    )
  }
  return (
    <div className="edu-slash-menu" role="listbox" aria-label="Sélecteur de type de bloc">
      {options.map((opt, idx) => {
        const Icon = opt.icon
        return (
          <button
            key={`${opt.type}-${opt.level ?? 0}-${opt.label}`}
            className={`edu-slash-item ${idx === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(idx)}
            onClick={() => onPick(opt)}
            type="button"
          >
            <span className="edu-slash-icon"><Icon size={14} /></span>
            <span className="edu-slash-label">{opt.label}</span>
            <span className="edu-slash-hint">{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function TemplatePicker({ templates, onPick }: { templates: EducationTemplate[]; onPick: (t: EducationTemplate) => void }) {
  if (templates.length === 0) {
    return (
      <div className="edu-template-picker">
        <div className="edu-template-picker-empty">
          Aucun template de note pour l'instant. Crée-en depuis l'onglet « Templates ».
        </div>
      </div>
    )
  }
  return (
    <div className="edu-template-picker">
      <div className="edu-template-picker-head">Insérer depuis un template</div>
      {templates.map((t) => (
        <button key={t._id} className="edu-template-picker-item" onClick={() => onPick(t)} type="button">
          <span className="edu-template-picker-name">{t.name}</span>
          {t.description && <span className="edu-template-picker-desc">{t.description}</span>}
        </button>
      ))}
    </div>
  )
}

function BacklinksPanel({ backlinks }: { backlinks?: BacklinkEntry[] }) {
  const [open, setOpen] = useState(false)
  const list = useMemo(() => backlinks ?? [], [backlinks])
  if (list.length === 0) return null
  return (
    <div className="edu-backlinks">
      <button
        type="button"
        className="edu-backlinks-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight size={12} className={`edu-backlinks-caret ${open ? 'open' : ''}`} />
        <FileText size={12} />
        {list.length} lien{list.length > 1 ? 's' : ''} dans cette note
      </button>
      {open && (
        <div className="edu-backlinks-list">
          {list.map((b) => (
            <button
              key={`${b.type}-${b.refId}`}
              type="button"
              className="edu-backlinks-item"
              onClick={b.onOpen}
              disabled={!b.onOpen}
            >
              <span className="edu-backlinks-kind">{kindLabel(b.type)}</span>
              <span className="edu-backlinks-label">{b.label}</span>
              {b.meta && <span className="edu-backlinks-meta">{b.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function kindLabel(t: NoteLinkType): string {
  switch (t) {
    case 'class':      return 'Classe'
    case 'session':    return 'Séance'
    case 'assignment': return 'Devoir'
    case 'student':    return 'Étudiant'
  }
}

/* Petit utilitaire callback pour évite de garder un closure stale dans les setTimeout. */
export function useStableCallback<T extends (...args: never[]) => unknown>(cb: T): T {
  const ref = useRef(cb)
  useEffect(() => { ref.current = cb })
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, [])
}

export { makeBlockId, emptyBlock }
