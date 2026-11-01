import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface MultiSelect {
  /** Identifiants sélectionnés. */
  selected: ReadonlySet<string>
  count: number
  isSelected: (id: string) => boolean
  /** Coche ou décoche une ligne ; avec `shift`, étend la sélection depuis la dernière ligne cliquée. */
  toggle: (id: string, opts?: { shift?: boolean }) => void
  /** Tout cocher sur la page (ou tout décocher si tout est déjà coché). */
  toggleAll: () => void
  selectAll: () => void
  /** Remplace la sélection par ces identifiants (ceux qui ne sont pas affichés sont ignorés). */
  selectIds: (ids: readonly string[]) => void
  clear: () => void
  /** Retire ces identifiants de la sélection (ex. ceux qu'une action groupée vient de traiter). */
  deselect: (ids: readonly string[]) => void
  allSelected: boolean
  someSelected: boolean
}

/**
 * Sélection multiple d'une liste visible.
 *
 * `items` est la page affichée, dans l'ordre d'affichage : la plage maj+clic et
 * « tout cocher » en dépendent. Les identifiants qui quittent la liste (suppression,
 * filtre, rechargement) sont retirés de la sélection. Échap la vide, sauf si
 * l'événement a déjà été traité (modale, menu) ou vient d'un champ de saisie.
 */
export function useMultiSelect<T>(items: readonly T[], getId: (item: T) => string): MultiSelect {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const getIdRef = useRef(getId)
  getIdRef.current = getId

  // Clé de contenu : l'appelant peut recréer le tableau à chaque rendu sans relancer les effets.
  const idsKey = items.map((item) => getIdRef.current(item)).join('\u0000')
  const ids = useMemo(() => (idsKey ? idsKey.split('\u0000') : []), [idsKey])

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(ids)
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
    if (anchor.current && !ids.includes(anchor.current)) anchor.current = null
  }, [ids])

  const clear = useCallback(() => {
    anchor.current = null
    setSelected(new Set())
  }, [])

  const deselect = useCallback((drop: readonly string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of drop) next.delete(id)
      return next.size === prev.size ? prev : next
    })
  }, [])

  const toggle = useCallback(
    (id: string, opts?: { shift?: boolean }) => {
      // L'ancre est lue avant l'updater : React l'exécute plus tard, quand elle a déjà changé.
      const from = anchor.current
      setSelected((prev) => {
        const next = new Set(prev)
        if (opts?.shift && from && from !== id) {
          const a = ids.indexOf(from)
          const b = ids.indexOf(id)
          if (a !== -1 && b !== -1) {
            // La plage prend l'état de la ligne d'ancrage : cocher une plage, ou la décocher.
            const check = prev.has(from)
            for (const rangeId of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
              if (check) next.add(rangeId)
              else next.delete(rangeId)
            }
            return next
          }
        }
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      anchor.current = id
    },
    [ids],
  )

  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids])

  const selectIds = useCallback(
    (wanted: readonly string[]) => {
      anchor.current = null
      const visible = new Set(ids)
      setSelected(new Set(wanted.filter((id) => visible.has(id))))
    },
    [ids],
  )

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  const toggleAll = useCallback(() => {
    anchor.current = null
    setSelected(allSelected ? new Set() : new Set(ids))
  }, [allSelected, ids])

  const count = selected.size
  useEffect(() => {
    if (count === 0) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]')) return
      clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, clear])

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  return {
    selected,
    count,
    isSelected,
    toggle,
    toggleAll,
    selectAll,
    selectIds,
    clear,
    deselect,
    allSelected,
    someSelected: count > 0 && !allSelected,
  }
}
