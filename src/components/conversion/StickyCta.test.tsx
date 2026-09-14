import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { I18nProvider } from '../../context/I18nContext'
import { ConversionProvider } from '../../context/ConversionContext'
import StickyCta from './StickyCta'

const CONSENT_KEY = 'venio_cookie_consent'

function renderStickyCta() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <I18nProvider>
          <ConversionProvider>
            <StickyCta />
          </ConversionProvider>
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

    expect(screen.queryByRole('region', { name: 'Prendre rendez-vous' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Réserver 30 minutes' })).toBeNull()
  })

  it('apparaît après le premier écran avec deux boutons nommés', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    renderStickyCta()

    scrollPastFirstScreen()

    expect(screen.getByRole('region', { name: 'Prendre rendez-vous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réserver 30 minutes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Être rappelé' })).toBeInTheDocument()
  })

  it('cède le bas d’écran au bandeau cookies tant que le consentement n’est pas tranché', () => {
    renderStickyCta()

    scrollPastFirstScreen()

    expect(screen.queryByRole('region', { name: 'Prendre rendez-vous' })).toBeNull()
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
