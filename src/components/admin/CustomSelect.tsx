import React, { useState, useRef, useEffect } from 'react'
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
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && (!menuRef.current || !menuRef.current.contains(target))) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width })
    }
    setOpen(!open)
  }

  return (
    <div className={`custom-select ${className || ''}`} ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="custom-select-trigger"
        onClick={handleToggle}
      >
        <span>{selected?.label || '—'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && menuPos && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className="custom-select-menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`custom-select-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default CustomSelect
