import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import locales, {
  formatMessage,
  isLazyLoaded,
  loadLazyMessages,
  setActiveLocale,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '../i18n'
import { apiFetch } from '../lib/api'

export type { Locale, MessageKey, MessageParams }

const STORAGE_KEY = 'venio-lang'

function readStoredLocale(): Locale {
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
  t: (key: MessageKey, params?: MessageParams) => string
}

function makeTranslator(locale: Locale): I18nContextValue['t'] {
  return (key, params) => {
    const template = locales[locale]?.[key] ?? locales.fr[key] ?? key
    return formatMessage(template, params, locale)
  }
}

// Outside a provider (isolated component tests) the UI stays in French.
const fallbackValue: I18nContextValue = { locale: 'fr', setLocale: () => {}, t: makeTranslator('fr') }

const I18nContext = createContext<I18nContextValue>(fallbackValue)

// Private areas rely on the lazily loaded dictionaries: hold their first render until they arrive.
function pathNeedsLazyMessages(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  return path.startsWith('/admin') || path.startsWith('/espace-client') || path.startsWith('/beta')
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)
  const [lazyReady, setLazyReady] = useState(isLazyLoaded)
  const auth = useContext(AuthContext)
  const user = auth?.user ?? null
  const isSignedIn = user !== null
  const isSignedInRef = useRef(isSignedIn)
  isSignedInRef.current = isSignedIn
  setActiveLocale(locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    let active = true
    loadLazyMessages().then(() => {
      if (active) setLazyReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The account preference wins once the session is known.
  const accountLocale = user?.locale
  useEffect(() => {
    if (accountLocale === 'fr' || accountLocale === 'en') setLocaleState(accountLocale)
  }, [accountLocale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage may not be available
    }
    // Signed-out visitors only keep the choice locally (venio-lang); a PATCH would 401.
    if (isSignedInRef.current) {
      apiFetch('/api/auth/locale', {
        method: 'PATCH',
        body: JSON.stringify({ locale: next }),
      }).catch(() => {})
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- lazyReady re-creates t once the private dictionaries are registered
  const t = useMemo(() => makeTranslator(locale), [locale, lazyReady])
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  // Re-mount the tree on a language switch so that components which only format
  // dates/numbers through the module-level helpers refresh too.
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={locale}>{lazyReady || !pathNeedsLazyMessages() ? children : null}</Fragment>
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
