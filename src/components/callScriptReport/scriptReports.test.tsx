import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import type { ScriptReport } from '../../services/callScriptReports'
import ScriptReportsView from './ScriptReportsView'
import { scriptReportFixtures } from './scriptReports.fixtures'

vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api')), apiFetch: vi.fn() }))

const [ready, skipped] = scriptReportFixtures as [ScriptReport, ScriptReport]

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockImplementation((async (path: string) => {
    if (path === '/api/commercial/script-reports') return { reports: [ready, skipped] }
    const found = [ready, skipped].find((r) => path.endsWith(`/${r._id}`))
    return { report: found }
  }) as typeof apiFetch)
})

it('ouvre la dernière semaine : conversion face à l’objectif, citations vérifiées, puis l’historique', async () => {
  render(<ScriptReportsView base="/api/commercial/script-reports" />)
  expect(await screen.findByText('« votre offre est trop chère pour nous »')).toBeTruthy()
  expect(screen.getByRole('img', { name: /Conversion 50 %, Objectif 40 %/ })).toBeTruthy()
  expect(screen.getByText('Ouvrir sur le résultat attendu avant le prix.')).toBeTruthy()
  expect(screen.getByText(/1 citation\(s\) écartée/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /Semaine 45/ }))
  expect(await screen.findByText(/Aucun appel transcrit cette semaine/)).toBeTruthy()
  expect(screen.queryByText('Objections récurrentes')).toBeNull()
})

it('aucun rapport : un état vide explicite', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ reports: [] })
  render(<ScriptReportsView base="/api/commercial/script-reports" />)
  expect(await screen.findByText(/Aucun rapport pour l’instant/)).toBeTruthy()
})
