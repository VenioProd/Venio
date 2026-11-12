import { useEffect, useRef } from 'react'
import './AnimatedBackground.css'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  update(): void
  draw(): void
}

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Local non-null references for use inside class closures
    const cvs: HTMLCanvasElement = canvas
    const context: CanvasRenderingContext2D = ctx
    let animationFrameId: number

    // Configuration
    const particles: Particle[] = []
    const particleCount = 80
    const connectionDistance = 150
    const mouse = { x: 0, y: 0 }

    // Taille du canvas
    const resizeCanvas = () => {
      cvs.width = window.innerWidth
      cvs.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Classe Particule
    class ParticleImpl implements Particle {
      x: number
      y: number
      vx: number
      vy: number
      radius: number

      constructor() {
        this.x = Math.random() * cvs.width
        this.y = Math.random() * cvs.height
        this.vx = (Math.random() - 0.5) * 0.5
        this.vy = (Math.random() - 0.5) * 0.5
        this.radius = Math.random() * 2 + 1
      }

      update() {
        this.x += this.vx
        this.y += this.vy

        // Rebond sur les bords
        if (this.x < 0 || this.x > cvs.width) this.vx *= -1
        if (this.y < 0 || this.y > cvs.height) this.vy *= -1

        // Garder dans les limites
        this.x = Math.max(0, Math.min(cvs.width, this.x))
        this.y = Math.max(0, Math.min(cvs.height, this.y))
      }

      draw() {
        context.beginPath()
        context.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        context.fillStyle = 'rgba(255, 255, 0, 0.6)'
        context.fill()
      }
    }

    // Créer les particules
    for (let i = 0; i < particleCount; i++) {
      particles.push(new ParticleImpl())
    }

    // Dessiner les connexions
    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistance) {
            const opacity = 1 - distance / connectionDistance
            context.beginPath()
            context.moveTo(particles[i].x, particles[i].y)
            context.lineTo(particles[j].x, particles[j].y)
            context.strokeStyle = `rgba(255, 255, 0, ${opacity * 0.2})`
            context.lineWidth = 1
            context.stroke()
          }
        }

        // Connexion avec la souris
        const dx = particles[i].x - mouse.x
        const dy = particles[i].y - mouse.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < connectionDistance) {
          const opacity = 1 - distance / connectionDistance
          context.beginPath()
          context.moveTo(particles[i].x, particles[i].y)
          context.lineTo(mouse.x, mouse.y)
          context.strokeStyle = `rgba(255, 255, 0, ${opacity * 0.3})`
          context.lineWidth = 1.5
          context.stroke()
        }
      }
    }

    // Animation
    const animate = () => {
      context.clearRect(0, 0, cvs.width, cvs.height)

      // Dessiner les connexions
      drawConnections()

      // Mettre à jour et dessiner les particules
      particles.forEach((particle) => {
        particle.update()
        particle.draw()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    // Suivre la souris
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }

    window.addEventListener('mousemove', handleMouseMove)
    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return <canvas ref={canvasRef} className="animated-background" />
}

export default AnimatedBackground
