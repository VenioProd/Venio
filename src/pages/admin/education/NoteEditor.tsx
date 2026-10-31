import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pin,
  Archive,
  Trash2,
  Plus,
  GripVertical,
  Type,
  Heading1,
  Heading2,
  Heading3,
  ListChecks,
  List,
  ListOrdered,
  Quote,
  Code,
  Lightbulb,
  Minus,
  Link2,
  FileText,
  ChevronRight,
  Sparkles,
  AtSign,
} from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import { formatRelativeDate } from './eduFormat'
import {
  searchEducation,
  studentDisplayName,
  type EducationNote,
  type NoteBlock,
  type NoteBlockType,
  type NoteLinkType,
  type EducationTemplate,
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
  /** Masque l'en-tête interne (titre/épingle/archive) — utile quand la page
   *  parente fournit déjà son propre titre (ex. page de classe). */
  hideHeader?: boolean
  /** Crée une sous-page enfant et renvoie sa référence (arborescence). */
  onCreateSubpage?: () => Promise<{ id: string; title: string; emoji?: string } | null>
  /** Ouvre une sous-page existante (navigation dans l'arbre). */
  onOpenSubpage?: (childId: string) => void
  /** Ouvre l'entité référencée par une mention (étudiant/séance/devoir/classe). */
  onOpenMention?: (refType: NoteLinkType, refId: string) => void
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
  labelKey: MessageKey
  hintKey: MessageKey
  icon: typeof Type
  keywords: string[]
  level?: number
}

const BLOCK_TYPES: BlockTypeDescriptor[] = [
  {
    type: 'paragraph',
    labelKey: 'eduA.note.block.paragraph',
    hintKey: 'eduA.note.block.paragraphHint',
    icon: Type,
    keywords: ['p', 'texte', 'paragraph'],
  },
  {
    type: 'heading',
    labelKey: 'eduA.note.block.h1',
    hintKey: 'eduA.note.block.h1Hint',
    icon: Heading1,
    keywords: ['h1', 'titre'],
    level: 1,
  },
  {
    type: 'heading',
    labelKey: 'eduA.note.block.h2',
    hintKey: 'eduA.note.block.h2Hint',
    icon: Heading2,
    keywords: ['h2', 'sous-titre'],
    level: 2,
  },
  {
    type: 'heading',
    labelKey: 'eduA.note.block.h3',
    hintKey: 'eduA.note.block.h3Hint',
    icon: Heading3,
    keywords: ['h3'],
    level: 3,
  },
  {
    type: 'checklist',
    labelKey: 'eduA.note.block.checklist',
    hintKey: 'eduA.note.block.checklistHint',
    icon: ListChecks,
    keywords: ['todo', 'tache', 'check', 'cocher'],
  },
  {
    type: 'bullet',
    labelKey: 'eduA.note.block.bullet',
    hintKey: 'eduA.note.block.bulletHint',
    icon: List,
    keywords: ['liste', 'puces', 'bullet'],
  },
  {
    type: 'numbered',
    labelKey: 'eduA.note.block.numbered',
    hintKey: 'eduA.note.block.numberedHint',
    icon: ListOrdered,
    keywords: ['numero', 'ordered'],
  },
  {
    type: 'quote',
    labelKey: 'eduA.note.block.quote',
    hintKey: 'eduA.note.block.quoteHint',
    icon: Quote,
    keywords: ['quote', 'citation'],
  },
  {
    type: 'callout',
    labelKey: 'eduA.note.block.callout',
    hintKey: 'eduA.note.block.calloutHint',
    icon: Lightbulb,
    keywords: ['callout', 'encadre', 'tip'],
  },
  {
    type: 'code',
    labelKey: 'eduA.note.block.code',
    hintKey: 'eduA.note.block.codeHint',
    icon: Code,
    keywords: ['code'],
  },
  {
    type: 'divider',
    labelKey: 'eduA.note.block.divider',
    hintKey: 'eduA.note.block.dividerHint',
    icon: Minus,
    keywords: ['divider', 'hr', 'separateur'],
  },
  {
    type: 'link',
    labelKey: 'eduA.note.block.link',
    hintKey: 'eduA.note.block.linkHint',
    icon: Link2,
    keywords: ['link', 'url', 'lien'],
  },
  {
    type: 'subpage',
    labelKey: 'eduA.note.block.subpage',
    hintKey: 'eduA.note.block.subpageHint',
    icon: FileText,
    keywords: ['page', 'sous-page', 'subpage', 'enfant'],
  },
  {
    type: 'mention',
    labelKey: 'eduA.note.block.mention',
    hintKey: 'eduA.note.block.mentionHint',
    icon: AtSign,
    keywords: ['mention', 'lien', 'reference', 'arobase', '@'],
  },
]

