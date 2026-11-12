import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LeadFormPanel from './LeadFormPanel'
import LeadDetailPage from './LeadDetailPage'
import MergeLeadDialog from './MergeLeadDialog'
import { DUPLICATE_DEBOUNCE_MS } from './duplicates'
import { EMPTY_FORM } from './constants'
import { apiFetch } from '../../../lib/api'
import type { Lead } from '../../../types/crm.types'
import fr from '../../../i18n/fr/crm'
import en from '../../../i18n/en/crm'

/** Chantier 3B — bandeau « doublons probables » du formulaire et fusion depuis la fiche. */

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../../components/admin/InteractionTimeline', () => ({ default: () => <p>Interaction timeline</p> }))
vi.mock('../../../components/admin/RevenueChain', () => ({ default: () => <p>Revenue chain</p> }))
vi.mock('./rich/LeadEnrichedPanel', () => ({ default: () => <p>Enriched panel</p> }))

const dup = {
  _id: 'dup1',
  company: 'Acme SAS',
  contactName: 'Jean',
  contactEmail: 'j@acme.fr',
  contactPhone: '0612345678',
  status: 'QUALIFIED',
}
const lead: Lead = { _id: 'lead1', company: 'Acme', contactEmail: 'a@acme.fr', status: 'LEAD' }
const other: Lead = { _id: 'lead2', company: 'Globex', contactEmail: 'x@globex.fr', status: 'LEAD' }

const mockApi = (handlers: Record<string, unknown> = {}) =>
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path in handlers) {
      const value = handlers[path]
      if (value instanceof Error) throw value
      return value
    }
    throw new Error(`Unexpected API request: ${path}`)
  })

const calls = (path: string) => vi.mocked(apiFetch).mock.calls.filter(([p]) => p === path)

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('i18n', () => {
  it('les clés de doublons et de fusion existent en français et en anglais', () => {
    const keys = Object.keys(fr).filter(
      (k) => k.startsWith('crm.merge.') || k.startsWith('crm.duplicates.') || k.includes('duplicates.block'),
    )
    expect(keys.length).toBeGreaterThanOrEqual(17)
    for (const key of keys) expect(en, key).toHaveProperty([key])
  })
})

describe('formulaire de création : bandeau de doublons', () => {
  const Form = ({ form }: { form: typeof EMPTY_FORM }) => (
    <LeadFormPanel
      form={form}
      admins={[]}
      isSuperAdmin
      canManageCrm
      onFormChange={() => {}}
      onSubmit={(e) => e.preventDefault()}
    />
  )

  it("n'appelle rien tant que les champs sont vides", async () => {
    vi.useFakeTimers()
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [dup], enabled: true } })
    render(<Form form={{ ...EMPTY_FORM }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DUPLICATE_DEBOUNCE_MS * 2)
    })
    expect(calls('/api/admin/crm/check-duplicate')).toHaveLength(0)
  })

  it('interroge le serveur après le délai, avec e-mail, téléphone et entreprise, puis affiche les doublons', async () => {
    vi.useFakeTimers()
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [dup], enabled: true } })
    render(
      <Form form={{ ...EMPTY_FORM, company: 'Acme', contactEmail: 'j@acme.fr', contactPhone: '06 12 34 56 78' }} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DUPLICATE_DEBOUNCE_MS - 1)
    })
    expect(calls('/api/admin/crm/check-duplicate')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2)
    })
    const [[, options]] = calls('/api/admin/crm/check-duplicate') as [[string, { method: string; body: string }]]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({
      company: 'Acme',
      contactEmail: 'j@acme.fr',
      contactPhone: '06 12 34 56 78',
    })
    expect(screen.getByRole('status').textContent).toContain('Acme SAS')
    expect(screen.getByRole('status').textContent).toContain('1 doublon probable')
  })

  it('anti-rebond : une seule requête pour plusieurs frappes rapprochées', async () => {
    vi.useFakeTimers()
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [], enabled: true } })
    const { rerender } = render(<Form form={{ ...EMPTY_FORM, company: 'A' }} />)
    for (const company of ['Ac', 'Acm', 'Acme']) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      rerender(<Form form={{ ...EMPTY_FORM, company }} />)
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DUPLICATE_DEBOUNCE_MS + 10)
    })
    expect(calls('/api/admin/crm/check-duplicate')).toHaveLength(1)
    expect(JSON.parse((calls('/api/admin/crm/check-duplicate')[0][1] as { body: string }).body).company).toBe('Acme')
  })

  it('aucun bandeau sans doublon ; une erreur serveur ne bloque pas la saisie', async () => {
    vi.useFakeTimers()
    mockApi({ '/api/admin/crm/check-duplicate': new Error('boom') })
    render(<Form form={{ ...EMPTY_FORM, company: 'Acme' }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DUPLICATE_DEBOUNCE_MS + 10)
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: /Créer|Create/ })).toBeTruthy()
  })
})

