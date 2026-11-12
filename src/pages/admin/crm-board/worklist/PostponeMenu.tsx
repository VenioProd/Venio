import { createPortal } from 'react-dom'
import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'

/** Heure par défaut d'une relance reportée : début de journée ouvrée. */
const FOLLOW_UP_HOUR = 9

export function inDays(days: number, from: Date = new Date()): Date {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  date.setHours(FOLLOW_UP_HOUR, 0, 0, 0)
  return date
}

const PRESETS: { labelKey: MessageKey; days: number }[] = [
  { labelKey: 'crm.postpone.tomorrow', days: 1 },
  { labelKey: 'crm.postpone.in3Days', days: 3 },
  { labelKey: 'crm.postpone.in1Week', days: 7 },
]

interface PostponeMenuProps {
  disabled?: boolean
  onPostpone: (date: Date) => void
}

const PostponeMenu: React.FC<PostponeMenuProps> = ({ disabled, onPostpone }) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<React.CSSProperties>({})

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const anchor = containerRef.current?.getBoundingClientRect()
      if (!anchor) return
      const height = menuRef.current?.scrollHeight || 200
      const upwards = window.innerHeight - anchor.bottom < height + 16 && anchor.top > height
      setPosition({
        position: 'fixed',
        top: upwards ? anchor.top - height - 6 : anchor.bottom + 6,
        left: Math.max(8, Math.min(anchor.right - 200, window.innerWidth - 208)),
        width: 200,
        maxHeight: 'calc(100dvh - 16px)',
        overflowY: 'auto',
      })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node))
        setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
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
        className="portal-button secondary crm-worklist-action"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {t('crm.postpone.button')}
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} className="crm-worklist-popover" role="menu" style={position}>
            {PRESETS.map((preset) => (
              <button key={preset.days} type="button" role="menuitem" onClick={() => choose(inDays(preset.days))}>
                {t(preset.labelKey)}
              </button>
            ))}
            <label className="crm-worklist-popover-date">
              <span>{t('crm.postpone.exactDate')}</span>
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
          </div>,
          document.body,
        )}
    </div>
  )
}

export default PostponeMenu
