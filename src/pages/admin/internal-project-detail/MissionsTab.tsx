import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import MissionForm from './MissionForm'
import { MSC, MSBg, MSBo, MSL, type Mission, type MissionFormState, type Project } from './types'

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
          Missions ({missions.length})
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Toggle vue Tableau / Cartes */}
          <div
            style={{
              display: 'flex',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            {(
              [
                ['table', 'Tableau'],
                ['cards', 'Cartes'],
              ] as const
            ).map(([v, label]) => (
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
                  background: missionView === v ? 'rgba(14, 165, 233, 0.14)' : 'transparent',
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
                {label}
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
                borderRadius: 8,
                border: '1px solid rgba(16,185,129,0.35)',
                background: 'rgba(16,185,129,0.08)',
                color: '#6ee7b7',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nouvelle mission
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
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Chargement...</p>
      ) : missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>◎</div>
          Aucune mission pour l'instant
        </div>
      ) : (
        <div>
          {/* Barre de filtres */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(
                [
                  ['ALL', 'Toutes'],
                  ['A_FAIRE', 'À faire'],
                  ['EN_COURS', 'En cours'],
                  ['TERMINE', 'Terminées'],
                ] as const
              ).map(([v, label]) => {
                const active = filterStatus === v
                const col = v === 'ALL' ? '#a5b4cf' : MSC[v]
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFilterStatus(v)}
                    style={{
                      padding: '4px 11px',
                      borderRadius: 16,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${active ? (v === 'ALL' ? 'rgba(165,180,207,0.4)' : MSBo[v]) : 'rgba(255,255,255,0.08)'}`,
                      background: active ? (v === 'ALL' ? 'rgba(165,180,207,0.1)' : MSBg[v]) : 'transparent',
                      color: active ? col : 'var(--text-secondary)',
                      transition: 'all .15s',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">Tous les membres</option>
              {project.members.map((mem) => (
                <option key={mem._id} value={mem._id}>
                  {mem.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {displayMissions.length} / {missions.length} mission{missions.length > 1 ? 's' : ''}
            </span>
          </div>

          {displayMissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Aucune mission ne correspond aux filtres
            </div>
          ) : missionView === 'table' ? (
            /* ─── Vue tableau (façon Monday) ─── */
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {(
                      [
                        ['title', 'Mission'],
                        ['status', 'Statut'],
                        ['assignee', 'Assignés'],
                        ['progress', 'Progression'],
                        ['steps', 'Étapes'],
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '.4px',
                          color: sortKey === key ? 'var(--primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {label}
                        {sortArrow(key)}
                      </th>
                    ))}
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.4px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      Livrables
                    </th>
                    <th
                      onClick={() => toggleSort('dueDate')}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.4px',
                        color: sortKey === 'dueDate' ? 'var(--primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      Deadline{sortArrow('dueDate')}
                    </th>
                    <th style={{ width: 28, borderBottom: '1px solid rgba(255,255,255,0.08)' }}></th>
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
                            borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)',
                            background: isExpanded
                              ? 'rgba(14, 165, 233, 0.06)'
                              : isOverdue
                                ? 'rgba(248,113,113,0.04)'
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
                                  borderRadius: 4,
                                  background: 'rgba(234,179,8,0.12)',
                                  border: '1px solid rgba(234,179,8,0.3)',
                                  color: '#fde047',
                                }}
                              >
                                🔍 {reviewingSteps} en review
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '2px 9px',
                                borderRadius: 12,
                                color: MSC[m.status],
                                background: MSBg[m.status],
                                border: `1px solid ${MSBo[m.status]}`,
                              }}
                            >
                              {MSL[m.status]}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {(m.assignedTo || []).length === 0 ? (
                              <span style={{ fontSize: 11, color: 'rgba(165,180,207,0.4)' }}>—</span>
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
                                      background: 'rgba(165,180,207,0.18)',
                                      border: '1.5px solid var(--bg-secondary, #0b1220)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: '#a5b4cf',
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
                                  borderRadius: 3,
                                  background: 'rgba(255,255,255,0.08)',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    borderRadius: 3,
                                    background: m.progress === 100 ? '#10b981' : 'var(--primary)',
                                    width: `${m.progress ?? 0}%`,
                                    transition: 'width .3s',
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: m.progress === 100 ? '#6ee7b7' : 'var(--primary)',
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
                              color: totalSteps > 0 && doneSteps === totalSteps ? '#6ee7b7' : 'var(--text-secondary)',
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
                              color: isOverdue ? '#f87171' : 'var(--text-secondary)',
                              fontWeight: isOverdue ? 600 : 400,
                            }}
                          >
                            {m.dueDate ? (
                              <>
                                {isOverdue && '⚠ '}
                                {new Date(m.dueDate).toLocaleDateString('fr-FR')}
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
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              background: 'rgba(14, 165, 233, 0.04)',
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
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isExpanded ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255,255,255,0.06)'}`,
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
                              borderRadius: 12,
                              color: MSC[m.status],
                              background: MSBg[m.status],
                              border: `1px solid ${MSBo[m.status]}`,
                            }}
                          >
                            {MSL[m.status]}
                          </span>
                          {isOverdue && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: 'rgba(248,113,113,0.12)',
                                border: '1px solid rgba(248,113,113,0.3)',
                                color: '#f87171',
                              }}
                            >
                              ⚠ En retard
                            </span>
                          )}
                          {reviewingSteps > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                borderRadius: 4,
                                background: 'rgba(234,179,8,0.12)',
                                border: '1px solid rgba(234,179,8,0.3)',
                                color: '#fde047',
                              }}
                            >
                              🔍 {reviewingSteps} en review
                            </span>
                          )}
                          {m.dueDate && (
                            <span style={{ fontSize: 11, color: isOverdue ? '#f87171' : 'var(--text-secondary)' }}>
                              · {new Date(m.dueDate).toLocaleDateString('fr-FR')}
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
                                  borderRadius: 10,
                                  background: 'rgba(165,180,207,0.08)',
                                  border: '1px solid rgba(165,180,207,0.15)',
                                }}
                              >
                                <div
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    background: 'rgba(165,180,207,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    fontWeight: 700,
                                    color: '#a5b4cf',
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
                          <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                            <div
                              style={{
                                height: '100%',
                                borderRadius: 2,
                                background: m.progress === 100 ? '#10b981' : 'var(--primary)',
                                width: `${m.progress ?? 0}%`,
                                transition: 'width .3s',
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: m.progress === 100 ? '#6ee7b7' : 'var(--primary)',
                              minWidth: 26,
                            }}
                          >
                            {m.progress ?? 0}%
                          </span>
                        </div>
                        {totalSteps > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {doneSteps}/{totalSteps} étapes
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
              to="/admin/gestion?view=missions"
              style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}
            >
              Voir toutes les missions dans Gestion →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
