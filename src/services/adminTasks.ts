import { apiFetch, apiUpload, apiDownload } from '../lib/api'
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
  const formData = new FormData()
  formData.append('file', file)
  const data = await apiUpload<{ attachments: TaskAttachment[] }>(
    `/api/admin/projects/${projectId}/tasks/${taskId}/attachments`,
    formData
  )
  return data.attachments
}

export async function downloadAttachment(projectId: string, taskId: string, attachmentId: string, fileName: string): Promise<void> {
  const { blob, filename } = await apiDownload(
    `/api/admin/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? fileName
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
