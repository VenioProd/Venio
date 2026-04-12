import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import locales from '../i18n'
import { apiFetch, getToken } from '../lib/api'

export type Locale = 'fr' | 'en'

const STORAGE_KEY = 'venio-lang'

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch {
    // localStorage may not be available
  }
  return 'fr'
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  // Keep <html lang> in sync with locale
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem(STORAGE_KEY, newLocale)
    } catch {
      // localStorage may not be available
    }
    // Persist to backend if authenticated (fire-and-forget)
    if (getToken()) {
      apiFetch('/api/auth/locale', {
        method: 'PATCH',
        body: JSON.stringify({ locale: newLocale }),
      }).catch(() => {})
    }
  }, [])

  const t = useCallback(
    (key: string): string => {
      const translations = locales[locale]
      if (translations && key in translations) {
        return translations[key]
      }
      // Fallback: try French, then return the key itself
      const fallback = locales.fr
      if (fallback && key in fallback) {
        return fallback[key]
      }
      return key
    },
    [locale]
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
