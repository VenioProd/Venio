import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import './systeme.css'

export interface TiltStageProps {
  children: ReactNode
  className?: string
  glow?: string
  /** Libellé déjà traduit par l'appelant. */
  caption?: string
}

export default function TiltStage({ children, className = '', glow, caption }: TiltStageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const visible = useInView(ref)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    const target = stage.current
    if (!el || !target || reduced || !visible || typeof window.matchMedia !== 'function') return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    let rect = el.getBoundingClientRect()
    let frame = 0
    let x = 0
    let y = 0
    const layers = Array.from(target.querySelectorAll<HTMLElement>('[data-depth]')).map((layer) => ({
      el: layer,
      depth: Number(layer.dataset.depth) || 0,
      translate: layer.style.translate,
    }))
    const reset = () => {
      if (frame) window.cancelAnimationFrame?.(frame)
      frame = 0
      target.style.removeProperty('--sy-tilt-x')
      target.style.removeProperty('--sy-tilt-y')
      layers.forEach((layer) => {
        layer.el.style.translate = layer.translate
      })
    }
    const measure = () => {
      rect = el.getBoundingClientRect()
    }
    const move = (event: PointerEvent) => {
      if (
        !fine.matches ||
        document.hidden ||
        event.pointerType === 'touch' ||
        !rect.width ||
        !rect.height ||
        typeof window.requestAnimationFrame !== 'function'
      )
        return
      x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5))
      y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5))
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        target.style.setProperty('--sy-tilt-x', `${-y * 6}deg`)
        target.style.setProperty('--sy-tilt-y', `${x * 8}deg`)
        layers.forEach((layer) => {
          layer.el.style.translate = `${x * layer.depth}px ${y * layer.depth}px`
        })
      })
    }
    const onVisibility = () => {
      if (document.hidden) reset()
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    el.addEventListener('pointerenter', measure)
    el.addEventListener('pointermove', move, { passive: true })
    el.addEventListener('pointerleave', reset)
    el.addEventListener('pointercancel', reset)
    fine.addEventListener?.('change', reset)
    window.addEventListener('scroll', measure, { passive: true, capture: true })
    window.addEventListener('resize', measure)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      reset()
      observer?.disconnect()
      el.removeEventListener('pointerenter', measure)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', reset)
      el.removeEventListener('pointercancel', reset)
      fine.removeEventListener?.('change', reset)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [children, reduced, visible])

  return (
    <div
      ref={ref}
      className={`sy-tilt-stage ${className}`}
      style={glow ? ({ '--sy-glow': glow } as CSSProperties) : undefined}
    >
      {glow && <span className="sy-tilt-stage__glow" aria-hidden="true" />}
      <div ref={stage} className="sy-tilt-stage__inner">
        {children}
      </div>
      {caption && <p className="sy-tilt-stage__caption">{caption}</p>}
    </div>
  )
}
