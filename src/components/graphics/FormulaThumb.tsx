import './graphics.css'
/**
 * Vignette filaire d'une formule de site : la maquette d'une page, en blocs.
 * Décor : aria-hidden. Les blocs pleins (.hl) prennent l'accent quand la
 * vignette est active, ou quand un parent `.vn-spot` est survolé.
 */

export type FormulaKind = 'vitrine' | 'essentiel' | 'business' | 'boutique' | 'mesure'

type Shape =
  | { t: 'r'; x: number; y: number; w: number; h: number; rx: number; hl?: boolean }
  | { t: 'c'; cx: number; cy: number; r: number; hl?: boolean }

const r = (x: number, y: number, w: number, h: number, rx: number, hl = false): Shape => ({
  t: 'r',
  x,
  y,
  w,
  h,
  rx,
  hl,
})

const SHAPES: Record<FormulaKind, Shape[]> = {
  vitrine: [r(6, 6, 88, 6, 1), r(6, 17, 88, 22, 2, true), r(6, 44, 54, 4, 1), r(6, 51, 38, 4, 1)],
  essentiel: [
    r(6, 6, 88, 6, 1),
    r(6, 17, 40, 38, 2, true),
    r(52, 17, 42, 4, 1),
    r(52, 25, 34, 3, 1),
    r(52, 35, 42, 4, 1),
    r(52, 43, 30, 3, 1),
    r(52, 51, 38, 3, 1),
  ],
  business: [
    r(6, 6, 88, 6, 1),
    { t: 'c', cx: 88, cy: 9, r: 3, hl: true },
    r(6, 17, 56, 38, 2),
    r(67, 17, 27, 17, 2, true),
    r(67, 38, 27, 17, 2),
  ],
  boutique: [
    r(6, 6, 88, 6, 1),
    r(6, 17, 27, 17, 2),
    r(36.5, 17, 27, 17, 2, true),
    r(67, 17, 27, 17, 2),
    r(6, 38, 27, 17, 2),
    r(36.5, 38, 27, 17, 2),
    r(67, 38, 27, 17, 2),
  ],
  mesure: [
    r(6, 6, 18, 49, 2),
    r(29, 6, 65, 8, 1),
    r(29, 19, 65, 6, 1, true),
    r(29, 29, 65, 6, 1),
    r(29, 39, 65, 6, 1),
    r(29, 49, 45, 6, 1),
  ],
}

export interface FormulaThumbProps {
  kind: FormulaKind
  /** Met en avant la vignette (formule sélectionnée). */
  active?: boolean
  className?: string
}

const FormulaThumb = ({ kind, active = false, className }: FormulaThumbProps) => {
  const cls = ['vn-thumb', active ? 'is-active' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={cls} aria-hidden="true">
      <svg viewBox="0 0 100 61" focusable="false">
        <rect className="vn-thumb__frame" x=".5" y=".5" width="99" height="60" rx="4" />
        {SHAPES[kind].map((s, i) =>
          s.t === 'r' ? (
            <rect
              key={i}
              className={s.hl ? 'vn-thumb__hl' : undefined}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.rx}
            />
          ) : (
            <circle key={i} className={s.hl ? 'vn-thumb__hl' : undefined} cx={s.cx} cy={s.cy} r={s.r} />
          ),
        )}
      </svg>
    </span>
  )
}

export default FormulaThumb
