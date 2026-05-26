import { type MutableRefObject } from 'react'
import { FileIcon, UploadIcon } from '@/components/icons/inline-icons'
import type { Mission } from './constants'

const statusBg: Record<string, string> = {
  A_FAIRE: 'rgba(234,179,8,0.12)',
  EN_COURS: 'rgba(14,165,233,0.12)',
  TERMINE: 'rgba(16,185,129,0.12)',
}
const statusBorder: Record<string, string> = {
  A_FAIRE: 'rgba(234,179,8,0.3)',
  EN_COURS: 'rgba(14,165,233,0.3)',
  TERMINE: 'rgba(16,185,129,0.3)',
}
const statusColor: Record<string, string> = {
  A_FAIRE: '#fde047',
  EN_COURS: '#38bdf8',
  TERMINE: '#6ee7b7',
}
const statusLabel: Record<string, string> = {
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  TERMINE: 'Terminée',
}

interface Props {
  mission: Mission
  isSuperAdmin: boolean
  isSelected: boolean
  uploadingMission: string | null
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>
  onSelect: (id: string) => void
  onStatusUpdate: (missionId: string, projectId: string, status: string) => void
  onProgressUpdate: (missionId: string, projectId: string, progress: number) => void
  onFileUpload: (missionId: string, projectId: string, file: File) => void | Promise<void>
}

export default function MissionRow({
  mission: m,
  isSuperAdmin,
  isSelected,
  uploadingMission,
  fileInputRefs,
  onSelect,
  onStatusUpdate,
  onProgressUpdate,
  onFileUpload,
}: Props) {
  const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
  const doneCount = m.steps?.filter(s => s.done).length ?? 0
  const totalSteps = m.steps?.length ?? 0
  const reviewCount = (m.steps || []).filter(s => s.waitingReview && !s.done).length

  return (
    <tr
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(56,189,248,0.04)' : 'transparent',
        transition: 'background .15s',
      }}
      onClick={() => onSelect(m._id)}
    >
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
          {m.internalProject?.name || '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
          {m.internalProject?.entity}
        </div>
      </td>
      <td style={{ padding: '11px 14px', maxWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
            {m.title}
          </span>
          {reviewCount > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 6,
                background: 'rgba(234,179,8,0.12)',
                border: '1px solid rgba(234,179,8,0.3)',
                color: '#fde047',
                whiteSpace: 'nowrap',
              }}
            >
              🔍 {reviewCount}
            </span>
          )}
        </div>
        {m.description && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 200,
            }}
          >
            {m.description}
          </div>
        )}
      </td>
      {isSuperAdmin && (
        <td style={{ padding: '11px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {(m.assignedTo || []).map(a => (
              <div
                key={a._id}
                title={a.name}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(165,180,207,0.15)',
                    border: '1px solid rgba(165,180,207,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#a5b4cf',
                    flexShrink: 0,
                  }}
                >
                  {a.name?.[0]?.toUpperCase()}
                </div>
                {(m.assignedTo || []).length === 1 && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.name}</span>
                )}
              </div>
            ))}
          </div>
        </td>
      )}
      <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 20,
              color: statusColor[m.status] || '#a5b4cf',
              background: statusBg[m.status] || 'rgba(255,255,255,0.05)',
              border: `1px solid ${statusBorder[m.status] || 'rgba(255,255,255,0.1)'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {statusLabel[m.status] || m.status}
          </span>
          {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const)
            .filter(v => v !== m.status)
            .map(v => (
              <button
                key={v}
                type="button"
                onClick={() => onStatusUpdate(m._id, m.internalProject?._id, v)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 12,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {statusLabel[v]}
              </button>
            ))}
        </div>
      </td>
      <td style={{ padding: '11px 14px', minWidth: 120 }} onClick={e => e.stopPropagation()}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            {totalSteps > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {doneCount}/{totalSteps} étapes
              </span>
            )}
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={m.progress ?? 0}
              onBlur={e => {
                const v = Math.min(100, Math.max(0, Number(e.target.value)))
                e.target.value = String(v)
                onProgressUpdate(m._id, m.internalProject?._id, v)
              }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 44,
                fontSize: 13,
                fontWeight: 700,
                padding: '2px 4px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: (m.progress ?? 0) === 100 ? '#6ee7b7' : '#38bdf8',
                textAlign: 'center',
                cursor: 'text',
                marginLeft: 'auto',
              }}
              title="Cliquer pour modifier la progression (%)"
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 2 }}>%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: (m.progress ?? 0) === 100 ? '#10b981' : '#38bdf8',
                width: `${m.progress ?? 0}%`,
                transition: 'width .3s',
              }}
            />
          </div>
        </div>
      </td>
      <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(m.files?.length ?? 0) > 0 && (
            <span
              style={{
                fontSize: 13,
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <FileIcon size={13} />
              {m.files.length}
            </span>
          )}
          <input
            type="file"
            ref={el => {
              fileInputRefs.current[`col_${m._id}`] = el
            }}
            style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (file) await onFileUpload(m._id, m.internalProject?._id, file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              fileInputRefs.current[`col_${m._id}`]?.click()
            }}
            disabled={uploadingMission === m._id}
            title="Joindre un fichier"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid rgba(165,180,207,0.2)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <UploadIcon size={11} />
            {uploadingMission === m._id ? '...' : '+ Fichier'}
          </button>
        </div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span
          style={{
            fontSize: 13,
            color: isOverdue ? '#f87171' : 'var(--text-secondary)',
            fontWeight: isOverdue ? 600 : 400,
          }}
        >
          {isOverdue && '⚠ '}
          {m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : '—'}
        </span>
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: '#38bdf8', opacity: 0.5 }}>›</span>
      </td>
    </tr>
  )
}
