import React from 'react'
import Decorations from './Decorations'
import NeonDivider from './NeonDivider'

interface Props {
  title: string
  children: React.ReactNode
}

/**
 * Unified layout for public legal pages (Ticket #29).
 * Replaces the duplicated GradientMesh + .legal-page + .legal-hero + NeonDivider
 * + .legal-content shell used by Legal, CGU, CGV, Confidentialite.
 *
 * Wraps content in `.legal-section` is the caller's responsibility — the
 * children are rendered inside `.legal-content`.
 */
export default function LegalPage({ title, children }: Props) {
  return (
    <>
      <Decorations variant="hero" />
      <div className="legal-page">
        <section className="legal-hero">
          <h1>{title}</h1>
        </section>

        <NeonDivider />

        <section className="legal-content">{children}</section>
      </div>
    </>
  )
}
