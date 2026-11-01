import { useEffect, useRef } from 'react'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import './systeme.css'

interface Point {
  c: number
  r: number
  tx: number
  ty: number
  x: number
  y: number
  vx: number
  vy: number
  px: number
  py: number
  m: number
  color: string
}
interface Pulse {
  c: number
  r: number
  dx: number
  dy: number
  length: number
  t: number
  speed: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Décor absolu. Les événements du pointeur sont écoutés sur le parent du canvas. */
export default function GridCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const inView = useInView(ref)
  const reduced = usePrefersReducedMotion()
  const visibleRef = useRef(false)
  const syncRef = useRef<() => void>(() => {})
  const elapsedRef = useRef(0)

  useEffect(() => {
    visibleRef.current = inView
    syncRef.current()
  }, [inView])

  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      return
    }
    if (!ctx) return
    const context = ctx
    const staticOnly = reduced || typeof window.requestAnimationFrame !== 'function'
    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let points: Point[] = []
    let pulses: Pulse[] = []
    let frame = 0
    let last = 0
    let lastPulse = elapsedRef.current
    let bounds = canvas.getBoundingClientRect()
    const mouse = { x: -10000, y: -10000 }
    const at = (c: number, r: number) => (c >= 0 && r >= 0 && c < cols && r < rows ? points[r * cols + c] : undefined)
    const segment = (a: Point, b: Point) => {
      context.moveTo(a.px, a.py)
      context.lineTo(b.px, b.py)
    }

    const draw = (delta = 0) => {
      const time = elapsedRef.current / 1000
      const progress = clamp(time / 3.5)
      const e = staticOnly ? 1 : progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      context.clearRect(0, 0, width, height)
      for (const p of points) {
        if (e < 1) {
          p.x += (p.vx * delta) / 16.667
          p.y += (p.vy * delta) / 16.667
          if (p.x < 0 || p.x > width) p.vx *= -1
          if (p.y < 0 || p.y > height) p.vy *= -1
        }
        const wave = staticOnly ? 0 : Math.sin(p.tx * 0.011 + time * 0.7) * Math.cos(p.ty * 0.013 + time * 0.45) * 5
        let x = lerp(p.x, p.tx, e)
        let y = lerp(p.y, p.ty + wave, e)
        const dx = x - mouse.x
        const dy = y - mouse.y
        const distance = Math.hypot(dx, dy)
        p.m = 0
        if (!staticOnly && distance < 150 && distance > 0.01) {
          p.m = (1 - distance / 150) ** 2
          x += (dx / distance) * p.m * 28
          y += (dy / distance) * p.m * 28
        }
        p.px = x
        p.py = y
      }
      if (e < 0.98) {
        context.lineWidth = 1
        for (let i = 0; i < points.length; i++) {
          const a = points[i]
          for (let j = i + 1; j < points.length; j++) {
            const b = points[j]
            if (Math.abs(a.px - b.px) > 105 || Math.abs(a.py - b.py) > 105) continue
            const distance = Math.hypot(a.px - b.px, a.py - b.py)
            if (distance > 105) continue
            context.strokeStyle = `rgba(${a.color},${(1 - distance / 105) * (1 - e) * 0.38})`
            context.beginPath()
            segment(a, b)
            context.stroke()
          }
        }
      }
      if (e > 0.02) {
        context.lineWidth = 1
        context.strokeStyle = `rgba(148,163,255,${0.12 * e})`
        context.beginPath()
        for (const p of points) {
          const right = at(p.c + 1, p.r)
          const down = at(p.c, p.r + 1)
          if (right) segment(p, right)
          if (down) segment(p, down)
        }
        context.stroke()
        for (const p of points) {
          if (p.m < 0.05) continue
          context.strokeStyle = `rgba(${p.color},${p.m * 0.9 * e})`
          context.beginPath()
          const right = at(p.c + 1, p.r)
          const down = at(p.c, p.r + 1)
          if (right) segment(p, right)
          if (down) segment(p, down)
          context.stroke()
        }
      }
      for (const p of points) {
        const size = 1.2 + p.m * 2.2
        context.fillStyle = `rgba(${p.color},${Math.min(1, 0.35 + 0.5 * e + p.m * 0.6)})`
        context.fillRect(p.px - size / 2, p.py - size / 2, size, size)
      }
      if (!staticOnly && e > 0.9) {
        if (elapsedRef.current - lastPulse > 260 && pulses.length < 14) {
          lastPulse = elapsedRef.current
          const [dx, dy] = [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
          ][Math.floor(Math.random() * 4)]
          pulses.push({
            c: Math.floor(Math.random() * cols),
            r: Math.floor(Math.random() * rows),
            dx,
            dy,
            length: 4 + Math.floor(Math.random() * 6),
            t: 0,
            speed: 0.04 + Math.random() * 0.04,
          })
        }
        pulses = pulses.filter((pulse) => pulse.t < pulse.length)
        for (const pulse of pulses) {
          pulse.t += (pulse.speed * delta) / 16.667
          const k = Math.floor(pulse.t)
          const f = pulse.t - k
          const a = at(pulse.c + pulse.dx * k, pulse.r + pulse.dy * k)
          const b = at(pulse.c + pulse.dx * (k + 1), pulse.r + pulse.dy * (k + 1))
          const tail = at(pulse.c + pulse.dx * Math.max(0, k - 1), pulse.r + pulse.dy * Math.max(0, k - 1))
          if (!a || !b || !tail) {
            pulse.t = pulse.length
            continue
          }
          const x = lerp(a.px, b.px, f)
          const y = lerp(a.py, b.py, f)
          const fade = Math.sin(Math.PI * clamp(pulse.t / pulse.length))
          const gradient = context.createLinearGradient(tail.px, tail.py, x, y)
          gradient.addColorStop(0, 'rgba(125,211,252,0)')
          gradient.addColorStop(1, `rgba(186,230,253,${0.9 * fade})`)
          context.strokeStyle = gradient
          context.lineWidth = 1.6
          context.beginPath()
          context.moveTo(tail.px, tail.py)
          if (tail !== a) context.lineTo(a.px, a.py)
          context.lineTo(x, y)
          context.stroke()
          for (const [radius, alpha] of [
            [2, fade],
            [7, 0.18 * fade],
          ]) {
            context.fillStyle = `rgba(224,242,254,${alpha})`
            context.beginPath()
            context.arc(x, y, radius, 0, Math.PI * 2)
            context.fill()
          }
        }
      }
    }

    const build = () => {
      bounds = canvas.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      let spacing = Math.max(44, width / 26)
      const count = () => {
        cols = Math.ceil(width / spacing) + 2
        rows = Math.ceil(height / spacing) + 2
      }
      count()
      while (cols * rows > 420) {
        spacing *= 1.08
        count()
      }
      const ox = (width - (cols - 1) * spacing) / 2
      const oy = (height - (rows - 1) * spacing) / 2
      points = []
      pulses = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const k = c / (cols - 1)
          points.push({
            c,
            r,
            tx: ox + c * spacing,
            ty: oy + r * spacing,
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            px: 0,
            py: 0,
            m: 0,
            color: `${Math.round(lerp(167, 94, k))},${Math.round(lerp(139, 234, k))},${Math.round(lerp(250, 212, k))}`,
          })
        }
      if (visibleRef.current && !document.hidden) draw()
    }
    const tick = (now: number) => {
      const delta = last ? Math.min(now - last, 64) : 0
      last = now
      elapsedRef.current += delta
      draw(delta)
      frame = window.requestAnimationFrame(tick)
    }
    const sync = () => {
      if (frame) window.cancelAnimationFrame?.(frame)
      frame = 0
      last = 0
      if (!visibleRef.current || document.hidden) return
      if (staticOnly) draw()
      else frame = window.requestAnimationFrame(tick)
    }
    const measurePosition = () => {
      bounds = canvas.getBoundingClientRect()
    }
    const move = (event: PointerEvent) => {
      if (staticOnly || !visibleRef.current || document.hidden || event.pointerType === 'touch') return
      mouse.x = event.clientX - bounds.left
      mouse.y = event.clientY - bounds.top
    }
    const leave = () => {
      mouse.x = mouse.y = -10000
    }
    build()
    syncRef.current = sync
    sync()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(build) : null
    observer?.observe(canvas)
    window.addEventListener('resize', build)
    window.addEventListener('scroll', measurePosition, { passive: true, capture: true })
    parent.addEventListener('pointerenter', measurePosition)
    parent.addEventListener('pointermove', move, { passive: true })
    parent.addEventListener('pointerleave', leave)
    parent.addEventListener('pointercancel', leave)
    document.addEventListener('visibilitychange', sync)
    return () => {
      if (frame) window.cancelAnimationFrame?.(frame)
      syncRef.current = () => {}
      observer?.disconnect()
      window.removeEventListener('resize', build)
      window.removeEventListener('scroll', measurePosition, true)
      parent.removeEventListener('pointerenter', measurePosition)
      parent.removeEventListener('pointermove', move)
      parent.removeEventListener('pointerleave', leave)
      parent.removeEventListener('pointercancel', leave)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [reduced])

  return <canvas ref={ref} className="sy-grid-canvas" aria-hidden="true" />
}