/** Libellé enregistré dans `meta.kind` du bloc (donnée stockée) ; l'affichage passe par `mentionKindText`. */
const STORED_MENTION_KIND: Record<NoteLinkType, string> = {
  // i18n-ignore: valeurs stockées dans le bloc
  student: 'Étudiant',
  // i18n-ignore: valeurs stockées dans le bloc
  session: 'Séance',
  // i18n-ignore: valeurs stockées dans le bloc
  assignment: 'Devoir',
  // i18n-ignore: valeurs stockées dans le bloc
  class: 'Classe',
}

export interface MentionOption {
  refType: NoteLinkType
  refId: string
  label: string
  kind: string
}

function descriptorFor(b: NoteBlock): BlockTypeDescriptor {
  if (b.type === 'heading') {
    const lvl = Math.min(Math.max(b.level || 1, 1), 3)
    return BLOCK_TYPES.find((t) => t.type === 'heading' && t.level === lvl) ?? BLOCK_TYPES[1]
  }
  return BLOCK_TYPES.find((t) => t.type === b.type) ?? BLOCK_TYPES[0]
}

function makeBlockId() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyBlock(type: NoteBlockType = 'paragraph', level = 1): NoteBlock {
  return { id: makeBlockId(), type, text: '', checked: false, level, meta: {} }
}

/** Tente d'interpréter un raccourci markdown en début de ligne. */
function detectMarkdownShortcut(
  text: string,
): { match: string; type: NoteBlockType; level?: number; checked?: boolean } | null {
  const trimmed = text.replace(/ /g, ' ')
  if (trimmed === '# ') return { match: trimmed, type: 'heading', level: 1 }
  if (trimmed === '## ') return { match: trimmed, type: 'heading', level: 2 }
  if (trimmed === '### ') return { match: trimmed, type: 'heading', level: 3 }
  if (trimmed === '- [] ' || trimmed === '- [ ] ' || trimmed === '[] ' || trimmed === '[ ] ') {
    return { match: trimmed, type: 'checklist', checked: false }
  }
  if (trimmed === '- [x] ' || trimmed === '[x] ') {
    return { match: trimmed, type: 'checklist', checked: true }
  }
  if (trimmed === '- ' || trimmed === '* ') return { match: trimmed, type: 'bullet' }
  if (trimmed === '1. ' || trimmed === '1) ') return { match: trimmed, type: 'numbered' }
  if (trimmed === '> ') return { match: trimmed, type: 'quote' }
  if (trimmed === '``` ' || trimmed === '```\n') return { match: trimmed, type: 'code' }
  if (trimmed === '--- ' || trimmed === '---\n') return { match: trimmed, type: 'divider' }
  if (trimmed === '/!\\ ' || trimmed === '!! ') return { match: trimmed, type: 'callout' }
  return null
}

