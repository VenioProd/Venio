import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../../hooks/useModalA11y'
import './PublicModal.css'

interface PublicModalProps {
  title: string
  eyebrow?: string
  onClose: () => void
  /** Champ qui reçoit le focus à l'ouverture. Par défaut : le premier élément focusable. */
  initialFocusRef?: RefObject<HTMLElement>
  children: ReactNode
}

/**
 * Primitive de dialogue du site public. `useModalA11y` fournit l'`inert` sur
 * `#root`, le focus initial, le piège à focus et la restauration du focus ; il
 * ne gère ni Échap ni le verrou de défilement, qui sont ajoutés ici.
 */
const PublicModal = ({ title, eyebrow, onClose, initialFocusRef, children }: PublicModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useModalA11y(true, dialogRef, initialFocusRef)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div className="mc-modal-layer" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="mc-card mc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mc-modal__head">
          <div className="mc-modal__heading">
            {eyebrow ? <p className="mc-eyebrow">{eyebrow}</p> : null}
            <h2 className="mc-modal__title" id={titleId}>
              {title}
            </h2>
          </div>
          <button type="button" className="mc-tap mc-modal__close" aria-label="Fermer la fenêtre" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mc-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default PublicModal
