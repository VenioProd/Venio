import React, { useEffect, useState, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import {
  fetchTasks,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  fetchComments,
  addComment,
  deleteComment,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
} from '../../services/adminTasks'
import ConfirmModal from '../ConfirmModal'
import { useMultiSelect } from './ui/useMultiSelect'
import { RowCheckbox } from './ui/RowCheckbox'
import TaskBulkBar from './TaskBulkBar'
import type { Task, TaskStatus, TaskPriority, TaskComment, TaskAttachment } from '../../types/task.types'
import type { AdminUser } from '../../types/crm.types'
import { useI18n } from '../../context/I18nContext'
import { formatDate as formatLocaleDate } from '../../i18n/format'
import type { MessageKey } from '../../i18n'
import '../../styles/task-board.css'

const TASK_COLUMNS: { key: TaskStatus; labelKey: MessageKey; color: string }[] = [
  { key: 'A_FAIRE', labelKey: 'compA.taskStatus.todo', color: '#0ea5e9' },
  { key: 'EN_COURS', labelKey: 'compA.taskStatus.inProgress', color: '#9b9b9b' },
  { key: 'EN_REVIEW', labelKey: 'compA.taskStatus.inReview', color: '#f59e0b' },
  { key: 'TERMINE', labelKey: 'compA.taskStatus.done', color: '#22c55e' },
]

const PRIORITY_CONFIG: Record<TaskPriority, { labelKey: MessageKey; color: string }> = {
  BASSE: { labelKey: 'compA.priority.low', color: '#64748b' },
  NORMALE: { labelKey: 'compA.priority.normal', color: '#0ea5e9' },
  HAUTE: { labelKey: 'compA.priority.high', color: '#f59e0b' },
  URGENTE: { labelKey: 'compA.priority.urgent', color: '#ef4444' },
}

interface TaskBoardProps {
  projectId: string
}

const emptyForm = {
  title: '',
  description: '',
  priority: 'NORMALE' as TaskPriority,
  assignee: '',
  dueDate: '',
  status: 'A_FAIRE' as TaskStatus,
}

const TaskBoard = ({ projectId }: TaskBoardProps) => {
  const { t } = useI18n()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_TASKS)
  const [tasks, setTasks] = useState<Task[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // canInteract: can upload files + comment (manage_tasks OR assignee)
  const isAssignee = editingTask?.assignee?._id === user?._id
  const canInteract = canManage || isAssignee
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cartes visibles dans l'ordre des colonnes : maj+clic prend la plage telle qu'affichée.
  const visibleTasks = TASK_COLUMNS.flatMap((column) =>
    tasks.filter((task) => task.status === column.key).sort((a, b) => a.order - b.order),
  )
  const select = useMultiSelect(visibleTasks, (task) => task._id)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [taskList, adminRes] = await Promise.all([
        fetchTasks(projectId),
        apiFetch<{ users?: AdminUser[] }>('/api/admin/admins'),
      ])
      setTasks(taskList)
      setAdmins(adminRes.users || [])
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.loadError'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const tasksByStatus = (status: TaskStatus): Task[] => {
    return tasks.filter((task) => task.status === status).sort((a, b) => a.order - b.order)
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, status: TaskStatus) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return
    try {
      const targetTasks = tasksByStatus(status)
      const order = targetTasks.length
      await moveTask(projectId, taskId, status, order)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.moveError'))
    }
  }

  const openCreateModal = (status: TaskStatus) => {
    setEditingTask(null)
    setForm({ ...emptyForm, status })
    setShowModal(true)
  }

  const openEditModal = async (task: Task) => {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      assignee: task.assignee?._id || '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      status: task.status,
    })
    setShowModal(true)
    setComments([])
    setCommentText('')
    try {
      const cmts = await fetchComments(projectId, task._id)
      setComments(cmts)
    } catch {
      // silently fail
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        assignee: form.assignee || '',
        dueDate: form.dueDate || '',
        status: form.status,
      }
      if (editingTask) {
        await updateTask(projectId, editingTask._id, payload)
      } else {
        await createTask(projectId, payload)
      }
      setShowModal(false)
      setForm(emptyForm)
      setEditingTask(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.saveError'))
    }
  }

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(projectId, taskId)
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.deleteError'))
    }
  }

  const handleAddComment = async () => {
    if (!commentText.trim() || !editingTask) return
    setCommentLoading(true)
    try {
      // Extract @mentions from text — match admin names
      const mentionIds: string[] = []
      for (const admin of admins) {
        if (commentText.includes(`@${admin.name}`)) {
          mentionIds.push(admin._id)
        }
      }
      const newComment = await addComment(projectId, editingTask._id, commentText, mentionIds)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.addCommentError'))
    } finally {
      setCommentLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!editingTask) return
    try {
      await deleteComment(projectId, editingTask._id, commentId)
      setComments((prev) => prev.filter((c) => c._id !== commentId))
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.deleteCommentError'))
    }
  }

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingTask) return
    setUploading(true)
    setError('')
    try {
      const attachments = await uploadAttachment(projectId, editingTask._id, file)
      setEditingTask({ ...editingTask, attachments })
      setTasks((prev) => prev.map((task) => (task._id === editingTask._id ? { ...task, attachments } : task)))
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.uploadError'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!editingTask) return
    setError('')
    try {
      await deleteAttachment(projectId, editingTask._id, attachmentId)
      const updated = (editingTask.attachments || []).filter((a) => a._id !== attachmentId)
      setEditingTask({ ...editingTask, attachments: updated })
      setTasks((prev) => prev.map((task) => (task._id === editingTask._id ? { ...task, attachments: updated } : task)))
    } catch (err: unknown) {
      setError((err as Error).message || t('compA.taskBoard.deleteFileError'))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return t('compA.gTable.sizeBytes', { n: bytes })
    if (bytes < 1024 * 1024) return t('compA.gTable.sizeKb', { n: (bytes / 1024).toFixed(0) })
    return t('compA.gTable.sizeMb', { n: (bytes / (1024 * 1024)).toFixed(1) })
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼'
    if (mimeType === 'application/pdf') return '📄'
    if (mimeType.startsWith('video/')) return '🎬'
    if (mimeType.startsWith('audio/')) return '🎵'
    return '📎'
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('compA.taskBoard.agoNow')
    if (minutes < 60) return t('compA.taskBoard.agoMinutes', { n: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('compA.taskBoard.agoHours', { n: hours })
    const days = Math.floor(hours / 24)
    return t('compA.taskBoard.agoDays', { n: days })
  }

  const formatDate = (date: string | null) => {
    if (!date) return ''
    return formatLocaleDate(date, { day: '2-digit', month: 'short' })
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
  }

  if (loading) {
    return <div className="task-board-loading">{t('compA.taskBoard.loading')}</div>
  }

  return (
    <div className="task-board-wrapper">
      {error && <div className="admin-error">{error}</div>}
      {canManage && <TaskBulkBar select={select} assignees={admins} onDone={load} allowArchive />}

      <div className="task-board">
        {TASK_COLUMNS.map((column) => {
          const columnTasks = tasksByStatus(column.key)
          return (
            <div
              key={column.key}
              className="task-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, column.key)}
              style={{ '--column-color': column.color } as React.CSSProperties}
            >
              <div className="task-column-header">
                <span className="task-column-title">{t(column.labelKey)}</span>
                <span className="task-column-count">{columnTasks.length}</span>
              </div>

              {canManage && (
                <button className="task-add-btn" onClick={() => openCreateModal(column.key)}>
                  {t('compA.taskBoard.add')}
                </button>
              )}

              {columnTasks.map((task) => (
                <div
                  key={task._id}
                  className={`task-card ${isOverdue(task.dueDate) && task.status !== 'TERMINE' ? 'task-card-overdue' : ''}`}
                  draggable={canManage}
                  onDragStart={(e) => handleDragStart(e, task._id)}
                  onClick={() => openEditModal(task)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="task-card-header">
                    {canManage && <RowCheckbox id={task._id} name={task.title} select={select} />}
                    <span className="task-card-title">{task.title}</span>
                    {canManage && (
                      <button
                        className="task-card-delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteConfirm(task._id)
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                  {task.description && (
                    <p className="task-card-desc">
                      {task.description.length > 80 ? task.description.slice(0, 80) + '...' : task.description}
                    </p>
                  )}
                  <div className="task-card-meta">
                    <span
                      className="task-priority-badge"
                      style={{ '--priority-color': PRIORITY_CONFIG[task.priority].color } as React.CSSProperties}
                    >
                      {t(PRIORITY_CONFIG[task.priority].labelKey)}
                    </span>
                    {task.assignee && <span className="task-assignee">{task.assignee.name}</span>}
                    {task.dueDate && (
                      <span
                        className={`task-due ${isOverdue(task.dueDate) && task.status !== 'TERMINE' ? 'task-due-overdue' : ''}`}
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Modal creation/edition */}
      {showModal && (
        <div className="task-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="task-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editingTask
                ? canManage
                  ? t('compA.taskBoard.editTitle')
                  : t('compA.taskBoard.detailTitle')
                : t('compA.taskBoard.newTitle')}
            </h3>
            {canManage ? (
              <form onSubmit={handleSubmit}>
                <div className="task-form-group">
                  <label>{t('compA.taskBoard.fTitleReq')}</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="task-form-group">
                  <label>{t('compA.gTable.description')}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="task-form-row">
                  <div className="task-form-group">
                    <label>{t('compA.gTable.thStatus')}</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
                    >
                      {TASK_COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>
                          {t(c.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="task-form-group">
                    <label>{t('compA.gTable.thPriority')}</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                    >
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>
                          {t(cfg.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="task-form-row">
                  <div className="task-form-group">
                    <label>{t('compA.gTable.thAssignee')}</label>
                    <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
                      <option value="">{t('compA.taskBoard.unassigned')}</option>
                      {admins.map((admin) => (
                        <option key={admin._id} value={admin._id}>
                          {admin.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="task-form-group">
                    <label>{t('compA.taskBoard.fDue')}</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="task-form-actions">
                  <button type="button" className="portal-btn-secondary" onClick={() => setShowModal(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="portal-btn">
                    {editingTask ? t('common.save') : t('compA.taskBoard.create')}
                  </button>
                </div>
              </form>
            ) : (
              editingTask && (
                <div className="task-detail-readonly">
                  <div className="task-form-group">
                    <label>{t('compA.taskBoard.fTitle')}</label>
                    <p className="task-readonly-value">{editingTask.title}</p>
                  </div>
                  {editingTask.description && (
                    <div className="task-form-group">
                      <label>{t('compA.gTable.description')}</label>
                      <p className="task-readonly-value">{editingTask.description}</p>
                    </div>
                  )}
                  <div className="task-form-row">
                    <div className="task-form-group">
                      <label>{t('compA.gTable.thStatus')}</label>
                      <p className="task-readonly-value">
                        {(() => {
                          const col = TASK_COLUMNS.find((c) => c.key === editingTask.status)
                          return col ? t(col.labelKey) : undefined
                        })()}
                      </p>
                    </div>
                    <div className="task-form-group">
                      <label>{t('compA.gTable.thPriority')}</label>
                      <p className="task-readonly-value">{t(PRIORITY_CONFIG[editingTask.priority].labelKey)}</p>
                    </div>
                  </div>
                  <div className="task-form-row">
                    <div className="task-form-group">
                      <label>{t('compA.gTable.thAssignee')}</label>
                      <p className="task-readonly-value">
                        {editingTask.assignee?.name || t('compA.taskBoard.unassigned')}
                      </p>
                    </div>
                    <div className="task-form-group">
                      <label>{t('compA.taskBoard.fDue')}</label>
                      <p className="task-readonly-value">
                        {editingTask.dueDate ? formatDate(editingTask.dueDate) : t('compA.taskBoard.noDue')}
                      </p>
                    </div>
                  </div>
                  <div className="task-form-actions">
                    <button type="button" className="portal-btn-secondary" onClick={() => setShowModal(false)}>
                      {t('common.close')}
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Attachments — only in edit mode */}
            {editingTask && (
              <div className="task-attachments-section">
                <h4 className="task-attachments-title">
                  {t('compA.taskBoard.attachments', { n: editingTask.attachments?.length || 0 })}
                </h4>
                <div className="task-attachments-list">
                  {(!editingTask.attachments || editingTask.attachments.length === 0) && (
                    <p className="task-attachments-empty">{t('compA.taskBoard.noAttachment')}</p>
                  )}
                  {editingTask.attachments?.map((att) => (
                    <div key={att._id} className="task-attachment-item">
                      <span className="task-attachment-icon">{getFileIcon(att.mimeType)}</span>
                      <div className="task-attachment-info">
                        <span className="task-attachment-name">{att.originalName}</span>
                        <span className="task-attachment-size">{formatFileSize(att.size)}</span>
                      </div>
                      <button
                        className="task-attachment-download"
                        onClick={() =>
                          downloadAttachment(projectId, editingTask._id, att._id, att.originalName).catch(() =>
                            setError(t('compA.taskBoard.downloadError')),
                          )
                        }
                      >
                        {t('compA.taskBoard.download')}
                      </button>
                      {canManage && (
                        <button className="task-attachment-delete" onClick={() => handleDeleteAttachment(att._id)}>
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canInteract && (
                  <div className="task-attachment-upload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleUploadAttachment}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="task-attachment-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? t('compA.taskBoard.uploading') : t('compA.taskBoard.addFile')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Comment thread — only in edit mode */}
            {editingTask && (
              <div className="task-comments-section">
                <h4 className="task-comments-title">{t('compA.taskBoard.comments', { n: comments.length })}</h4>
                <div className="task-comments-list">
                  {comments.length === 0 && <p className="task-comments-empty">{t('compA.taskBoard.noComment')}</p>}
                  {comments.map((comment) => (
                    <div key={comment._id} className="task-comment">
                      <div className="task-comment-header">
                        <span className="task-comment-author">{comment.author.name}</span>
                        <span className="task-comment-time">{formatTimeAgo(comment.createdAt)}</span>
                        {(comment.author._id === user?._id || user?.role === 'SUPER_ADMIN') && (
                          <button className="task-comment-delete" onClick={() => handleDeleteComment(comment._id)}>
                            x
                          </button>
                        )}
                      </div>
                      <p className="task-comment-content">{comment.content}</p>
                      {comment.mentions.length > 0 && (
                        <div className="task-comment-mentions">
                          {comment.mentions.map((m) => (
                            <span key={m._id} className="task-mention-badge">
                              @{m.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {canInteract && (
                  <div className="task-comment-input">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder={t('compA.taskBoard.commentPlaceholder')}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleAddComment()
                        }
                      }}
                    />
                    <button
                      className="portal-btn"
                      onClick={handleAddComment}
                      disabled={commentLoading || !commentText.trim()}
                    >
                      {t('compA.taskBoard.send')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={true}
          title={t('compA.taskBoard.deleteTitle')}
          message={t('compA.taskBoard.deleteMessage')}
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

export default TaskBoard
