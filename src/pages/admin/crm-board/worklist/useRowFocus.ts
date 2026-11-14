import { useEffect, useRef, useState, type RefObject } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { Lead } from '../../../../types/crm.types'

/** Attribut posé sur le lien (ou bouton) du nom de chaque ligne : cible du focus. */
export const ROW_TITLE_ATTR = 'data-worklist-title'

interface Settled {
  id: string
  company: string
  /** Rang de la ligne avant l'action : la suivante prend sa place. */
  index: number
  tick: number
}

/**
 * « Traiter puis suivant » : après une action réussie, si la ligne a quitté la
 * liste, le focus passe à la ligne qui prend sa place (sinon à la précédente,
 * sinon au repli) et l'annonce est lue par les lecteurs d'écran ; si elle est
 * restée, le focus revient sur son nom.
 *
 * `rows` : lignes affichées, dans l'ordre de lecture. `fallbackRef` : élément
 * focalisable (tabIndex -1) quand la liste est vide.
 */
export function useRowFocus(
  rows: readonly Lead[],
  containerRef: RefObject<HTMLElement | null>,
  fallbackRef?: RefObject<HTMLElement | null>,
) {
  const { t } = useI18n()
  const [announcement, setAnnouncement] = useState('')
  const [settled, setSettled] = useState<Settled | null>(null)
  const handled = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  /** Enveloppe une action de ligne ; `action` renvoie `false` si rien n'a été enregistré. */
  const track = async (leadId: string, action: () => Promise<boolean>): Promise<boolean> => {
    const index = rows.findIndex((lead) => lead._id === leadId)
    const company = rows[index]?.company ?? ''
    const ok = await action()
    if (ok) setSettled((current) => ({ id: leadId, company, index, tick: (current?.tick ?? 0) + 1 }))
    return ok
  }

  // Après le rendu qui suit l'action (la file vient d'être rechargée par l'action elle-même).
  useEffect(() => {
    if (!settled || handled.current === settled.tick) return
    handled.current = settled.tick
    const focusTitle = (id: string) =>
      containerRef.current?.querySelector<HTMLElement>(`[${ROW_TITLE_ATTR}="${id}"]`)?.focus()
    let message: string
    if (rows.some((lead) => lead._id === settled.id)) {
      focusTitle(settled.id)
      message = t('crmToday.sr.saved', { company: settled.company })
    } else {
      const next = rows[Math.max(0, settled.index)] ?? rows[settled.index - 1]
      if (next) {
        focusTitle(next._id)
        message = t('crmToday.sr.doneNext', { company: settled.company, next: next.company })
      } else {
        fallbackRef?.current?.focus()
        message = t('crmToday.sr.doneLast', { company: settled.company })
      }
    }
    // Vidé puis reposé : un même message lu deux fois de suite est annoncé deux fois.
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setAnnouncement('')
      timer.current = setTimeout(() => setAnnouncement(message), 50)
    }, 0)
  }, [settled, rows, containerRef, fallbackRef, t])

  return { track, announcement }
}
