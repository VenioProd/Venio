import React from 'react'
import './NeonDivider.css'

const NeonDivider = ({ variant = 'default' }) => {
  return (
    <div className={`neon-divider neon-divider-${variant}`} aria-hidden="true">
      <span className="neon-divider-line"></span>
      <span className="neon-divider-dot"></span>
    </div>
  )
}

export default NeonDivider
