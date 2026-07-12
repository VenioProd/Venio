import type { Dispatch, SetStateAction } from 'react'
import type { Mission } from './types'

type DeliverableInput = { title: string; description: string; assignedTo: string }

interface MissionDeliverablesProps {
  mission: Mission
  isSuperAdmin: boolean
  deliverableInputs: Record<string, DeliverableInput>
  setDeliverableInputs: Dispatch<SetStateAction<Record<string, DeliverableInput>>>
  onAdd: (missionId: string, mission: Mission) => void
  onToggle: (missionId: string, mission: Mission, deliverableId: string) => void
  onDelete: (missionId: string, mission: Mission, deliverableId: string) => void
}
export default function MissionDeliverables({
  mission,
  isSuperAdmin,
  deliverableInputs,
  setDeliverableInputs,
  onAdd: handleDeliverableAdd,
  onToggle: handleDeliverableToggle,
  onDelete: handleDeliverableDelete,
}: MissionDeliverablesProps) {
  const delivDone = (mission.deliverables || []).filter((deliverable) => deliverable.done).length

  return (
    <>
      {/* Livrables attendus */}
      {((mission.deliverables || []).length > 0 || isSuperAdmin) && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                color: 'var(--text-secondary)',
              }}
            >
              📦 Livrables attendus
            </span>
            {(mission.deliverables || []).length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 8,
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px solid rgba(14, 165, 233, 0.25)',
                  color: 'var(--primary)',
                }}
              >
                {delivDone}/{(mission.deliverables || []).length}
              </span>
            )}
          </div>
          {(mission.deliverables || []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'rgba(165,180,207,0.3)', margin: '0 0 8px' }}>Aucun livrable défini</p>
          ) : (
            (mission.deliverables || []).map((d) => {
              const da = d.assignedTo ? (mission.assignedTo || []).find((a) => a._id === d.assignedTo) : null
              return (
                <div
                  key={d._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 6,
                    padding: '8px 10px',
                    borderRadius: 7,
                    background: d.done ? 'rgba(14, 165, 233, 0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${d.done ? 'rgba(14, 165, 233, 0.18)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={d.done}
                    onChange={() => handleDeliverableToggle(mission._id, mission, d._id)}
                    style={{
                      cursor: 'pointer',
                      width: 14,
                      height: 14,
                      accentColor: 'var(--primary)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {da && (
                        <div
                          title={da.name}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: 'rgba(14, 165, 233, 0.15)',
                            border: '1px solid rgba(14, 165, 233, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 8,
                            fontWeight: 700,
                            color: 'var(--primary)',
                            flexShrink: 0,
                          }}
                        >
                          {da.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span
                        style={{
                          fontSize: 12,
                          color: d.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                          textDecoration: d.done ? 'line-through' : 'none',
                          fontWeight: 500,
                        }}
                      >
                        {d.title}
                      </span>
                    </div>
                    {d.description && (
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>
                        {d.description}
                      </p>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeliverableDelete(mission._id, mission, d._id)}
                      style={{
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 4,
                        border: '1px solid rgba(248,113,113,0.2)',
                        background: 'rgba(248,113,113,0.05)',
                        color: '#f87171',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })
          )}
          {isSuperAdmin && (
            <div style={{ marginTop: 6 }}>
              {(mission.assignedTo || []).length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverableInputs((s) => ({
                        ...s,
                        [mission._id]: { ...(s[mission._id] || { title: '', description: '' }), assignedTo: '' },
                      }))
                    }
                    style={{
                      padding: '2px 7px',
                      borderRadius: 9,
                      border: `1px solid ${!deliverableInputs[mission._id]?.assignedTo ? 'rgba(14, 165, 233, 0.35)' : 'rgba(255,255,255,0.07)'}`,
                      background: !deliverableInputs[mission._id]?.assignedTo
                        ? 'rgba(14, 165, 233, 0.08)'
                        : 'transparent',
                      color: !deliverableInputs[mission._id]?.assignedTo ? 'var(--primary)' : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Tous
                  </button>
                  {(mission.assignedTo || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() =>
                        setDeliverableInputs((s) => ({
                          ...s,
                          [mission._id]: {
                            ...(s[mission._id] || { title: '', description: '' }),
                            assignedTo: s[mission._id]?.assignedTo === a._id ? '' : a._id,
                          },
                        }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 7px',
                        borderRadius: 9,
                        border: `1px solid ${deliverableInputs[mission._id]?.assignedTo === a._id ? 'rgba(14, 165, 233, 0.4)' : 'rgba(255,255,255,0.07)'}`,
                        background:
                          deliverableInputs[mission._id]?.assignedTo === a._id
                            ? 'rgba(14, 165, 233, 0.1)'
                            : 'transparent',
                        color:
                          deliverableInputs[mission._id]?.assignedTo === a._id
                            ? 'var(--primary)'
                            : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: 'rgba(165,180,207,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 7,
                          fontWeight: 700,
                        }}
                      >
                        {a.name[0]?.toUpperCase()}
                      </div>
                      {a.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  className="portal-input"
                  value={deliverableInputs[mission._id]?.title || ''}
                  onChange={(e) =>
                    setDeliverableInputs((s) => ({
                      ...s,
                      [mission._id]: {
                        ...(s[mission._id] || { description: '', assignedTo: '' }),
                        title: e.target.value,
                      },
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDeliverableAdd(mission._id, mission)
                  }}
                  placeholder="Livrable attendu…"
                  style={{ fontSize: 12, padding: '5px 9px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => handleDeliverableAdd(mission._id, mission)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 5,
                    border: '1px solid rgba(14, 165, 233, 0.3)',
                    background: 'rgba(14, 165, 233, 0.08)',
                    color: 'var(--primary)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
              <input
                className="portal-input"
                value={deliverableInputs[mission._id]?.description || ''}
                onChange={(e) =>
                  setDeliverableInputs((s) => ({
                    ...s,
                    [mission._id]: {
                      ...(s[mission._id] || { title: '', assignedTo: '' }),
                      description: e.target.value,
                    },
                  }))
                }
                placeholder="Description optionnelle"
                style={{ fontSize: 11, padding: '4px 9px', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
