import GradientMeshBackground from './GradientMeshBackground'
import ParallaxDecorations from './ParallaxDecorations'
import DotsOverlay from './DotsOverlay'
import GrainMicrodots from './GrainMicrodots'
import GridOverlay from './GridOverlay'

type Variant = 'hero' | 'subtle' | 'admin' | 'none'

/**
 * Decorative layer composition (Ticket #28).
 *
 * Replaces the ad-hoc stacking of GradientMeshBackground + ParallaxDecorations
 * + DotsOverlay etc. that pages used to do by hand.
 *
 * Variants:
 * - hero    : full marketing stack (mesh + parallax + dots)
 * - subtle  : light grain only — good for content pages
 * - admin   : low-key grid overlay for back-office shells
 * - none    : no decorations (escape hatch)
 */
export default function Decorations({ variant = 'subtle' }: { variant?: Variant }) {
  if (variant === 'none') return null
  if (variant === 'hero')
    return (
      <>
        <GradientMeshBackground />
        <ParallaxDecorations />
        <DotsOverlay />
      </>
    )
  if (variant === 'subtle') return <GrainMicrodots />
  if (variant === 'admin') return <GridOverlay />
  return null
}
