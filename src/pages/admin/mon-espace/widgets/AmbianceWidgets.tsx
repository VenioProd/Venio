import React, { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Play, Pause, RotateCcw, Target, MessageSquare, Receipt, FolderKanban } from 'lucide-react'
import { saveLayout } from '../../../../services/workspace'

const QUOTES = [
  "Fais aujourd'hui ce que les autres remettent à demain.",
  'La discipline est le pont entre les objectifs et les résultats.',
  'Un petit progrès chaque jour mène à de grands résultats.',
]

export function ClockWidget() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  return (
    <div className="widget widget--center">
      <div data-testid="clock-time" className="clock-time">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="clock-date">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
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
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [running])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return (
    <div className="widget widget--center">
      <div className="widget-title">Focus</div>
      <div className="pomodoro-time">{mm}:{ss}</div>
      <div className="pomodoro-actions">
        <button onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pause' : 'Démarrer'}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Démarrer'}
        </button>
        <button onClick={() => { setRunning(false); setSeconds(25 * 60) }} aria-label="Réinitialiser"><RotateCcw size={16} /></button>
      </div>
    </div>
  )
}

export function GoalWidget() {
  const [goal, setGoal] = useState('')
  const quote = QUOTES[new Date().getDate() % QUOTES.length]
  const save = (text: string) => { saveLayout({ dailyGoal: { text, date: new Date().toISOString() } }).catch(() => {}) }
  return (
    <div className="widget">
      <div className="widget-title"><Target size={15} /> Objectif du jour</div>
      <input className="widget-input" placeholder="Mon objectif du jour…" value={goal}
        onChange={(e) => setGoal(e.target.value)} onBlur={(e) => save(e.target.value)} />
      <p className="goal-quote">"{quote}"</p>
    </div>
  )
}

const DEFAULT_SHORTCUTS = [
  { to: '/admin/messages', label: 'Messages', Icon: MessageSquare },
  { to: '/admin/gestion', label: 'Projets', Icon: FolderKanban },
  { to: '/admin/comptabilite', label: 'Compta', Icon: Receipt },
]

export function ShortcutsWidget() {
  return (
    <div className="widget">
      <div className="widget-title">Raccourcis</div>
      <div className="shortcuts-grid">
        {DEFAULT_SHORTCUTS.map((s) => (
          <Link to={s.to} key={s.to} className="shortcut"><s.Icon size={18} /><span>{s.label}</span></Link>
        ))}
      </div>
    </div>
  )
}
