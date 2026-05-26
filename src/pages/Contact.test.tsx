import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// Mock @emailjs/browser — Contact loads it lazily inside handleSubmit.
vi.mock('@emailjs/browser', () => ({
  default: { init: vi.fn(), send: vi.fn(async () => ({ status: 200 })) },
}))

// Mock I18nContext (SEO depends on it)
vi.mock('@/context/I18nContext', () => ({
  useI18n: () => ({ lang: 'fr', setLang: vi.fn(), t: (k: string) => k }),
}))

import Contact from '@/pages/Contact'

function renderContact() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Contact />
      </MemoryRouter>
    </HelmetProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Contact page — smoke', () => {
  it('renders the hero', () => {
    renderContact()
    expect(screen.getByRole('heading', { name: /CONTACT/i, level: 1 })).toBeInTheDocument()
  })

  it('renders the contact form with accessible labels (fix #8)', () => {
    renderContact()
    expect(screen.getByLabelText('Prénom')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Entreprise')).toBeInTheDocument()
    expect(screen.getByLabelText('Sujet')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
  })

  it('exposes the submit button', () => {
    renderContact()
    const submit = screen.getByRole('button', { name: /Envoyer/i })
    expect(submit).toBeInTheDocument()
  })

  it('submit button starts disabled (captcha not yet verified)', () => {
    renderContact()
    const submit = screen.getByRole('button', { name: /Envoyer/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('updates form fields on input', () => {
    renderContact()
    const email = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(email, { target: { value: 'me@me.com' } })
    expect(email.value).toBe('me@me.com')
  })

  it('renders the direct email link to contact@venio.paris', () => {
    renderContact()
    const link = screen.getByRole('link', { name: /contact@venio\.paris/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('mailto:contact@venio.paris')
  })
})
