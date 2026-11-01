import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { useI18n } from '../../context/I18nContext'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import './systeme.css'

export interface HeroFlowProps {
  strategyHref?: string
  communicationHref?: string
  platformsHref?: string
}

export default function HeroFlow({
  strategyHref = '#strategie',
  communicationHref = '#communication',
  platformsHref = '#plateformes',
}: HeroFlowProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const trackRef = useRef<SVGPathElement>(null)
  const beamRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const samples = useRef<{ x: number; y: number }[]>([])
  const elapsed = useRef(0)
  const gradientId = `sy-flow-${useId().replace(/:/g, '')}`
  const visible = useInView(ref)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const el = ref.current
    const track = trackRef.current
    const beam = beamRef.current
    if (!el || !track || !beam) return
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.sy-flow__card'))
    let disposed = false
    const draw = () => {
      const bounds = el.getBoundingClientRect()
      const boxes = cards.map((card) => {
        const r = card.getBoundingClientRect()
        return {
          l: r.left - bounds.left,
          r: r.right - bounds.left,
          t: r.top - bounds.top,
          b: r.bottom - bounds.top,
          x: r.left - bounds.left + r.width / 2,
          y: r.top - bounds.top + r.height / 2,
        }
      })
      const vertical = window.innerWidth <= 900
      const d = boxes
        .slice(0, 2)
        .map((a, i) => {
          const b = boxes[i + 1]
          const sign = i ? -1 : 1
          if (vertical) {
            const m = (a.b + b.t) / 2
            return `M${a.x},${a.b} C${a.x + 40 * sign},${m} ${b.x - 40 * sign},${m} ${b.x},${b.t}`
          }
          const m = (a.r + b.l) / 2
          return `M${a.r},${a.y} C${m},${a.y - 70 * sign} ${m},${b.y + 70 * sign} ${b.l},${b.y}`
        })
        .join(' ')
      track.setAttribute('d', d)
      beam.setAttribute('d', d)
      // Toute la géométrie SVG est échantillonnée ici, jamais dans la boucle.
      samples.current = []
      if (typeof track.getTotalLength === 'function' && typeof track.getPointAtLength === 'function') {
        const length = track.getTotalLength()
        if (length > 0)
          samples.current = Array.from({ length: 361 }, (_, i) => {
            const point = track.getPointAtLength((length * i) / 360)
            return { x: point.x, y: point.y }
          })
      }
      if (dotRef.current) dotRef.current.style.opacity = samples.current.length ? '1' : '0'
    }
    draw()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null
    observer?.observe(el)
    cards.forEach((card) => observer?.observe(card))
    window.addEventListener('resize', draw)
    void document.fonts?.ready.then(() => {
      if (!disposed) draw()
    })
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', draw)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    const dot = dotRef.current
    if (!el || !dot) return
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      if (last) elapsed.current += Math.min(now - last, 64)
      last = now
      const points = samples.current
      if (points.length) {
        const position = ((elapsed.current / 3600) % 1) * (points.length - 1)
        const i = Math.floor(position)
        const a = points[i]
        const b = points[Math.min(i + 1, points.length - 1)]
        const fraction = position - i
        dot.setAttribute('cx', String(a.x + (b.x - a.x) * fraction))
        dot.setAttribute('cy', String(a.y + (b.y - a.y) * fraction))
      }
      frame = window.requestAnimationFrame(tick)
    }
    const update = () => {
      if (frame) window.cancelAnimationFrame?.(frame)
      frame = 0
      last = 0
      const active = visible && !reduced && !document.hidden
      el.classList.toggle('sy-motion-active', active)
      dot.style.display = active ? '' : 'none'
      if (active && typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(tick)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      if (frame) window.cancelAnimationFrame?.(frame)
      el.classList.remove('sy-motion-active')
      document.removeEventListener('visibilitychange', update)
    }
  }, [visible, reduced])

  const nodes = [
    { href: strategyHref, color: '#a78bfa', label: t('pubHome.sys.flow1Label'), verb: t('pubHome.sys.flow1Verb') },
    { href: communicationHref, color: '#38bdf8', label: t('pubHome.sys.flow2Label'), verb: t('pubHome.sys.flow2Verb') },
    { href: platformsHref, color: '#5eead4', label: t('pubHome.sys.flow3Label'), verb: t('pubHome.sys.flow3Verb') },
  ]
  return (
    <div ref={ref} className="sy-flow" role="group" aria-label={t('pubHome.sys.flowAria')}>
      <svg className="sy-flow__paths" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId}>
            <stop stopColor="#a78bfa" />
            <stop offset=".5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#5eead4" />
          </linearGradient>
        </defs>
        <path ref={trackRef} className="sy-flow__track" />
        <path ref={beamRef} className="sy-flow__beam" stroke={`url(#${gradientId})`} />
        <circle ref={dotRef} className="sy-flow__dot" r="3.5" />
      </svg>
      {nodes.map((node, index) => (
        <a
          key={index}
          className="sy-flow__node"
          href={node.href}
          style={{ '--c': node.color, '--j': index } as CSSProperties}
        >
          <span className="sy-flow__card" aria-hidden="true">
            {index === 0 && (
              <span className="sy-mini-radar">
                <i />
                <i />
                <i />
                <span className="sy-mini-radar__sweep" />
                {[
                  [34, 44],
                  [112, 62],
                  [62, 118],
                ].map(([left, top], i) => (
                  <b key={i} style={{ left, top }}>
                    0{i + 1}
                  </b>
                ))}
              </span>
            )}
            {index === 1 && (
              <span className="sy-mini-posts">
                <span />
                <span />
                <span />
              </span>
            )}
            {index === 2 && (
              <span className="sy-mini-app">
                <i />
                <span>
                  <em>
                    <s />
                    <s />
                    <s />
                  </em>
                  <svg viewBox="0 0 140 52" preserveAspectRatio="none" focusable="false">
                    <path d="M0 44 C20 40 26 22 46 26 S76 40 92 20 S124 8 140 6" />
                  </svg>
                </span>
              </span>
            )}
          </span>
          <span className="sy-flow__label">
            <b>{node.label}</b>
            <small>{node.verb}</small>
          </span>
        </a>
      ))}
    </div>
  )
}
