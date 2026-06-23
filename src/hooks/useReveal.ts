import { useEffect } from 'react'

/**
 * Révèle au scroll les éléments correspondant à `selector` en leur ajoutant
 * `visibleClass` dès qu'ils entrent dans le viewport (one-shot).
 */
export function useReveal(selector: string, visibleClass: string) {
  useEffect(() => {
    const els = document.querySelectorAll(selector)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(visibleClass)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [selector, visibleClass])
}
