import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadLazyMessages } from '../../../i18n'
import { apiFetch } from '../../../lib/api'
import DemoAccesses from './DemoAccesses'
import type { ProjectSheetDemoAccess } from '../../../types/projectSheet.types'

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }))
const mockedFetch = vi.mocked(apiFetch)

beforeAll(loadLazyMessages)

const ACCESS: ProjectSheetDemoAccess = {
  _id: 'd1',
  url: 'https://demo.example.test',
  role: 'Directeur',
  username: 'demo-dir',
  notes: 'Données fictives',
  hasPassword: true,
}
const SECRET = 'MotDePasseDeDemo-42'

function mount(props: Partial<React.ComponentProps<typeof DemoAccesses>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <DemoAccesses sheetId="sheet1" accesses={[ACCESS]} canEdit canReveal onChange={onChange} {...props} />,
  )
  return { onChange, ...view }
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedFetch.mockImplementation(async (path, options) => {
    if (String(path).endsWith('/reveal')) return { password: SECRET } as never
    if (options?.method === 'DELETE') return { demoAccesses: [] } as never
    return { demoAccesses: [ACCESS] } as never
  })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

describe('Accès démo', () => {
  it('affiche l’avertissement en permanence et ne montre jamais le mot de passe avant clic', () => {
    const { container } = mount()
    expect(
      screen.getByText('Uniquement des comptes de démonstration à données fictives. Jamais d’identifiants réels de production, de clients ou d’outils internes.'),
    ).toBeInTheDocument()
    expect(screen.getByText('demo-dir')).toBeInTheDocument()
    expect(screen.getByText('••••')).toBeInTheDocument()
    expect(container.textContent).not.toContain(SECRET)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('« Afficher » appelle reveal, montre le mot de passe jusqu’à « Masquer »', async () => {
    const { container } = mount()
    fireEvent.click(screen.getByRole('button', { name: /Afficher le mot de passe/ }))
    expect(await screen.findByText(SECRET)).toBeInTheDocument()
    expect(mockedFetch).toHaveBeenCalledWith('/api/admin/project-sheets/sheet1/demo-accesses/d1/reveal', { method: 'POST' })
    fireEvent.click(screen.getByRole('button', { name: /Masquer le mot de passe/ }))
    expect(container.textContent).not.toContain(SECRET)
    expect(screen.getByText('••••')).toBeInTheDocument()
  })

  it('« Copier » récupère le mot de passe, l’écrit dans le presse-papiers et confirme', async () => {
    const { container } = mount()
    fireEvent.click(screen.getByRole('button', { name: /Copier le mot de passe/ }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET))
    expect(await screen.findByText('Copié')).toBeInTheDocument()
    // Copier ne dévoile pas le mot de passe à l’écran.
    expect(container.textContent).not.toContain(SECRET)
  })

  it('sans droit de révélation, aucun bouton Afficher / Copier', () => {
    mount({ canReveal: false })
    expect(screen.queryByRole('button', { name: /Afficher/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Copier/ })).toBeNull()
    expect(screen.getByText('••••')).toBeInTheDocument()
  })

  it('sans mot de passe enregistré, pas de boutons de révélation', () => {
    mount({ accesses: [{ ...ACCESS, hasPassword: false }] })
    expect(screen.getByText('Aucun mot de passe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Afficher/ })).toBeNull()
  })

  it('en lecture seule, aucun ajout / modification / suppression', () => {
    mount({ canEdit: false })
    expect(screen.queryByRole('button', { name: /Ajouter un accès démo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
  })

  it('ajoute un accès (POST) et remonte la nouvelle liste', async () => {
    const { onChange } = mount()
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un accès démo/ }))
    expect(screen.getByText('Ne saisissez jamais de secret (mot de passe, clé, jeton) dans une fiche.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://demo2.example.test' } })
    fireEvent.change(screen.getByLabelText('Rôle du compte'), { target: { value: 'Formateur' } })
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'demo-form' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret-demo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’accès' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([ACCESS]))
    const call = mockedFetch.mock.calls.find(([, o]) => o?.method === 'POST')!
    expect(call[0]).toBe('/api/admin/project-sheets/sheet1/demo-accesses')
    expect(JSON.parse(call[1]!.body as string)).toEqual({
      url: 'https://demo2.example.test',
      role: 'Formateur',
      username: 'demo-form',
      notes: '',
      password: 'secret-demo',
    })
  })

  it('modifier avec mot de passe vide ne l’envoie pas (inchangé)', async () => {
    const { onChange } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const password = screen.getByLabelText('Mot de passe')
    expect(password).toHaveAttribute('placeholder', 'laisser vide pour conserver')
    fireEvent.change(screen.getByLabelText('Rôle du compte'), { target: { value: 'Directeur adjoint' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’accès' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const call = mockedFetch.mock.calls.find(([, o]) => o?.method === 'PATCH')!
    expect(call[0]).toBe('/api/admin/project-sheets/sheet1/demo-accesses/d1')
    const body = JSON.parse(call[1]!.body as string)
    expect(body).not.toHaveProperty('password')
    expect(body.role).toBe('Directeur adjoint')
  })

  it('supprime après confirmation seulement', async () => {
    const { onChange } = mount()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(mockedFetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]))
    expect(mockedFetch).toHaveBeenCalledWith('/api/admin/project-sheets/sheet1/demo-accesses/d1', { method: 'DELETE' })
    confirm.mockRestore()
  })
})
