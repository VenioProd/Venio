import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Pause, RotateCcw, Target, Plus, X } from 'lucide-react'
import { saveLayout, getLayout } from '../../../../services/workspace'
import type { Shortcut } from '../../../../types/workspace.types'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'
import { formatDate, formatTime } from '../../../../i18n/format'

const QUOTE_KEYS: MessageKey[] = [
  'adminAccess.widgets.quote1',
  'adminAccess.widgets.quote2',
  'adminAccess.widgets.quote3',
]

export function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="widget widget--center">
      <div data-testid="clock-time" className="clock-time">
        {formatTime(now, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="clock-date">{formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  )
}

export function PomodoroWidget() {
  const { t } = useI18n()
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    } else if (ref.current) {
      clearInterval(ref.current)
    }
    return () => {
      if (ref.current) clearInterval(ref.current)
    }
  }, [running])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return (
    <div className="widget widget--center">
      <div className="widget-title">{t('adminAccess.widgets.focus')}</div>
      <div className="pomodoro-time">
        {mm}:{ss}
      </div>
      <div className="pomodoro-actions">
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? t('adminAccess.widgets.pause') : t('adminAccess.widgets.start')}
        >
          {running ? <Pause size={16} /> : <Play size={16} />}{' '}
          {running ? t('adminAccess.widgets.pause') : t('adminAccess.widgets.start')}
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setSeconds(25 * 60)
          }}
          aria-label={t('adminAccess.widgets.reset')}
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}

export function GoalWidget() {
  const { t } = useI18n()
  const [goal, setGoal] = useState('')
  const quote = t(QUOTE_KEYS[new Date().getDate() % QUOTE_KEYS.length]!)
  const save = (text: string) => {
    saveLayout({ dailyGoal: { text, date: new Date().toISOString() } }).catch(() => {})
  }
  useEffect(() => {
    let cancelled = false
    getLayout()
      .then((layout) => {
        if (!cancelled && layout?.dailyGoal?.text) setGoal(layout.dailyGoal.text)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <div className="widget">
      <div className="widget-title">
        <Target size={15} /> {t('adminAccess.widgets.goalTitle')}
      </div>
      <input
        className="widget-input"
        placeholder={t('adminAccess.widgets.goalPlaceholder')}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onBlur={(e) => save(e.target.value)}
      />
      <p className="goal-quote">"{quote}"</p>
    </div>
  )
}

const SUGGESTED_SHORTCUTS: { labelKey: MessageKey; link: string }[] = [
  { labelKey: 'adminAccess.widgets.shortcutMessages', link: '/admin/inbox/conversations' },
  { labelKey: 'adminAccess.widgets.shortcutProjects', link: '/admin/projets/clients' },
  { labelKey: 'adminAccess.widgets.shortcutAccounting', link: '/admin/comptabilite' },
]

function isSafeShortcutLink(link: string): boolean {
  return (link.startsWith('/') && !link.startsWith('//')) || /^https:\/\//i.test(link)
}

function ShortcutLink({ shortcut }: { shortcut: Shortcut }) {
  if (!isSafeShortcutLink(shortcut.link)) return null
  if (/^https:\/\//i.test(shortcut.link)) {
    return (
      <a href={shortcut.link} target="_blank" rel="noreferrer">
        {shortcut.label}
      </a>
    )
  }
  return <Link to={shortcut.link}>{shortcut.label}</Link>
}

export function ShortcutsWidget() {
  const { t } = useI18n()
  const [shortcuts, setShortcuts] = useState<Shortcut[] | null>(null)
  const [label, setLabel] = useState('')
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    getLayout()
      .then((layout) => setShortcuts(layout.shortcuts ?? []))
      .catch(() => {
        setShortcuts([])
        setError(t('adminAccess.widgets.shortcutsLoadFailed'))
      })
  }

  useEffect(() => {
    let cancelled = false
    getLayout()
      .then((layout) => {
        if (!cancelled) setShortcuts(layout.shortcuts ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          setShortcuts([])
          setError(t('adminAccess.widgets.shortcutsLoadFailed'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const persist = async (next: Shortcut[]) => {
    setError(null)
    try {
      const saved = await saveLayout({ shortcuts: next })
      setShortcuts(saved.shortcuts ?? next)
      return true
    } catch {
      setError(t('adminAccess.widgets.shortcutsSaveFailed'))
      return false
    }
  }

  const addShortcut = () => {
    const nextLabel = label.trim()
    const nextLink = link.trim()
    if (!nextLabel || !isSafeShortcutLink(nextLink)) {
      setError(t('adminAccess.widgets.shortcutsInvalid'))
      return
    }
    void persist([...(shortcuts ?? []), { label: nextLabel, link: nextLink }]).then((saved) => {
      if (saved) {
        setLabel('')
        setLink('')
      }
    })
  }

  return (
    <div className="widget">
      <div className="widget-title">{t('adminAccess.widgets.shortcutsTitle')}</div>
      {shortcuts === null && !error && <p className="widget-empty">{t('adminAccess.widgets.shortcutsLoading')}</p>}
      {error && (
        <div className="widget-feedback" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>
            {t('adminAccess.widgets.retry')}
          </button>
        </div>
      )}
      <div className="shortcuts-grid">
        {(shortcuts ?? []).map((shortcut) => (
          <div className="shortcut" key={`${shortcut.label}-${shortcut.link}`}>
            <ShortcutLink shortcut={shortcut} />
            <button
              type="button"
              aria-label={t('adminAccess.widgets.shortcutDelete', { label: shortcut.label })}
              onClick={() => void persist((shortcuts ?? []).filter((item) => item !== shortcut))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {shortcuts?.length === 0 && !error && <p className="widget-empty">{t('adminAccess.widgets.shortcutsEmpty')}</p>}
      </div>
      <div className="shortcuts-form">
        <input
          aria-label={t('adminAccess.widgets.shortcutLabelAria')}
          className="widget-input"
          placeholder={t('adminAccess.widgets.shortcutLabelPlaceholder')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <input
          aria-label={t('adminAccess.widgets.shortcutLinkAria')}
          className="widget-input"
          placeholder={t('adminAccess.widgets.shortcutLinkPlaceholder')}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && addShortcut()}
        />
        <button
          type="button"
          className="widget-add__btn"
          onClick={addShortcut}
          aria-label={t('adminAccess.widgets.shortcutAdd')}
        >
          <Plus size={16} />
        </button>
      </div>
      {shortcuts?.length === 0 && (
        <p className="shortcuts-suggestions">
          {t('adminAccess.widgets.shortcutExamples', {
            list: SUGGESTED_SHORTCUTS.map((suggestion) => t(suggestion.labelKey)).join(', '),
          })}
        </p>
      )}
    </div>
  )
}
