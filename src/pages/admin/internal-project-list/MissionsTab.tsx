/* eslint-disable @typescript-eslint/no-explicit-any */
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import type { Mission } from './types'
import { useInternalProjectListCtx } from './Context'
import { MISSION_STATUS_KEYS, labelFor } from './labels'

export default function MissionsTab() {
  const { t } = useI18n()
  const {
    missions,
    missionsLoading,
    selectedMission,
    setSelectedMission,
    user,
    isSuperAdmin,
    projects,
    setShowMissionForm,
    handleMissionStatusUpdate,
    handleMissionProgressUpdate,
    handleMissionFileUpload,
    fileInputRefs,
    uploadingMission,
  } = useInternalProjectListCtx()
  return (
    <div style={{ marginTop: 20 }}>
      {/* Récap par assigné — super admin only */}
      {isSuperAdmin &&
        missions.length > 0 &&
        (() => {
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
          missions.forEach((m) => {
            ;(m.assignedTo || []).forEach((a) => {
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
              const participant = (m.participants || []).find((p) => p.user?._id === a._id)
              if (participant?.blocked) entry.blockedCount++
              entry.missions.push(m)
            })
          })
          byAssignee.forEach((entry) => {
            entry.avgProgress = Math.round(
              entry.missions.reduce((sum: any, m: any) => sum + (m.progress ?? 0), 0) / entry.missions.length,
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
                    borderRadius: 'var(--r-md)',
                    background:
                      entry.blockedCount > 0
                        ? 'color-mix(in srgb, var(--critical) 4%, transparent)'
                        : 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                    border: `1px solid ${entry.blockedCount > 0 ? 'color-mix(in srgb, var(--critical) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background:
                          entry.blockedCount > 0
                            ? 'color-mix(in srgb, var(--critical) 15%, transparent)'
                            : 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
                        border: `1px solid ${entry.blockedCount > 0 ? 'color-mix(in srgb, var(--critical) 35%, transparent)' : 'color-mix(in srgb, var(--text-secondary) 20%, transparent)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: entry.blockedCount > 0 ? 'var(--critical)' : 'var(--text-secondary)',
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
                      <span style={{ fontSize: 10, color: 'var(--critical)', flexShrink: 0 }}>🚫</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {t('projA.missions.doneOfTotal', { done: entry.done, total: entry.total })}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: entry.avgProgress === 100 ? 'var(--good)' : 'var(--primary)',
                      }}
                    >
                      {entry.avgProgress}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 'var(--r-hair)',
                      background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 'var(--r-hair)',
                        background: entry.avgProgress === 100 ? 'var(--good)' : 'var(--primary)',
                        width: `${entry.avgProgress}%`,
                        transition: 'width .3s',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

      {missionsLoading ? (
        <div className="portal-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t('common.loading')}</p>
        </div>
      ) : missions.length === 0 ? (
        <div className="portal-card">
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>◎</div>
            {t('projA.missions.empty')}
          </div>
        </div>
      ) : (
        <div className="portal-card production-table-scroll" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)' }}>
                {[
                  t('projA.missions.colProject'),
                  t('projA.missions.colMission'),
                  ...(isSuperAdmin ? [t('projA.missions.colAssignedTo')] : []),
                  t('projA.missions.colStatus'),
                  t('projA.missions.colProgress'),
                  t('projA.common.files'),
                  t('projA.common.deadline'),
                  '',
                ].map((h: any, i: number) => (
                  <th
                    key={i}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      color: 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => {
                const statusBg: Record<string, string> = {
                  A_FAIRE: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                  EN_COURS: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  TERMINE: 'color-mix(in srgb, var(--good) 12%, transparent)',
                }
                const statusBorder: Record<string, string> = {
                  A_FAIRE: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                  EN_COURS: 'color-mix(in srgb, var(--primary) 30%, transparent)',
                  TERMINE: 'color-mix(in srgb, var(--good) 30%, transparent)',
                }
                const statusColor: Record<string, string> = {
                  A_FAIRE: 'var(--warning)',
                  EN_COURS: 'var(--primary)',
                  TERMINE: 'var(--good)',
                }
                const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                const doneCount = m.steps?.filter((s) => s.done).length ?? 0
                const totalSteps = m.steps?.length ?? 0
                const reviewCount = (m.steps || []).filter((s) => s.waitingReview && !s.done).length
                const isSelected = selectedMission === m._id
                return (
                  <>
                    <tr
                      key={m._id}
                      style={{
                        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
                        cursor: 'pointer',
                        background: isSelected ? 'color-mix(in srgb, var(--primary) 4%, transparent)' : 'transparent',
                        transition: 'background .15s',
                      }}
                      onClick={() => setSelectedMission(m._id)}
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
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{m.title}</span>
                          {reviewCount > 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 'var(--r-sm)',
                                background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                color: 'var(--warning)',
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
                            {(m.assignedTo || []).map((a) => (
                              <div key={a._id} title={a.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: 'color-mix(in srgb, var(--text-secondary) 15%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--text-secondary) 20%, transparent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--text-secondary)',
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
                      <td style={{ padding: '11px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '3px 9px',
                              borderRadius: 'var(--r-pill)',
                              color: statusColor[m.status] || 'var(--text-secondary)',
                              background:
                                statusBg[m.status] || 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                              border: `1px solid ${statusBorder[m.status] || 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {labelFor(t, MISSION_STATUS_KEYS, m.status)}
                          </span>
                          {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const)
                            .filter((v) => v !== m.status)
                            .map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-md)',
                                  border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  background: 'transparent',
                                  color: 'var(--text-secondary)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {t(MISSION_STATUS_KEYS[v])}
                              </button>
                            ))}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', minWidth: 120 }} onClick={(e) => e.stopPropagation()}>
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
                                {t('projA.missions.stepsCount', { done: doneCount, total: totalSteps })}
                              </span>
                            )}
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={m.progress ?? 0}
                              onBlur={(e) => {
                                const v = Math.min(100, Math.max(0, Number(e.target.value)))
                                e.target.value = String(v)
                                handleMissionProgressUpdate(m._id, m.internalProject?._id, v)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: 44,
                                fontSize: 13,
                                fontWeight: 700,
                                padding: '2px 4px',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                                background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                                color: (m.progress ?? 0) === 100 ? 'var(--good)' : 'var(--primary)',
                                textAlign: 'center',
                                cursor: 'text',
                                marginLeft: 'auto',
                              }}
                              title={t('projA.missions.progressTitle')}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 2 }}>%</span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 'var(--r-hair)',
                              background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 'var(--r-hair)',
                                background: (m.progress ?? 0) === 100 ? 'var(--good)' : 'var(--primary)',
                                width: `${m.progress ?? 0}%`,
                                transition: 'width .3s',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(m.files?.length ?? 0) > 0 && (
                            <span
                              style={{
                                fontSize: 13,
                                color: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              {m.files.length}
                            </span>
                          )}
                          <input
                            type="file"
                            ref={(el) => {
                              fileInputRefs.current[`col_${m._id}`] = el
                            }}
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (file) await handleMissionFileUpload(m._id, m.internalProject?._id, file)
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              fileInputRefs.current[`col_${m._id}`]?.click()
                            }}
                            disabled={uploadingMission === m._id}
                            title={t('projA.common.attachFile')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid color-mix(in srgb, var(--text-secondary) 20%, transparent)',
                              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                              color: 'var(--text-secondary)',
                              fontSize: 12,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            {uploadingMission === m._id ? '...' : t('projA.missions.addFile')}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span
                          style={{
                            fontSize: 13,
                            color: isOverdue ? 'var(--critical)' : 'var(--text-secondary)',
                            fontWeight: isOverdue ? 600 : 400,
                          }}
                        >
                          {isOverdue && '⚠ '}
                          {m.dueDate ? formatDate(m.dueDate) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 8px', textAlign: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--primary)', opacity: 0.5 }}>›</span>
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
