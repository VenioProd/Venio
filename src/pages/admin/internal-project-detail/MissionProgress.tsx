import { useI18n } from '../../../context/I18nContext'
import type { Mission } from './types'

interface MissionProgressProps {
  mission: Mission
  isSuperAdmin: boolean
  onProgressUpdate: (missionId: string, progress: number) => void
}

export default function MissionProgress({
  mission,
  isSuperAdmin,
  onProgressUpdate: handleProgressUpdate,
}: MissionProgressProps) {
  const { t } = useI18n()
  return (
    <>
      {/* Progression globale */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'none',
            letterSpacing: 'normal',
            color: 'var(--text-secondary)',
            minWidth: 130,
          }}
        >
          {t('projB.detail.progress')}
        </span>
        <div
          style={{
            flex: 1,
            height: 7,
            borderRadius: 'var(--r-sm)',
            background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 'var(--r-sm)',
              background:
                mission.progress === 100
                  ? 'linear-gradient(90deg,var(--good),var(--good))'
                  : 'linear-gradient(90deg,var(--primary),var(--primary))',
              width: `${mission.progress ?? 0}%`,
              transition: 'width .4s',
            }}
          />
        </div>
        {isSuperAdmin ? (
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={mission.progress ?? 0}
            key={`${mission._id}-${mission.progress}`}
            onBlur={(e) => {
              const v = Math.min(100, Math.max(0, Number(e.target.value)))
              e.target.value = String(v)
              handleProgressUpdate(mission._id, v)
            }}
            style={{
              width: 48,
              fontSize: 13,
              fontWeight: 700,
              padding: '2px 5px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
              color: mission.progress === 100 ? 'var(--good)' : 'var(--primary)',
              textAlign: 'center',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: mission.progress === 100 ? 'var(--good)' : 'var(--primary)',
              minWidth: 36,
              textAlign: 'right',
            }}
          >
            {mission.progress ?? 0}
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
      </div>
    </>
  )
}
