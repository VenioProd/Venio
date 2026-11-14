import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'
import { LEGACY_ADMIN_LIST_ROUTES } from '../../../lib/adminHubRoutes'
import { CRM_LEGACY_ROUTES } from '../../../lib/crmNavigation'
import type { User } from '../../../types/auth.types'

/**
 * Preuve que chaque ancienne adresse du CRM — y compris celles que le serveur
 * écrit dans les e-mails, notifications, boîte de réception et fiches projet —
 * arrive au bon écran, requête et ancre conservées.
 */
vi.mock('../../../context/AuthContext', async (original) => ({
  ...(await original<typeof import('../../../context/AuthContext')>()),
  useAuth: () => ({
    user: { _id: 'admin', name: 'Admin', role: 'SUPER_ADMIN', permissions: [] } as unknown as User,
    loading: false,
  }),
}))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../components/AdminShell', () => ({ default: () => <Outlet /> }))
vi.mock('../../../components/admin/SearchModal', () => ({ default: () => null }))
vi.mock('../../../components/CookieConsent', () => ({ default: () => null }))
vi.mock('../CrmBoard', () => ({
  default: ({ queue, worklistGroups }: { queue?: boolean; worklistGroups?: string[] }) => (
    <p>{queue ? `Écran file ${worklistGroups?.join('+')}` : 'Écran pipeline'}</p>
  ),
}))
vi.mock('../crm-board/TeamCallDesk', () => ({ default: () => <p>Écran poste d’appel</p> }))
vi.mock('../../../components/callScriptReport/ScriptReportsView', () => ({ default: () => <p>Écran scripts</p> }))
vi.mock('../crm-board/automations', () => ({ default: () => <p>Écran automatisations</p> }))
vi.mock('../crm-settings', () => ({ default: () => <p>Écran réglages</p> }))
vi.mock('../analytics/crm', () => ({ default: () => <p>Écran prévisions</p> }))
vi.mock('../analytics/crm/ForecastSection', () => ({ default: () => null }))
vi.mock('../ClientAccountList', () => ({ default: () => <p>Écran comptes clients</p> }))
vi.mock('../ExternalSales', () => ({ default: () => <p>Écran partenaires</p> }))

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

const SCREENS: Record<string, [moment: string, tab: string, screen: string]> = {
  '/admin/crm/aujourdhui': ['Aujourd’hui', 'Aujourd’hui', 'Écran file overdue+today'],
  '/admin/crm/prospecter/poste': ['Prospecter', 'Poste d’appel', 'Écran poste d’appel'],
  '/admin/crm/prospecter/scripts': ['Prospecter', 'Scripts et rapport', 'Écran scripts'],
  '/admin/crm/suivre/pipeline': ['Suivre', 'Pipeline', 'Écran pipeline'],
  '/admin/crm/suivre/comptes': ['Suivre', 'Comptes clients', 'Écran comptes clients'],
  '/admin/crm/suivre/partenaires': ['Suivre', 'Partenaires', 'Écran partenaires'],
  '/admin/crm/piloter/previsions': ['Piloter', 'Prévisions et objectifs', 'Écran prévisions'],
  '/admin/crm/piloter/automatisations': ['Piloter', 'Automatisations', 'Écran automatisations'],
  '/admin/crm/piloter/reglages': ['Piloter', 'Réglages', 'Écran réglages'],
}

async function expectArrival(from: string, expectedUrl: string) {
  const { unmount } = render(
    <MemoryRouter initialEntries={['/admin/guide', from]} initialIndex={1}>
      <App />
      <Location />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent(expectedUrl))
  const pathname = expectedUrl.split(/[?#]/)[0]
  const [moment, tab, text] =
    SCREENS[pathname.startsWith('/admin/crm/leads/') ? '/admin/crm/suivre/pipeline' : pathname]
  expect(await screen.findByText(text)).toBeInTheDocument()
  const nav = screen.getByRole('navigation', { name: `Sections de ${moment}` })
  expect(within(nav).getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
  unmount()
}

const query = '?q=deux+termes&project=p1#section'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('Anciennes adresses du CRM', () => {
  it.each(Object.entries(CRM_LEGACY_ROUTES))('%s → %s', async (old, destination) => {
    const [pathname, defaults] = destination.split('?')
    await expectArrival(
      `${old}${query}`,
      `${pathname}?q=deux+termes&project=p1${defaults ? `&${defaults}` : ''}#section`,
    )
  })

  it.each(Object.entries(LEGACY_ADMIN_LIST_ROUTES).filter(([, destination]) => destination.startsWith('/admin/crm')))(
    'alias admin %s → %s',
    async (old, destination) => {
      await expectArrival(`${old}${query}`, `${destination.split('?')[0]}?q=deux+termes&project=p1#section`)
    },
  )

  it.each([
    // Liens écrits par le serveur (backend/src : e-mails, notifications, inbox, fiches projet, rapports).
    ['/admin/crm', '/admin/crm/suivre/pipeline'],
    ['/admin/crm?mode=file', '/admin/crm/aujourdhui'],
    ['/admin/crm?mode=file&project=ARROW#suite', '/admin/crm/aujourdhui?project=ARROW#suite'],
    ['/admin/crm?mode=table&project=ARROW#suite', '/admin/crm/suivre/pipeline?mode=liste&project=ARROW#suite'],
    ['/admin/crm?project=ARROW&entity=ARROW', '/admin/crm/suivre/pipeline?project=ARROW&entity=ARROW'],
    ['/admin/crm?mode=kanban', '/admin/crm/suivre/pipeline?mode=kanban'],
    ['/admin/crm/rapports-scripts', '/admin/crm/prospecter/scripts'],
    ['/admin/crm/sequences?section=regles', '/admin/crm/piloter/automatisations?section=regles'],
    ['/admin/arrow-prospection?q=client#selection', '/admin/crm/suivre/pipeline?q=client&project=ARROW#selection'],
    ['/admin/crm/leads/0123456789abcdef01234567', '/admin/crm/leads/0123456789abcdef01234567'],
  ])('%s → %s', async (from, to) => {
    await expectArrival(from, to)
  })

  it('remplace l’entrée d’historique au lieu de créer une boucle au retour', async () => {
    function Back() {
      const navigate = useNavigate()
      return <button onClick={() => navigate(-1)}>Précédent</button>
    }
    render(
      <MemoryRouter initialEntries={['/admin/crm/plan', '/admin/crm/a-traiter']} initialIndex={1}>
        <App />
        <Back />
        <Location />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/aujourdhui'))
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm/plan'))
  })
})
