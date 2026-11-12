import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../../types/auth.types'
import App from '../../../App'
import { translate } from '../../../i18n'
import { ADMIN_HUBS } from '../../../lib/adminHubs'
import { LEGACY_ADMIN_LIST_ROUTES } from '../../../lib/adminHubRoutes'

let currentUser: User
vi.mock('../../../context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../context/AuthContext')>()),
  useAuth: () => ({ user: currentUser, loading: false }),
}))
vi.mock('../../../components/AdminShell', () => ({ default: () => <Outlet /> }))
vi.mock('../../../components/admin/SearchModal', () => ({ default: () => null }))
vi.mock('../../../components/CookieConsent', () => ({ default: () => null }))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({ decisions: [] }) }))
vi.mock('../Messaging', () => ({ default: () => <p>Page Messaging</p> }))
vi.mock('../ActivityCenter', () => ({ default: () => <p>Page ActivityCenter</p> }))
vi.mock('../EmailComposer', () => ({ default: () => <p>Page EmailComposer</p> }))
vi.mock('../AdminDashboard', () => ({ default: () => <p>Page AdminDashboard</p> }))
vi.mock('../SuperAdminDashboard', () => ({ default: () => <p>Page SuperAdminDashboard</p> }))
vi.mock('../analytics', () => ({ default: () => <p>Page Analytics</p> }))
vi.mock('../CrmBoard', () => ({ default: () => <p>Page CrmBoard</p> }))
vi.mock('../ClientAccountList', () => ({ default: () => <p>Page ClientAccountList</p> }))
vi.mock('../ExternalSales', () => ({ default: () => <p>Page ExternalSales</p> }))
vi.mock('../GestionBoard', () => ({ default: () => <p>Page GestionBoard</p> }))
vi.mock('../projects-portfolio/ProjectsPortfolio', () => ({ default: () => <p>Page ProjectsPortfolio</p> }))
vi.mock('../InternalProjectList', () => ({ default: () => <p>Page InternalProjectList</p> }))
vi.mock('../SubsidiaryList', () => ({ default: () => <p>Page SubsidiaryList</p> }))
vi.mock('../TemplateList', () => ({ default: () => <p>Page TemplateList</p> }))
vi.mock('../change-requests', () => ({ default: () => <p>Page AdminChangeRequests</p> }))
vi.mock('../TicketList', () => ({ default: () => <p>Page TicketList</p> }))
vi.mock('../dev-workspace', () => ({ default: () => <p>Page DevWorkspace</p> }))
vi.mock('../beta', () => ({ default: () => <p>Page BetaWorkspace</p> }))
vi.mock('../InternList', () => ({ default: () => <p>Page InternList</p> }))
vi.mock('../AdminList', () => ({ default: () => <p>Page AdminList</p> }))
vi.mock('../ToolAccessList', () => ({ default: () => <p>Page ToolAccessList</p> }))
vi.mock('../QualiopiBoard', () => ({ default: () => <p>Page QualiopiBoard</p> }))
vi.mock('../education', () => ({ default: () => <p>Page EducationWorkspace</p> }))
vi.mock('../SystemHealth', () => ({ default: () => <p>Page SystemHealth</p> }))
vi.mock('../AuditLog', () => ({ default: () => <p>Page AuditLog</p> }))
vi.mock('../AgentTokensList', () => ({ default: () => <p>Page AgentTokensList</p> }))
vi.mock('../Webhooks', () => ({ default: () => <p>Page Webhooks</p> }))
vi.mock('../MyReports', () => ({ default: () => <p>Page MyReports</p> }))
vi.mock('../accueil', () => ({ default: () => <p>Page Accueil</p> }))
vi.mock('../DecisionsList', () => ({ default: () => <p>Page DecisionsList</p> }))
vi.mock('../client-detail', () => ({ default: () => <p>Page ClientAccountDetail</p> }))
vi.mock('../AdminNew', () => ({ default: () => <p>Page AdminNew</p> }))
vi.mock('../AdminEdit', () => ({ default: () => <p>Page AdminEdit</p> }))
vi.mock('../ClientAccountNew', () => ({ default: () => <p>Page ClientAccountNew</p> }))
vi.mock('../ProjectDetail', () => ({ default: () => <p>Page ProjectDetail</p> }))
vi.mock('../project-form', () => ({ default: () => <p>Page ProjectForm</p> }))
vi.mock('../InternalProjectDetail', () => ({ default: () => <p>Page InternalProjectDetail</p> }))
vi.mock('../InternDetail', () => ({ default: () => <p>Page InternDetail</p> }))
vi.mock('../SubsidiaryDetail', () => ({ default: () => <p>Page SubsidiaryDetail</p> }))
vi.mock('../change-requests/ChangeRequestDetail', () => ({ default: () => <p>Page ChangeRequestDetail</p> }))
vi.mock('../dev-workspace/DevProjectCockpit', () => ({ default: () => <p>Page DevProjectCockpit</p> }))
vi.mock('../beta/CampaignCockpit', () => ({ default: () => <p>Page CampaignCockpit</p> }))
vi.mock('../Calendar', () => ({ default: () => <p>Page Calendar</p> }))

