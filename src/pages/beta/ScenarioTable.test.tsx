import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { TesterRun, TesterScenario } from '../../services/betaTester'
import ScenarioTable from './ScenarioTable'

const scenario = (over: Partial<TesterScenario> = {}): TesterScenario => ({
  _id: 's1',
  identifier: 'BETA-1',
  title: 'La plateforme est debout',
  description: '',
  steps: [
    { order: 1, instruction: 'Ouvrir la page d’état', expected: 'Tout au vert' },
    { order: 2, instruction: 'Ouvrir /login', expected: 'Zéro erreur en console' },
  ],
  summaryStatus: 'NOT_TESTED',
  ...over,
})

const run = (over: Partial<TesterRun> = {}): TesterRun => ({
  _id: 'r1',
  scenario: 's1',
  mine: true,
  verdict: 'WORKS',
  severity: null,
  status: 'OPEN',
  failedStep: null,
  title: '',
  confirmationCount: 0,
  confirmedByMe: false,
  createdAt: '2026-09-04T10:00:00Z',
  ...over,
})

function renderTable(props: Partial<React.ComponentProps<typeof ScenarioTable>> = {}) {
  return render(
    <ScenarioTable
      scenarios={[scenario(), scenario({ _id: 's2', identifier: 'BETA-2', title: 'Le prospect souscrit' })]}
      myRuns={{}}
      checkedByScenario={{}}
      openId={null}
      onToggle={vi.fn()}
      renderDetail={() => <div>détail</div>}
      {...props}
    />,
  )
}

describe('ScenarioTable', () => {
  it('presente les demarches en lignes, une par demarche', () => {
    renderTable()
    expect(screen.getAllByRole('row')).toHaveLength(3) // en-tête + 2
    expect(screen.getByRole('rowheader', { name: /La plateforme est debout/ })).toBeInTheDocument()
  })

  it('situe chaque demarche dans le parcours plutot que par son identifiant', () => {
    renderTable()
    const first = screen.getByRole('row', { name: /La plateforme est debout/ })
    expect(within(first).getByText('1')).toBeInTheDocument()
    expect(within(first).queryByText('BETA-1')).not.toBeInTheDocument()
  })

  it('montre l avancement des coches de chaque demarche', () => {
    renderTable({ checkedByScenario: { s1: [1] } })
    const row = screen.getByRole('row', { name: /La plateforme est debout/ })
    expect(within(row).getByText('1 / 2')).toBeInTheDocument()
  })

  it('annonce une demarche non commencee sans faire croire a un echec', () => {
    renderTable()
    const row = screen.getByRole('row', { name: /Le prospect souscrit/ })
    expect(within(row).getByText(/à tester/i)).toBeInTheDocument()
  })

  it('affiche le verdict deja rendu par le testeur', () => {
    renderTable({ myRuns: { s1: run({ verdict: 'BROKEN' }) } })
    const row = screen.getByRole('row', { name: /La plateforme est debout/ })
    expect(within(row).getByText('Ne fonctionne pas')).toBeInTheDocument()
  })

  it('nomme le verdict d une demarche que le testeur n a pas pu derouler', () => {
    renderTable({ myRuns: { s1: run({ verdict: 'BLOCKED' }) } })
    const row = screen.getByRole('row', { name: /La plateforme est debout/ })
    expect(within(row).getByText(/n.a pas pu être testée/i)).toBeInTheDocument()
  })

  it('signale ce qui a ete corrige et attend une revalidation', () => {
    renderTable({ myRuns: { s1: run({ verdict: 'BROKEN', status: 'FIXED' }) } })
    const row = screen.getByRole('row', { name: /La plateforme est debout/ })
    expect(within(row).getByText(/à revérifier/i)).toBeInTheDocument()
  })

  it('ouvre le detail de la demarche au clic', () => {
    const onToggle = vi.fn()
    renderTable({ onToggle })
    fireEvent.click(screen.getByRole('button', { name: /La plateforme est debout/ }))
    expect(onToggle).toHaveBeenCalledWith('s1')
  })

  it('n affiche le detail que de la demarche ouverte', () => {
    renderTable({ openId: 's1', renderDetail: (s) => <div>détail de {s.title}</div> })
    expect(screen.getByText(/détail de La plateforme est debout/)).toBeInTheDocument()
    expect(screen.queryByText(/détail de Le prospect souscrit/)).not.toBeInTheDocument()
  })

  it('indique quelle ligne est deployee aux lecteurs d ecran', () => {
    renderTable({ openId: 's1' })
    expect(screen.getByRole('button', { name: /La plateforme est debout/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Le prospect souscrit/ })).toHaveAttribute('aria-expanded', 'false')
  })
})
