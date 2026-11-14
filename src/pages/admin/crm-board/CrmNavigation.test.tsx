import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { apiFetch } from '../../../lib/api'
import { getCommandPaletteItems } from '../../../lib/adminNavigation'
import type { User } from '../../../types/auth.types'

const session = vi.hoisted(() => ({ user: null as unknown as User }))
vi.mock('../../../context/AuthContext', async (original) => ({
  ...(await original<typeof import('../../../context/AuthContext')>()),
  useAuth: () => ({ user: session.user, loading: false }),
}))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../components/AdminShell', () => ({ default: () => <Outlet /> }))
vi.mock('../../../components/admin/SearchModal', () => ({ default: () => null }))
vi.mock('../../../components/CookieConsent', () => ({ default: () => null }))
vi.mock('../CrmBoard', () => ({
  default: ({ queue, worklistGroups }: { queue?: boolean; worklistGroups?: string[] }) => (
    <p>{queue ? `File ${worklistGroups?.join('+')}` : 'Pipeline des leads'}</p>
  ),
}))
// Un écran refait pose son propre en-tête : la coque doit alors retirer le sien.
vi.mock('../crm-settings', async () => {
  const { CrmPageHead } = await import('../../../components/admin/crm-ui')
  return {
    default: () => (
      <>
        <CrmPageHead title="Réglages du CRM" lede="Les règles de fonctionnement" />
        <p>Réglages chargés</p>
      </>
    ),
  }
})
vi.mock('./automations', () => ({ default: () => <p>Automatisations chargées</p> }))
vi.mock('./TeamCallDesk', () => ({ default: () => <p>File d’appels chargée</p> }))

const SUPER_ADMIN = { _id: 'admin', name: 'Admin', role: 'SUPER_ADMIN', permissions: [] } as unknown as User
const viewer = (granted: string[], denied: string[] = []) =>
  ({
    _id: 'viewer',
    name: 'Lecteur',
    role: 'VIEWER',
    permissions: [],
    grantedPermissions: granted,
    deniedPermissions: denied,
  }) as unknown as User

function Location() {
  const location = useLocation()
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  )
}
function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}
const momentNames = () =>
  within(screen.getByRole('navigation', { name: 'Moments du travail' }))
    .getAllByRole('link')
    .map((link) => link.querySelector('.crm-ui-moment__label')?.textContent)
const subtabs = (moment: string) => screen.getByRole('navigation', { name: `Sections de ${moment}` })

