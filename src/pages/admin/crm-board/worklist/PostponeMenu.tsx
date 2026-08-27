import React, { useEffect, useRef, useState } from 'react'

/** Heure par défaut d'une relance reportée : début de journée ouvrée. */
const FOLLOW_UP_HOUR = 9

export function inDays(days: number, from: Date = new Date()): Date {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  date.setHours(FOLLOW_UP_HOUR, 0, 0, 0)
  return date
}

const PRESETS: { label: string; days: number }[] = [
  { label: 'Demain', days: 1 },
  { label: 'Dans 3 jours', days: 3 },
  { label: 'Dans 1 semaine', days: 7 },
]

interface PostponeMenuProps {
  disabled?: boolean
  onPostpone: (date: Date) => void
}

const PostponeMenu: React.FC<PostponeMenuProps> = ({ disabled, onPostpone }) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (date: Date) => {
    setOpen(false)
    onPostpone(date)
  }

  return (
    <div className="crm-worklist-postpone" ref={containerRef}>
      <button
        type="button"
        className="crm-worklist-action"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        Reporter
      </button>
      {open && (
        <div className="crm-worklist-popover" role="menu">
          {PRESETS.map((preset) => (
            <button key={preset.days} type="button" role="menuitem" onClick={() => choose(inDays(preset.days))}>
              {preset.label}
            </button>
          ))}
          <label className="crm-worklist-popover-date">
            <span>Date précise</span>
            <input
              type="date"
              onChange={(event) => {
                // Découpage manuel : `new Date('2026-08-30')` serait lu comme
                // minuit UTC, donc la veille dans les fuseaux à l'ouest.
                const [year, month, day] = event.target.value.split('-').map(Number)
                if (!year || !month || !day) return
                choose(new Date(year, month - 1, day, FOLLOW_UP_HOUR, 0, 0, 0))
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

export default PostponeMenu
