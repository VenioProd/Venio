import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

type Theme = 'dark' | 'light'
export type ColorAccent =
  | 'sky'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'coral'
  | 'yellow'
  | 'indigo'
  | 'teal'
  | 'fuchsia'
  | 'lime'
  | 'slate'

export const COLOR_ACCENTS: readonly ColorAccent[] = [
  'sky',
  'violet',
  'emerald',
  'amber',
  'rose',
  'coral',
  'yellow',
  'indigo',
  'teal',
  'fuchsia',
  'lime',
  'slate',
] as const

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  colorAccent: ColorAccent
  setColorAccent: (a: ColorAccent) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'venio-theme'
const ACCENT_KEY = 'venio-accent'

const isPortalPath = (pathname: string) =>
  pathname.startsWith('/admin') || pathname.startsWith('/espace-client')

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isPortal = isPortalPath(location.pathname)

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  })

  const [colorAccent, setColorAccentState] = useState<ColorAccent>(() => {
    return (localStorage.getItem(ACCENT_KEY) as ColorAccent) || 'sky'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(ACCENT_KEY, colorAccent)
    if (!isPortal || colorAccent === 'sky') {
      document.documentElement.removeAttribute('data-accent')
      return
    }
    document.documentElement.setAttribute('data-accent', colorAccent)
  }, [colorAccent, isPortal])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const setColorAccent = (a: ColorAccent) => {
    setColorAccentState(a)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colorAccent, setColorAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
