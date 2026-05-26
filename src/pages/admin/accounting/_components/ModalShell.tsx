import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  closeOnBackdrop?: boolean
  wide?: boolean
  children: ReactNode
}

export default function ModalShell({
  title,
  onClose,
  closeOnBackdrop = true,
  wide = false,
  children,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (closeOnBackdrop) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        className="accounting-card"
        style={{
          maxWidth: wide ? 600 : 520,
          width: '100%',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