function Location() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="URL">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => navigate(-1)}>Précédent</button>
      <button onClick={() => navigate(1)}>Suivant</button>
    </>
  )
}
function mount(path: string, previous = '/admin/guide') {
  return render(
    <MemoryRouter initialEntries={[previous, path]} initialIndex={1}>
      <App />
      <Location />
    </MemoryRouter>,
  )
}
function viewer(grantedPermissions: string[], deniedPermissions: string[] = []): User {
  return {
    _id: 'u1',
    name: 'Utilisateur',
    email: 'user@example.test',
    role: 'VIEWER',
    permissions: [],
    grantedPermissions,
    deniedPermissions,
  }
}

beforeEach(() => {
  currentUser = { ...viewer([]), role: 'SUPER_ADMIN' }
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

const cases = [
  {
    hub: 'inbox',
    legacy: '/admin/centre-activite',
    to: '/admin/inbox/activite',
    visible: ['Activité', 'Notifications'],
    grant: [],
    deny: ['view_messaging'],
  },
  {
    hub: 'analytics',
    legacy: '/admin/dashboard',
    to: '/admin/analytics/business',
    visible: ['Business'],
    grant: [],
    deny: ['view_projects'],
  },
  {
    hub: 'crm',
    legacy: '/admin/comptes-clients',
    to: '/admin/crm/comptes',
    visible: ['Comptes clients'],
    grant: ['manage_clients'],
    deny: ['view_crm', 'manage_external_sales'],
  },
  {
    hub: 'projets',
    legacy: '/admin/gestion',
    to: '/admin/projets/clients',
    visible: ['Clients', 'Internes', 'Fiches projets'],
    grant: ['view_projects'],
    deny: ['edit_projects'],
  },
  {
    hub: 'demandes',
    legacy: '/admin/tickets',
    to: '/admin/demandes/equipe',
    visible: ['Équipe'],
    grant: ['view_tickets'],
    deny: ['view_change_requests'],
  },
  {
    hub: 'dev',
    legacy: '/admin/beta',
    to: '/admin/dev/recette',
    visible: ['Recette'],
    grant: ['view_beta'],
    deny: ['view_dev', 'submit_dev_suggestion'],
  },
  {
    hub: 'equipe',
    legacy: '/admin/comptes-admin',
    to: '/admin/equipe/comptes',
    visible: ['Rôles & comptes', 'Accès outils'],
    grant: ['manage_admins'],
    deny: [],
  },
  {
    hub: 'formation',
    legacy: '/admin/education',
    to: '/admin/formation/pedagogie',
    visible: ['Pédagogie'],
    grant: ['view_education'],
    deny: [],
  },
  {
    hub: 'systeme',
    legacy: '/admin/webhooks',
    to: '/admin/systeme/integrations',
    visible: ['Intégrations'],
    grant: ['view_webhooks'],
    deny: ['manage_admins'],
  },
] as const

describe.each(cases)('Routage du hub $hub', ({ hub, legacy, to, visible, grant, deny }) => {
  it('redirige la liste historique avec paramètres et affiche les seuls onglets autorisés', async () => {
    currentUser = viewer([...grant], [...deny])
    mount(`${legacy}?project=p1&view=missions#selection`)
    await screen.findByRole('tablist')
    expect(screen.getByLabelText('URL')).toHaveTextContent(`${to}?project=p1&view=missions#selection`)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([...visible])
    expect(screen.getByRole('tabpanel')).toHaveClass('admin-hub-panel')
    if (hub === 'systeme') {
      expect(await screen.findByText('Page Webhooks')).toBeInTheDocument()
      expect(screen.queryByText('Page AgentTokensList')).not.toBeInTheDocument()
    }
  })

  it('rend tous les onglets pour un super admin et synchronise clic, historique et URL', async () => {
    const definition = ADMIN_HUBS[hub]
    mount(definition.tabs[0].to)
    await screen.findByRole('tablist')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      definition.tabs.map((tab) => translate(tab.labelKey)),
    )
    const second = definition.tabs[1]
    fireEvent.click(screen.getByRole('tab', { name: translate(second.labelKey) }))
    expect(screen.getByLabelText('URL')).toHaveTextContent(second.to)
    expect(screen.getByRole('tab', { name: translate(second.labelKey) })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(screen.getByRole('tab', { name: translate(definition.tabs[0].labelKey) })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('tab', { name: translate(second.labelKey) })).toHaveAttribute('aria-selected', 'true')
  })

  it('protège aussi un accès direct à un onglet interdit', async () => {
    currentUser = viewer([...grant], [...deny])
    const definition = ADMIN_HUBS[hub]
    const forbidden = definition.tabs.find((tab) => !(visible as readonly string[]).includes(translate(tab.labelKey)))
    if (!forbidden) return // Équipe : les deux accès par permission sont accordés ensemble, Membres reste interdit.
    mount(`${forbidden.to}?source=direct`)
    await screen.findByRole('tablist')
    expect(screen.queryByRole('tab', { name: translate(forbidden.labelKey) })).not.toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveTextContent(`${to}?source=direct`)
  })
})

describe('Compatibilité des URL admin', () => {
  it.each(Object.entries(LEGACY_ADMIN_LIST_ROUTES))('%s → %s, query string conservée', async (old, destination) => {
    mount(`${old}?q=deux+termes&project=p1#section`)
    await screen.findByRole('tablist')
    expect(screen.getByLabelText('URL')).toHaveTextContent(
      `${destination.split('?')[0]}?q=deux+termes&project=p1#section`,
    )
  })

  it('conserve le filtre Arrow par défaut de son ancienne URL', async () => {
    mount('/admin/arrow-prospection?q=client#selection')
    await screen.findByRole('tablist')
    expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/crm?q=client&project=ARROW#selection')
  })

  it('remplace l’entrée historique au lieu de créer une boucle au retour arrière', async () => {
    mount('/admin/messages?q=test', '/admin/mon-espace')
    await screen.findByRole('tablist')
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(await screen.findByText('Page Accueil')).toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveTextContent('/admin/mon-espace')
  })

  it.each([
    ['/admin/comptes-clients/u1', 'ClientAccountDetail'],
    ['/admin/comptes-clients/nouveau', 'ClientAccountNew'],
    ['/admin/comptes-admin/u1', 'AdminEdit'],
    ['/admin/comptes-admin/nouveau', 'AdminNew'],
    ['/admin/projets/p1', 'ProjectDetail'],
    ['/admin/projets/nouveau', 'ProjectForm'],
    ['/admin/projets-internes/p1', 'InternalProjectDetail'],
    ['/admin/stagiaires/u1', 'InternDetail'],
    ['/admin/filiales/s1', 'SubsidiaryDetail'],
    ['/admin/demandes-clients/r1', 'ChangeRequestDetail'],
    ['/admin/crm/leads/l1', 'CrmBoard'],
    ['/admin/dev/issues/i1', 'DevWorkspace'],
    ['/admin/dev/projects/p1', 'DevProjectCockpit'],
    ['/admin/beta/campaigns/c1', 'CampaignCockpit'],
    ['/admin/calendrier', 'Calendar'],
  ])('préserve %s', async (path, page) => {
    mount(path)
    expect(await screen.findByText(`Page ${page}`)).toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveTextContent(path)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it.each(['/admin', '/admin/mon-espace'])(
    'rend le nouvel accueil sur %s, sans digest ni grille personnalisable',
    async (path) => {
      mount(path)
      expect(await screen.findByText('Page Accueil')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /À arbitrer/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Personnaliser/ })).not.toBeInTheDocument()
    },
  )

  it('refuse un hub entièrement inaccessible sans monter ses enfants', async () => {
    currentUser = viewer([], ['view_crm', 'manage_clients', 'manage_external_sales'])
    mount('/admin/crm')
    expect(await screen.findByText('Page Accueil')).toBeInTheDocument()
    expect(screen.queryByText('Page CrmBoard')).not.toBeInTheDocument()
  })

  it('conserve le scroll de la page entre onglets du même hub', async () => {
    mount('/admin/inbox/conversations')
    await screen.findByRole('tablist')
    vi.mocked(window.scrollTo).mockClear()
    fireEvent.click(screen.getByRole('tab', { name: 'Activité' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Activité' })).toHaveAttribute('aria-selected', 'true'))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
