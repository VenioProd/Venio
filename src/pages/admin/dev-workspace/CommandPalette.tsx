import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, LayoutGrid, Plus, Search, Sun, Target } from 'lucide-react'
import type { DevIssue, DevProject } from '../../../services/dev'
import './CommandPalette.css'

// Normalisation insensible à la casse et aux accents pour le filtrage client.
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

type PaletteAction = {
  id: string
  label: string
  icon: React.ReactNode
  run: () => void
}

type PaletteItem = { kind: 'action'; action: PaletteAction } | { kind: 'issue'; issue: DevIssue }

interface CommandPaletteProps {
  issues: DevIssue[]
  projects: DevProject[]
  canCreate: boolean
  onClose: () => void
  onSelectIssue: (issue: DevIssue) => void
  onNewIssue: () => void
  onOpenReviewQueue: () => void
  onToggleViewMode: () => void
  onShowToday: () => void
  onOpenCockpit: (projectId: string) => void
}

/**
 * Palette de commandes ⌘K (A6) : actions rapides + recherche dans les issues
 * déjà chargées. Pattern inspiré du SearchModal éducation (overlay + autofocus
 * + navigation clavier ↑↓/Enter/Escape).
 */
const CommandPalette = ({
  issues,
  projects,
  canCreate,
  onClose,
  onSelectIssue,
  onNewIssue,
  onOpenReviewQueue,
  onToggleViewMode,
  onShowToday,
  onOpenCockpit,
}: CommandPaletteProps) => {
  const [q, setQ] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = []
    if (canCreate) {
      base.push({ id: 'new-issue', label: 'Nouvelle issue', icon: <Plus size={13} />, run: onNewIssue })
    }
    base.push(
      { id: 'review-queue', label: 'File de revue', icon: <Check size={13} />, run: onOpenReviewQueue },
      { id: 'toggle-view', label: 'Basculer liste/kanban', icon: <LayoutGrid size={13} />, run: onToggleViewMode },
      { id: 'today', label: 'Ma journée', icon: <Sun size={13} />, run: onShowToday },
      ...projects.map((p) => ({
        id: `cockpit-${p._id}`,
        label: `Cockpit ${p.key}`,
        icon: <Target size={13} />,
        run: () => onOpenCockpit(p._id),
      })),
    )
    return base
  }, [canCreate, projects, onNewIssue, onOpenReviewQueue, onToggleViewMode, onShowToday, onOpenCockpit])

  // Liste plate des items affichés : actions matchantes puis issues (max 8).
  const items = useMemo<PaletteItem[]>(() => {
    const nq = norm(q.trim())
    const matchedActions = nq ? actions.filter((a) => norm(a.label).includes(nq)) : actions
    const matchedIssues = nq
      ? issues.filter((i) => norm(i.title).includes(nq) || norm(i.identifier).includes(nq)).slice(0, 8)
      : []
    return [
      ...matchedActions.map((action): PaletteItem => ({ kind: 'action', action })),
      ...matchedIssues.map((issue): PaletteItem => ({ kind: 'issue', issue })),
    ]
  }, [q, actions, issues])

  const execute = (item: PaletteItem) => {
    onClose()
    if (item.kind === 'action') item.action.run()
    else onSelectIssue(item.issue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) execute(item)
    }
  }

  // Garde l'item actif visible lors de la navigation clavier.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const firstIssueIndex = items.findIndex((it) => it.kind === 'issue')

  return (
    <>
      <div className="dev-cmdk-backdrop" onClick={onClose} />
      <div className="dev-cmdk" role="dialog" aria-label="Palette de commandes" onKeyDown={handleKeyDown}>
        <div className="dev-cmdk-input-row">
          <Search size={14} />
          <input
            autoFocus
            className="dev-cmdk-input"
            placeholder="Action ou issue… (↑↓ pour naviguer, Enter pour ouvrir)"
            value={q}
            onChange={(e) => {
              // Reset de la sélection quand la requête change.
              setQ(e.target.value)
              setActiveIndex(0)
            }}
          />
          <kbd className="dev-cmdk-kbd">Esc</kbd>
        </div>
        <div className="dev-cmdk-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="dev-cmdk-empty">Aucun résultat pour « {q} »</div>
          ) : (
            items.map((item, idx) => (
              <div key={item.kind === 'action' ? item.action.id : item.issue._id}>
                {idx === 0 && item.kind === 'action' && <div className="dev-cmdk-section">Actions</div>}
                {idx === firstIssueIndex && item.kind === 'issue' && <div className="dev-cmdk-section">Issues</div>}
                <button
                  type="button"
                  className={'dev-cmdk-item' + (idx === activeIndex ? ' active' : '')}
                  data-active={idx === activeIndex}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => execute(item)}
                >
                  {item.kind === 'action' ? (
                    <>
                      <span className="dev-cmdk-item-icon">{item.action.icon}</span>
                      <span className="dev-cmdk-item-label">{item.action.label}</span>
                    </>
                  ) : (
                    <>
                      <span className="dev-cmdk-item-id">{item.issue.identifier}</span>
                      <span className="dev-cmdk-item-label">{item.issue.title}</span>
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

export default CommandPalette
