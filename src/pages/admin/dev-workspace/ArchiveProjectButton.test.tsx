import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ArchiveProjectButton from './ArchiveProjectButton'
import { setDevProjectArchived } from '../../../services/dev'

vi.mock('../../../services/dev', async (original) => ({
  ...(await original<typeof import('../../../services/dev')>()),
  setDevProjectArchived: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(setDevProjectArchived).mockResolvedValue({} as never)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const modal = async () => {
  await waitFor(() => expect(document.querySelector('.confirm-modal')).not.toBeNull())
  return document.querySelector('.confirm-modal') as HTMLElement
}
const confirmBtn = (m: HTMLElement) => m.querySelector('.confirm-modal__btn--confirm') as HTMLButtonElement
const cancelBtn = (m: HTMLElement) => m.querySelector('.confirm-modal__btn--cancel') as HTMLButtonElement

it('propose Archiver, demande confirmation puis archive', async () => {
  const onChanged = vi.fn()
  render(<ArchiveProjectButton projectId="p1" projectName="Ancien" archived={false} onChanged={onChanged} />)
  fireEvent.click(screen.getByRole('button', { name: /Archiver|Archive/ }))
  const m = await modal()
  expect(m.textContent).toContain('Ancien')
  fireEvent.click(confirmBtn(m))
  await waitFor(() => expect(setDevProjectArchived).toHaveBeenCalledWith('p1', true))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true))
})

it('propose Restaurer pour un projet archivé', async () => {
  const onChanged = vi.fn()
  render(<ArchiveProjectButton projectId="p1" projectName="Ancien" archived onChanged={onChanged} />)
  fireEvent.click(screen.getByRole('button', { name: /Restaurer|Restore/ }))
  fireEvent.click(confirmBtn(await modal()))
  await waitFor(() => expect(setDevProjectArchived).toHaveBeenCalledWith('p1', false))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(false))
})

it('ne fait rien si la confirmation est annulée', async () => {
  const onChanged = vi.fn()
  render(<ArchiveProjectButton projectId="p1" projectName="Ancien" archived={false} onChanged={onChanged} />)
  fireEvent.click(screen.getByRole('button', { name: /Archiver|Archive/ }))
  fireEvent.click(cancelBtn(await modal()))
  await new Promise((r) => setTimeout(r, 20))
  expect(setDevProjectArchived).not.toHaveBeenCalled()
  expect(onChanged).not.toHaveBeenCalled()
})

it('affiche l’erreur si l’appel échoue', async () => {
  vi.mocked(setDevProjectArchived).mockRejectedValue(new Error('Boom'))
  render(<ArchiveProjectButton projectId="p1" projectName="Ancien" archived={false} onChanged={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Archiver|Archive/ }))
  fireEvent.click(confirmBtn(await modal()))
  expect((await screen.findByRole('alert')).textContent).toBe('Boom')
})
