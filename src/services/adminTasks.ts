import { apiFetch, getToken } from '../lib/api'
import type { Task, TaskFormData, TaskComment, TaskAttachment } from '../types/task.types'

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks`) as { tasks: Task[] }
  return res.tasks
}

export async function createTask(projectId: string, data: Partial<TaskFormData>): Promise<Task> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  }) as { task: Task }
  return res.task
}

export async function updateTask(projectId: string, taskId: string, data: Partial<TaskFormData>): Promise<Task> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }) as { task: Task }
  return res.task
}

export async function moveTask(projectId: string, taskId: string, status: string, order: number): Promise<Task> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ status, order }),
  }) as { task: Task }
  return res.task
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

export async function fetchComments(projectId: string, taskId: string): Promise<TaskComment[]> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}/comments`) as { comments: TaskComment[] }
  return res.comments
}

export async function addComment(projectId: string, taskId: string, content: string, mentions: string[] = []): Promise<TaskComment> {
  const res = await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, mentions }),
  }) as { comment: TaskComment }
  return res.comment
}

export async function deleteComment(projectId: string, taskId: string, commentId: string): Promise<void> {
  await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}

// ─── Task Attachments ───

export async function uploadAttachment(projectId: string, taskId: string, file: File): Promise<TaskAttachment[]> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`/api/admin/projects/${projectId}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as any).error || 'Erreur upload')
  }
  const data = await response.json()
  return (data as any).attachments
}

export async function downloadAttachment(projectId: string, taskId: string, attachmentId: string, fileName: string): Promise<void> {
  const token = getToken()
  const response = await fetch(`/api/admin/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    throw new Error('Erreur telechargement')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function deleteAttachment(projectId: string, taskId: string, attachmentId: string): Promise<void> {
  await apiFetch(`/api/admin/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
