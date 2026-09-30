import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('../../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import QualificationForm from './QualificationForm'
import NeedStart from './NeedStart'

function renderForm(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/contact${search}`]}>
      <QualificationForm />
    </MemoryRouter>,
  )
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Continuer|Envoyer/ }))
const legend = () => document.querySelector('legend')?.textContent
const payload = () => JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  apiFetch.mockResolvedValue({ ok: true })
})

describe('QualificationForm', () => {
  it('démarre à l’étape 1 et bloque tant qu’aucun besoin n’est choisi', () => {
    renderForm()

    expect(legend()).toBe('De quoi avez-vous besoin ?')
    expect(screen.getByText('Étape 1 sur 5')).toBeInTheDocument()
    next()

    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez au moins une réponse')
    expect(legend()).toBe('De quoi avez-vous besoin ?')
  })

  it('met à jour le relevé et la piste en direct, avec des boutons aria-pressed', () => {
    renderForm()
    const card = screen.getByRole('button', { name: /Mieux communiquer/ })
    expect(card).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(card)

    expect(card).toHaveAttribute('aria-pressed', 'true')
    const side = screen.getByRole('complementary', { name: 'Relevé de votre besoin' })
    expect(within(side).getByText('Mieux communiquer')).toBeInTheDocument()
    expect(within(side).getByText('Diagnostic de communication')).toBeInTheDocument()
  })

  it('affiche les précisions selon le besoin et déplace le focus sur la légende', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /Un outil métier/ }))
    fireEvent.click(screen.getByRole('button', { name: /Une marque/ }))
    next()

    expect(legend()).toBe('Précisons un peu.')
    expect(screen.getByText('Précisons un peu.')).toHaveFocus()
    expect(screen.getByText("Aujourd'hui, ça tourne sur…")).toBeInTheDocument()
    expect(screen.getByText('Où en est votre marque ?')).toBeInTheDocument()
    expect(screen.queryByText('Que doit faire le site ?')).toBeNull()
  })

  it('permet de revenir en arrière par les nœuds de progression', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /Une marque/ }))
    next()
    next()
    expect(legend()).toBe('Votre entreprise.')

    fireEvent.click(screen.getByRole('button', { name: /Revenir à l'étape 1/ }))

    expect(legend()).toBe('De quoi avez-vous besoin ?')
    expect(screen.getByRole('button', { name: /Une marque/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('pré-remplit depuis l’URL et démarre à l’étape 2', () => {
    renderForm('?besoin=site,com&formule=business')

    expect(legend()).toBe('Précisons un peu.')
    expect(screen.getByRole('button', { name: 'Vendre, suivre mes clients' })).toHaveAttribute('aria-pressed', 'true')
    const side = screen.getByRole('complementary')
    expect(within(side).getByText('Site · formule Business')).toBeInTheDocument()
  })

  it('signale inline un prénom, un e-mail ou un consentement manquant', () => {
    renderForm('?besoin=flou')
    next()
    next()
    next()
    expect(legend()).toBe('Où vous répondre ?')

    next()
    expect(screen.getByRole('alert')).toHaveTextContent('Indiquez votre prénom')

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemple' } })
    next()
    expect(screen.getByRole('alert')).toHaveTextContent('semble incomplète')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemple.fr' } })
    next()
    expect(screen.getByRole('alert')).toHaveTextContent('Cochez la case')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('déroule le parcours complet, envoie le payload et affiche la confirmation', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /Un nouveau site/ }))
    fireEvent.click(screen.getByRole('button', { name: /Mieux communiquer/ }))
    next()

    fireEvent.click(screen.getByRole('button', { name: 'Vendre, suivre mes clients' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pas assez de demandes' }))
    next()

    fireEvent.change(screen.getByLabelText('Votre activité, en quelques mots'), { target: { value: 'Cabinet' } })
    fireEvent.click(screen.getByRole('button', { name: '2 à 10' }))
    next()

    fireEvent.click(screen.getByRole('button', { name: "D'ici 3 mois" }))
    fireEvent.click(screen.getByRole('button', { name: '3 000 à 8 000 €' }))
    fireEvent.click(screen.getByRole('button', { name: 'Moi et mes associés' }))
    next()

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemple.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Un appel de 30 minutes' }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute(
      'href',
      '/confidentialite',
    )
    next()

    await waitFor(() => expect(screen.getByRole('heading', { name: /C'est noté, Ana\./ })).toBeInTheDocument())
    expect(screen.getByText(/pour convenir d'un appel de 30 minutes/)).toBeInTheDocument()

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch.mock.calls[0][0]).toBe('/api/contact')
    expect(payload()).toMatchObject({
      firstName: 'Ana',
      email: 'ana@exemple.fr',
      consent: true,
      website: '',
      qualification: {
        need: ['site', 'com'],
        formule: 'business',
        pain: ['demandes'],
        activite: 'Cabinet',
        taille: '2-10',
        quand: '3m',
        budget: 'b2',
        decide: 'associes',
        reponse: 'appel',
      },
    })
    expect(typeof payload().startedAt).toBe('number')
  })

  it('affiche une erreur d’envoi sans perdre les réponses', async () => {
    apiFetch.mockRejectedValueOnce(new Error('réseau'))
    renderForm('?besoin=flou')
    next()
    next()
    next()
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@exemple.fr' } })
    fireEvent.click(screen.getByRole('checkbox'))
    next()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('contact@venio.paris'))
    expect(screen.getByLabelText('Prénom')).toHaveValue('Ana')
  })
})

describe('NeedStart', () => {
  it('propose six liens vers le formulaire, un par besoin', () => {
    render(
      <MemoryRouter>
        <NeedStart />
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(6)
    expect(screen.getByRole('link', { name: /Un nouveau site/ })).toHaveAttribute('href', '/contact?besoin=site')
    expect(screen.getByRole('link', { name: /Je ne sais pas encore/ })).toHaveAttribute('href', '/contact?besoin=flou')
  })
})
