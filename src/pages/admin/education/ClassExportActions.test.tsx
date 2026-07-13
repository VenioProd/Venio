import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassExportActions } from './ClassExportActions'
import { downloadClassWorkspaceExport } from '../../../services/education'

vi.mock('../../../services/education', () => ({
  downloadClassWorkspaceExport: vi.fn(),
}))

describe('ClassExportActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the active export state and prevents a parallel download', async () => {
    let complete: (() => void) | undefined
    vi.mocked(downloadClassWorkspaceExport).mockImplementation(
      () => new Promise<void>((resolve) => { complete = resolve }),
    )
    render(<ClassExportActions classId="classe-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Exporter les cours en CSV' }))

    expect(downloadClassWorkspaceExport).toHaveBeenCalledWith('classe-1', 'csv')
    expect(screen.getByRole('button', { name: 'Exporter les cours en CSV' })).toHaveTextContent('Export CSV…')
    expect(screen.getByRole('button', { name: 'Exporter la classe en JSON' })).toBeDisabled()

    complete?.()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter les cours en CSV' })).toHaveTextContent('CSV'))
  })

  it('renders an explicit download error', async () => {
    vi.mocked(downloadClassWorkspaceExport).mockRejectedValue(new Error('MFA récente requise'))
    render(<ClassExportActions classId="classe-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Exporter la classe en JSON' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('MFA récente requise')
  })
})