describe('fiche lead : Fusionner dans…', () => {
  const renderModal = (props: Partial<React.ComponentProps<typeof LeadDetailPage>> = {}) =>
    render(
      <MemoryRouter>
        <LeadDetailPage
          lead={lead}
          admins={[]}
          canManageCrm
          converting={null}
          onClose={() => {}}
          onLeadChange={() => {}}
          onUpdateLead={async () => {}}
          onConvertToClient={() => {}}
          mergeCandidates={[lead, other]}
          onMerged={() => {}}
          {...props}
        />
      </MemoryRouter>,
    )

  it("le bouton n'apparaît qu'avec manage_crm", () => {
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [], enabled: true } })
    const { unmount } = renderModal()
    expect(screen.getByRole('button', { name: 'Fusionner dans…' })).toBeTruthy()
    unmount()
    renderModal({ canManageCrm: false })
    expect(screen.queryByRole('button', { name: 'Fusionner dans…' })).toBeNull()
  })

  it('propose les doublons probables, demande confirmation, puis fusionne dans la cible choisie', async () => {
    const onMerged = vi.fn()
    mockApi({
      '/api/admin/crm/check-duplicate': { duplicates: [dup], enabled: true },
      '/api/admin/crm/leads/dup1/merge': { lead: { _id: 'dup1' } },
    })
    renderModal({ onMerged })
    fireEvent.click(screen.getByRole('button', { name: 'Fusionner dans…' }))

    // La requête de suggestions exclut le lead lui-même.
    await waitFor(() => expect(calls('/api/admin/crm/check-duplicate')).toHaveLength(1))
    expect(JSON.parse((calls('/api/admin/crm/check-duplicate')[0][1] as { body: string }).body)).toMatchObject({
      excludeId: 'lead1',
      company: 'Acme',
    })

    fireEvent.click(await screen.findByRole('button', { name: /Acme SAS/ }))
    // Confirmation avant tout appel d'écriture.
    expect(screen.getByText(/« Acme » sera supprimé/)).toBeTruthy()
    expect(calls('/api/admin/crm/leads/dup1/merge')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Fusionner' }))
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith({ _id: 'dup1', company: 'Acme SAS' }))
    const [[, options]] = calls('/api/admin/crm/leads/dup1/merge') as [[string, { method: string; body: string }]]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ sourceId: 'lead1' })
  })

  it('la recherche libre trouve un lead du tableau, jamais le lead lui-même', async () => {
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [], enabled: true } })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Fusionner dans…' }))
    fireEvent.change(await screen.findByPlaceholderText(/Rechercher un lead/), { target: { value: 'globex' } })
    expect(screen.getByRole('button', { name: /Globex/ })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Rechercher un lead/), { target: { value: 'a@acme.fr' } })
    expect(screen.queryByRole('button', { name: /a@acme\.fr/ })).toBeNull()
  })
})

describe('MergeLeadDialog : refus du serveur', () => {
  it('affiche le message d’erreur et ne ferme pas', async () => {
    const onMerged = vi.fn()
    mockApi({
      '/api/admin/crm/check-duplicate': { duplicates: [dup], enabled: true },
      '/api/admin/crm/leads/dup1/merge': new Error(
        'Les deux leads sont gagnés avec des clients différents : fusion refusée',
      ),
    })
    render(<MergeLeadDialog lead={lead} candidates={[]} onCancel={() => {}} onMerged={onMerged} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme SAS/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Fusionner' }))
    expect((await screen.findByRole('alert')).textContent).toContain('clients différents')
    expect(onMerged).not.toHaveBeenCalled()
  })

  it('Retour revient à la liste sans appel d’écriture', async () => {
    mockApi({ '/api/admin/crm/check-duplicate': { duplicates: [dup], enabled: true } })
    render(<MergeLeadDialog lead={lead} candidates={[]} onCancel={() => {}} onMerged={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme SAS/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }))
    expect(screen.getByRole('button', { name: /Acme SAS/ })).toBeTruthy()
    expect(calls('/api/admin/crm/leads/dup1/merge')).toHaveLength(0)
  })
})
