import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch, type SearchResult } from '../../services/search'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import '../../styles/search-modal.css'

const TYPE_ICONS: Record<string, string> = {
  project: '\u{1F4C1}',
  client: '\u{1F464}',
  task: '\u{2705}',
  lead: '\u{1F525}',
}

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  project: 'compB.search.typeProject',
  client: 'compB.search.typeClient',
  task: 'compB.search.typeTask',
  lead: 'compB.search.typeLead',
}

export default function SearchModal() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await globalSearch(q)
      setResults(data)
      setSelectedIndex(0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 250)
  }

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    navigate(result.link)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div className="search-overlay" onClick={() => setOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrapper">
          <svg className="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder={t('compB.search.placeholder')}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <kbd className="search-kbd">Esc</kbd>
        </div>

        {loading && <div className="search-loading">{t('compB.search.loading')}</div>}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="search-empty">{t('compB.search.noResult', { query })}</div>
        )}

        {results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                className={`search-result-item ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="search-result-icon">{TYPE_ICONS[r.type] || '\u{1F4CC}'}</span>
                <div className="search-result-text">
                  <span className="search-result-title">{r.title}</span>
                  <span className="search-result-subtitle">{r.subtitle}</span>
                </div>
                <span className="search-result-type">
                  {TYPE_LABEL_KEYS[r.type] ? t(TYPE_LABEL_KEYS[r.type]) : r.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {query.length < 2 && !loading && (
          <div className="search-hints">
            <p>{t('compB.search.minChars')}</p>
            <div className="search-hints-shortcuts">
              <span>
                <kbd>{'\u2191'}</kbd>
                <kbd>{'\u2193'}</kbd> {t('compB.search.navigate')}
              </span>
              <span>
                <kbd>{'\u21B5'}</kbd> {t('compB.search.select')}
              </span>
              <span>
                <kbd>Esc</kbd> {t('common.close')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
