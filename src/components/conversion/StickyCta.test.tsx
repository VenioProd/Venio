import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { I18nProvider } from '../../context/I18nContext'
import StickyCta from './StickyCta'

const CONSENT_KEY = 'venio_cookie_consent'

function renderStickyCta(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <I18nProvider>
          <StickyCta />
        </I18nProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** jsdom n'implémente pas le défilement : on pose scrollY et on notifie. */
function scrollPastFirstScreen() {
  Object.defineProperty(window, 'scrollY', { value: 2000, writable: true, configurable: true })
  fireEvent.scroll(window)
}

describe('barre d’action flottante', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('reste absente au chargement, avant le premier écran franchi', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    renderStickyCta()

    expect(screen.queryByRole('region', { name: 'Décrire mon besoin' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Décrire mon besoin' })).toBeNull()
  })

  it('apparaît après le premier écran avec un lien vers le formulaire', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    renderStickyCta()

    scrollPastFirstScreen()

    expect(screen.getByRole('region', { name: 'Décrire mon besoin' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Décrire mon besoin' })).toHaveAttribute('href', '/contact')
  })

  it('se retire sur la page contact, où le formulaire est déjà affiché', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    renderStickyCta('/contact?besoin=com')

    scrollPastFirstScreen()

    expect(screen.queryByRole('region', { name: 'Décrire mon besoin' })).toBeNull()
  })

  it('cède le bas d’écran au bandeau cookies tant que le consentement n’est pas tranché', () => {
    renderStickyCta()

    scrollPastFirstScreen()

    expect(screen.queryByRole('region', { name: 'Décrire mon besoin' })).toBeNull()
  })

  it('réserve sa hauteur au pied de page quand elle est visible, et la rend ensuite', () => {
    window.localStorage.setItem(CONSENT_KEY, 'refused')
    const { unmount } = renderStickyCta()

    scrollPastFirstScreen()
    expect(document.documentElement.style.getPropertyValue('--mc-sticky-h')).not.toBe('')

    unmount()
    expect(document.documentElement.style.getPropertyValue('--mc-sticky-h')).toBe('')
  })
})
