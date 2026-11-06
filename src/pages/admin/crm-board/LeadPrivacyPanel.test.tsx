import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeadPrivacyPanel from './LeadPrivacyPanel'
import type { Lead } from '../../../types/crm.types'

const apiFetch = vi.fn()
const apiDownload = vi.fn()
vi.mock('../../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiDownload: (...args: unknown[]) => apiDownload(...args),
}))

const lead = { _id: 'lead1', company: 'Acme', status: 'LEAD' } as Lead
const status = (extra: Record<string, unknown> = {}) => ({
  consent: { status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST', source: 'FORMULAIRE_SITE', at: '2026-11-01T10:00:00.000Z' },
  doNotContact: false,
  doNotContactAt: null,
  doNotContactReason: '',
  anonymizedAt: null,
  suppressed: false,
  canAdminister: false,
  ...extra,
})

beforeEach(() => {
  apiFetch.mockReset()
  apiDownload.mockReset()
})

const renderPanel = (props: Partial<Parameters<typeof LeadPrivacyPanel>[0]> = {}) => {
  const onUpdateLead = vi.fn(async () => {})
  const onLocalChange = vi.fn()
  render(<LeadPrivacyPanel lead={lead} canManageCrm onUpdateLead={onUpdateLead} onLocalChange={onLocalChange} {...props} />)
  return { onUpdateLead, onLocalChange }
}

describe('fiche lead — bloc Données personnelles', () => {
  it('affiche le statut, la base légale et pose l’opposition par la case « Ne pas contacter »', async () => {
    apiFetch.mockResolvedValue(status())
    const { onUpdateLead } = renderPanel()
    expect(await screen.findByText('Données personnelles')).toBeInTheDocument()
    expect(await screen.findByText('Non recueilli')).toBeInTheDocument()
    expect(screen.getByText('Intérêt légitime')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(onUpdateLead).toHaveBeenCalledWith('lead1', { doNotContact: true }))
    // Pas d'export ni d'anonymisation hors administration du CRM.
    expect(screen.queryByText('Exporter les données')).toBeNull()
    expect(screen.queryByText('Anonymiser')).toBeNull()
  })

  it('signale une adresse de la liste de suppression ; lecture seule sans manage_crm', async () => {
    apiFetch.mockResolvedValue(status({ suppressed: true, doNotContact: true, doNotContactAt: '2026-11-02T10:00:00.000Z' }))
    renderPanel({ canManageCrm: false })
    expect(await screen.findByText(/liste « ne pas contacter »/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('administrateur : exporte et anonymise après confirmation', async () => {
    apiFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return { lead: { ...lead, contactName: 'Anonymisé (demande)', anonymizedAt: '2026-11-06T10:00:00.000Z' } }
      return status({ canAdminister: true })
    })
    apiDownload.mockResolvedValue({ blob: new Blob(['{}']), filename: 'x.json', contentType: 'application/json' })
    const createObjectURL = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const { onLocalChange } = renderPanel()

    fireEvent.click(await screen.findByText('Exporter les données'))
    await waitFor(() => expect(apiDownload).toHaveBeenCalledWith('/api/admin/crm/leads/lead1/personal-data'))

    fireEvent.click(screen.getByText('Anonymiser'))
    const buttons = await screen.findAllByRole('button', { name: 'Anonymiser' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/crm/leads/lead1/anonymize', { method: 'POST' }),
    )
    await waitFor(() => expect(onLocalChange).toHaveBeenCalledWith(expect.objectContaining({ contactName: 'Anonymisé (demande)' })))
  })
})
