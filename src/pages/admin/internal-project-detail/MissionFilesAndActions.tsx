import { apiDownload } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { MSL_KEYS, type Mission } from './types'

interface MissionFilesAndActionsProps {
  projectId?: string
  mission: Mission
  isSuperAdmin: boolean
  onFileInputRef: (missionId: string, input: HTMLInputElement | null) => void
  onSelectFile: (missionId: string) => void
  uploadingFile: Record<string, boolean>
  onUpload: (missionId: string, file: File) => void
  onDeleteFile: (missionId: string, fileId: string) => void
  onStatusChange: (missionId: string, status: string) => void
  onDeleteMission: (missionId: string) => void
}

export default function MissionFilesAndActions({
  projectId,
  mission,
  isSuperAdmin,
  onFileInputRef,
  onSelectFile,
  uploadingFile,
  onUpload: handleUploadFile,
  onDeleteFile: handleDeleteFile,
  onStatusChange: handleMissionStatus,
  onDeleteMission: handleDeleteMission,
}: MissionFilesAndActionsProps) {
  const { t } = useI18n()
  return (
    <>
      {/* Fichiers */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'none',
            letterSpacing: 'normal',
            color: 'var(--text-secondary)',
            marginBottom: 8,
          }}
        >
          {t('projB.detail.filesHeading', { count: mission.files?.length || 0 })}
        </div>
        {mission.files?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {mission.files.map((f) => (
              <div
                key={f._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 'var(--r-sm)',
                  background: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                }}
              >
                <span style={{ fontSize: 13 }}>
                  {f.mimeType.includes('pdf') ? '📄' : f.mimeType.startsWith('image/') ? '🖼️' : '📁'}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const { blob } = await apiDownload(
                      `/api/admin/internal-projects/${projectId}/missions/${mission._id}/files/${f._id}`,
                    )
                    const url = URL.createObjectURL(blob)
                    window.open(url, '_blank')
                    setTimeout(() => URL.revokeObjectURL(url), 5000)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    flex: 1,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.originalName}
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {t('projB.detail.fileSize', { size: (f.size / 1024).toFixed(0) })}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteFile(mission._id, f._id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'color-mix(in srgb, var(--critical) 40%, transparent)',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '0 2px',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          ref={(el) => onFileInputRef(mission._id, el)}
          style={{ display: 'none' }}
          disabled={uploadingFile[mission._id]}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUploadFile(mission._id, f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => onSelectFile(mission._id)}
          disabled={uploadingFile[mission._id]}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            padding: '5px 11px',
            borderRadius: 'var(--r-md)',
            border: '1px solid color-mix(in srgb, var(--text-secondary) 18%, transparent)',
            background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {uploadingFile[mission._id] ? t('projB.detail.uploading') : t('projB.detail.attachFile')}
        </button>
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(MSL_KEYS)
          .filter(([v]) => v !== mission.status)
          .map(([v, labelKey]) => (
            <button
              key={v}
              type="button"
              onClick={() => handleMissionStatus(mission._id, v)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                fontSize: 12,
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-secondary)',
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => handleDeleteMission(mission._id)}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--r-md)',
              border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)',
              fontSize: 12,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--critical)',
              marginLeft: 'auto',
            }}
          >
            {t('common.delete')}
          </button>
        )}
      </div>
    </>
  )
}
