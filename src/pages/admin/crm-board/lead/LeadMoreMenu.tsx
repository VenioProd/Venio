import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import './lead.css'

export interface LeadMenuItem {
  key: string
  label: string
  /** Lien interne : rendu en `<a>`. */
  to?: string
  onSelect?: () => void
  tone?: 'danger'
  disabled?: boolean
  icon?: ReactNode
  /** Filet au-dessus : sépare les actions sensibles. */
  separated?: boolean
}

/**
 * Menu « Autres actions » de la fiche. Le calque est portalisé dans `body` (`src/App.css` isole chaque élément,
 * un menu resté dans la fiche serait rogné ou recouvert). Flèches, Début/Fin, Échap, clic extérieur.
 */
export default function LeadMoreMenu({ label, items }: { label: string; items: LeadMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (rect) setPos({ position: 'fixed', top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    }
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    place()
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', outside)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('mousedown', outside)
    }
  }, [open])

  if (items.length === 0) return null

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const move = (event: React.KeyboardEvent) => {
    const nodes = [
      ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []),
    ]
    const index = nodes.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? nodes.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length
      nodes[next]?.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="crm-ui-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} id={id} role="menu" aria-label={label} className="crm-lead-menu" style={pos} onKeyDown={move}>
            {items.map((item) => {
              const common = {
                role: 'menuitem',
                className: `crm-lead-menu__item${item.tone === 'danger' ? ' crm-lead-menu__item--danger' : ''}${item.separated ? ' crm-lead-menu__item--sep' : ''}`,
                'aria-disabled': item.disabled || undefined,
                tabIndex: -1,
              } as const
              return item.to ? (
                <Link
                  key={item.key}
                  to={item.to}
                  {...common}
                  onClick={() => {
                    close(false)
                    item.onSelect?.()
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  {...common}
                  onClick={() => {
                    if (item.disabled) return
                    close(false)
                    item.onSelect?.()
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
