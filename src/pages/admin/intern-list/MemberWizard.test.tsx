import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MemberWizard from './MemberWizard'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api', () => ({ apiFetch }))

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

beforeEach(() => apiFetch.mockReset().mockResolvedValue({ credentialsSent: true }))

describe('MemberWizard', () => {
  it('bloque l’étape Statut tant qu’aucun statut n’est choisi', () => {
    render(<MemberWizard admins={[]} actorRole="SUPER_ADMIN" onClose={() => {}} onCreated={() => {}} />)
    click('Continuer')
    expect(screen.getByText('Choisis un statut.')).toBeInTheDocument()
  })

  it('crée un RH en 3 étapes sans étape Mission', async () => {
    const onCreated = vi.fn()
    render(<MemberWizard admins={[]} actorRole="SUPER_ADMIN" onClose={() => {}} onCreated={onCreated} />)
    click(/^RH/)
    click('Continuer')
    click('Continuer')
    expect(screen.getByText('Le nom est requis.')).toBeInTheDocument()
    type(/^Nom complet/, 'Rita Martin')
    type(/^Email/, 'pas-un-email')
    click('Continuer')
    expect(screen.getByText('Email invalide.')).toBeInTheDocument()
    type(/^Email/, 'rita@venio.test')
    click('Continuer')
    click('Créer le membre')
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const [url, options] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/admin/members')
    expect(JSON.parse(options.body)).toMatchObject({
      kind: 'RH',
      name: 'Rita Martin',
      email: 'rita@venio.test',
      sendInvitation: true,
    })
    expect(JSON.parse(options.body).intern).toBeUndefined()
  })

  it('refuse un stagiaire dont la fin précède le début, puis envoie la fiche', async () => {
    render(<MemberWizard admins={[]} actorRole="SUPER_ADMIN" onClose={() => {}} onCreated={() => {}} />)
    click(/^Stagiaire/)
    click('Continuer')
    type(/^Nom complet/, 'Sam')
    type(/^Email/, 'sam@venio.test')
    click('Continuer')
    type(/^Poste/, 'Dev')
    type(/^Date de debut/, '2026-09-01')
    type(/^Date de fin/, '2026-01-01')
    click('Continuer')
    expect(screen.getByText('La fin doit suivre le début.')).toBeInTheDocument()
    type(/^Date de fin/, '2027-03-01')
    expect(screen.getByText('Durée : 6 mois')).toBeInTheDocument()
    click('Continuer')
    click('Créer le membre')
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(JSON.parse(apiFetch.mock.calls[0][1].body).intern).toMatchObject({
      poste: 'Dev',
      dateDebut: '2026-09-01',
      dateFin: '2027-03-01',
    })
  })

  it('ne propose que Client à un admin non super admin', () => {
    render(<MemberWizard admins={[]} actorRole="ADMIN" onClose={() => {}} onCreated={() => {}} />)
    expect(screen.getByRole('button', { name: /^Client/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^RH/ })).toBeNull()
  })
})
