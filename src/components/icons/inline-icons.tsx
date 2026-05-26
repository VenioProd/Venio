// Small inline SVG icons extracted from page-level god components.
// Kept as plain function components so they can be tree-shaken and styled
// via the `stroke` / `color` CSS cascade (they all use `stroke="currentColor"`
// unless an explicit `stroke` prop overrides).
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

const baseProps = (size: number | string = 13): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})

export function PlusIcon({ size = 13, strokeWidth = 2.5, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={strokeWidth} {...rest}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 13, strokeWidth = 2.2, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={strokeWidth} {...rest}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

export function TargetIcon({ size = 13, strokeWidth = 2.2, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={strokeWidth} {...rest}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}

/** Document / file icon */
export function FileIcon({ size = 13, strokeWidth = 2.5, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={strokeWidth} {...rest}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

/** Upload / paperclip "tray + arrow up" icon */
export function UploadIcon({ size = 11, strokeWidth = 2.5, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} strokeWidth={strokeWidth} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
