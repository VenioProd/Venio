import { useCallback, useEffect, useRef, useState } from 'react'

export interface PromptModalProps {
  isOpen: boolean
  title: string
  message?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  multiline?: boolean
  maxLength?: number
  validate?: (value: string) => string | null
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function PromptModal({
  isOpen,
  title,
  message,
  placeholder,
  initialValue = '',
  confirmLabel = 'Valider',
  cancelLabel = 'Annuler',
  multiline = false,
  maxLength,
  validate,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue)
      setError(null)
      const timer = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(timer)
    }
  }, [isOpen, initialValue])

  useEffect(() => {
    if (!isOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Champ requis')
      return
    }
    if (validate) {
      const validation = validate(trimmed)
      if (validation) {
        setError(validation)
        return
      }
    }
    onConfirm(trimmed)
  }, [value, validate, onConfirm])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey && !multiline) {
        event.preventDefault()
        handleSubmit()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && multiline) {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit, multiline]
  )

  if (!isOpen) return null

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div
        ref={modalRef}
        className="confirm-modal confirm-modal--info"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
      >
        <div className="confirm-modal__header">
          <h2 id="prompt-modal-title" className="confirm-modal__title">{title}</h2>
          <button className="confirm-modal__close" onClick={onCancel} aria-label="Fermer" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="confirm-modal__body">
          {message && <p className="confirm-modal__message">{message}</p>}
          {multiline ? (
            <textarea
              ref={(node) => { inputRef.current = node }}
              className="prompt-modal__input prompt-modal__input--multiline"
              value={value}
              placeholder={placeholder}
              maxLength={maxLength}
              rows={4}
              onChange={(event) => { setValue(event.target.value); setError(null) }}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <input
              ref={(node) => { inputRef.current = node }}
              type="text"
              className="prompt-modal__input"
              value={value}
              placeholder={placeholder}
              maxLength={maxLength}
              onChange={(event) => { setValue(event.target.value); setError(null) }}
              onKeyDown={handleKeyDown}
            />
          )}
          {error && <p className="prompt-modal__error" role="alert">{error}</p>}
        </div>
        <div className="confirm-modal__footer">
          <button className="confirm-modal__btn confirm-modal__btn--cancel" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info" onClick={handleSubmit} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
