import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

const read = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches

/** Vrai quand le visiteur demande moins de mouvement ; suit les changements en direct. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(read)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}
