import { apiFetch } from '../lib/api'
import type { ProjectTemplate } from '../types/template.types'

export async function fetchTemplates(): Promise<ProjectTemplate[]> {
  const res = (await apiFetch('/api/admin/templates')) as { templates: ProjectTemplate[] }
  return res.templates
}

export async function fetchTemplate(id: string): Promise<ProjectTemplate> {
  const res = (await apiFetch(`/api/admin/templates/${id}`)) as { template: ProjectTemplate }
  return res.template
}

export async function createTemplate(data: Partial<ProjectTemplate>): Promise<ProjectTemplate> {
  const res = (await apiFetch('/api/admin/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  })) as { template: ProjectTemplate }
  return res.template
}

export async function updateTemplate(id: string, data: Partial<ProjectTemplate>): Promise<ProjectTemplate> {
  const res = (await apiFetch(`/api/admin/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })) as { template: ProjectTemplate }
  return res.template
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
}
