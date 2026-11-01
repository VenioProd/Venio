import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import MissionForm from './MissionForm'
import { MSC, MSBg, MSBo, MSL_KEYS, type Mission, type MissionFormState, type Project } from './types'

type MissionView = 'cards' | 'table'
type SortKey = 'title' | 'status' | 'progress' | 'dueDate' | 'steps' | 'assignee'

interface MissionsTabProps {
  project: Project
  missions: Mission[]
  missionsLoading: boolean
  isAdminRole: boolean
  showMissionForm: boolean
  setShowMissionForm: Dispatch<SetStateAction<boolean>>
  missionForm: MissionFormState
  setMissionForm: Dispatch<SetStateAction<MissionFormState>>
  savingMission: boolean
  onCreateMission: (event: FormEvent) => void
  missionView: MissionView
  setMissionView: Dispatch<SetStateAction<MissionView>>
  filterStatus: 'ALL' | 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
  setFilterStatus: Dispatch<SetStateAction<'ALL' | 'A_FAIRE' | 'EN_COURS' | 'TERMINE'>>
  filterAssignee: string
  setFilterAssignee: Dispatch<SetStateAction<string>>
  sortArrow: (key: SortKey) => string
  toggleSort: (key: SortKey) => void
  sortKey: SortKey
  displayMissions: Mission[]
  selectedMission: string | null
  setSelectedMission: Dispatch<SetStateAction<string | null>>
  renderMissionDetail: (mission: Mission) => ReactNode
}

