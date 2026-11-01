import { useCallback, useMemo } from 'react'
import { useI18n } from '../../../context/I18nContext'
import BulkActionBar, { type BulkAction } from '../../../components/admin/ui/BulkActionBar'
import { useBulkRunner, type BulkResult } from '../../../components/admin/ui/useBulkRunner'
import type { MultiSelect } from '../../../components/admin/ui/useMultiSelect'
import { STATUS_CONFIG } from './types'

interface TicketBulkBarProps {
  select: MultiSelect
  /** Onglet des archives : on y désarchive au lieu d'archiver. */
  archived: boolean
  onDone: () => void | Promise<void>
}

/** Barre d'actions groupées des tickets (POST /api/admin/tickets/bulk). */
export default function TicketBulkBar({ select, archived, onDone }: TicketBulkBarProps) {
  const { t } = useI18n()
  const { deselect } = select
  const handleDone = useCallback(
    async (result: BulkResult) => {
      deselect(result.succeeded)
      await onDone()
    },
    [deselect, onDone],
  )
  const { run, busy, ConfirmDialog } = useBulkRunner({ endpoint: '/api/admin/tickets/bulk', onDone: handleDone })
  const ids = useMemo(() => [...select.selected], [select.selected])

  const actions: BulkAction[] = [
    ...(archived
      ? []
      : [
          {
            kind: 'select',
            id: 'status',
            label: t('bulk.action.status'),
            options: Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({ value, label: t(cfg.labelKey) })),
            onSelect: (status: string) => run(ids, 'update', { status }),
          } as BulkAction,
        ]),
    archived
      ? { id: 'unarchive', label: t('bulk.action.unarchive'), onSelect: () => run(ids, 'unarchive') }
      : { id: 'archive', label: t('bulk.action.archive'), onSelect: () => run(ids, 'archive') },
    { id: 'delete', label: t('bulk.action.delete'), danger: true, onSelect: () => run(ids, 'delete') },
  ]

  return (
    <>
      <BulkActionBar count={select.count} actions={actions} onClear={select.clear} busy={busy} />
      {ConfirmDialog}
    </>
  )
}
