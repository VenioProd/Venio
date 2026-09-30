import './graphics.css'
import { useEffect, useRef, useState } from 'react'

/**
 * Icône au trait, tracée à l'apparition (stroke-dashoffset, pathLength = 1).
 * Décor : aria-hidden, le libellé est toujours porté par le texte voisin.
 *
 * Le tracé n'est armé que si le navigateur sait observer l'entrée à l'écran et
 * que le visiteur n'a pas demandé moins de mouvement : sinon l'icône est
 * dessinée d'emblée. Elle n'est jamais invisible en attendant un observateur
 * qui ne viendrait pas.
 */

export type LineIconName =
  'megaphone' | 'doc' | 'glyph' | 'code' | 'target' | 'eye' | 'key' | 'scissors' | 'loupe' | 'calendar' | 'spark'

/** Tracés en viewBox 24 ; chaque « M » ouvre un nouveau chemin. */
const PATHS: Record<LineIconName, string> = {
  megaphone: 'M3 10v4h3l6 4V6l-6 4H3z M16 8.5a5 5 0 0 1 0 7 M18.5 6a8.5 8.5 0 0 1 0 12',
  doc: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5 M9 8h3',
  glyph: 'M3 19L8 5l5 14 M5 14h6 M20 19v-6a3 3 0 0 0-6 0 M14 16.5a3 2.5 0 1 0 6 0 v-2',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.5 4l-3 16',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10 M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  key: 'M8 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M11 11l9 9 M17 17l2-2 M14.5 14.5l2-2',
  scissors:
    'M6 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M6 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M8 7.5L20 18 M8 16.5L20 6',
  loupe: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M15 15l6 6 M7 10h6',
  calendar: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M8 13h2 M13 13h2 M8 16h2',
  spark: 'M3 20h18 M4 16l4-5 4 3 5-7 3 3',
}

const paths = (name: LineIconName) => PATHS[name].split(/\s(?=M)/)

export interface LineIconProps {
  name: LineIconName
  /** 'md' 44 px (cartes), 'sm' 30 px (en ligne dans un titre). */
  size?: 'md' | 'sm'
  /** Retard du tracé, en ms (cascade dans une grille). */
  delay?: number
  className?: string
}

const LineIcon = ({ name, size = 'md', delay = 0, className }: LineIconProps) => {
  const ref = useRef<HTMLSpanElement | null>(null)
  // Armé d'emblée (avant la première peinture, sans flash de l'icône pleine)
  // seulement si on sait observer et si le mouvement n'est pas refusé.
  const [state, setState] = useState<'armed' | 'drawn'>(() =>
    typeof window !== 'undefined' &&
    typeof IntersectionObserver !== 'undefined' &&
    !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ? 'armed'
      : 'drawn',
  )

  useEffect(() => {
    if (state !== 'armed' || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('drawn')
          io.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [state])

  const cls = ['vn-ic', size === 'sm' ? 'vn-ic--sm' : '', state === 'armed' ? 'is-armed' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <span ref={ref} className={cls} style={{ ['--vn-d' as string]: `${delay}ms` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {paths(name).map((d) => (
          <path key={d} pathLength={1} d={d} />
        ))}
      </svg>
    </span>
  )
}

export default LineIcon
