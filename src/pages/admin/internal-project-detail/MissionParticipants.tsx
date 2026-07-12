import { MSC, MSBg, MSBo, MSL, type Mission } from './types'

interface MissionParticipantsProps {
  mission: Mission
  isSuperAdmin: boolean
  currentUserId?: string
  onParticipantUpdate: (
    missionId: string,
    userId: string,
    fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string },
  ) => void
}

export default function MissionParticipants({
  mission,
  isSuperAdmin,
  currentUserId,
  onParticipantUpdate: handleParticipantUpdate,
}: MissionParticipantsProps) {
  return (
    <>
      {/* Participants — suivi individuel */}
      {(mission.participants || []).length > 0 &&
        (() => {
          const avgP = Math.round(
            (mission.participants || []).reduce((s, p) => s + (p.progress ?? 0), 0) / mission.participants.length,
          )
          const blockedCount = (mission.participants || []).filter((p) => p.blocked).length
          return (
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
                  👥 Avancement par membre
                </span>
                {blockedCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 8,
                      background: 'rgba(248,113,113,0.12)',
                      border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171',
                    }}
                  >
                    🚫 {blockedCount} bloqué{blockedCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(mission.participants || []).map((p) => {
                  const canEdit = isSuperAdmin || p.user?._id === currentUserId
                  const mySteps = (mission.steps || []).filter((s) => s.assignedTo === p.user?._id)
                  const myStepsDone = mySteps.filter((s) => s.done).length
                  const commonSteps = (mission.steps || []).filter((s) => !s.assignedTo)
                  const commonDone = commonSteps.filter((s) => s.done).length
                  const myDelivs = (mission.deliverables || []).filter((d) => d.assignedTo === p.user?._id)
                  const myDelivsDone = myDelivs.filter((d) => d.done).length
                  const isBehind = mission.participants.length > 1 && avgP - (p.progress ?? 0) >= 30
                  const avatarColor = p.blocked
                    ? '#f87171'
                    : p.status === 'TERMINE'
                      ? '#6ee7b7'
                      : p.user?._id === currentUserId
                        ? 'var(--primary)'
                        : '#a5b4cf'
                  const cardBorder = p.blocked
                    ? 'rgba(248,113,113,0.25)'
                    : isBehind
                      ? 'rgba(251,191,36,0.2)'
                      : p.user?._id === currentUserId
                        ? 'rgba(14, 165, 233, 0.15)'
                        : 'rgba(255,255,255,0.05)'
                  const cardBg = p.blocked
                    ? 'rgba(248,113,113,0.04)'
                    : p.user?._id === currentUserId
                      ? 'rgba(14, 165, 233, 0.05)'
                      : 'rgba(255,255,255,0.02)'
                  const barColor = p.blocked ? '#f87171' : p.progress === 100 ? '#10b981' : 'var(--primary)'
                  return (
                    <div
                      key={p._id}
                      style={{
                        borderRadius: 8,
                        background: cardBg,
                        border: `1px solid ${cardBorder}`,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              background: p.blocked ? 'rgba(248,113,113,0.15)' : 'rgba(165,180,207,0.12)',
                              border: `1.5px solid ${p.blocked ? 'rgba(248,113,113,0.4)' : 'rgba(165,180,207,0.2)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              color: avatarColor,
                              flexShrink: 0,
                            }}
                          >
                            {p.blocked ? '🚫' : p.user?.name?.[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                            {p.user?.name}
                          </span>
                          {p.user?._id === currentUserId && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--primary)',
                                background: 'rgba(14, 165, 233, 0.1)',
                                border: '1px solid rgba(14, 165, 233, 0.2)',
                                borderRadius: 8,
                                padding: '1px 6px',
                              }}
                            >
                              Moi
                            </span>
                          )}
                          {p.blocked ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 8,
                                background: 'rgba(248,113,113,0.15)',
                                border: '1px solid rgba(248,113,113,0.35)',
                                color: '#f87171',
                                fontWeight: 600,
                              }}
                            >
                              🚫 Bloqué
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 10,
                                color: MSC[p.status] || '#a5b4cf',
                                background: MSBg[p.status] || 'rgba(255,255,255,0.05)',
                                border: `1px solid ${MSBo[p.status] || 'rgba(255,255,255,0.1)'}`,
                              }}
                            >
                              {MSL[p.status] || p.status}
                            </span>
                          )}
                          {isBehind && !p.blocked && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 6,
                                background: 'rgba(251,191,36,0.1)',
                                border: '1px solid rgba(251,191,36,0.3)',
                                color: '#fbbf24',
                              }}
                            >
                              ⚠ En retard
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 3,
                                background: barColor,
                                width: `${p.progress ?? 0}%`,
                                transition: 'width .3s',
                              }}
                            />
                          </div>
                          {canEdit ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={p.progress ?? 0}
                              key={`${p._id}-${p.progress}`}
                              onBlur={(e) => {
                                const v = Math.min(100, Math.max(0, Number(e.target.value)))
                                e.target.value = String(v)
                                handleParticipantUpdate(mission._id, p.user?._id, { progress: v })
                              }}
                              style={{
                                width: 42,
                                fontSize: 12,
                                fontWeight: 700,
                                padding: '2px 4px',
                                borderRadius: 5,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.04)',
                                color: p.progress === 100 ? '#6ee7b7' : 'var(--primary)',
                                textAlign: 'center',
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: p.progress === 100 ? '#6ee7b7' : 'var(--primary)',
                                minWidth: 26,
                                textAlign: 'right',
                              }}
                            >
                              {p.progress ?? 0}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>%</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: canEdit ? 6 : 0 }}>
                          {mySteps.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: myStepsDone === mySteps.length ? '#6ee7b7' : 'var(--text-secondary)',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 5,
                                padding: '1px 6px',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              ✅ {myStepsDone}/{mySteps.length} étapes
                            </span>
                          )}
                          {commonSteps.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 5,
                                padding: '1px 6px',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              {commonDone}/{commonSteps.length} communes
                            </span>
                          )}
                          {myDelivs.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: myDelivsDone === myDelivs.length ? 'var(--primary)' : 'var(--text-secondary)',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 5,
                                padding: '1px 6px',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              📦 {myDelivsDone}/{myDelivs.length} livrables
                            </span>
                          )}
                        </div>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => handleParticipantUpdate(mission._id, p.user?._id, { status: v })}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  border: `1px solid ${p.status === v ? MSBo[v] : 'rgba(255,255,255,0.08)'}`,
                                  background: p.status === v ? MSBg[v] : 'transparent',
                                  color: p.status === v ? MSC[v] : 'var(--text-secondary)',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontWeight: p.status === v ? 600 : 400,
                                  transition: 'all .15s',
                                }}
                              >
                                {MSL[v]}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                handleParticipantUpdate(mission._id, p.user?._id, {
                                  blocked: !p.blocked,
                                  blockedReason: p.blocked ? '' : p.blockedReason,
                                })
                              }
                              style={{
                                padding: '2px 8px',
                                borderRadius: 10,
                                border: `1px solid ${p.blocked ? 'rgba(248,113,113,0.4)' : 'rgba(248,113,113,0.2)'}`,
                                background: p.blocked ? 'rgba(248,113,113,0.12)' : 'transparent',
                                color: p.blocked ? '#f87171' : 'rgba(248,113,113,0.5)',
                                fontSize: 11,
                                cursor: 'pointer',
                                marginLeft: 'auto',
                                transition: 'all .15s',
                              }}
                            >
                              {p.blocked ? '🚫 Débloquer' : '🚫 Bloquer'}
                            </button>
                          </div>
                        )}
                      </div>
                      {p.blocked && (
                        <div
                          style={{
                            padding: '7px 12px 10px',
                            borderTop: '1px solid rgba(248,113,113,0.15)',
                            background: 'rgba(248,113,113,0.03)',
                          }}
                        >
                          {canEdit ? (
                            <textarea
                              defaultValue={p.blockedReason || ''}
                              key={`br-${p._id}-${p.blockedReason}`}
                              onBlur={(e) =>
                                handleParticipantUpdate(mission._id, p.user?._id, { blockedReason: e.target.value })
                              }
                              placeholder="Décris le blocage…"
                              rows={2}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                padding: '5px 8px',
                                borderRadius: 5,
                                border: '1px solid rgba(248,113,113,0.2)',
                                background: 'rgba(248,113,113,0.06)',
                                color: '#f87171',
                                resize: 'vertical',
                                lineHeight: 1.5,
                                boxSizing: 'border-box',
                              }}
                            />
                          ) : p.blockedReason ? (
                            <p style={{ fontSize: 11, color: '#f87171', margin: 0, lineHeight: 1.5 }}>
                              "{p.blockedReason}"
                            </p>
                          ) : (
                            <p style={{ fontSize: 11, color: 'rgba(248,113,113,0.5)', margin: 0, fontStyle: 'italic' }}>
                              Aucune raison précisée
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
    </>
  )
}
