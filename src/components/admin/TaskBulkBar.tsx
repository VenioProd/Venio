import { useCallback, useMemo } from 'react'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import BulkActionBar, { type BulkAction } from './ui/BulkActionBar'
import { useBulkRunner, type BulkResult } from './ui/useBulkRunner'
import type { MultiSelect } from './ui/useMultiSelect'

const STATUSES: { value: string; labelKey: MessageKey }[] = [
  { value: 'A_FAIRE', labelKey: 'compA.taskStatus.todo' },
  { value: 'EN_COURS', labelKey: 'compA.taskStatus.inProgress' },
  { value: 'EN_REVIEW', labelKey: 'compA.taskStatus.inReview' },
  { value: 'TERMINE', labelKey: 'compA.taskStatus.done' },
  { value: 'VALIDE', labelKey: 'compA.taskStatus.valid' },
  { value: 'NON_VALIDE', labelKey: 'compA.taskStatus.invalid' },
  { value: 'A_MODIFIER', labelKey: 'compA.taskStatus.toEdit' },
]
const PRIORITIES: { value: string; labelKey: MessageKey }[] = [
  { value: 'BASSE', labelKey: 'compA.priority.low' },
  { value: 'NORMALE', labelKey: 'compA.priority.normal' },
  { value: 'HAUTE', labelKey: 'compA.priority.high' },
  { value: 'URGENTE', labelKey: 'compA.priority.urgent' },
]
const NO_ASSIGNEE = '__none__'

interface TaskBulkBarProps {
  select: MultiSelect
  assignees: { _id: string; name: string }[]
  /** Recharge la liste après l'action. */
  onDone: () => void | Promise<void>
  /** Archive : à n'offrir que là où la liste masque les tâches archivées. */
  allowArchive?: boolean
}

/** Barre d'actions groupées des tâches (POST /api/admin/tasks/bulk). */
export default function TaskBulkBar({ select, assignees, onDone, allowArchive = false }: TaskBulkBarProps) {
  const { t } = useI18n()
  const { deselect } = select
  const handleDone = useCallback(
    async (result: BulkResult) => {
      deselect(result.succeeded)
      await onDone()
    },
    [deselect, onDone],
  )
  const { run, busy, ConfirmDialog } = useBulkRunner({ endpoint: '/api/admin/tasks/bulk', onDone: handleDone })
  const ids = useMemo(() => [...select.selected], [select.selected])

  const actions: BulkAction[] = [
    {
      kind: 'select',
      id: 'status',
      label: t('bulk.action.status'),
      options: STATUSES.map((s) => ({ value: s.value, label: t(s.labelKey) })),
      onSelect: (status) => run(ids, 'update', { status }),
    },
    {
      kind: 'select',
      id: 'priority',
      label: t('bulk.action.priority'),
      options: PRIORITIES.map((p) => ({ value: p.value, label: t(p.labelKey) })),
      onSelect: (priority) => run(ids, 'update', { priority }),
    },
    {
      kind: 'select',
      id: 'assignee',
      label: t('bulk.action.assignee'),
      options: [
        { value: NO_ASSIGNEE, label: t('bulk.action.noAssignee') },
        ...assignees.map((a) => ({ value: a._id, label: a.name })),
      ],
      onSelect: (value) => run(ids, 'update', { assignee: value === NO_ASSIGNEE ? null : value }),
    },
    {
      kind: 'date',
      id: 'dueDate',
      label: t('bulk.action.dueDate'),
      clearLabel: t('bulk.action.noDueDate'),
      onSelect: (dueDate) => run(ids, 'update', { dueDate }),
    },
    ...(allowArchive
      ? [{ id: 'archive', label: t('bulk.action.archive'), onSelect: () => run(ids, 'archive') } as BulkAction]
      : []),
    { id: 'delete', label: t('bulk.action.delete'), danger: true, onSelect: () => run(ids, 'delete') },
  ]

  return (
    <>
      <BulkActionBar count={select.count} actions={actions} onClear={select.clear} busy={busy} />
      {ConfirmDialog}
    </>
  )
}
