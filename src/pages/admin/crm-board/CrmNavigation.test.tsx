import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../../../App'

vi.mock('../../../context/AuthContext', async (original) => ({
  ...(await original<typeof import('../../../context/AuthContext')>()),
  useAuth: () => ({ user: { _id: 'admin', name: 'Admin', role: 'SUPER_ADMIN', permissions: [] }, loading: false }),
}))
vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../components/AdminShell', () => ({ default: () => <Outlet /> }))
vi.mock('../../../components/admin/SearchModal', () => ({ default: () => null }))
vi.mock('../../../components/CookieConsent', () => ({ default: () => null }))
vi.mock('../CrmBoard', () => ({ default: () => <p>Leads chargés</p> }))
vi.mock('../crm-settings', () => ({ default: () => <p>Réglages chargés</p> }))
vi.mock('./automations', () => ({ default: () => <p>Automatisations chargées</p> }))

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
    ['/admin/crm/leads/l1', '/admin/crm/leads/l1', 'Leads'],
    ['/admin/crm/settings', '/admin/crm/reglages', 'Réglages'],
    ['/admin/crm/sequences', '/admin/crm/automatisations?section=sequences', 'Automatisations'],
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
