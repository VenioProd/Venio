import type { KeyboardEvent } from 'react'

/** Navigation clavier d'une tablist : flèches, Début, Fin. `idFor` donne l'id DOM de chaque onglet. */
export function handleTabKeys(
  event: KeyboardEvent,
  current: number,
  count: number,
  select: (index: number) => void,
  idFor: (index: number) => string,
) {
  let next = current
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % count
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  else return
  event.preventDefault()
  select(next)
  requestAnimationFrame(() => document.getElementById(idFor(next))?.focus())
}
