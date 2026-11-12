import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../../App'

const session = vi.hoisted(() => ({
  user: { _id: 'admin', name: 'Admin', role: 'SUPER_ADMIN', permissions: [] } as Record<string, unknown>,
}))
vi.mock('../../../context/AuthContext', async (original) => ({
  ...(await original<typeof import('../../../context/AuthContext')>()),
  useAuth: () => ({ user: session.user, loading: false }),
}))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../components/AdminShell', () => ({ default: () => <Outlet /> }))
vi.mock('../../../components/admin/SearchModal', () => ({ default: () => null }))
vi.mock('../../../components/CookieConsent', () => ({ default: () => null }))
vi.mock('../CrmBoard', () => ({ default: () => <p>Leads chargés</p> }))
vi.mock('../crm-settings', () => ({ default: () => <p>Réglages chargés</p> }))
vi.mock('./automations', () => ({ default: () => <p>Automatisations chargées</p> }))
vi.mock('./TeamCallDesk', () => ({ default: () => <p>File d’appels chargée</p> }))

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

it('redirige les anciennes adresses CRM en conservant les filtres et sélectionne le bon onglet', async () => {
  for (const [from, to, label] of [
    ['/admin/crm?mode=file&project=ARROW#suite', '/admin/crm/a-traiter?project=ARROW#suite', 'À traiter'],
    ['/admin/crm?mode=table&project=ARROW#suite', '/admin/crm?mode=liste&project=ARROW#suite', 'Leads'],
    ['/admin/crm/leads/l1', '/admin/crm/leads/l1', 'Leads'],
    ['/admin/crm/settings', '/admin/crm/reglages', 'Réglages'],
    ['/admin/crm/sequences', '/admin/crm/automatisations?section=sequences', 'Automatisations'],
    ['/admin/crm/appels?mine=0', '/admin/crm/appels?mine=0', 'Appels'],
  ]) {
    const { unmount } = render(
      <MemoryRouter initialEntries={[from]}>
        <App />
        <Location />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent(to))
    expect(await screen.findByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
    unmount()
  }
})

it('place « Appels » juste après « À traiter » et le réserve à qui peut gérer le CRM', async () => {
  const tabs = async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/crm/a-traiter']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('tablist')
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent)
    unmount()
    return names
  }
  expect((await tabs()).slice(0, 3)).toEqual(['À traiter', 'Appels', 'Leads'])

  session.user = { _id: 'viewer', name: 'Lecteur', role: 'VIEWER', permissions: [], grantedPermissions: ['view_crm'] }
  const viewerTabs = await tabs()
  expect(viewerTabs).toContain('À traiter')
  expect(viewerTabs).not.toContain('Appels')
})