export default function MissionsTab({
  project,
  missions,
  missionsLoading,
  isAdminRole,
  showMissionForm,
  setShowMissionForm,
  missionForm,
  setMissionForm,
  savingMission,
  onCreateMission: handleCreateMission,
  missionView,
  setMissionView,
  filterStatus,
  setFilterStatus,
  filterAssignee,
  setFilterAssignee,
  sortArrow,
  toggleSort,
  sortKey,
  displayMissions,
  selectedMission,
  setSelectedMission,
  renderMissionDetail,
}: MissionsTabProps) {
  const { t } = useI18n()
  return (
    <div className="portal-card" style={{ marginTop: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {t('projB.tab.title', { count: missions.length })}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Toggle vue Tableau / Cartes */}
          <div
            style={{
              display: 'flex',
              borderRadius: 'var(--r-md)',
              border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
              overflow: 'hidden',
            }}
          >
            {(
              [
                ['table', 'projB.tab.viewTable'],
                ['cards', 'projB.tab.viewCards'],
              ] as const satisfies readonly (readonly [MissionView, MessageKey])[]
            ).map(([v, labelKey]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMissionView(v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  border: 'none',
                  background: missionView === v ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
                  color: missionView === v ? 'var(--primary)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {v === 'table' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                )}
                {t(labelKey)}
              </button>
            ))}
          </div>
          {isAdminRole && (
            <button
              type="button"
              onClick={() => setShowMissionForm((f) => !f)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--good) 35%, transparent)',
                background: 'color-mix(in srgb, var(--good) 8%, transparent)',
                color: 'var(--good)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('projB.tab.newMission')}
            </button>
          )}
        </div>
      </div>

      {isAdminRole && showMissionForm && (
        <MissionForm
          form={missionForm}
          setForm={setMissionForm}
          members={project.members}
          saving={savingMission}
          onSubmit={handleCreateMission}
          onCancel={() => setShowMissionForm(false)}
        />
      )}

      {missionsLoading ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
      ) : missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>◎</div>
          {t('projB.tab.empty')}
        </div>
      ) : (
        <div>
          {/* Barre de filtres */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(
                [
                  ['ALL', 'projB.tab.filterAll'],
                  ['A_FAIRE', 'projB.mission.statusTodo'],
                  ['EN_COURS', 'projB.mission.statusInProgress'],
                  ['TERMINE', 'projB.tab.filterDone'],
                ] as const satisfies readonly (readonly [string, MessageKey])[]
              ).map(([v, labelKey]) => {
                const active = filterStatus === v
                const col = v === 'ALL' ? 'var(--text-secondary)' : MSC[v]
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFilterStatus(v)}
                    style={{
                      padding: '4px 11px',
                      borderRadius: 'var(--r-lg)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${active ? (v === 'ALL' ? 'color-mix(in srgb, var(--text-secondary) 40%, transparent)' : MSBo[v]) : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}`,
                      background: active
                        ? v === 'ALL'
                          ? 'color-mix(in srgb, var(--text-secondary) 10%, transparent)'
                          : MSBg[v]
                        : 'transparent',
                      color: active ? col : 'var(--text-secondary)',
                      transition: 'all .15s',
                    }}
                  >
                    {t(labelKey)}
                  </button>
                )
              })}
            </div>
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--r-md)',
                fontSize: 12,
                border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">{t('projB.tab.allMembers')}</option>
              {project.members.map((mem) => (
                <option key={mem._id} value={mem._id}>
                  {mem.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {t('projB.tab.shownCount', { shown: displayMissions.length, count: missions.length })}
            </span>
          </div>

          {displayMissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              {t('projB.tab.noMatch')}
            </div>
          ) : missionView === 'table' ? (
            /* ─── Vue tableau (façon Monday) ─── */
            <div
              className="production-table-scroll"
              style={{
                overflowX: 'auto',
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)' }}>
                    {(
                      [
                        ['title', 'projB.tab.colMission'],
                        ['status', 'projB.tab.colStatus'],
                        ['assignee', 'projB.tab.colAssignees'],
                        ['progress', 'projB.tab.colProgress'],
                        ['steps', 'projB.tab.colSteps'],
                      ] as const satisfies readonly (readonly [SortKey, MessageKey])[]
                    ).map(([key, labelKey]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'none',
                          letterSpacing: 'normal',
                          color: sortKey === key ? 'var(--primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
                        }}
                      >
                        {t(labelKey)}
                        {sortArrow(key)}
                      </th>
                    ))}
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
                      }}
                    >
                      {t('projB.tab.colDeliverables')}
                    </th>
                    <th
                      onClick={() => toggleSort('dueDate')}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        color: sortKey === 'dueDate' ? 'var(--primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
                      }}
                    >
                      {t('projB.tab.colDeadline')}
                      {sortArrow('dueDate')}
                    </th>
                    <th
                      style={{
                        width: 28,
                        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
                      }}
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {displayMissions.map((m) => {
                    const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                    const doneSteps = m.steps?.filter((s) => s.done).length ?? 0
                    const totalSteps = m.steps?.length ?? 0
                    const delivTotal = (m.deliverables || []).length
                    const delivDone = (m.deliverables || []).filter((d) => d.done).length
                    const reviewingSteps = (m.steps || []).filter((s) => s.waitingReview && !s.done).length
                    const isExpanded = selectedMission === m._id
                    return (
                      <Fragment key={m._id}>
                        <tr
                          onClick={() => setSelectedMission(isExpanded ? null : m._id)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: isExpanded
                              ? 'none'
                              : '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                            background: isExpanded
                              ? 'color-mix(in srgb, var(--primary) 6%, transparent)'
                              : isOverdue
                                ? 'color-mix(in srgb, var(--critical) 4%, transparent)'
                                : 'transparent',
                            transition: 'background .12s',
                          }}
                        >
                          <td style={{ padding: '10px 14px', maxWidth: 320 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                marginBottom: m.description ? 2 : 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.title}
                            </div>
                            {m.description && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 300,
                                }}
                              >
                                {m.description}
                              </div>
                            )}
                            {reviewingSteps > 0 && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: 3,
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 'var(--r-sm)',
                                  background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                                  border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                  color: 'var(--warning)',
                                }}
                              >
                                {t('projB.mission.inReview', { count: reviewingSteps })}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '2px 9px',
                                borderRadius: 'var(--r-md)',
                                color: MSC[m.status],
                                background: MSBg[m.status],
                                border: `1px solid ${MSBo[m.status]}`,
                              }}
                            >
                              {t(MSL_KEYS[m.status])}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {(m.assignedTo || []).length === 0 ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: 'color-mix(in srgb, var(--text-secondary) 40%, transparent)',
                                }}
                              >
                                —
                              </span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {(m.assignedTo || []).slice(0, 4).map((a, i) => (
                                  <div
                                    key={a._id}
                                    title={a.name}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: '50%',
                                      background: 'color-mix(in srgb, var(--text-secondary) 18%, transparent)',
                                      border: '1.5px solid var(--bg-secondary, var(--bg-secondary))',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: 'var(--text-secondary)',
                                      marginLeft: i === 0 ? 0 : -7,
                                    }}
                                  >
                                    {a.name[0]?.toUpperCase()}
                                  </div>
                                ))}
                                {(m.assignedTo || []).length > 4 && (
                                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 5 }}>
                                    +{(m.assignedTo || []).length - 4}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 'var(--r-hair)',
                                  background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    borderRadius: 'var(--r-hair)',
                                    background: m.progress === 100 ? 'var(--good)' : 'var(--primary)',
                                    width: `${m.progress ?? 0}%`,
                                    transition: 'width .3s',
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: m.progress === 100 ? 'var(--good)' : 'var(--primary)',
                                  minWidth: 32,
                                  textAlign: 'right',
                                }}
                              >
                                {m.progress ?? 0}%
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              whiteSpace: 'nowrap',
                              color:
                                totalSteps > 0 && doneSteps === totalSteps ? 'var(--good)' : 'var(--text-secondary)',
                              fontSize: 12,
                            }}
                          >
                            {totalSteps > 0 ? `${doneSteps}/${totalSteps}` : '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              whiteSpace: 'nowrap',
                              color:
                                delivTotal > 0 && delivDone === delivTotal ? 'var(--primary)' : 'var(--text-secondary)',
                              fontSize: 12,
                            }}
                          >
                            {delivTotal > 0 ? `${delivDone}/${delivTotal}` : '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              whiteSpace: 'nowrap',
                              fontSize: 12,
                              color: isOverdue ? 'var(--critical)' : 'var(--text-secondary)',
                              fontWeight: isOverdue ? 600 : 400,
                            }}
                          >
                            {m.dueDate ? (
                              <>
                                {isOverdue && '⚠ '}
                                {formatDate(m.dueDate)}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              color: 'var(--primary)',
                              opacity: 0.5,
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                transform: isExpanded ? 'rotate(90deg)' : 'none',
                                transition: 'transform .2s',
                              }}
                            >
                              ›
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr
                            style={{
                              borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                              background: 'color-mix(in srgb, var(--primary) 4%, transparent)',
                            }}
                          >
                            <td colSpan={8} style={{ padding: 0 }}>
                              {renderMissionDetail(m)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ─── Vue cartes ─── */
            <div>
              {displayMissions.map((m) => {
                const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
                const doneSteps = m.steps?.filter((s) => s.done).length ?? 0
                const totalSteps = m.steps?.length ?? 0
                const isExpanded = selectedMission === m._id
                const reviewingSteps = (m.steps || []).filter((s) => s.waitingReview && !s.done).length

                return (
                  <div
                    key={m._id}
                    style={{
                      marginBottom: 10,
                      borderRadius: 'var(--r-md)',
                      background: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                      border: `1px solid ${isExpanded ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)'}`,
                      overflow: 'hidden',
                      transition: 'border-color .15s',
                    }}
                  >
                    {/* Mission header row */}
                    <div
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        justifyContent: 'space-between',
                      }}
                      onClick={() => setSelectedMission(isExpanded ? null : m._id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-md)',
                              color: MSC[m.status],
                              background: MSBg[m.status],
                              border: `1px solid ${MSBo[m.status]}`,
                            }}
                          >
                            {t(MSL_KEYS[m.status])}
                          </span>
                          {isOverdue && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 'var(--r-sm)',
                                background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)',
                                color: 'var(--critical)',
                              }}
                            >
                              {t('projB.mission.late')}
                            </span>
                          )}
                          {reviewingSteps > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 'var(--r-sm)',
                                background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                color: 'var(--warning)',
                              }}
                            >
                              {t('projB.mission.inReview', { count: reviewingSteps })}
                            </span>
                          )}
                          {m.dueDate && (
                            <span
                              style={{ fontSize: 11, color: isOverdue ? 'var(--critical)' : 'var(--text-secondary)' }}
                            >
                              · {formatDate(m.dueDate)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                          {m.title}
                        </div>
                        {m.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {m.description}
                          </div>
                        )}
                        {/* Assignees */}
                        {(m.assignedTo || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {(m.assignedTo || []).map((a) => (
                              <div
                                key={a._id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px',
                                  borderRadius: 'var(--r-md)',
                                  background: 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
                                  border: '1px solid color-mix(in srgb, var(--text-secondary) 15%, transparent)',
                                }}
                              >
                                <div
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    background: 'color-mix(in srgb, var(--text-secondary) 20%, transparent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    fontWeight: 700,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {a.name[0]?.toUpperCase()}
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 6,
                          flexShrink: 0,
                        }}
                      >
                        {/* Mini progress */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              width: 60,
                              height: 4,
                              borderRadius: 'var(--r-hair)',
                              background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 'var(--r-hair)',
                                background: m.progress === 100 ? 'var(--good)' : 'var(--primary)',
                                width: `${m.progress ?? 0}%`,
                                transition: 'width .3s',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: m.progress === 100 ? 'var(--good)' : 'var(--primary)',
                              minWidth: 26,
                            }}
                          >
                            {m.progress ?? 0}%
                          </span>
                        </div>
                        {totalSteps > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {t('projB.mission.stepsCount', { done: doneSteps, total: totalSteps })}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--primary)',
                            opacity: 0.5,
                            transform: isExpanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform .2s',
                            display: 'inline-block',
                          }}
                        >
                          ›
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && renderMissionDetail(m)}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <Link
              to="/admin/projets/clients?view=missions"
              style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}
            >
              {t('projB.tab.seeAll')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
