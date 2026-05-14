import React from 'react'
import './NeonDivider.css'

interface NeonDividerProps {
  variant?: 'default' | 'soft'
}

const NeonDivider = ({ variant = 'default' }: NeonDividerProps) => {
  return (
    <div className={`neon-divider neon-divider-${variant}`} aria-hidden="true">
      <span className="neon-divider-line"></span>
      <span className="neon-divider-dot"></span>
    </div>
  )
}

export default NeonDivider
