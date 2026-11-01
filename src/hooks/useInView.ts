import { useEffect, useState, type RefObject } from 'react'

interface UseInViewOptions {
  /** Ne plus observer après la première entrée (révélations, démarrages paresseux). */
  once?: boolean
  threshold?: number
  rootMargin?: string
}

/**
 * Vrai tant que l'élément est visible. Sert à démarrer un canvas ou une
 * boucle d'animation seulement à l'écran. Sans IntersectionObserver
 * (tests, vieux navigateurs), l'élément est réputé visible.
 */
export function useInView<T extends Element>(
  ref: RefObject<T>,
  { once = false, threshold = 0, rootMargin = '0px' }: UseInViewOptions = {},
): boolean {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, once, threshold, rootMargin])

  return inView
}
