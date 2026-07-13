import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Pause, RotateCcw, Target, Plus, X } from 'lucide-react'
import { saveLayout, getLayout } from '../../../../services/workspace'
import type { Shortcut } from '../../../../types/workspace.types'

const QUOTES = [
  "Fais aujourd'hui ce que les autres remettent à demain.",
  'La discipline est le pont entre les objectifs et les résultats.',
  'Un petit progrès chaque jour mène à de grands résultats.',
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
        {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="clock-date">
        {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

export function PomodoroWidget() {
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
      <div className="widget-title">Focus</div>
      <div className="pomodoro-time">
        {mm}:{ss}
      </div>
      <div className="pomodoro-actions">
        <button onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause' : 'Démarrer'}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Démarrer'}
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setSeconds(25 * 60)
          }}
          aria-label="Réinitialiser"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}

export function GoalWidget() {
  const [goal, setGoal] = useState('')
  const quote = QUOTES[new Date().getDate() % QUOTES.length]
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
        <Target size={15} /> Objectif du jour
      </div>
      <input
        className="widget-input"
        placeholder="Mon objectif du jour…"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onBlur={(e) => save(e.target.value)}
      />
      <p className="goal-quote">"{quote}"</p>
    </div>
  )
}

const SUGGESTED_SHORTCUTS = [
  { label: 'Messages', link: '/admin/messages' },
  { label: 'Projets', link: '/admin/gestion' },
  { label: 'Compta', link: '/admin/comptabilite' },
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
        setError('Impossible de charger les raccourcis')
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
          setError('Impossible de charger les raccourcis')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (next: Shortcut[]) => {
    setError(null)
    try {
      const saved = await saveLayout({ shortcuts: next })
      setShortcuts(saved.shortcuts ?? next)
      return true
    } catch {
      setError('Impossible d’enregistrer les raccourcis')
      return false
    }
  }

  const addShortcut = () => {
    const nextLabel = label.trim()
    const nextLink = link.trim()
    if (!nextLabel || !isSafeShortcutLink(nextLink)) {
      setError('Saisissez un libellé et un lien interne ou HTTPS valide')
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
      <div className="widget-title">Raccourcis</div>
      {shortcuts === null && !error && <p className="widget-empty">Chargement des raccourcis…</p>}
      {error && (
        <div className="widget-feedback" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>
            Réessayer
          </button>
        </div>
      )}
      <div className="shortcuts-grid">
        {(shortcuts ?? []).map((shortcut) => (
          <div className="shortcut" key={`${shortcut.label}-${shortcut.link}`}>
            <ShortcutLink shortcut={shortcut} />
            <button
              type="button"
              aria-label={`Supprimer ${shortcut.label}`}
              onClick={() => void persist((shortcuts ?? []).filter((item) => item !== shortcut))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {shortcuts?.length === 0 && !error && <p className="widget-empty">Aucun raccourci configuré</p>}
      </div>
      <div className="shortcuts-form">
        <input
          aria-label="Libellé du raccourci"
          className="widget-input"
          placeholder="Libellé"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <input
          aria-label="Lien du raccourci"
          className="widget-input"
          placeholder="/admin/... ou https://..."
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && addShortcut()}
        />
        <button type="button" className="widget-add__btn" onClick={addShortcut} aria-label="Ajouter un raccourci">
          <Plus size={16} />
        </button>
      </div>
      {shortcuts?.length === 0 && (
        <p className="shortcuts-suggestions">
          Exemples : {SUGGESTED_SHORTCUTS.map((suggestion) => suggestion.label).join(', ')}.
        </p>
      )}
    </div>
  )
}
