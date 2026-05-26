import { useEffect, useState } from 'react'
import './ParallaxDecorations.css'

const ParallaxDecorations = () => {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.pageYOffset)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="parallax-decorations">
      {/* Un seul cercle très subtil */}
      <div 
        className="parallax-circle parallax-circle-1"
        style={{ 
          transform: `translateY(${scrollY * 0.03}px)` 
        }}
      />
    </div>
  )
}

export default ParallaxDecorations