export function NoteEditor({
  note,
  onChange,
  onDelete,
  templates,
  onApplyTemplate,
  backlinks,
  hideHeader,
  onCreateSubpage,
  onOpenSubpage,
  onOpenMention,
}: NoteEditorProps) {
  const { t } = useI18n()
  const [slashFor, setSlashFor] = useState<{ idx: number; query: string } | null>(null)
  const [mentionFor, setMentionFor] = useState<{ idx: number } | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  function pickMention(idx: number, opt: MentionOption) {
    updateBlock(idx, {
      type: 'mention',
      text: opt.label,
      meta: { refType: opt.refType, refId: opt.refId, label: opt.label, kind: opt.kind },
    })
    setMentionFor(null)
  }

  function update(patch: Partial<EducationNote>) {
    onChange({ ...note, ...patch })
  }
  function updateBlock(idx: number, patch: Partial<NoteBlock>) {
    const blocks = note.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b))
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
    // Mention : `@` au début d'un bloc vide ouvre le sélecteur d'entité.
    if (e.key === '@' && b.text === '') {
      e.preventDefault()
      setMentionFor({ idx })
      return
    }
    if (slashFor && slashFor.idx === idx) {
      if (e.key === 'Escape') {
        setSlashFor(null)
        return
      }
      if (e.key === 'Backspace' && slashFor.query === '') {
        setSlashFor(null)
        return
      }
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

  async function pickFromSlash(descriptor: BlockTypeDescriptor) {
    if (!slashFor) return
    const idx = slashFor.idx
    setSlashFor(null)
    // Sous-page : on crée la page enfant à la volée et on transforme le bloc
    // en carte de lien (non éditable comme un textarea).
    if (descriptor.type === 'subpage') {
      if (!onCreateSubpage) return
      const child = await onCreateSubpage()
      if (!child) return
      updateBlock(idx, {
        type: 'subpage',
        text: child.title,
        meta: { childId: child.id, label: child.title, emoji: child.emoji || '' },
      })
      return
    }
    // Mention : on n'écrit pas le bloc tout de suite, on ouvre le sélecteur.
    if (descriptor.type === 'mention') {
      setMentionFor({ idx })
      return
    }
    setBlockType(idx, descriptor.type, descriptor.level)
  }

  // Quand on change d'active block, on resize tous les textareas (au mount aussi).
  useEffect(() => {
    Object.values(textareaRefs.current).forEach((el) => {
      if (el) autoresize(el)
    })
  }, [note.blocks])

  const filteredSlashOptions = useMemo(() => {
    if (!slashFor) return BLOCK_TYPES
    const q = slashFor.query.toLowerCase().trim()
    if (!q) return BLOCK_TYPES
    return BLOCK_TYPES.filter(
      (bt) => t(bt.labelKey).toLowerCase().includes(q) || bt.keywords.some((k) => k.includes(q)),
    )
  }, [slashFor, t])

  return (
    <div>
      {!hideHeader && (
        <>
          <div className="edu-row between" style={{ marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <input
              className="edu-note-title"
              value={note.title}
              placeholder={t('eduA.note.untitled')}
              onChange={(e) => update({ title: e.target.value })}
            />
            <div className="edu-row" style={{ gap: 4 }}>
              {templates && templates.length > 0 && (
                <button
                  className="edu-btn-icon"
                  title={t('eduA.note.insertTemplate')}
                  onClick={() => setShowTemplates((v) => !v)}
                  aria-expanded={showTemplates}
                >
                  <Sparkles size={16} color={showTemplates ? 'var(--primary)' : undefined} />
                </button>
              )}
              <button
                className="edu-btn-icon"
                title={t('eduA.note.pin')}
                onClick={() => update({ pinned: !note.pinned })}
              >
                <Pin size={16} color={note.pinned ? 'var(--primary)' : undefined} />
              </button>
              <button
                className="edu-btn-icon"
                title={t('eduA.note.archive')}
                onClick={() => update({ archived: !note.archived })}
              >
                <Archive size={16} color={note.archived ? '#F59E0B' : undefined} />
              </button>
              <button className="edu-btn-icon" title={t('common.delete')} onClick={onDelete}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div className="edu-note-meta">{t('eduA.note.updated', { when: formatRelativeDate(note.updatedAt) })}</div>
        </>
      )}

      {/* Le bouton « template » reste accessible même en-tête masqué. */}
      {hideHeader && templates && templates.length > 0 && (
        <div className="edu-row" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            className="edu-btn-icon"
            title={t('eduA.note.insertTemplate')}
            onClick={() => setShowTemplates((v) => !v)}
            aria-expanded={showTemplates}
          >
            <Sparkles size={16} color={showTemplates ? 'var(--primary)' : undefined} />
          </button>
        </div>
      )}

      {showTemplates && templates && (
        <TemplatePicker
          templates={templates.filter((tpl) => tpl.kind === 'note')}
          onPick={(tpl) => {
            if (onApplyTemplate) onApplyTemplate(tpl)
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
            onDragOver={(e) => {
              if (draggingIdx !== null) e.preventDefault()
            }}
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
              title={t('eduA.note.dragHint')}
              aria-label={t('eduA.note.reorder')}
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
              title={t('eduA.note.typeTitle', { label: t(desc.labelKey) })}
            >
              <Icon size={14} />
            </button>

            {b.type === 'checklist' && (
              <input
                type="checkbox"
                className="edu-block-checkbox"
                checked={b.checked}
                onChange={(e) => updateBlock(i, { checked: e.target.checked })}
                aria-label={t('eduA.note.check')}
              />
            )}

            {b.type === 'divider' ? (
              <div className="edu-block-divider" aria-hidden />
            ) : b.type === 'subpage' ? (
              <button
                type="button"
                className="edu-block-subpage"
                onClick={() => {
                  const cid = b.meta?.childId
                  if (cid && onOpenSubpage) onOpenSubpage(String(cid))
                }}
                title={t('eduA.note.openSubpage')}
              >
                <span className="edu-block-subpage-icon">
                  {b.meta?.emoji ? String(b.meta.emoji) : <FileText size={15} />}
                </span>
                <span className="edu-block-subpage-title">
                  {String(b.meta?.label || b.text || t('eduA.note.untitled'))}
                </span>
                <ChevronRight size={14} className="edu-block-subpage-caret" />
              </button>
            ) : b.type === 'mention' ? (
              <button
                type="button"
                className="edu-block-mention"
                onClick={() => {
                  const rt = b.meta?.refType
                  const ri = b.meta?.refId
                  if (rt && ri && onOpenMention) onOpenMention(String(rt) as NoteLinkType, String(ri))
                }}
                title={t('eduA.note.openReference')}
              >
                <AtSign size={13} className="edu-block-mention-icon" />
                {b.meta?.kind ? (
                  <span className="edu-block-mention-kind">{mentionKindText(b.meta.refType, String(b.meta.kind))}</span>
                ) : null}
                <span className="edu-block-mention-label">
                  {String(b.meta?.label || b.text || t('eduA.note.reference'))}
                </span>
              </button>
            ) : (
              <div className="edu-block-input-wrap">
                <textarea
                  ref={(el) => {
                    textareaRefs.current[b.id] = el
                  }}
                  className={`edu-block-input ${b.type === 'heading' ? `heading-${Math.min(Math.max(b.level || 1, 1), 3)}` : b.type === 'code' ? 'code' : b.type === 'quote' ? 'quote' : b.type === 'callout' ? 'callout' : b.type === 'checklist' && b.checked ? 'checked' : ''}`}
                  value={b.text}
                  placeholder={placeholderFor(b)}
                  onChange={(e) => {
                    onBlockChange(i, e.target.value)
                    autoresize(e.currentTarget)
                  }}
                  onKeyDown={(e) => onBlockKeyDown(e, i)}
                  onFocus={() => {
                    /* No-op, but keep focus stable */
                  }}
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
                {mentionFor && mentionFor.idx === i && (
                  <MentionMenu onPick={(opt) => pickMention(i, opt)} onClose={() => setMentionFor(null)} />
                )}
              </div>
            )}
          </div>
        )
      })}

      <button className="edu-btn ghost edu-block-add" onClick={() => insertBlockAfter(note.blocks.length - 1)}>
        <Plus size={13} /> {t('eduA.note.addBlock')}
      </button>

      <BacklinksPanel backlinks={backlinks} />
    </div>
  )
}

function placeholderFor(b: NoteBlock): string {
  switch (b.type) {
    case 'heading':
      return b.level === 1
        ? translate('eduA.note.placeholder.h1')
        : b.level === 2
          ? translate('eduA.note.placeholder.h2')
          : translate('eduA.note.placeholder.h3')
    case 'checklist':
      return translate('eduA.note.placeholder.checklist')
    case 'bullet':
      return translate('eduA.note.placeholder.bullet')
    case 'numbered':
      return translate('eduA.note.placeholder.numbered')
    case 'quote':
      return translate('eduA.note.placeholder.quote')
    case 'callout':
      return translate('eduA.note.placeholder.callout')
    case 'code':
      return translate('eduA.note.placeholder.code')
    case 'link':
      return translate('eduA.note.placeholder.link')
    default:
      return translate('eduA.note.placeholder.default')
  }
}

interface SlashMenuProps {
  query: string
  options: BlockTypeDescriptor[]
  onPick: (d: BlockTypeDescriptor) => void
  onClose: () => void
}

function SlashMenu({ query, options, onPick, onClose }: SlashMenuProps) {
  const { t } = useI18n()
  const [active, setActive] = useState(0)
  useEffect(() => {
    setActive(0)
  }, [query])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const opt = options[active]
        if (opt) onPick(opt)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, options.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        return
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active, options, onClose, onPick])

  if (options.length === 0) {
    return (
      <div className="edu-slash-menu" role="listbox">
        <div className="edu-slash-empty">{t('eduA.note.slashEmpty', { query })}</div>
      </div>
    )
  }
  return (
    <div className="edu-slash-menu" role="listbox" aria-label={t('eduA.note.slashAria')}>
      {options.map((opt, idx) => {
        const Icon = opt.icon
        return (
          <button
            key={`${opt.type}-${opt.level ?? 0}-${opt.labelKey}`}
            className={`edu-slash-item ${idx === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(idx)}
            onClick={() => onPick(opt)}
            type="button"
          >
            <span className="edu-slash-icon">
              <Icon size={14} />
            </span>
            <span className="edu-slash-label">{t(opt.labelKey)}</span>
            <span className="edu-slash-hint">{t(opt.hintKey)}</span>
          </button>
        )
      })}
    </div>
  )
}

interface MentionMenuProps {
  onPick: (opt: MentionOption) => void
  onClose: () => void
}

function MentionMenu({ onPick, onClose }: MentionMenuProps) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MentionOption[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await searchEducation(query)
        if (cancelled) return
        const opts: MentionOption[] = [
          ...r.results.students.slice(0, 5).map((s) => ({
            refType: 'student' as NoteLinkType,
            refId: s._id,
            label: studentDisplayName(s),
            kind: STORED_MENTION_KIND.student,
          })),
          ...r.results.sessions.slice(0, 5).map((s) => ({
            refType: 'session' as NoteLinkType,
            refId: s._id,
            label: s.title,
            kind: STORED_MENTION_KIND.session,
          })),
          ...r.results.assignments.slice(0, 5).map((a) => ({
            refType: 'assignment' as NoteLinkType,
            refId: a._id,
            label: a.title,
            kind: STORED_MENTION_KIND.assignment,
          })),
          ...r.results.classes.slice(0, 5).map((c) => ({
            refType: 'class' as NoteLinkType,
            refId: c._id,
            label: c.name,
            kind: STORED_MENTION_KIND.class,
          })),
        ]
        setResults(opts)
        setActive(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = results[active]
      if (opt) onPick(opt)
      return
    }
  }

  return (
    <div className="edu-slash-menu edu-mention-menu" role="dialog" aria-label={t('eduA.note.mentionAria')}>
      <input
        ref={inputRef}
        className="edu-mention-input"
        value={q}
        placeholder={t('eduA.note.mentionPlaceholder')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          /* fermeture via Échap/clic ; on garde au blur pour laisser cliquer une option */
        }}
      />
      {q.trim().length < 1 ? (
        <div className="edu-slash-empty">{t('eduA.note.mentionTyping')}</div>
      ) : loading ? (
        <div className="edu-slash-empty">{t('eduA.note.mentionSearching')}</div>
      ) : results.length === 0 ? (
        <div className="edu-slash-empty">{t('eduA.note.mentionNoResult', { query: q.trim() })}</div>
      ) : (
        results.map((opt, idx) => (
          <button
            key={`${opt.refType}-${opt.refId}`}
            className={`edu-slash-item ${idx === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(idx)}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(opt)
            }}
            type="button"
          >
            <span className="edu-mention-kind">{mentionKindText(opt.refType, opt.kind)}</span>
            <span className="edu-slash-label" style={{ fontWeight: 500 }}>
              {opt.label}
            </span>
          </button>
        ))
      )}
    </div>
  )
}

