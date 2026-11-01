import { useI18n } from '../../../context/I18nContext'
import { MSC, MSBg, MSBo, MSL_KEYS, type Mission } from './types'

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
  const { t } = useI18n()
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
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('projB.detail.byMember')}
                </span>
                {blockedCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 'var(--r-md)',
                      background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)',
                      color: 'var(--critical)',
                    }}
                  >
                    {t('projB.detail.blockedCount', { count: blockedCount })}
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
                    ? 'var(--critical)'
                    : p.status === 'TERMINE'
                      ? 'var(--good)'
                      : p.user?._id === currentUserId
                        ? 'var(--primary)'
                        : 'var(--text-secondary)'
                  const cardBorder = p.blocked
                    ? 'color-mix(in srgb, var(--critical) 25%, transparent)'
                    : isBehind
                      ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                      : p.user?._id === currentUserId
                        ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                        : 'color-mix(in srgb, var(--text-primary) 5%, transparent)'
                  const cardBg = p.blocked
                    ? 'color-mix(in srgb, var(--critical) 4%, transparent)'
                    : p.user?._id === currentUserId
                      ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                      : 'color-mix(in srgb, var(--text-primary) 2%, transparent)'
                  const barColor = p.blocked ? 'var(--critical)' : p.progress === 100 ? 'var(--good)' : 'var(--primary)'
                  return (
                    <div
                      key={p._id}
                      style={{
                        borderRadius: 'var(--r-md)',
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
                              background: p.blocked
                                ? 'color-mix(in srgb, var(--critical) 15%, transparent)'
                                : 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
                              border: `1.5px solid ${p.blocked ? 'color-mix(in srgb, var(--critical) 40%, transparent)' : 'color-mix(in srgb, var(--text-secondary) 20%, transparent)'}`,
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
                                background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                                borderRadius: 'var(--r-md)',
                                padding: '1px 6px',
                              }}
                            >
                              {t('projB.detail.me')}
                            </span>
                          )}
                          {p.blocked ? (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 'var(--r-md)',
                                background: 'color-mix(in srgb, var(--critical) 15%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--critical) 35%, transparent)',
                                color: 'var(--critical)',
                                fontWeight: 600,
                              }}
                            >
                              {t('projB.detail.blocked')}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 'var(--r-md)',
                                color: MSC[p.status] || 'var(--text-secondary)',
                                background: MSBg[p.status] || 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                                border: `1px solid ${MSBo[p.status] || 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                              }}
                            >
                              {MSL_KEYS[p.status] ? t(MSL_KEYS[p.status]) : p.status}
                            </span>
                          )}
                          {isBehind && !p.blocked && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 'var(--r-sm)',
                                background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                color: 'var(--warning)',
                              }}
                            >
                              {t('projB.mission.late')}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 5,
                              borderRadius: 'var(--r-hair)',
                              background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 'var(--r-hair)',
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
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                color: p.progress === 100 ? 'var(--good)' : 'var(--primary)',
                                textAlign: 'center',
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: p.progress === 100 ? 'var(--good)' : 'var(--primary)',
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
                                color: myStepsDone === mySteps.length ? 'var(--good)' : 'var(--text-secondary)',
                                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                borderRadius: 'var(--r-sm)',
                                padding: '1px 6px',
                                border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                              }}
                            >
                              {t('projB.detail.ownSteps', { done: myStepsDone, total: mySteps.length })}
                            </span>
                          )}
                          {commonSteps.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                borderRadius: 'var(--r-sm)',
                                padding: '1px 6px',
                                border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                              }}
                            >
                              {t('projB.detail.commonSteps', { done: commonDone, total: commonSteps.length })}
                            </span>
                          )}
                          {myDelivs.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: myDelivsDone === myDelivs.length ? 'var(--primary)' : 'var(--text-secondary)',
                                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                borderRadius: 'var(--r-sm)',
                                padding: '1px 6px',
                                border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                              }}
                            >
                              {t('projB.detail.ownDeliverables', { done: myDelivsDone, total: myDelivs.length })}
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
                                  borderRadius: 'var(--r-md)',
                                  border: `1px solid ${p.status === v ? MSBo[v] : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}`,
                                  background: p.status === v ? MSBg[v] : 'transparent',
                                  color: p.status === v ? MSC[v] : 'var(--text-secondary)',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontWeight: p.status === v ? 600 : 400,
                                  transition: 'all .15s',
                                }}
                              >
                                {t(MSL_KEYS[v])}
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
                                borderRadius: 'var(--r-md)',
                                border: `1px solid ${p.blocked ? 'color-mix(in srgb, var(--critical) 40%, transparent)' : 'color-mix(in srgb, var(--critical) 20%, transparent)'}`,
                                background: p.blocked
                                  ? 'color-mix(in srgb, var(--critical) 12%, transparent)'
                                  : 'transparent',
                                color: p.blocked
                                  ? 'var(--critical)'
                                  : 'color-mix(in srgb, var(--critical) 50%, transparent)',
                                fontSize: 11,
                                cursor: 'pointer',
                                marginLeft: 'auto',
                                transition: 'all .15s',
                              }}
                            >
                              {p.blocked ? t('projB.detail.unblock') : t('projB.detail.block')}
                            </button>
                          </div>
                        )}
                      </div>
                      {p.blocked && (
                        <div
                          style={{
                            padding: '7px 12px 10px',
                            borderTop: '1px solid color-mix(in srgb, var(--critical) 15%, transparent)',
                            background: 'color-mix(in srgb, var(--critical) 3%, transparent)',
                          }}
                        >
                          {canEdit ? (
                            <textarea
                              defaultValue={p.blockedReason || ''}
                              key={`br-${p._id}-${p.blockedReason}`}
                              onBlur={(e) =>
                                handleParticipantUpdate(mission._id, p.user?._id, { blockedReason: e.target.value })
                              }
                              placeholder={t('projB.detail.blockPlaceholder')}
                              rows={2}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                padding: '5px 8px',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid color-mix(in srgb, var(--critical) 20%, transparent)',
                                background: 'color-mix(in srgb, var(--critical) 6%, transparent)',
                                color: 'var(--critical)',
                                resize: 'vertical',
                                lineHeight: 1.5,
                                boxSizing: 'border-box',
                              }}
                            />
                          ) : p.blockedReason ? (
                            <p style={{ fontSize: 11, color: 'var(--critical)', margin: 0, lineHeight: 1.5 }}>
                              "{p.blockedReason}"
                            </p>
                          ) : (
                            <p
                              style={{
                                fontSize: 11,
                                color: 'color-mix(in srgb, var(--critical) 50%, transparent)',
                                margin: 0,
                                fontStyle: 'italic',
                              }}
                            >
                              {t('projB.detail.noReason')}
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
