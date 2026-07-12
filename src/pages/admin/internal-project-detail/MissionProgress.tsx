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
  return (
    <>
      {/* Progression globale */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            color: 'var(--text-secondary)',
            minWidth: 130,
          }}
        >
          📊 Progression globale
        </span>
        <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 4,
              background:
                mission.progress === 100
                  ? 'linear-gradient(90deg,#10b981,#6ee7b7)'
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
              borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: mission.progress === 100 ? '#6ee7b7' : 'var(--primary)',
              textAlign: 'center',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: mission.progress === 100 ? '#6ee7b7' : 'var(--primary)',
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
