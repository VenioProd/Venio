import { type MutableRefObject } from 'react'
import MissionRow from './MissionRow'
import type { Mission } from './constants'

interface Props {
  missions: Mission[]
  missionsLoading: boolean
  isSuperAdmin: boolean
  selectedMission: string | null
  uploadingMission: string | null
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>
  onSelectMission: (id: string) => void
  onStatusUpdate: (missionId: string, projectId: string, status: string) => void
  onProgressUpdate: (missionId: string, projectId: string, progress: number) => void
  onFileUpload: (missionId: string, projectId: string, file: File) => void | Promise<void>
}

function AssigneeRecap({ missions }: { missions: Mission[] }) {
  const byAssignee = new Map<
    string,
    {
      name: string
      total: number
      done: number
      avgProgress: number
      blockedCount: number
      missions: Mission[]
    }
  >()
  missions.forEach(m => {
    ;(m.assignedTo || []).forEach(a => {
      if (!byAssignee.has(a._id))
        byAssignee.set(a._id, {
          name: a.name,
          total: 0,
          done: 0,
          avgProgress: 0,
          blockedCount: 0,
          missions: [],
        })
      const entry = byAssignee.get(a._id)!
      entry.total++
      if (m.status === 'TERMINE') entry.done++
      const participant = (m.participants || []).find(p => p.user?._id === a._id)
      if (participant?.blocked) entry.blockedCount++
      entry.missions.push(m)
    })
  })
  byAssignee.forEach(entry => {
    entry.avgProgress = Math.round(
      entry.missions.reduce((sum, m) => sum + (m.progress ?? 0), 0) / entry.missions.length,
    )
  })

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
      {Array.from(byAssignee.entries()).map(([id, entry]) => (
        <div
          key={id}
          style={{
            flex: '1 1 160px',
            minWidth: 160,
            padding: '14px 16px',
            borderRadius: 10,
            background:
              entry.blockedCount > 0 ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              entry.blockedCount > 0 ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.07)'
            }`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background:
                  entry.blockedCount > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(165,180,207,0.12)',
                border: `1px solid ${
                  entry.blockedCount > 0 ? 'rgba(248,113,113,0.35)' : 'rgba(165,180,207,0.2)'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: entry.blockedCount > 0 ? '#f87171' : '#a5b4cf',
                flexShrink: 0,
              }}
            >
              {entry.name[0]?.toUpperCase()}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {entry.name}
            </span>
            {entry.blockedCount > 0 && (
              <span style={{ fontSize: 10, color: '#f87171', flexShrink: 0 }}>🚫</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {entry.done}/{entry.total} terminées
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: entry.avgProgress === 100 ? '#6ee7b7' : '#38bdf8',
              }}
            >
              {entry.avgProgress}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: entry.avgProgress === 100 ? '#10b981' : '#38bdf8',
                width: `${entry.avgProgress}%`,
                transition: 'width .3s',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MissionsTab({
  missions,
  missionsLoading,
  isSuperAdmin,
  selectedMission,
  uploadingMission,
  fileInputRefs,
  onSelectMission,
  onStatusUpdate,
  onProgressUpdate,
  onFileUpload,
}: Props) {
  return (
    <div style={{ marginTop: 20 }}>
      {isSuperAdmin && missions.length > 0 && <AssigneeRecap missions={missions} />}

      {missionsLoading ? (
        <div className="portal-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
        </div>
      ) : missions.length === 0 ? (
        <div className="portal-card">
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: 'var(--text-secondary)',
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>◎</div>
            Aucune mission pour l'instant
          </div>
        </div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {(
                  [
                    'Projet',
                    'Mission',
                    ...(isSuperAdmin ? ['Assigné à'] : []),
                    'Statut',
                    'Progression',
                    'Fichiers',
                    'Deadline',
                    '',
                  ] as string[]
                ).map((h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '.6px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <MissionRow
                  key={m._id}
                  mission={m}
                  isSuperAdmin={isSuperAdmin}
                  isSelected={selectedMission === m._id}
                  uploadingMission={uploadingMission}
                  fileInputRefs={fileInputRefs}
                  onSelect={onSelectMission}
                  onStatusUpdate={onStatusUpdate}
                  onProgressUpdate={onProgressUpdate}
                  onFileUpload={onFileUpload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
