import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/admin/ui/PageHeader'
import BulkActionBar, { type BulkAction } from '../../components/admin/ui/BulkActionBar'
import QuickSelect from '../../components/admin/ui/QuickSelect'
import { RowCheckbox, SelectAllCheckbox } from '../../components/admin/ui/RowCheckbox'
import { useBulkRunner, type BulkResult } from '../../components/admin/ui/useBulkRunner'
import { useMultiSelect } from '../../components/admin/ui/useMultiSelect'
import { useI18n } from '../../context/I18nContext'
import { useNotifications } from '../../context/NotificationContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../hooks/useConfirm'
import { formatDate } from '../../i18n/format'
import { deleteReadNotifications, fetchAllNotifications, type NotificationView } from '../../services/notifications'
import type { AppNotification } from '../../types/notification.types'
import './NotificationsCenter.css'

const DAY_MS = 24 * 60 * 60 * 1000

const getId = (n: AppNotification) => n._id

/** Rappels et notifications de l'administrateur connecté, avec tri par lots. */
export default function NotificationsCenter() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { confirm, ConfirmDialog: DeleteReadDialog } = useConfirm()
  const { refresh: refreshBell, markAllAsRead } = useNotifications()
  const [view, setView] = useState<NotificationView>('active')
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const select = useMultiSelect(items, getId)
  const { deselect } = select

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllNotifications(view)
      setItems(data.notifications)
    } catch {
      setError(t('bulk.notif.loadError'))
    } finally {
      setLoading(false)
    }
  }, [view, t])

  useEffect(() => {
    void load()
  }, [load])

  const handleDone = useCallback(
    async (result: BulkResult) => {
      deselect(result.succeeded)
      await Promise.all([load(), refreshBell()])
    },
    [deselect, load, refreshBell],
  )
  const { run, busy, ConfirmDialog } = useBulkRunner({ endpoint: '/api/admin/notifications/bulk', onDone: handleDone })
  const ids = useMemo(() => [...select.selected], [select.selected])

  const filters = useMemo(() => {
    const limit = Date.now() - 30 * DAY_MS
    return [
      { id: 'read', label: t('bulk.quick.read'), ids: items.filter((n) => n.isRead).map(getId) },
      { id: 'unread', label: t('bulk.quick.unread'), ids: items.filter((n) => !n.isRead).map(getId) },
      {
        id: 'older30',
        label: t('bulk.quick.older30'),
        ids: items.filter((n) => new Date(n.createdAt).getTime() < limit).map(getId),
      },
    ]
  }, [items, t])

  const archived = view === 'archived'
  const actions: BulkAction[] = [
    { id: 'read', label: t('bulk.action.markRead'), onSelect: () => run(ids, 'read') },
    { id: 'unread', label: t('bulk.action.markUnread'), onSelect: () => run(ids, 'unread') },
    archived
      ? { id: 'unarchive', label: t('bulk.action.unarchive'), onSelect: () => run(ids, 'unarchive') }
      : { id: 'archive', label: t('bulk.action.archive'), onSelect: () => run(ids, 'archive') },
    { id: 'delete', label: t('bulk.action.delete'), danger: true, onSelect: () => run(ids, 'delete') },
  ]

  const hasUnread = items.some((n) => !n.isRead)
  const hasRead = items.some((n) => n.isRead)

  const onMarkAll = async () => {
    await markAllAsRead()
    await load()
  }

  const onDeleteRead = async () => {
    const ok = await confirm({
      title: t('bulk.notif.deleteReadTitle'),
      message: t('bulk.notif.deleteReadMessage'),
      confirmLabel: t('bulk.action.delete'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      const deleted = await deleteReadNotifications(view)
      showToast(t('bulk.notif.deleteReadDone', { count: deleted }), 'success')
      select.clear()
      await Promise.all([load(), refreshBell()])
    } catch {
      showToast(t('bulk.notif.actionError'), 'error')
    }
  }

  const open = (n: AppNotification) => {
    if (n.link) navigate(n.link)
  }

  return (
    <div className="portal-container pilotage-page notif-center">
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.inbox')}
        title={t('bulk.notif.title')}
        subtitle={t('bulk.notif.subtitle')}
        actions={
          <>
            <button
              type="button"
              className="portal-button secondary notif-center__btn"
              onClick={() => void onMarkAll()}
              disabled={!hasUnread || archived}
            >
              {t('bulk.notif.markAllRead')}
            </button>
            <button
              type="button"
              className="portal-button secondary notif-center__btn"
              onClick={() => void onDeleteRead()}
              disabled={!hasRead}
            >
              {t('bulk.notif.deleteRead')}
            </button>
          </>
        }
      />

      <div className="notif-center__views" role="group" aria-label={t('bulk.notif.title')}>
        {(['active', 'archived'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="notif-center__view"
            aria-pressed={view === v}
            onClick={() => {
              select.clear()
              setView(v)
            }}
          >
            {t(v === 'active' ? 'bulk.notif.viewActive' : 'bulk.notif.viewArchived')}
          </button>
        ))}
        <span className="notif-center__total">{t('bulk.notif.total', { count: items.length })}</span>
      </div>

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      <QuickSelect select={select} filters={filters} total={items.length} />

      {loading && items.length === 0 ? (
        <p role="status">{t('adminOps.common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="notif-center__empty">{t(archived ? 'bulk.notif.emptyArchived' : 'bulk.notif.empty')}</p>
      ) : (
        <>
          <div className="notif-center__head">
            <SelectAllCheckbox select={select} />
          </div>
          <ul className="notif-center__list">
            {items.map((n) => (
              <li key={n._id} className={`notif-center__row${n.isRead ? '' : ' notif-center__row--unread'}`}>
                <RowCheckbox id={n._id} name={n.title} select={select} />
                <button type="button" className="notif-center__main" onClick={() => open(n)} disabled={!n.link}>
                  <span className="notif-center__title">
                    {!n.isRead && <span className="notif-center__dot" aria-label={t('bulk.notif.unreadBadge')} />}
                    {n.title}
                  </span>
                  {n.message && <span className="notif-center__message">{n.message}</span>}
                </button>
                <time className="notif-center__date" dateTime={n.createdAt}>
                  {formatDate(n.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}

      <BulkActionBar count={select.count} actions={actions} onClear={select.clear} busy={busy} />
      {ConfirmDialog}
      {DeleteReadDialog}
    </div>
  )
}
