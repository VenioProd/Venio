import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Keep workspace overlays above the admin shell's isolated stacking contexts. */
export function WorkspaceOverlayPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
