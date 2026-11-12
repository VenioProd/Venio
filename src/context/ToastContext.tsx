import { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, type: ToastType, duration?: number) => string
  removeToast: (id: string) => void
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
  warning: 6000,
}

let toastCounter = 0

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType, duration?: number) => {
    const id = `toast-${Date.now()}-${++toastCounter}`
    const resolvedDuration = duration ?? DEFAULT_DURATIONS[type]

    const toast: Toast = { id, message, type, duration: resolvedDuration }
    setToasts((prev) => [...prev, toast])

    return id
  }, [])

  const value = useMemo(() => ({ toasts, showToast, removeToast }), [toasts, showToast, removeToast])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
