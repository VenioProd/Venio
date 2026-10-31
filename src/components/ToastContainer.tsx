import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast, type Toast, type ToastType } from '../context/ToastContext'
import { useI18n } from '../context/I18nContext'

const ICONS: Record<ToastType, JSX.Element> = {
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-1 15l-5-5 1.41-1.41L9 12.17l7.59-7.59L18 6l-9 9z"
        fill="currentColor"
      />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"
        fill="currentColor"
      />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9V9h2v6zm0-8H9V5h2v2z"
        fill="currentColor"
      />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 18h18L10 1 1 18zm10-2H9v-2h2v2zm0-4H9V8h2v4z" fill="currentColor" />
    </svg>
  ),
}

const COLORS: Record<ToastType, string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#0ea5e9',
  warning: '#f59e0b',
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const { t } = useI18n()
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClose = useCallback(() => {
    if (exiting) return
    setExiting(true)
    setTimeout(() => onRemove(toast.id), 300)
  }, [exiting, onRemove, toast.id])

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      handleClose()
    }, toast.duration)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast.duration, handleClose])

  const borderColor = COLORS[toast.type]

  return (
    <div className={`toast-item ${exiting ? 'toast-exit' : ''}`} style={{ borderLeftColor: borderColor }} role="alert">
      <div className="toast-icon" style={{ color: borderColor }}>
        {ICONS[toast.type]}
      </div>
      <p className="toast-message">{toast.message}</p>
      <button className="toast-close" onClick={handleClose} aria-label={t('shell.toast.close')} type="button">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M14 1.41L12.59 0 7 5.59 1.41 0 0 1.41 5.59 7 0 12.59 1.41 14 7 8.41 12.59 14 14 12.59 8.41 7 14 1.41z"
            fill="currentColor"
          />
        </svg>
      </button>
      <div
        className="toast-progress"
        style={{
          backgroundColor: borderColor,
          animationDuration: `${toast.duration}ms`,
        }}
      />
    </div>
  )
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
