import { useCallback, useRef, useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { useToast } from '../../../context/ToastContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { apiFetch } from '../../../lib/api'

export interface BulkResult {
  succeeded: string[]
  failed: { id: string; error: string }[]
}

export type BulkActionName = 'delete' | 'archive' | 'unarchive' | 'update' | 'read' | 'unread'

export interface UseBulkRunnerOptions {
  /** Ex. `/api/admin/tasks/bulk`. */
  endpoint: string
  /** Appelé après toute réponse du serveur, y compris un succès partiel : recharger la liste, ajuster la sélection. */
  onDone: (result: BulkResult) => void | Promise<void>
}

/**
 * Lance une action groupée : confirmation avant suppression, appel de l'endpoint
 * (une clé d'idempotence par opération), puis toast « réussis / en échec ».
 */
export function useBulkRunner({ endpoint, onDone }: UseBulkRunnerOptions) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)

  const run = useCallback(
    async (ids: string[], action: BulkActionName, patch?: Record<string, unknown>): Promise<BulkResult | null> => {
      if (running.current || ids.length === 0) return null
      if (action === 'delete') {
        const ok = await confirm({
          title: t('bulk.confirm.deleteTitle'),
          message: t('bulk.confirm.deleteMessage', { count: ids.length }),
          confirmLabel: t('bulk.action.delete'),
          variant: 'danger',
        })
        if (!ok) return null
      }
      running.current = true
      setBusy(true)
      try {
        const result = await apiFetch<BulkResult>(endpoint, {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ ids, action, ...(patch ? { patch } : {}) }),
        })
        if (result.failed.length === 0) {
          showToast(t('bulk.result.success', { count: result.succeeded.length }), 'success')
        } else if (result.succeeded.length === 0) {
          showToast(`${t('bulk.result.failure')} — ${result.failed[0].error}`, 'error')
        } else {
          showToast(
            `${t('bulk.result.partial', { ok: result.succeeded.length, failed: result.failed.length })} — ${result.failed[0].error}`,
            'warning',
          )
        }
        await onDone(result)
        return result
      } catch (err) {
        showToast(err instanceof Error && err.message ? err.message : t('bulk.result.error'), 'error')
        return null
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [confirm, endpoint, onDone, showToast, t],
  )

  return { run, busy, ConfirmDialog }
}
