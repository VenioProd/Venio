import { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Search, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import { getCommandPaletteItems, type AdminCommandPaletteItem } from '../lib/adminNavigation'
import './AdminCommandPalette.css'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')

interface AdminCommandPaletteProps {
  onClose: () => void
}

export default function AdminCommandPalette({ onClose }: AdminCommandPaletteProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    const normalizedQuery = normalize(query.trim())
    return getCommandPaletteItems(user).filter(
      (item) => !normalizedQuery || normalize(item.label).includes(normalizedQuery),
    )
  }, [query, user])

  useEffect(() => {
    const activeItem = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (typeof activeItem?.scrollIntoView === 'function') activeItem.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const select = (item: AdminCommandPaletteItem) => {
    trackAdminEvent('admin_palette_selected', item.id)
    onClose()
    navigate(item.to)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (items.length ? (index + 1) % items.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (items.length ? (index - 1 + items.length) % items.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[Math.min(activeIndex, Math.max(items.length - 1, 0))]
      if (item) select(item)
    }
  }

  return (
    <div className="admin-command-palette-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="admin-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="admin-command-palette__search">
          <Search size={18} aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder="Rechercher un module ou une action"
            aria-label="Rechercher un module ou une action"
          />
          <kbd>Échap</kbd>
        </div>
        <div className="admin-command-palette__results" ref={listRef} role="listbox" aria-label="Résultats">
          {items.length === 0 ? (
            <p className="admin-command-palette__empty">Aucun module ou action autorisé ne correspond.</p>
          ) : (
            items.map((item, index) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex}
                className={`admin-command-palette__item${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(item)}
              >
                {item.kind === 'action' ? <Zap size={16} aria-hidden /> : <Command size={16} aria-hidden />}
                <span>{item.label}</span>
                <small>{item.kind === 'action' ? 'Action' : item.zone}</small>
              </button>
            ))
          )}
        </div>
        <footer className="admin-command-palette__footer">↑↓ naviguer · Entrée ouvrir · Échap fermer</footer>
      </section>
    </div>
  )
}
