import { useEffect, useRef, type RefObject } from 'react'

/**
 * Halo qui suit la souris. Pose --mx / --my (en px, relatifs à l'élément) sur
 * chaque `.vn-spot` survolé sous le conteneur : un seul écouteur délégué, quel
 * que soit le nombre de cartes. Le halo lui-même est dessiné par graphics.css.
 *
 * Usage : `const ref = useSpotlight<HTMLDivElement>()` puis `<div ref={ref}>`,
 * ou `useSpotlight(monRef)` pour réutiliser un ref existant.
 */
export function useSpotlight<T extends HTMLElement = HTMLElement>(external?: RefObject<T>) {
  const own = useRef<T>(null)
  const ref = external ?? own

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const onMove = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const el = target.closest<HTMLElement>('.vn-spot')
      if (!el || !root.contains(el)) return
      const box = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${event.clientX - box.left}px`)
      el.style.setProperty('--my', `${event.clientY - box.top}px`)
    }

    root.addEventListener('pointermove', onMove, { passive: true })
    return () => root.removeEventListener('pointermove', onMove)
  }, [ref])

  return ref
}
