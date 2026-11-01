import { useEffect, useRef } from 'react'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import GridCanvas from './GridCanvas'
import './systeme.css'

export interface HeroBackdropProps {
  canvas?: boolean
  className?: string
}

/** Fond absolu : le parent doit porter `position: relative` et contenir son débordement. */
export default function HeroBackdrop({ canvas = false, className = '' }: HeroBackdropProps) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const el = ref.current
    const update = () => el?.classList.toggle('sy-motion-active', visible && !reduced && !document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [visible, reduced])

  return (
    <>
      <div ref={ref} className={`sy-hero-backdrop ${className}`} aria-hidden="true">
        <div className="sy-aurora">
          <i />
          <i />
          <i />
        </div>
        {!canvas && <div className="sy-hero-backdrop__grid" />}
      </div>
      {canvas && <GridCanvas />}
    </>
  )
}
