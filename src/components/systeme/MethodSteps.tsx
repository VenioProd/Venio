import { useId, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../context/I18nContext'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import type { MessageKey } from '../../i18n'
import './systeme.css'

export interface MethodStepsProps {
  headingLevel?: 3
}

const paths = [
  'M11 5a6 6 0 1 0 0 12a6 6 0 1 0 0-12 M20 20l-4.5-4.5',
  'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
  'M14 6l4 4 M12 8l6-6 4 4-6 6z M12 8L3 17l4 4 9-9',
  'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M8 12.5l2.6 2.6L16 9.5',
  'M21 3L10 14 M21 3l-7 18-4-7-7-4z',
]

function Step({ n, path, headingLevel = 3 }: { n: number; path: string; headingLevel?: 3 }) {
  const { t } = useI18n()
  const uid = useId()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered
  const Heading = `h${headingLevel}` as 'h3'
  return (
    <li
      className={`sy-step${open ? ' sy-is-open' : ''}`}
      style={{ '--d': n - 1 } as CSSProperties}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches)
          setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
    >
      <Heading>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={uid}
          onClick={() => {
            setPinned(!open)
            setHovered(false)
          }}
        >
          <span className="sy-step__node" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d={path} />
            </svg>
          </span>
          <span className="sy-step__number" aria-hidden="true">
            0{n}
          </span>
          <span className="sy-step__title">
            {t(`pubHome.method.step${n}Title` as MessageKey)} <small aria-hidden="true">+</small>
          </span>
        </button>
      </Heading>
      <div id={uid} className="sy-step__more" aria-hidden={!open}>
        <div>
          <p className="sy-step__cadence">{t(`pubHome.method.step${n}Cadence` as MessageKey)}</p>
          <ul className="sy-chips">
            {[1, 2, 3].map((item) => (
              <li key={item}>{t(`pubHome.method.step${n}Del${item}` as MessageKey)}</li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  )
}

export default function MethodSteps({ headingLevel = 3 }: MethodStepsProps) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, threshold: 0.2 })
  const reduced = usePrefersReducedMotion()
  return (
    <div ref={ref} className={`sy-steps${visible || reduced ? ' sy-is-in' : ''}`}>
      <span className="sy-steps__beam" aria-hidden="true">
        <i />
      </span>
      <ol>
        {paths.map((path, index) => (
          <Step key={path} path={path} n={index + 1} headingLevel={headingLevel} />
        ))}
      </ol>
    </div>
  )
}
