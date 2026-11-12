import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import ReactDOM from 'react-dom'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  className?: string
}

const CustomSelect = ({ options, value, onChange, className }: CustomSelectProps) => {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<React.CSSProperties>({})
  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 14
      const above = rect.top - 14
      const natural = menuRef.current?.scrollHeight || 300
      const upwards = below < Math.min(natural, 300) && above > below
      const maxHeight = Math.max(0, Math.min(300, upwards ? above : below))
      const width = Math.min(Math.max(rect.width, menuRef.current?.scrollWidth || 0), window.innerWidth - 16)
      setMenuPos({
        position: 'fixed',
        top: upwards ? Math.max(8, rect.top - Math.min(natural, maxHeight) - 6) : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight,
        overflowY: 'auto',
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, options])

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, id])

  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value)
    setOpen(false)
    triggerRef.current?.focus()
  }
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'Escape') {
      if (open) event.stopPropagation()
      setOpen(false)
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const current = open ? active : Math.max(0, selectedIndex)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      setActive(Math.max(0, next))
      setOpen(true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else {
        setActive(Math.max(0, selectedIndex))
        setOpen(true)
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const start = open ? active : selectedIndex
      const next = options.findIndex((_, offset) => {
        const index = (start + 1 + offset) % options.length
        return options[index].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())
      })
      if (next >= 0) {
        event.preventDefault()
        setActive((start + 1 + next) % options.length)
        setOpen(true)
      }
    }
  }

  return (
    <div className={`custom-select ${className || ''}`} ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        className="custom-select-trigger"
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (!menuRef.current?.contains(event.relatedTarget as Node)) setOpen(false)
        }}
        onClick={() => {
          setActive(Math.max(0, selectedIndex))
          setOpen(!open)
        }}
      >
        <span>{selected?.label || '—'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            id={id}
            role="listbox"
            className="custom-select-menu"
            style={menuPos}
            aria-label={selected?.label || '—'}
          >
            {options.map((opt, index) => (
              <div
                key={opt.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={opt.value === value}
                className={`custom-select-option ${opt.value === value ? 'active' : ''} ${index === active ? 'highlighted' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {opt.label}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export default CustomSelect