function TemplatePicker({
  templates,
  onPick,
}: {
  templates: EducationTemplate[]
  onPick: (tpl: EducationTemplate) => void
}) {
  const { t } = useI18n()
  if (templates.length === 0) {
    return (
      <div className="edu-template-picker">
        <div className="edu-template-picker-empty">{t('eduA.note.pickerEmpty')}</div>
      </div>
    )
  }
  return (
    <div className="edu-template-picker">
      <div className="edu-template-picker-head">{t('eduA.note.insertTemplate')}</div>
      {templates.map((tpl) => (
        <button key={tpl._id} className="edu-template-picker-item" onClick={() => onPick(tpl)} type="button">
          <span className="edu-template-picker-name">{tpl.name}</span>
          {tpl.description && <span className="edu-template-picker-desc">{tpl.description}</span>}
        </button>
      ))}
    </div>
  )
}

function BacklinksPanel({ backlinks }: { backlinks?: BacklinkEntry[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const list = useMemo(() => backlinks ?? [], [backlinks])
  if (list.length === 0) return null
  return (
    <div className="edu-backlinks">
      <button type="button" className="edu-backlinks-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronRight size={12} className={`edu-backlinks-caret ${open ? 'open' : ''}`} />
        <FileText size={12} />
        {t('eduA.note.backlinks', { count: list.length })}
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
    case 'class':
      return translate('eduA.note.kind.class')
    case 'session':
      return translate('eduA.note.kind.session')
    case 'assignment':
      return translate('eduA.note.kind.assignment')
    case 'student':
      return translate('eduA.note.kind.student')
  }
}

/** Libellé affiché d'une mention : suit la langue active, sinon retombe sur le libellé stocké. */
function mentionKindText(refType: unknown, stored: string): string {
  return refType === 'class' || refType === 'session' || refType === 'assignment' || refType === 'student'
    ? kindLabel(refType)
    : stored
}

/* Petit utilitaire callback pour évite de garder un closure stale dans les setTimeout. */
export function useStableCallback<T extends (...args: never[]) => unknown>(cb: T): T {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, [])
}

export { makeBlockId, emptyBlock }
