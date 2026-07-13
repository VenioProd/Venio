import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectsTab from './ProjectsTab'
import type { Project } from './types'

const project: Project = {
  _id: 'project-1',
  name: 'Refonte admin',
  description: 'Découpage de l’écran projets internes',
  entity: 'Venio',
  poles: ['Dev'],
  members: [{ _id: 'member-1', name: 'Ada Lovelace', email: 'ada@example.test', role: 'ADMIN' }],
  status: 'EN_COURS',
  priority: 'HAUTE',
  startDate: null,
  endDate: '2026-08-01T00:00:00.000Z',
  tags: [],
  createdBy: { name: 'Ada Lovelace' },
}

describe('ProjectsTab', () => {
  it('preserves project navigation and super-admin actions without bubbling card clicks', () => {
    const onOpenProject = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <ProjectsTab
        loading={false}
        projects={[project]}
        isSuperAdmin
        onOpenProject={onOpenProject}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(onEdit).toHaveBeenCalledWith(project)
    expect(onDelete).toHaveBeenCalledWith(project._id)
    expect(onOpenProject).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText(project.name))
    expect(onOpenProject).toHaveBeenCalledWith(project._id)
  })
})
