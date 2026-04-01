import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface DocPreviewModalProps {
  url: string
  name: string
  onClose: () => void
}

function getFileKind(name: string): 'image' | 'pdf' | 'video' | 'other' {
  const lower = name.toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(lower)) return 'image'
  if (/\.pdf$/.test(lower)) return 'pdf'
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(lower)) return 'video'
  return 'other'
}

export default function DocPreviewModal({ url, name, onClose }: DocPreviewModalProps) {
  const kind = getFileKind(name)

  // Bloquer le scroll du body pendant que la modale est ouverte
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fermer avec Echap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
        background: 'rgba(0,0,0,0.88)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 960, height: 'calc(100vh - 48px)',
          background: '#0f172a', borderRadius: 12, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>{name}</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <a
              href={url}
              download={name}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.2)', textDecoration: 'none' }}
            >
              Télécharger
            </a>
            <button onClick={onClose} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>
              Fermer ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: kind === 'pdf' ? '#1e293b' : '#0f172a' }}>
          {kind === 'image' && (
            <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
          {kind === 'pdf' && (
            <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title={name} />
          )}
          {kind === 'video' && (
            <video src={url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
          )}
          {kind === 'other' && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" style={{ marginBottom: 16 }} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 }}>Ce format ne peut pas être prévisualisé</p>
              <a href={url} download={name} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, background: 'rgba(14,165,233,0.15)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.3)', textDecoration: 'none' }}>
                Télécharger le fichier
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
