import { useEffect, useRef, useState } from 'react'

const CANVAS_SIZE = 300

interface AvatarCropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

const AvatarCropModal = ({ file, onConfirm, onCancel }: AvatarCropModalProps) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => {
      const minScale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight)
      setImgEl(img)
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setScale(minScale)
      setOffset({ x: 0, y: 0 })
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const clamp = (ox: number, oy: number, s: number) => {
    const sw = imgNatural.w * s
    const sh = imgNatural.h * s
    const mx = Math.max(0, (sw - CANVAS_SIZE) / 2)
    const my = Math.max(0, (sh - CANVAS_SIZE) / 2)
    return { x: Math.min(mx, Math.max(-mx, ox)), y: Math.min(my, Math.max(-my, oy)) }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
  }

  const handleMouseUp = () => { dragging.current = false }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!imgNatural.w) return
    const minScale = Math.max(CANVAS_SIZE / imgNatural.w, CANVAS_SIZE / imgNatural.h)
    const next = Math.min(4, Math.max(minScale, scale - e.deltaY * 0.001))
    setScale(next)
    setOffset(prev => clamp(prev.x, prev.y, next))
  }

  const handleConfirm = () => {
    if (!imgEl) return
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, 2 * Math.PI)
    ctx.clip()
    const sw = imgEl.naturalWidth * scale
    const sh = imgEl.naturalHeight * scale
    ctx.drawImage(imgEl, (CANVAS_SIZE - sw) / 2 + offset.x, (CANVAS_SIZE - sh) / 2 + offset.y, sw, sh)
    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.92)
  }

  const sw = imgNatural.w * scale
  const sh = imgNatural.h * scale
  const imgX = (CANVAS_SIZE - sw) / 2 + offset.x
  const imgY = (CANVAS_SIZE - sh) / 2 + offset.y

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card, #1e1e2e)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '28px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
          Cadrer la photo
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #888)', textAlign: 'center' }}>
          Glissez pour repositionner · Molette pour zoomer
        </p>

        <div
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            cursor: imgEl ? 'grab' : 'default',
            position: 'relative',
            border: '2px solid var(--primary, #0ea5e9)',
            background: 'rgba(255,255,255,0.04)',
            userSelect: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {imgUrl && imgEl ? (
            <img
              src={imgUrl}
              alt="aperçu recadrage"
              draggable={false}
              style={{
                position: 'absolute',
                width: sw,
                height: sh,
                left: imgX,
                top: imgY,
                pointerEvents: 'none',
              }}
            />
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--text-muted, #888)' }}>
              Chargement...
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'none',
              color: 'var(--text-secondary, #aaa)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!imgEl}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: imgEl ? 'var(--primary, #0ea5e9)' : 'rgba(14,165,233,0.3)',
              color: '#fff',
              cursor: imgEl ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

export default AvatarCropModal
