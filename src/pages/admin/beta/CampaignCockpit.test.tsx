import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const campaign = {
  _id: 'c1',
  devProject: { _id: 'p1', key: 'ARR', name: 'Arrow' },
  name: 'Passe de contrôle',
  description: '',
  targetUrl: null,
  status: 'RUNNING' as const,
  startsAt: null,
  endsAt: null,
  createdAt: '2026-09-04T10:00:00Z',
  updatedAt: '2026-09-04T10:00:00Z',
}

const emptyCoverage = {
  cells: {},
  testedCount: 0,
  expectedCount: 0,
  disputedScenarioIds: [],
  silentTesterIds: [],
}

const tester = {
  _id: 't1',
  campaign: 'c1',
  name: 'Raphael',
  email: 'raphael@venio.test',
  invitedAt: '2026-09-04T10:00:00Z',
  lastSeenAt: null,
  revokedAt: null,
  expiresAt: null,
  isTeamMember: true,
}

vi.mock('../../../services/beta', () => ({
  getCampaign: vi.fn(),
  listRuns: vi.fn().mockResolvedValue({ runs: [] }),
  updateCampaign: vi.fn(),
  campaignReportUrl: () => '/report',
  joinCampaignAsTester: vi.fn(),
  inviteTester: vi.fn(),
  revokeTester: vi.fn(),
  rotateTesterLink: vi.fn(),
  testerLinkUrl: (token: string) => `https://venio.paris/beta/${token}`,
  listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  createTemplate: vi.fn(),
  applyTemplate: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  archiveScenario: vi.fn(),
  listRunComments: vi.fn().mockResolvedValue({ comments: [] }),
  addRunComment: vi.fn(),
  promoteRun: vi.fn(),
  updateRunStatus: vi.fn(),
  runAttachmentUrl: () => '/shot',
}))

import { getCampaign, joinCampaignAsTester } from '../../../services/beta'
import CampaignCockpit from './CampaignCockpit'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCampaign).mockResolvedValue({
    campaign,
    scenarios: [],
    testers: [],
    coverage: emptyCoverage,
  })
  vi.mocked(joinCampaignAsTester).mockResolvedValue({ tester, token: 'a'.repeat(43) })
})

function renderCockpit() {
  return render(
    <MemoryRouter initialEntries={['/admin/beta/campaigns/c1']}>
      <Routes>
        <Route path="/admin/beta/campaigns/:campaignId" element={<CampaignCockpit />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CampaignCockpit', () => {
  it('garde le lien affiche apres l inscription, alors que la campagne se recharge', async () => {
    renderCockpit()
    await waitFor(() => expect(screen.getByRole('button', { name: /Testeurs/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Testeurs/ }))

    // Au rechargement, la campagne renvoie le testeur fraîchement inscrit.
    vi.mocked(getCampaign).mockResolvedValue({
      campaign,
      scenarios: [],
      testers: [tester],
      coverage: emptyCoverage,
    })
    fireEvent.click(screen.getByRole('button', { name: /Je participe/ }))

    // Le secret n'est lisible qu'une fois : le perdre au rechargement obligerait
    // à en générer un autre sans que personne comprenne pourquoi.
    await waitFor(() => expect(screen.getByText(`https://venio.paris/beta/${'a'.repeat(43)}`)).toBeInTheDocument())
  })

  it('n affiche « Chargement » qu au premier affichage', async () => {
    renderCockpit()
    await waitFor(() => expect(screen.getByRole('button', { name: /Testeurs/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Testeurs/ }))
    fireEvent.click(screen.getByRole('button', { name: /Je participe/ }))
    // Pendant le rechargement, l'écran ne doit pas disparaître.
    expect(screen.queryByText(/Chargement/)).not.toBeInTheDocument()
  })
})
