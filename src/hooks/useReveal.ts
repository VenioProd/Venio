import { useEffect } from 'react'

/**
 * Révèle au scroll les éléments correspondant à `selector` en leur ajoutant
 * `visibleClass` dès qu'ils entrent dans le viewport (one-shot). Sans
 * IntersectionObserver, tout est révélé d'emblée. `refreshKey` relance
 * l'observation quand la liste rendue change (filtres, onglets).
 */
export function useReveal(selector: string, visibleClass: string, refreshKey?: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll(selector)
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add(visibleClass))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(visibleClass)
            io.unobserve(entry.target)
          }
        })
      },
      // Seuil nul : un bloc plus haut que plusieurs écrans (grilles empilées sur mobile)
      // n'atteindrait jamais un ratio de visibilité, il serait masqué pour toujours.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [selector, visibleClass, refreshKey])
}
