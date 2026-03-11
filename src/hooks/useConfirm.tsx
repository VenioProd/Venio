import { useState, useCallback } from 'react'
import ConfirmModal from '../components/ConfirmModal'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
}

export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise((resolve) => {
      setState({ options: opts, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  const ConfirmDialog = state ? (
    <ConfirmModal
      isOpen
      title={state.options.title || 'Confirmation'}
      message={state.options.message}
      confirmLabel={state.options.confirmLabel || 'Supprimer'}
      cancelLabel={state.options.cancelLabel || 'Annuler'}
      variant={state.options.variant || 'danger'}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmDialog }
}
