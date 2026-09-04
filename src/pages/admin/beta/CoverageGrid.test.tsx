import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BetaCoverage, BetaScenario, BetaTester } from '../../../services/beta'
import CoverageGrid from './CoverageGrid'

const scenario = (id: string, title: string): BetaScenario => ({
  _id: id,
  campaign: 'c1',
  number: 1,
  identifier: `BETA-${id}`,
  title,
  description: '',
  steps: [],
  rank: 1,
  summaryStatus: 'NOT_TESTED',
})

const tester = (id: string, name: string): BetaTester => ({
  _id: id,
  campaign: 'c1',
  name,
  email: `${name.toLowerCase()}@example.test`,
  invitedAt: '2026-09-01T10:00:00Z',
  lastSeenAt: null,
  revokedAt: null,
  expiresAt: null,
})

const scenarios = [scenario('s1', 'Demander un devis'), scenario('s2', 'Creer un compte')]
const testers = [tester('lea', 'Lea'), tester('max', 'Max')]

const coverage: BetaCoverage = {
  cells: {
    s1: { lea: 'WORKS', max: 'BROKEN' },
    s2: { lea: null, max: null },
  },
  testedCount: 2,
  expectedCount: 4,
  disputedScenarioIds: ['s1'],
  silentTesterIds: [],
}

function renderGrid(override: Partial<BetaCoverage> = {}) {
  return render(<CoverageGrid scenarios={scenarios} testers={testers} coverage={{ ...coverage, ...override }} />)
}

describe('CoverageGrid', () => {
  it('dresse une colonne par testeur et une ligne par demarche', () => {
    renderGrid()
    expect(screen.getByRole('columnheader', { name: /Lea/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Max/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Demander un devis/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Creer un compte/ })).toBeInTheDocument()
  })

  it('dit ce que chaque case signifie, sans compter sur la seule couleur', () => {
    renderGrid()
    const row = screen.getByRole('row', { name: /Demander un devis/ })
    expect(within(row).getByLabelText('Lea : Fonctionne')).toBeInTheDocument()
    expect(within(row).getByLabelText('Max : Ne fonctionne pas')).toBeInTheDocument()
  })

  it('marque explicitement les cases que personne n a remplies', () => {
    renderGrid()
    const row = screen.getByRole('row', { name: /Creer un compte/ })
    expect(within(row).getByLabelText('Lea : pas encore testé')).toBeInTheDocument()
  })

  it('signale les demarches ou les testeurs se contredisent', () => {
    renderGrid()
    const disputed = screen.getByRole('rowheader', { name: /Demander un devis/ })
    expect(within(disputed).getByTitle('Les testeurs ne sont pas d’accord')).toBeInTheDocument()
    const agreed = screen.getByRole('rowheader', { name: /Creer un compte/ })
    expect(within(agreed).queryByTitle('Les testeurs ne sont pas d’accord')).not.toBeInTheDocument()
  })

  it('affiche la couverture atteinte', () => {
    renderGrid()
    expect(screen.getByText('50 %')).toBeInTheDocument()
    expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument()
  })

  it('invite a inviter quelqu un tant qu il n y a pas de testeur', () => {
    render(<CoverageGrid scenarios={scenarios} testers={[]} coverage={{ ...coverage, expectedCount: 0 }} />)
    expect(screen.getByText(/Aucun testeur invité/i)).toBeInTheDocument()
  })
})
