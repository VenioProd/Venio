import React, { useState } from 'react'
import { Maximize2, X, GripVertical } from 'lucide-react'
import type { WidgetConfig } from '../../../types/workspace.types'

const SIZES = [
  { w: 3, h: 3 },
  { w: 4, h: 4 },
  { w: 6, h: 5 },
]

function nextSize(w: number, h: number): { w: number; h: number } {
  const idx = SIZES.findIndex((s) => s.w === w && s.h === h)
  const next = SIZES[(idx + 1) % SIZES.length]
  return next ?? { w: 4, h: 4 }
}

interface BentoGridProps {
  widgets: WidgetConfig[]
  editing: boolean
  onChange: (widgets: WidgetConfig[]) => void
  renderWidget: (key: string) => React.ReactNode
}

export default function BentoGrid({ widgets, editing, onChange, renderWidget }: BentoGridProps) {
  const [dragKey, setDragKey] = useState<string | null>(null)

  const visible = widgets.filter((w) => w.enabled)

  const handleDrop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return
    const ordered = [...widgets]
    const from = ordered.findIndex((w) => w.key === dragKey)
    const to = ordered.findIndex((w) => w.key === targetKey)
    if (from < 0 || to < 0) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved!)
    onChange(ordered)
    setDragKey(null)
  }

  const cycleSize = (key: string) => {
    onChange(widgets.map((w) => (w.key === key ? { ...w, ...nextSize(w.w, w.h) } : w)))
  }

  const disable = (key: string) => {
    onChange(widgets.map((w) => (w.key === key ? { ...w, enabled: false } : w)))
  }

  return (
    <div className="bento-grid">
      {visible.map((w) => (
        <div
          key={w.key}
          className={`bento-tile bento-w-${w.w} bento-h-${w.h}${editing ? ' bento-editing' : ''}`}
          draggable={editing}
          onDragStart={() => editing && setDragKey(w.key)}
          onDragOver={(e) => editing && e.preventDefault()}
          onDrop={() => editing && handleDrop(w.key)}
          onDragEnd={() => setDragKey(null)}
        >
          {editing && (
            <div className="bento-tile__bar">
              <GripVertical size={14} className="bento-tile__grip" />
              <div className="bento-tile__actions">
                <button aria-label="Changer la taille" onClick={() => cycleSize(w.key)}>
                  <Maximize2 size={14} />
                </button>
                <button aria-label="Masquer le widget" onClick={() => disable(w.key)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          <div className="bento-tile__body">{renderWidget(w.key)}</div>
        </div>
      ))}
    </div>
  )
}
