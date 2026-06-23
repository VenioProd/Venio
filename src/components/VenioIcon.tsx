import React from 'react'

const W = '#ffffff'
const L = '#ccff00'
const S = { stroke: W, strokeWidth: 1.6, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const }
const SA = { ...S, stroke: L }

const ICONS: Record<string, React.ReactNode> = {
  lucidite: (
    <>
      <path d="M3 16 L16 7 L29 16 L16 25 Z" {...S} fill="none" />
      <circle cx="16" cy="16" r="3" {...SA} fill="none" />
    </>
  ),
  efficacite: (
    <>
      <path d="M7 7 H25" {...S} fill="none" />
      <path d="M7 25 H25" {...S} fill="none" />
      <path d="M16 7 V25" {...SA} fill="none" />
    </>
  ),
  refus: (
    <>
      <circle cx="16" cy="16" r="10" {...S} fill="none" />
      <path d="M9 9 L23 23" {...SA} fill="none" />
    </>
  ),
  conseil: (
    <>
      <circle cx="16" cy="16" r="8" {...S} fill="none" />
      <path d="M16 2 V8 M16 24 V30 M2 16 H8 M24 16 H30" {...S} fill="none" />
      <circle cx="16" cy="16" r="1.6" fill={L} stroke={L} strokeWidth="1" />
    </>
  ),
  developpement: (
    <>
      <path d="M12 8 L5 16 L12 24" {...S} fill="none" />
      <path d="M20 8 L27 16 L20 24" {...S} fill="none" />
      <path d="M14 23 H18" {...SA} fill="none" />
    </>
  ),
  communication: (
    <>
      <circle cx="9" cy="16" r="2" fill={L} stroke={L} strokeWidth="1" />
      <path d="M15 10 A8 8 0 0 1 15 22" {...S} fill="none" />
      <path d="M19 6 A13 13 0 0 1 19 26" {...SA} fill="none" />
    </>
  ),
  vitrine: (
    <>
      <rect x="6" y="8" width="20" height="16" {...S} fill="none" />
      <path d="M6 13 H26" {...S} fill="none" />
      <circle cx="9.5" cy="10.5" r="0.9" fill={L} stroke={L} strokeWidth="1" />
    </>
  ),
  essentiel: (
    <>
      <rect x="6" y="7" width="20" height="18" {...S} fill="none" />
      <path d="M10 13 H22 M10 17 H22" {...S} fill="none" />
      <path d="M10 21 H17" {...SA} fill="none" />
    </>
  ),
  business: (
    <>
      <rect x="6" y="7" width="20" height="18" {...S} fill="none" />
      <circle cx="16" cy="13.5" r="2.4" {...SA} fill="none" />
      <path d="M11.5 21 A4.5 4.5 0 0 1 20.5 21" {...S} fill="none" />
    </>
  ),
  ecommerce: (
    <>
      <rect x="7" y="7" width="7" height="7" {...S} fill="none" />
      <rect x="18" y="7" width="7" height="7" {...SA} fill="none" />
      <rect x="7" y="18" width="7" height="7" {...S} fill="none" />
      <rect x="18" y="18" width="7" height="7" {...S} fill="none" />
    </>
  ),
  plateforme: (
    <>
      <circle cx="8" cy="10" r="2.4" {...S} fill="none" />
      <circle cx="24" cy="9" r="2.4" {...S} fill="none" />
      <circle cx="16" cy="24" r="2.6" fill={L} stroke={L} strokeWidth="1" />
      <path d="M10 11 L14.5 22 M22 11 L17.5 22 M10.5 10 H21.5" {...S} fill="none" />
    </>
  ),
}

interface VenioIconProps {
  name: keyof typeof ICONS
  size?: number
  className?: string
  style?: React.CSSProperties
  'aria-hidden'?: boolean
}

const VenioIcon: React.FC<VenioIconProps> = ({
  name,
  size = 32,
  className = '',
  style,
  'aria-hidden': ariaHidden = true,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={`vi ${className}`}
    style={style}
    aria-hidden={ariaHidden}
  >
    {ICONS[name]}
  </svg>
)

export type VenioIconName = keyof typeof ICONS
export default VenioIcon