beforeEach(() => {
  session.user = SUPER_ADMIN
  vi.mocked(apiFetch).mockReset().mockResolvedValue({})
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('Navigation du CRM en quatre moments', () => {
  it('montre les quatre moments, les sous-onglets du moment courant et le lien « Où est quoi ? »', async () => {
    mount('/admin/crm/aujourdhui')
    expect(await screen.findByText(/File overdue\+today/)).toBeInTheDocument()
    expect(momentNames()).toEqual(['Aujourd’hui', 'Prospecter', 'Suivre', 'Piloter'])
    const moments = screen.getByRole('navigation', { name: 'Moments du travail' })
    expect(within(moments).getByRole('link', { current: 'page' })).toHaveTextContent('Aujourd’hui')
    const tabs = within(subtabs('Aujourd’hui')).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Aujourd’hui',
      'Cette semaine',
      'À ne pas laisser filer',
      'Où est quoi ?',
    ])
    expect(tabs[0]).toHaveAttribute('aria-current', 'page')
    expect(tabs[3]).toHaveAttribute('href', '/admin/crm/plan')
  })

  it('monte chaque écran existant sous sa nouvelle adresse', async () => {
    for (const [path, moment, tab, screenText] of [
      ['/admin/crm/aujourdhui/semaine', 'Aujourd’hui', 'Cette semaine', /File upcoming/],
      ['/admin/crm/aujourdhui/filer', 'Aujourd’hui', 'À ne pas laisser filer', /File drifting/],
      ['/admin/crm/prospecter/poste', 'Prospecter', 'Poste d’appel', /File d’appels chargée/],
      ['/admin/crm/suivre/pipeline', 'Suivre', 'Pipeline', /Pipeline des leads/],
      ['/admin/crm/piloter/automatisations', 'Piloter', 'Automatisations', /Automatisations chargées/],
      ['/admin/crm/piloter/reglages', 'Piloter', 'Réglages', /Réglages chargés/],
    ] as const) {
      const { unmount } = mount(path)
      expect(await screen.findByText(screenText)).toBeInTheDocument()
      expect(within(subtabs(moment)).getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
      unmount()
    }
  })

  it('porte le titre de page de chaque écran, et le laisse à la fiche d’un lead', async () => {
    const first = mount('/admin/crm/prospecter/poste')
    expect(await screen.findByRole('heading', { level: 1, name: 'Poste d’appel' })).toBeInTheDocument()
    first.unmount()
    const second = mount('/admin/crm/leads/l1')
    await screen.findByText(/Pipeline des leads/)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    second.unmount()
    mount('/admin/crm/piloter/reglages')
    await screen.findByText('Réglages chargés')
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual([
        'Réglages du CRM',
      ]),
    )
  })

  it('affiche les compteurs réels de la file, et aucun quand la donnée manque', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path === '/api/admin/crm/worklist'
        ? { groups: {}, counts: { overdue: 2, today: 3, upcoming: 4, drifting: 0 } }
        : {},
    )
    mount('/admin/crm/aujourdhui')
    expect(await screen.findByRole('link', { name: 'Aujourd’hui 5' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cette semaine 4' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'À ne pas laisser filer 0' })).toBeInTheDocument()
    expect(screen.getByText('5 à traiter')).toHaveClass('crm-ui-moment__hint')
    fireEvent.click(screen.getByRole('link', { name: /^Suivre/ }))
    expect(within(subtabs('Suivre')).getByRole('link', { name: 'Pipeline' })).not.toHaveAttribute('aria-label')
  })

  it('ouvre un moment sur son premier sous-onglet permis, requête conservée', async () => {
    mount('/admin/crm/piloter?periode=30#objectifs')
    await waitFor(() =>
      expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/piloter/previsions?periode=30#objectifs'),
    )
  })

  it('rattache la fiche d’un lead au pipeline, ou à la file qui l’a ouverte', async () => {
    const first = mount('/admin/crm/leads/l1?q=a')
    expect(await screen.findByText(/Pipeline des leads/)).toBeInTheDocument()
    expect(within(subtabs('Suivre')).getByRole('link', { name: 'Pipeline' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/leads/l1?q=a')
    first.unmount()
    mount('/admin/crm/leads/l1?from=semaine')
    expect(await screen.findByText(/Pipeline des leads/)).toBeInTheDocument()
    expect(within(subtabs('Aujourd’hui')).getByRole('link', { name: 'Cette semaine' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('réserve Prospecter et Réglages à qui peut gérer le CRM, et redirige un accès direct', async () => {
    session.user = viewer(['view_crm'])
    const first = mount('/admin/crm/aujourdhui')
    await screen.findByText(/File overdue/)
    expect(momentNames()).toEqual(['Aujourd’hui', 'Suivre', 'Piloter'])
    first.unmount()

    const second = mount('/admin/crm/piloter/reglages?x=1')
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/piloter/previsions?x=1'))
    expect(within(subtabs('Piloter')).queryByRole('link', { name: 'Réglages' })).toBeNull()
    second.unmount()

    mount('/admin/crm/prospecter/poste?y=2')
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/aujourdhui?y=2'))
  })

  it('ne montre à un gestionnaire des comptes que le moment Suivre et ses comptes', async () => {
    session.user = viewer(['manage_clients'], ['view_crm', 'manage_external_sales'])
    mount('/admin/crm/aujourdhui')
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/suivre/comptes'))
    expect(momentNames()).toEqual(['Suivre'])
    expect(
      within(subtabs('Suivre'))
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Comptes clients', 'Où est quoi ?'])
    expect(apiFetch).not.toHaveBeenCalledWith('/api/admin/crm/worklist')
  })

  it('« Où est quoi ? » liste les anciens onglets permis et mène à leurs écrans', async () => {
    mount('/admin/crm/plan')
    expect(await screen.findByRole('heading', { level: 1, name: 'Plan du CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { current: 'page' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Retour au CRM' })).toHaveAttribute('href', '/admin/crm/aujourdhui')
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(10)
    expect(within(table).getByRole('link', { name: 'Poste d’appel' })).toHaveAttribute(
      'href',
      '/admin/crm/prospecter/poste',
    )
  })
})

describe('Palette de commandes du CRM', () => {
  it('nomme chaque sous-onglet avec son moment et respecte sa permission', () => {
    const items = getCommandPaletteItems(SUPER_ADMIN)
    expect(items.find((item) => item.id === 'crm-poste')).toMatchObject({
      label: 'CRM · Prospecter · Poste d’appel',
      to: '/admin/crm/prospecter/poste',
    })
    expect(items.find((item) => item.id === 'crm-plan')?.to).toBe('/admin/crm/plan')
    expect(items.find((item) => item.id === 'create-lead')?.to).toBe('/admin/crm/suivre/pipeline')

    const viewerItems = getCommandPaletteItems(viewer(['view_crm'])).map((item) => item.id)
    expect(viewerItems).toEqual(expect.arrayContaining(['crm-jour', 'crm-pipeline', 'crm-plan']))
    expect(viewerItems).not.toEqual(expect.arrayContaining(['crm-poste']))
    expect(viewerItems).not.toContain('crm-reglages')
  })
})
