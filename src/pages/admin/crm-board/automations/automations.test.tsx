import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CrmAutomations from './index'

const apiFetch = vi.fn()
vi.mock('../../../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const rule = (over: Record<string, unknown> = {}) => ({
  _id: 'r1',
  name: 'Relance après 7 jours',
  description: 'Évite les leads qui dorment',
  status: 'PAUSED',
  system: false,
  trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED'] } },
  conditions: { op: 'AND', items: [{ field: 'budget', operator: 'gte', value: 10000 }] },
  actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' } }],
  limits: { perLead: 'DAYS', days: 7, maxPerRun: 50 },
  requireApproval: true,
  stats: { runs: 10, ok: 9, errors: 1, lastRunAt: null },
  ...over,
})
const systemRule = rule({ _id: 'r2', name: 'Alerte lead chaud', status: 'ACTIVE', system: true })
const run = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  _id: id,
  rule: 'r1',
  ruleName: 'Relance après 7 jours',
  lead: 'l1',
  leadLabel: `Lead ${id}`,
  trigger: 'LEAD_INACTIVE',
  status,
  steps: [{ action: 'CREATE_TASK', status: status === 'ERR' ? 'ERR' : 'OK', message: status === 'ERR' ? 'SMTP refusé' : 'Tâche créée', at: new Date().toISOString() }],
  durationMs: 400,
  createdAt: new Date().toISOString(),
  ...over,
})

const calls = () => apiFetch.mock.calls.map(([url, opts]) => ({ url: String(url), method: (opts as RequestInit | undefined)?.method ?? 'GET', body: (opts as RequestInit | undefined)?.body }))

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    if (url === '/api/admin/crm/rules') return { items: [rule(), systemRule] }
    if (url.startsWith('/api/admin/crm/rules/runs?')) {
      const status = new URL(url, 'http://x').searchParams.get('status')
      const all = [run('a', 'OK'), run('b', 'ERR')]
      const items = status ? all.filter((r) => r.status === status) : all
      return { items, page: 1, pageSize: 50, total: items.length }
    }
    if (url === '/api/admin/crm/rules/r1' && opts?.method === 'PATCH') return rule(JSON.parse(String(opts.body)))
    return {}
  })
})

describe('onglet Automatisations', () => {
  it('affiche les règles, leur flux Quand / Si / Alors et les KPI issus des stats', async () => {
    render(<CrmAutomations />)
    expect(await screen.findByText('Relance après 7 jours')).toBeInTheDocument()
    const card = screen.getByTestId('rule-r1')
    expect(within(card).getByText('Quand')).toBeInTheDocument()
    expect(within(card).getByText('Si')).toBeInTheDocument()
    expect(within(card).getByText('Alors')).toBeInTheDocument()
    expect(within(card).getByText(/Montant ≥ 10000/)).toBeInTheDocument()
    expect(screen.getByText('Système')).toBeInTheDocument()
    // règle système : pas de « Modifier », mais « Dupliquer »
    const sys = screen.getByTestId('rule-r2')
    expect(within(sys).queryByRole('button', { name: /Modifier/ })).toBeNull()
    expect(within(sys).getByRole('button', { name: /Dupliquer/ })).toBeInTheDocument()
    // 1 active sur 2 ; 20 exécutions ; 18/20 = 90 %
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getAllByText('90 %').length).toBeGreaterThan(0)
  })

  it('active une règle en pause avec un PATCH status', async () => {
    render(<CrmAutomations />)
    const toggle = await screen.findByRole('button', { name: 'Activer la règle « Relance après 7 jours »' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'))
    const patch = calls().find((c) => c.method === 'PATCH')
    expect(patch?.url).toBe('/api/admin/crm/rules/r1')
    expect(JSON.parse(String(patch?.body))).toEqual({ status: 'ACTIVE' })
  })

  it('filtre le journal par statut côté API', async () => {
    render(<CrmAutomations />)
    await screen.findByText('Relance après 7 jours')
    fireEvent.click(screen.getByRole('tab', { name: 'Journal d’exécution' }))
    expect(await screen.findByText('Lead a')).toBeInTheDocument()
    expect(screen.getByText('Lead b')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Erreurs/ }))
    await waitFor(() => expect(screen.queryByText('Lead a')).toBeNull())
    expect(screen.getByText('Lead b')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Erreurs/ })).toHaveAttribute('aria-pressed', 'true')
    expect(calls().some((c) => c.url.includes('runs?status=ERR'))).toBe(true)
    // détail dépliable avec relance sur erreur
    fireEvent.click(screen.getByText('Lead b'))
    fireEvent.click(await screen.findByRole('button', { name: 'Relancer l’exécution' }))
    await waitFor(() => expect(calls().some((c) => c.method === 'POST' && c.url.endsWith('/runs/b/retry'))).toBe(true))
  })
})
