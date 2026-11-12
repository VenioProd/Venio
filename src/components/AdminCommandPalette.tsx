import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Command, Search, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import { getCommandPaletteItems, getZoneLabel, type AdminCommandPaletteItem } from '../lib/adminNavigation'
import { useI18n } from '../context/I18nContext'
import { intlLocale } from '../i18n'
import { useModalA11y } from '../hooks/useModalA11y'
import { globalSearch, type SearchResult } from '../services/search'
import SearchModal from './admin/SearchModal'
import './AdminCommandPalette.css'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(intlLocale())

interface AdminCommandPaletteProps {
  onClose: () => void
}

export default function AdminCommandPalette({ onClose }: AdminCommandPaletteProps) {
  const { user } = useAuth()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useModalA11y(true, dialogRef, inputRef)

  const items = useMemo(() => {
    const normalizedQuery = normalize(query.trim())
    return getCommandPaletteItems(user).filter(
      (item) => !normalizedQuery || normalize(item.label).includes(normalizedQuery),
    )
  }, [query, user, locale])

  useEffect(() => {
    let cancelled = false
    setResults([])
    setSearchError(false)
    setLoading(false)
    if (query.trim().length < 2) return
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await globalSearch(query.trim())
        if (!cancelled) setResults(data)
      } catch {
        if (!cancelled) setSearchError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const count = items.length + results.length

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
      setActiveIndex((index) => (count ? (index + 1) % count : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (count ? (index - 1 + count) % count : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const index = Math.min(activeIndex, Math.max(count - 1, 0))
      const item = items[index]
      if (item) select(item)
      else {
        const result = results[index - items.length]
        if (result) {
          onClose()
          navigate(result.link)
        }
      }
    }
  }

  return createPortal(
    <div className="admin-command-palette-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="admin-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.palette.quickSearch')}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="admin-command-palette__search">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={t('shell.palette.placeholder')}
            aria-label={t('shell.palette.placeholder')}
          />
          <kbd>{t('shell.palette.escKey')}</kbd>
        </div>
        <div
          className="admin-command-palette__results"
          ref={listRef}
          role="listbox"
          aria-label={t('shell.palette.results')}
        >
          {count === 0 && !loading && !searchError ? (
            <p className="admin-command-palette__empty">{t('shell.palette.empty')}</p>
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
                onFocus={() => setActiveIndex(index)}
                onClick={() => select(item)}
              >
                {item.kind === 'action' ? <Zap size={16} aria-hidden /> : <Command size={16} aria-hidden />}
                <span>{item.label}</span>
                <small>{item.kind === 'action' ? t('shell.palette.actionBadge') : getZoneLabel(item.zone)}</small>
              </button>
            ))
          )}
          <SearchModal
            results={results}
            activeIndex={activeIndex - items.length}
            onActiveIndex={(index) => setActiveIndex(items.length + index)}
            onSelect={onClose}
          />
        </div>
        {loading && (
          <p role="status" className="admin-command-palette__empty">
            {t('shell.palette.loading')}
          </p>
        )}
        {searchError && (
          <p role="alert" className="admin-command-palette__empty">
            {t('shell.palette.searchError')}
          </p>
        )}
        <footer className="admin-command-palette__footer">{t('shell.palette.footerHint')}</footer>
      </section>
    </div>,
    document.body,
  )
}
