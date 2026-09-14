import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { ConversionProvider, useConversion } from '../../context/ConversionContext'

const Ouvertures = () => {
  const { openBooking, openCallback } = useConversion()
  return (
    <>
      <button type="button" onClick={openBooking}>
        Réserver 30 minutes
      </button>
      <button type="button" onClick={openCallback}>
        Être rappelé
      </button>
    </>
  )
}

let appRoot: HTMLElement | null = null

function renderProvider() {
  // useModalA11y rend le #root de l'application inerte : il doit exister.
  appRoot = document.createElement('div')
  appRoot.id = 'root'
  document.body.appendChild(appRoot)

  return render(
    <MemoryRouter>
      <ConversionProvider>
        <Ouvertures />
      </ConversionProvider>
    </MemoryRouter>,
  )
}

const contactCalls = () => apiFetch.mock.calls.filter((call) => call[0] === '/api/contact')

const contactPayload = () => JSON.parse((contactCalls()[0][1] as { body: string }).body) as Record<string, unknown>

function remplir(champs: Record<string, string>) {
  for (const [label, valeur] of Object.entries(champs)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiFetch.mockResolvedValue({ ok: true })
})

afterEach(() => {
  appRoot?.remove()
  appRoot = null
  document.body.style.overflow = ''
})

describe('modales de conversion', () => {
  it('ne monte aucun champ de formulaire tant qu’aucune modale n’est ouverte', () => {
    renderProvider()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prénom')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Téléphone')).not.toBeInTheDocument()
  })

  it('ouvre la réservation, envoie le créneau à /api/contact puis se ferme', async () => {
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Réserver 30 minutes' }))
    expect(screen.getByRole('dialog', { name: 'Réserver 30 minutes' })).toHaveAttribute('aria-modal', 'true')

    remplir({
      Prénom: 'Ana',
      Nom: 'Dupont',
      Email: 'ana@example.test',
      'Créneau souhaité': 'Mardi matin',
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Réserver le créneau' }))

    await waitFor(() => expect(contactCalls()).toHaveLength(1))
    expect(contactPayload()).toMatchObject({
      firstName: 'Ana',
      lastName: 'Dupont',
      email: 'ana@example.test',
      subject: 'Réservation 30 minutes',
      message: 'Créneau souhaité : Mardi matin',
      consent: true,
      website: '',
    })
    expect(typeof contactPayload().startedAt).toBe('number')

    expect(await screen.findByText(/votre demande a bien été reçue/i)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('envoie le téléphone du rappel dans un champ dédié', async () => {
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Être rappelé' }))
    remplir({
      Prénom: 'Léo',
      Nom: 'Martin',
      Email: 'leo@example.test',
      Téléphone: '06 12 34 56 78',
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Demander un rappel' }))

    await waitFor(() => expect(contactCalls()).toHaveLength(1))
    expect(contactPayload()).toMatchObject({
      firstName: 'Léo',
      phone: '06 12 34 56 78',
      subject: 'Demande de rappel',
      message: 'Demande de rappel.',
      consent: true,
    })
  })

  it('refuse d’envoyer sans consentement', () => {
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Être rappelé' }))
    remplir({
      Prénom: 'Léo',
      Nom: 'Martin',
      Email: 'leo@example.test',
      Téléphone: '0612345678',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Demander un rappel' }))

    expect(screen.getByText('Veuillez accepter le traitement de votre demande.')).toBeInTheDocument()
    expect(contactCalls()).toHaveLength(0)
  })

  it('affiche un message d’erreur quand l’envoi échoue', async () => {
    apiFetch.mockImplementation((path: string) =>
      path === '/api/contact' ? Promise.reject(new Error('indisponible')) : Promise.resolve({ ok: true }),
    )
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Réserver 30 minutes' }))
    remplir({
      Prénom: 'Ana',
      Nom: 'Dupont',
      Email: 'ana@example.test',
      'Créneau souhaité': 'Jeudi 17 h',
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Réserver le créneau' }))

    expect(await screen.findByText(/Une erreur est survenue/i)).toBeInTheDocument()
  })
})
