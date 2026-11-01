import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface DialogProps {
  titleId: string
  className?: string
  onClose: () => void
  children: ReactNode
}

/** Boîte de dialogue modale légère : Échap ferme, le focus entre et revient à l'appelant. */
export default function Dialog({ titleId, onClose, className = 'crm-auto-dlg', children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    node?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      }
      if (event.key === 'Tab' && node) {
        const focusables = node.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <>
      <div className="crm-auto-scrim" onClick={onClose} aria-hidden="true" />
      <div className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        {children}
      </div>
    </>,
    document.body,
  )
}
