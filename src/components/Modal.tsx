import React, { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Optional id for the title, useful for aria-labelledby. */
  titleId?: string
  /** Max width in px (defaults to 600). */
  maxWidth?: number
}

/**
 * Generic modal scaffold (Ticket #29).
 *
 * Mirrors the structure of `.dm-modal` from index.css so existing styling
 * (dm-backdrop / dm-header / dm-body / dm-footer) keeps working. New
 * call-sites should use this component rather than hand-rolling another
 * dm-* tree.
 *
 * For the existing DecisionsList modal (which is a <form>), prefer
 * keeping the inline structure — this Modal is for new dialogs.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  titleId,
  maxWidth,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const headingId = titleId ?? 'modal-title'

  return (
    <>
      <div className="dm-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="dm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dm-header">
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="dm-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="dm-body">{children}</div>
        {footer && <div className="dm-footer">{footer}</div>}
      </div>
    </>
  )
}
