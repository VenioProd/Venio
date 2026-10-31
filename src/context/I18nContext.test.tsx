import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from './AuthContext'
import { I18nProvider, useI18n } from './I18nContext'
import fr from '../i18n/fr/crm'
import en from '../i18n/en/crm'
import type { AuthContextValue } from '../types/auth.types'

const apiFetch = vi.fn().mockResolvedValue({ ok: true })
vi.mock('../lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const [crmKey] = Object.keys(fr) as (keyof typeof fr)[]

function Probe() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="home">{t('nav.home')}</span>
      <span data-testid="crm">{t(crmKey)}</span>
      <button onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}>switch</button>
    </div>
  )
}

function renderWith(user: { locale?: 'fr' | 'en' } | null) {
  const value = { user, loading: false } as unknown as AuthContextValue
  return render(
    <AuthContext.Provider value={value}>
      <I18nProvider>
        <Probe />
      </I18nProvider>
    </AuthContext.Provider>,
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    apiFetch.mockClear()
  })

  it('reste en français par défaut', () => {
    renderWith(null)
    expect(screen.getByTestId('locale').textContent).toBe('fr')
    expect(screen.getByTestId('home').textContent).toBe('Accueil')
  })

  it('lit la langue mémorisée et traduit aussi les domaines privés', () => {
    localStorage.setItem('venio-lang', 'en')
    renderWith(null)
    expect(screen.getByTestId('home').textContent).toBe('Home')
    expect(screen.getByTestId('crm').textContent).toBe(en[crmKey])
  })

  it('un visiteur déconnecté garde le choix en local, sans appel API', () => {
    renderWith(null)
    act(() => screen.getByText('switch').click())
    expect(localStorage.getItem('venio-lang')).toBe('en')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un utilisateur connecté enregistre la langue sur son compte', () => {
    renderWith({ locale: 'fr' })
    act(() => screen.getByText('switch').click())
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale: 'en' }),
    })
  })

  it('la langue du compte l’emporte sur celle du navigateur', () => {
    localStorage.setItem('venio-lang', 'fr')
    renderWith({ locale: 'en' })
    expect(screen.getByTestId('locale').textContent).toBe('en')
  })
})
