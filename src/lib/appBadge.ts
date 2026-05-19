/**
 * Wrapper autour de la Badging API (W3C Badging) pour afficher un badge
 * numérique sur l'icône de l'app PWA installée.
 *
 * Supporté : Chrome / Edge (desktop + Android) et Safari iOS 16.4+ pour les
 * PWA ajoutées à l'écran d'accueil avec permission notifications accordée.
 * Sans support, les appels sont silencieusement ignorés.
 */

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function getBadgingNavigator(): BadgingNavigator | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as BadgingNavigator
  if (typeof nav.setAppBadge !== 'function') return null
  return nav
}

export function syncAppBadge(count: number): void {
  const nav = getBadgingNavigator()
  if (!nav) return
  if (count > 0) {
    nav.setAppBadge?.(count).catch(() => {})
  } else {
    nav.clearAppBadge?.().catch(() => {})
  }
}
