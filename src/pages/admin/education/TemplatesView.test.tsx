import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TemplatesView } from './TemplatesView'
import {
  createClass,
  createSession,
  createTemplate,
  listTemplates,
  updateTemplate,
  type EducationTemplate,
} from '../../../services/education'
vi.mock('../../../services/education', async (original) => ({
  ...(await original<typeof import('../../../services/education')>()),
  listTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  createClass: vi.fn(),
  createSession: vi.fn(),
}))
const model = (body = {}): EducationTemplate => ({
  _id: 't1',
  name: 'Atelier',
  kind: 'session',
  body: {
    title: 'Atelier pratique',
    durationMin: 120,
    objectives: ['Comprendre'],
    supports: ['https://example.com/cours'],
    customFutureField: { keep: true },
    ...body,
  },
  description: '',
  tags: [],
  createdAt: '',
  updatedAt: '',
})
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTemplates).mockResolvedValue({ templates: [model()], total: 1 })
  vi.mocked(updateTemplate).mockResolvedValue({ template: model() })
  vi.mocked(createTemplate).mockResolvedValue({ template: model() })
})
it('edits a teaching form, previews and preserves fields from newer templates', async () => {
  render(<TemplatesView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Atelier' }))
  fireEvent.change(screen.getByLabelText('Objectifs'), { target: { value: 'Comprendre\nPratiquer' } })
  expect(screen.getByRole('region', { name: 'Aperçu du template' })).toHaveTextContent('Pratiquer')
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() =>
    expect(updateTemplate).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        body: expect.objectContaining({
          objectives: ['Comprendre', 'Pratiquer'],
          customFutureField: { keep: true },
          supports: ['https://example.com/cours'],
        }),
      }),
    ),
  )
})
it('duplicates into a new template and rejects malformed advanced input', async () => {
  render(<TemplatesView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Atelier' }))
  fireEvent.change(screen.getByLabelText('Contenu avancé'), { target: { value: '[]' } })
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('doit être un objet')
  expect(createTemplate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Contenu avancé'), { target: { value: JSON.stringify(model().body) } })
  fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))
  await waitFor(() => expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Atelier (copie)' })))
  expect(updateTemplate).not.toHaveBeenCalled()
})
it('applies a session template to the selected class with its supports', async () => {
  vi.mocked(createSession).mockResolvedValue({ session: {} } as never)
  render(
    <TemplatesView classes={[{ _id: 'class-a', name: 'Master A', school: 'École A', status: 'ACTIVE' }] as never} />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Utiliser' }))
  const create = screen.getByRole('button', { name: 'Créer à partir du template' })
  expect(create).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Classe destinataire'), { target: { value: 'class-a' } })
  fireEvent.change(screen.getByLabelText('Date et heure'), { target: { value: '2026-10-03T09:00' } })
  fireEvent.click(create)
  await waitFor(() =>
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-a',
        title: 'Atelier pratique',
        status: 'PLANIFIEE',
        supports: ['https://example.com/cours'],
      }),
    ),
  )
})
it('creates a new class from a class template', async () => {
  vi.mocked(listTemplates).mockResolvedValue({
    templates: [
      { ...model(), kind: 'class', body: { name: 'Master modèle', school: 'École', level: 'M2', weeklyHours: 4 } },
    ],
    total: 1,
  })
  vi.mocked(createClass).mockResolvedValue({ class: {} } as never)
  render(<TemplatesView />)
  fireEvent.click(await screen.findByRole('button', { name: 'Utiliser' }))
  fireEvent.change(screen.getByLabelText('Nom de la nouvelle classe'), { target: { value: 'Master 2027' } })
  fireEvent.click(screen.getByRole('button', { name: 'Créer à partir du template' }))
  await waitFor(() =>
    expect(createClass).toHaveBeenCalledWith({ name: 'Master 2027', school: 'École', level: 'M2', weeklyHours: 4 }),
  )
})
