import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getOverview = vi.fn()
vi.mock('../services/workspace', () => ({ getOverview: (...a: unknown[]) => getOverview(...a) }))

import { OverviewProvider, KpiWidget, PinnedWidget, ActivityWidget, WeekWidget } from '../pages/admin/mon-espace/widgets/OverviewWidgets'

beforeEach(() => {
  vi.clearAllMocks()
  getOverview.mockResolvedValue({
    kpis: [{ label: 'Leads chauds', value: 3, link: '/admin/crm' }],
    overdue: [],
    week: [{ _id: 'w1', title: 'Échéance', status: 'A_FAIRE', priority: 'NORMALE', order: 0, dueDate: new Date().toISOString() }],
    pinned: [{ _id: 'p1', title: 'Épinglé', link: '/admin/x' }],
    activity: [{ _id: 'a1', title: 'Notif', message: 'msg', link: '/x', createdAt: new Date().toISOString() }],
  })
})

const wrap = (ui: React.ReactNode) => render(<MemoryRouter><OverviewProvider>{ui}</OverviewProvider></MemoryRouter>)

describe('Overview widgets', () => {
  it('KPI affiche label/valeur', async () => { wrap(<KpiWidget />); await waitFor(() => expect(screen.getByText('Leads chauds')).toBeInTheDocument()) })
  it('Pinned affiche les épinglés', async () => { wrap(<PinnedWidget />); await waitFor(() => expect(screen.getByText('Épinglé')).toBeInTheDocument()) })
  it('Activity affiche les notifs', async () => { wrap(<ActivityWidget />); await waitFor(() => expect(screen.getByText('Notif')).toBeInTheDocument()) })
  it('Week affiche les échéances', async () => { wrap(<WeekWidget />); await waitFor(() => expect(screen.getByText('Échéance')).toBeInTheDocument()) })
})
