export const APP_THEMES = {
  glass: {
    backgrounds: ['mist', 'dawn', 'lagoon', 'lavender', 'night'],
    accents: ['sky', 'violet', 'mint', 'coral', 'amber'],
  },
  neon: {
    backgrounds: ['black', 'graphite', 'abyss', 'plum', 'forest'],
    accents: ['cyan', 'magenta', 'violet', 'acid', 'orange'],
  },
} as const

export interface AppTheme {
  theme: keyof typeof APP_THEMES
  background: string
  accent: string
}
export const DEFAULT_APP_THEME: AppTheme = { theme: 'glass', background: 'mist', accent: 'sky' }

export function isAppTheme(value: unknown): value is AppTheme {
  if (!value || typeof value !== 'object') return false
  const { theme, background, accent } = value as Record<string, unknown>
  if (theme !== 'glass' && theme !== 'neon') return false
  const options = APP_THEMES[theme]
  return typeof background === 'string' && (options.backgrounds as readonly string[]).includes(background)
    && typeof accent === 'string' && (options.accents as readonly string[]).includes(accent)
}
