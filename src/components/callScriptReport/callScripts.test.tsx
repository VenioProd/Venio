import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../../lib/api'
import type { CallScriptText } from '../../services/callScripts'
import CallScriptPanel from './CallScriptPanel'
import ScriptTexts from './ScriptTexts'

vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api')), apiFetch: vi.fn() }))

const TEAM = '/api/admin/call-desk'
let scripts: CallScriptText[]
const sent = () =>
  vi
    .mocked(apiFetch)
    .mock.calls.filter(([, options]) => options?.method)
    .map(([path, options]) => [options!.method, path, JSON.parse(String(options!.body))])

beforeEach(() => {
  vi.mocked(apiFetch).mockReset()
  window.localStorage.clear()
  scripts = [
    {
      tag: 'DEFAULT',
      title: 'Ouverture',
      body: 'Bonjour, c’est Venio.\n<b>Pas du HTML</b>',
      updatedAt: '2026-11-10T10:00:00Z',
    },
    { tag: 'RELANCE', title: null, body: null, updatedAt: null },
  ]
  vi.mocked(apiFetch).mockImplementation((async (path: string, options?: { method?: string; body?: string }) => {
    if (!options?.method) return { scripts }
    const body = JSON.parse(String(options.body))
    if (path.endsWith('/calls/script-tags')) return { scriptTags: [...scripts.map((s) => s.tag), body.tag] }
    return { script: { ...body, updatedAt: '2026-11-14T09:00:00Z' } }
  }) as typeof apiFetch)
})

it('lit le texte en brut ; « Modifier » et « Nouveau script » écrivent sur le routeur de l’équipe', async () => {
  render(<ScriptTexts base={TEAM} canEdit level={2} />)

  fireEvent.click(await screen.findByRole('button', { name: 'DEFAULT' }))
  expect(screen.getByText(/Pas du HTML/).textContent).toContain('<b>Pas du HTML</b>')
  expect(document.querySelector('.cs-body b')).toBeNull()
  expect(screen.getByText('Pas encore de texte')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Modifier le script RELANCE' }))
  fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Après proposition' } })
  fireEvent.change(screen.getByLabelText('Texte'), { target: { value: 'Je reviens vers vous.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(await screen.findByText('Après proposition')).toBeTruthy()
  expect(sent()).toEqual([
    ['PUT', `${TEAM}/calls/scripts`, { tag: 'RELANCE', title: 'Après proposition', body: 'Je reviens vers vous.' }],
  ])

  // Création : l'étiquette d'abord, puis son texte.
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau script' }))
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nom du script'), { target: { value: 'SALON' } })
  fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Salon' } })
  fireEvent.change(screen.getByLabelText('Texte'), { target: { value: 'Nous nous sommes croisés au salon.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(await screen.findByRole('button', { name: 'SALON' })).toBeTruthy()
  expect(sent().slice(1)).toEqual([
    ['POST', `${TEAM}/calls/script-tags`, { tag: 'SALON' }],
    ['PUT', `${TEAM}/calls/scripts`, { tag: 'SALON', title: 'Salon', body: 'Nous nous sommes croisés au salon.' }],
  ])

  // Un nom déjà pris n'envoie rien.
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau script' }))
  fireEvent.change(screen.getByLabelText('Nom du script'), { target: { value: 'DEFAULT' } })
  fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'x' } })
  fireEvent.change(screen.getByLabelText('Texte'), { target: { value: 'y' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(await screen.findByText('Un script porte déjà ce nom.')).toBeTruthy()
  expect(sent()).toHaveLength(3)
})

it('sans droit d’écriture (externe, ou équipe sans MANAGE_CRM), le volet est en lecture seule', async () => {
  render(<ScriptTexts base="/api/commercial" canEdit={false} level={3} />)
  expect(await screen.findByRole('button', { name: 'DEFAULT' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Nouveau script' })).toBeNull()
  expect(screen.getByText(/rédigés par l’équipe/)).toBeTruthy()
})

it('panneau d’appel : texte du script choisi, repliable et replié au prochain appel ; rien sans texte', async () => {
  const { rerender } = render(<CallScriptPanel apiPrefix={TEAM} tag="DEFAULT" />)
  const head = await screen.findByRole('button', { name: /Script : DEFAULT/ })
  expect(head).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/Bonjour, c’est Venio/)).toBeVisible()

  fireEvent.click(head)
  expect(head).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText(/Bonjour, c’est Venio/)).not.toBeVisible()

  // Le choix de replier est gardé pour la fiche suivante.
  rerender(<CallScriptPanel key="suivante" apiPrefix={TEAM} tag="DEFAULT" />)
  expect(await screen.findByRole('button', { name: /Script : DEFAULT/ })).toHaveAttribute('aria-expanded', 'false')

  rerender(<CallScriptPanel apiPrefix={TEAM} tag="RELANCE" />)
  await waitFor(() => expect(screen.queryByRole('button', { name: /Script/ })).toBeNull())
  rerender(<CallScriptPanel apiPrefix={TEAM} tag="" />)
  expect(screen.queryByRole('button', { name: /Script/ })).toBeNull()
})
