import { type MutableRefObject, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { FileIcon, UploadIcon } from '@/components/icons/inline-icons'
import type { Mission } from './constants'

const SL: Record<string, string> = { A_FAIRE: 'À faire', EN_COURS: 'En cours', TERMINE: 'Terminée' }
const SC: Record<string, string> = { A_FAIRE: '#fde047', EN_COURS: '#38bdf8', TERMINE: '#6ee7b7' }
const SBg: Record<string, string> = {
  A_FAIRE: 'rgba(234,179,8,0.12)',
  EN_COURS: 'rgba(14,165,233,0.12)',
  TERMINE: 'rgba(16,185,129,0.12)',
}
const SBo: Record<string, string> = {
  A_FAIRE: 'rgba(234,179,8,0.3)',
  EN_COURS: 'rgba(14,165,233,0.3)',
  TERMINE: 'rgba(16,185,129,0.3)',
}

function Section({
  icon,
  title,
  badge,
  children,
}: {
  icon: string
  title: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.7px',
            color: 'var(--text-secondary)',
          }}
        >
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  )
}

interface Props {
  mission: Mission | null
  currentUserId: string | undefined
  isSuperAdmin: boolean
  expandedStep: string | null
  missionStepInputs: Record<string, string>
  stepAssigneeInputs: Record<string, string>
  deliverableInputs: Record<string, { title: string; description: string; assignedTo: string }>
  uploadingMission: string | null
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>
  setExpandedStep: (id: string | null) => void
  setMissionStepInputs: (
    updater: (s: Record<string, string>) => Record<string, string>,
  ) => void
  setStepAssigneeInputs: (
    updater: (s: Record<string, string>) => Record<string, string>,
  ) => void
  setDeliverableInputs: (
    updater: (
      s: Record<string, { title: string; description: string; assignedTo: string }>,
    ) => Record<string, { title: string; description: string; assignedTo: string }>,
  ) => void
  setMissions: (
    updater: (ms: Mission[]) => Mission[],
  ) => void
  onClose: () => void
  onMissionStatusUpdate: (missionId: string, projectId: string, status: string) => void
  onProgressUpdate: (missionId: string, projectId: string, progress: number) => void
  onParticipantUpdate: (
    missionId: string,
    projectId: string,
    userId: string,
    fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string },
  ) => void
  onMissionToggleStep: (
    missionId: string,
    projectId: string,
    mission: Mission,
    stepId: string,
  ) => void
  onMissionAddStep: (
    missionId: string,
    projectId: string,
    mission: Mission,
    title: string,
    assignedTo?: string,
  ) => void
  onStepDescUpdate: (
    missionId: string,
    projectId: string,
    mission: Mission,
    stepId: string,
    description: string,
  ) => void
  onDeliverableAdd: (missionId: string, projectId: string, mission: Mission) => void
  onDeliverableToggle: (
    missionId: string,
    projectId: string,
    mission: Mission,
    delivId: string,
  ) => void
  onDeliverableDelete: (
    missionId: string,
    projectId: string,
    mission: Mission,
    delivId: string,
  ) => void
  onMissionFileUpload: (
    missionId: string,
    projectId: string,
    file: File,
  ) => void | Promise<void>
  onMissionFileDelete: (missionId: string, projectId: string, fileId: string) => void
  onMissionFileOpen: (missionId: string, projectId: string, fileId: string) => void
  onMissionDateUpdate: (missionId: string, projectId: string, dueDate: string) => void
}

export default function MissionDetailDrawer(props: Props) {
  const {
    mission: m,
    currentUserId,
    isSuperAdmin,
    expandedStep,
    missionStepInputs,
    stepAssigneeInputs,
    deliverableInputs,
    uploadingMission,
    fileInputRefs,
    setExpandedStep,
    setMissionStepInputs,
    setStepAssigneeInputs,
    setDeliverableInputs,
    setMissions,
    onClose,
    onMissionStatusUpdate,
    onProgressUpdate,
    onParticipantUpdate,
    onMissionToggleStep,
    onMissionAddStep,
    onStepDescUpdate,
    onDeliverableAdd,
    onDeliverableToggle,
    onDeliverableDelete,
    onMissionFileUpload,
    onMissionFileDelete,
    onMissionFileOpen,
    onMissionDateUpdate,
  } = props

  if (!m) return null

  const doneCount = m.steps?.filter(s => s.done).length ?? 0
  const totalSteps = m.steps?.length ?? 0
  const delivDone = (m.deliverables || []).filter(d => d.done).length
  const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 90,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1001,
          backdropFilter: 'blur(3px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: 90,
          right: 0,
          bottom: 0,
          width: 560,
          background: '#0f1219',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          zIndex: 1002,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            padding: '22px 24px 18px',
            background: 'linear-gradient(180deg, rgba(14,165,233,0.06) 0%, transparent 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(14,165,233,0.12)',
                    border: '1px solid rgba(14,165,233,0.25)',
                    color: '#38bdf8',
                  }}
                >
                  {m.internalProject?.entity}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(165,180,207,0.5)' }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {m.internalProject?.name}
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
              </div>
              <h2
                style={{
                  fontSize: 19,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '0 0 8px',
                  lineHeight: 1.3,
                }}
              >
                {m.title}
              </h2>
              {m.description && (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {m.description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all .15s',
              }}
            >
              ✕
            </button>
          </div>

          {/* Statut global + deadline */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 14,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 20,
                color: SC[m.status],
                background: SBg[m.status],
                border: `1px solid ${SBo[m.status]}`,
              }}
            >
              {SL[m.status]}
            </span>
            {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const)
              .filter(v => v !== m.status)
              .map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 12,
                    cursor: 'pointer',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {SL[v]}
                </button>
              ))}
            {m.dueDate && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  color: isOverdue ? '#f87171' : 'var(--text-secondary)',
                  fontWeight: isOverdue ? 600 : 400,
                }}
              >
                📅{' '}
                {new Date(m.dueDate).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>

        {/* ── PROGRESSION GLOBALE ── */}
        <Section icon="📊" title="Progression globale">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.07)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 4,
                  background:
                    (m.progress ?? 0) === 100
                      ? 'linear-gradient(90deg,#10b981,#6ee7b7)'
                      : 'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                  width: `${m.progress ?? 0}%`,
                  transition: 'width .4s',
                }}
              />
            </div>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={m.progress ?? 0}
              key={`${m._id}-${m.progress}`}
              onBlur={e => {
                const v = Math.min(100, Math.max(0, Number(e.target.value)))
                e.target.value = String(v)
                onProgressUpdate(m._id, m.internalProject?._id, v)
              }}
              style={{
                width: 52,
                fontSize: 15,
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: (m.progress ?? 0) === 100 ? '#6ee7b7' : '#38bdf8',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
          </div>
          {totalSteps > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              {doneCount}/{totalSteps} étapes ·{' '}
              {(m.deliverables || []).length > 0 &&
                `${delivDone}/${(m.deliverables || []).length} livrables`}
            </div>
          )}
        </Section>

        {/* ── PROGRESSION INDIVIDUELLE ── */}
        {(m.participants || []).length > 0 &&
          (() => {
            const avgProgress = Math.round(
              (m.participants || []).reduce((s, p) => s + (p.progress ?? 0), 0) /
                m.participants.length,
            )
            const blockedCount = (m.participants || []).filter(p => p.blocked).length
            return (
              <Section
                icon="👥"
                title="Avancement par membre"
                badge={
                  blockedCount > 0 ? (
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
                  ) : undefined
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(m.participants || []).map(p => {
                    const canEdit = isSuperAdmin || p.user?._id === currentUserId
                    const mySteps = (m.steps || []).filter(s => s.assignedTo === p.user?._id)
                    const myStepsDone = mySteps.filter(s => s.done).length
                    const commonSteps = (m.steps || []).filter(s => !s.assignedTo)
                    const commonDone = commonSteps.filter(s => s.done).length
                    const myDelivs = (m.deliverables || []).filter(
                      d => d.assignedTo === p.user?._id,
                    )
                    const myDelivsDone = myDelivs.filter(d => d.done).length
                    const isBehind =
                      m.participants.length > 1 && avgProgress - (p.progress ?? 0) >= 30
                    const avatarBg = p.blocked
                      ? 'rgba(248,113,113,0.15)'
                      : p.status === 'TERMINE'
                        ? 'rgba(16,185,129,0.15)'
                        : p.user?._id === currentUserId
                          ? 'rgba(14,165,233,0.15)'
                          : 'rgba(165,180,207,0.12)'
                    const avatarBorder = p.blocked
                      ? 'rgba(248,113,113,0.4)'
                      : p.status === 'TERMINE'
                        ? 'rgba(16,185,129,0.4)'
                        : p.user?._id === currentUserId
                          ? 'rgba(14,165,233,0.3)'
                          : 'rgba(165,180,207,0.2)'
                    const avatarColor = p.blocked
                      ? '#f87171'
                      : p.status === 'TERMINE'
                        ? '#6ee7b7'
                        : p.user?._id === currentUserId
                          ? '#38bdf8'
                          : '#a5b4cf'
                    const cardBorder = p.blocked
                      ? 'rgba(248,113,113,0.25)'
                      : isBehind
                        ? 'rgba(251,191,36,0.2)'
                        : p.user?._id === currentUserId
                          ? 'rgba(14,165,233,0.15)'
                          : 'rgba(255,255,255,0.05)'
                    const cardBg = p.blocked
                      ? 'rgba(248,113,113,0.04)'
                      : p.user?._id === currentUserId
                        ? 'rgba(14,165,233,0.05)'
                        : 'rgba(255,255,255,0.02)'
                    const barColor = p.blocked
                      ? '#f87171'
                      : p.progress === 100
                        ? '#10b981'
                        : p.user?._id === currentUserId
                          ? '#38bdf8'
                          : '#a5b4cf'

                    return (
                      <div
                        key={p._id}
                        style={{
                          borderRadius: 10,
                          background: cardBg,
                          border: `1px solid ${cardBorder}`,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ padding: '12px 14px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 9,
                            }}
                          >
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: '50%',
                                background: avatarBg,
                                border: `1.5px solid ${avatarBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                fontWeight: 700,
                                color: avatarColor,
                                flexShrink: 0,
                              }}
                            >
                              {p.blocked ? '🚫' : p.user?.name?.[0]?.toUpperCase()}
                            </div>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                flex: 1,
                              }}
                            >
                              {p.user?.name}
                            </span>
                            {p.user?._id === currentUserId && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: '#38bdf8',
                                  background: 'rgba(14,165,233,0.1)',
                                  border: '1px solid rgba(14,165,233,0.2)',
                                  borderRadius: 8,
                                  padding: '1px 6px',
                                }}
                              >
                                Moi
                              </span>
                            )}
                            {p.blocked && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 8,
                                  background: 'rgba(248,113,113,0.15)',
                                  border: '1px solid rgba(248,113,113,0.35)',
                                  color: '#f87171',
                                  fontWeight: 600,
                                }}
                              >
                                🚫 Bloqué
                              </span>
                            )}
                            {!p.blocked && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  color: SC[p.status] || '#a5b4cf',
                                  background: SBg[p.status] || 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${SBo[p.status] || 'rgba(255,255,255,0.1)'}`,
                                }}
                              >
                                {SL[p.status] || p.status}
                              </span>
                            )}
                            {isBehind && !p.blocked && (
                              <span
                                title="Contribution en retard sur le groupe"
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  borderRadius: 8,
                                  background: 'rgba(251,191,36,0.1)',
                                  border: '1px solid rgba(251,191,36,0.3)',
                                  color: '#fbbf24',
                                }}
                              >
                                ⚠ En retard
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 7,
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.07)',
                                overflow: 'hidden',
                              }}
                            >
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
                                onBlur={e => {
                                  const v = Math.min(100, Math.max(0, Number(e.target.value)))
                                  e.target.value = String(v)
                                  onParticipantUpdate(
                                    m._id,
                                    m.internalProject?._id,
                                    p.user?._id,
                                    { progress: v },
                                  )
                                }}
                                style={{
                                  width: 44,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  padding: '2px 4px',
                                  borderRadius: 5,
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  background: 'rgba(255,255,255,0.04)',
                                  color: p.progress === 100 ? '#6ee7b7' : '#38bdf8',
                                  textAlign: 'center',
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: p.progress === 100 ? '#6ee7b7' : '#38bdf8',
                                  minWidth: 28,
                                  textAlign: 'right',
                                }}
                              >
                                {p.progress ?? 0}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              gap: 10,
                              flexWrap: 'wrap',
                              marginBottom: canEdit ? 8 : 0,
                            }}
                          >
                            {mySteps.length > 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color:
                                    myStepsDone === mySteps.length
                                      ? '#6ee7b7'
                                      : 'var(--text-secondary)',
                                  background:
                                    myStepsDone === mySteps.length
                                      ? 'rgba(16,185,129,0.08)'
                                      : 'rgba(255,255,255,0.04)',
                                  borderRadius: 6,
                                  padding: '2px 7px',
                                  border: `1px solid ${
                                    myStepsDone === mySteps.length
                                      ? 'rgba(16,185,129,0.2)'
                                      : 'rgba(255,255,255,0.06)'
                                  }`,
                                }}
                              >
                                ✅ {myStepsDone}/{mySteps.length} étapes perso
                              </span>
                            )}
                            {commonSteps.length > 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  background: 'rgba(255,255,255,0.04)',
                                  borderRadius: 6,
                                  padding: '2px 7px',
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
                                  color:
                                    myDelivsDone === myDelivs.length
                                      ? '#c4b5fd'
                                      : 'var(--text-secondary)',
                                  background:
                                    myDelivsDone === myDelivs.length
                                      ? 'rgba(139,92,246,0.08)'
                                      : 'rgba(255,255,255,0.04)',
                                  borderRadius: 6,
                                  padding: '2px 7px',
                                  border: `1px solid ${
                                    myDelivsDone === myDelivs.length
                                      ? 'rgba(139,92,246,0.2)'
                                      : 'rgba(255,255,255,0.06)'
                                  }`,
                                }}
                              >
                                📦 {myDelivsDone}/{myDelivs.length} livrables
                              </span>
                            )}
                            {mySteps.length === 0 &&
                              commonSteps.length === 0 &&
                              myDelivs.length === 0 &&
                              (m.steps || []).length === 0 && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: 'rgba(165,180,207,0.35)',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Aucune étape définie
                                </span>
                              )}
                          </div>

                          {canEdit && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    onParticipantUpdate(
                                      m._id,
                                      m.internalProject?._id,
                                      p.user?._id,
                                      { status: v },
                                    )
                                  }
                                  style={{
                                    padding: '3px 9px',
                                    borderRadius: 12,
                                    border: `1px solid ${
                                      p.status === v ? SBo[v] : 'rgba(255,255,255,0.08)'
                                    }`,
                                    background: p.status === v ? SBg[v] : 'transparent',
                                    color: p.status === v ? SC[v] : 'var(--text-secondary)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    fontWeight: p.status === v ? 600 : 400,
                                    transition: 'all .15s',
                                  }}
                                >
                                  {SL[v]}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  onParticipantUpdate(
                                    m._id,
                                    m.internalProject?._id,
                                    p.user?._id,
                                    {
                                      blocked: !p.blocked,
                                      blockedReason: p.blocked ? '' : p.blockedReason,
                                    },
                                  )
                                }
                                style={{
                                  padding: '3px 9px',
                                  borderRadius: 12,
                                  border: `1px solid ${
                                    p.blocked
                                      ? 'rgba(248,113,113,0.4)'
                                      : 'rgba(248,113,113,0.2)'
                                  }`,
                                  background: p.blocked
                                    ? 'rgba(248,113,113,0.12)'
                                    : 'transparent',
                                  color: p.blocked ? '#f87171' : 'rgba(248,113,113,0.5)',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontWeight: p.blocked ? 600 : 400,
                                  marginLeft: 'auto',
                                  transition: 'all .15s',
                                }}
                              >
                                {p.blocked ? '🚫 Débloqué' : '🚫 Signaler blocage'}
                              </button>
                            </div>
                          )}
                        </div>

                        {p.blocked && (
                          <div
                            style={{
                              padding: '8px 14px 12px',
                              borderTop: '1px solid rgba(248,113,113,0.15)',
                              background: 'rgba(248,113,113,0.03)',
                            }}
                          >
                            {canEdit ? (
                              <textarea
                                defaultValue={p.blockedReason || ''}
                                key={`blocked-${p._id}-${p.blockedReason}`}
                                onBlur={e =>
                                  onParticipantUpdate(
                                    m._id,
                                    m.internalProject?._id,
                                    p.user?._id,
                                    { blockedReason: e.target.value },
                                  )
                                }
                                placeholder="Décris le blocage pour que l'équipe puisse aider…"
                                rows={2}
                                style={{
                                  width: '100%',
                                  fontSize: 12,
                                  padding: '6px 9px',
                                  borderRadius: 6,
                                  border: '1px solid rgba(248,113,113,0.2)',
                                  background: 'rgba(248,113,113,0.06)',
                                  color: '#f87171',
                                  resize: 'vertical',
                                  lineHeight: 1.5,
                                  boxSizing: 'border-box',
                                }}
                              />
                            ) : p.blockedReason ? (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: '#f87171',
                                  margin: 0,
                                  lineHeight: 1.5,
                                }}
                              >
                                "{p.blockedReason}"
                              </p>
                            ) : (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: 'rgba(248,113,113,0.5)',
                                  margin: 0,
                                  fontStyle: 'italic',
                                }}
                              >
                                Aucune raison précisée
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )
          })()}

        {/* ── ÉTAPES ── */}
        <Section
          icon="✅"
          title="Étapes"
          badge={
            totalSteps > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 8,
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  color: '#6ee7b7',
                }}
              >
                {doneCount}/{totalSteps}
              </span>
            ) : undefined
          }
        >
          {totalSteps > 0 ? (
            m.steps.map(step => {
              const stepAssignee = step.assignedTo
                ? (m.assignedTo || []).find(a => a._id === step.assignedTo)
                : null
              const isOpen = expandedStep === step._id
              return (
                <div
                  key={step._id}
                  style={{
                    marginBottom: 6,
                    borderRadius: 8,
                    background: step.done
                      ? 'rgba(16,185,129,0.04)'
                      : step.waitingReview
                        ? 'rgba(234,179,8,0.04)'
                        : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${
                      step.done
                        ? 'rgba(16,185,129,0.15)'
                        : step.waitingReview
                          ? 'rgba(234,179,8,0.2)'
                          : 'rgba(255,255,255,0.05)'
                    }`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedStep(isOpen ? null : step._id)}
                  >
                    <input
                      type="checkbox"
                      checked={step.done}
                      onChange={e => {
                        e.stopPropagation()
                        onMissionToggleStep(m._id, m.internalProject?._id, m, step._id)
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        cursor: 'pointer',
                        width: 15,
                        height: 15,
                        accentColor: '#10b981',
                        flexShrink: 0,
                      }}
                    />
                    {stepAssignee && (
                      <div
                        title={stepAssignee.name}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: 'rgba(56,189,248,0.15)',
                          border: '1px solid rgba(56,189,248,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#38bdf8',
                          flexShrink: 0,
                        }}
                      >
                        {stepAssignee.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        flex: 1,
                        color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                        textDecoration: step.done ? 'line-through' : 'none',
                      }}
                    >
                      {step.title}
                    </span>
                    {step.description && (
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6 }}>
                        📝
                      </span>
                    )}
                    {step.waitingReview && !step.done && (
                      <>
                        <span
                          style={{
                            fontSize: 10,
                            color: '#fde047',
                            background: 'rgba(234,179,8,0.12)',
                            border: '1px solid rgba(234,179,8,0.25)',
                            borderRadius: 8,
                            padding: '1px 6px',
                          }}
                        >
                          En attente
                        </span>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={async e => {
                              e.stopPropagation()
                              try {
                                const data = await apiFetch<{ mission: Mission }>(
                                  `/api/admin/internal-projects/${m.internalProject?._id}/missions/${m._id}/steps/${step._id}/validate-step`,
                                  { method: 'POST' },
                                )
                                setMissions(ms =>
                                  ms.map(x => (x._id === m._id ? data.mission : x)),
                                )
                              } catch {
                                /* silent */
                              }
                            }}
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 6,
                              border: '1px solid rgba(16,185,129,0.35)',
                              background: 'rgba(16,185,129,0.1)',
                              color: '#6ee7b7',
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Valider
                          </button>
                        )}
                      </>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        opacity: 0.5,
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .2s',
                        display: 'inline-block',
                      }}
                    >
                      ▾
                    </span>
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        padding: '0 12px 10px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <textarea
                        defaultValue={step.description || ''}
                        key={`desc-${step._id}`}
                        onBlur={e =>
                          onStepDescUpdate(
                            m._id,
                            m.internalProject?._id,
                            m,
                            step._id,
                            e.target.value,
                          )
                        }
                        placeholder="Ajouter des détails, notes, contexte…"
                        rows={3}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          fontSize: 12,
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--text-primary)',
                          resize: 'vertical',
                          lineHeight: 1.5,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <p style={{ fontSize: 13, color: 'rgba(165,180,207,0.3)', margin: 0 }}>
              Aucune étape définie
            </p>
          )}
          {isSuperAdmin && (
            <div style={{ marginTop: 10 }}>
              {(m.assignedTo || []).length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 5,
                    marginBottom: 7,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                  <button
                    type="button"
                    onClick={() => setStepAssigneeInputs(s => ({ ...s, [m._id]: '' }))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      border: `1px solid ${
                        !stepAssigneeInputs[m._id]
                          ? 'rgba(165,180,207,0.35)'
                          : 'rgba(255,255,255,0.07)'
                      }`,
                      background: !stepAssigneeInputs[m._id]
                        ? 'rgba(165,180,207,0.08)'
                        : 'transparent',
                      color: !stepAssigneeInputs[m._id] ? '#a5b4cf' : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Tous
                  </button>
                  {(m.assignedTo || []).map(a => (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() =>
                        setStepAssigneeInputs(s => ({
                          ...s,
                          [m._id]: s[m._id] === a._id ? '' : a._id,
                        }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 10,
                        border: `1px solid ${
                          stepAssigneeInputs[m._id] === a._id
                            ? 'rgba(56,189,248,0.4)'
                            : 'rgba(255,255,255,0.07)'
                        }`,
                        background:
                          stepAssigneeInputs[m._id] === a._id
                            ? 'rgba(56,189,248,0.1)'
                            : 'transparent',
                        color:
                          stepAssigneeInputs[m._id] === a._id
                            ? '#38bdf8'
                            : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          background: 'rgba(165,180,207,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8,
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
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="portal-input"
                  value={missionStepInputs[m._id] || ''}
                  onChange={e =>
                    setMissionStepInputs(s => ({ ...s, [m._id]: e.target.value }))
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter' && missionStepInputs[m._id]?.trim())
                      onMissionAddStep(
                        m._id,
                        m.internalProject?._id,
                        m,
                        missionStepInputs[m._id].trim(),
                        stepAssigneeInputs[m._id] || undefined,
                      )
                  }}
                  placeholder="Nouvelle étape…"
                  style={{ fontSize: 13, padding: '6px 10px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (missionStepInputs[m._id]?.trim())
                      onMissionAddStep(
                        m._id,
                        m.internalProject?._id,
                        m,
                        missionStepInputs[m._id].trim(),
                        stepAssigneeInputs[m._id] || undefined,
                      )
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(14,165,233,0.3)',
                    background: 'rgba(14,165,233,0.08)',
                    color: '#38bdf8',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ── LIVRABLES ── */}
        <Section
          icon="📦"
          title="Livrables attendus"
          badge={
            (m.deliverables || []).length > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 8,
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  color: '#c4b5fd',
                }}
              >
                {delivDone}/{(m.deliverables || []).length}
              </span>
            ) : undefined
          }
        >
          {(m.deliverables || []).length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(165,180,207,0.3)', margin: 0 }}>
              Aucun livrable défini
            </p>
          ) : (
            (m.deliverables || []).map(d => {
              const da = d.assignedTo ? (m.assignedTo || []).find(a => a._id === d.assignedTo) : null
              return (
                <div
                  key={d._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: d.done ? 'rgba(139,92,246,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${
                      d.done ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.05)'
                    }`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={d.done}
                    onChange={() =>
                      onDeliverableToggle(m._id, m.internalProject?._id, m, d._id)
                    }
                    style={{
                      cursor: 'pointer',
                      width: 15,
                      height: 15,
                      accentColor: '#8b5cf6',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {da && (
                        <div
                          title={da.name}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: 'rgba(139,92,246,0.15)',
                            border: '1px solid rgba(139,92,246,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#c4b5fd',
                            flexShrink: 0,
                          }}
                        >
                          {da.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          color: d.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                          textDecoration: d.done ? 'line-through' : 'none',
                          fontWeight: 500,
                        }}
                      >
                        {d.title}
                      </span>
                    </div>
                    {d.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          margin: '3px 0 0',
                          lineHeight: 1.4,
                        }}
                      >
                        {d.description}
                      </p>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        onDeliverableDelete(m._id, m.internalProject?._id, m, d._id)
                      }
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 5,
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
            <div style={{ marginTop: 8 }}>
              {(m.assignedTo || []).length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 5,
                    marginBottom: 7,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverableInputs(s => ({
                        ...s,
                        [m._id]: {
                          ...(s[m._id] || { title: '', description: '', assignedTo: '' }),
                          assignedTo: '',
                        },
                      }))
                    }
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      border: `1px solid ${
                        !deliverableInputs[m._id]?.assignedTo
                          ? 'rgba(139,92,246,0.35)'
                          : 'rgba(255,255,255,0.07)'
                      }`,
                      background: !deliverableInputs[m._id]?.assignedTo
                        ? 'rgba(139,92,246,0.08)'
                        : 'transparent',
                      color: !deliverableInputs[m._id]?.assignedTo
                        ? '#c4b5fd'
                        : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Tous
                  </button>
                  {(m.assignedTo || []).map(a => (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() =>
                        setDeliverableInputs(s => ({
                          ...s,
                          [m._id]: {
                            ...(s[m._id] || { title: '', description: '', assignedTo: '' }),
                            assignedTo: s[m._id]?.assignedTo === a._id ? '' : a._id,
                          },
                        }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 10,
                        border: `1px solid ${
                          deliverableInputs[m._id]?.assignedTo === a._id
                            ? 'rgba(139,92,246,0.4)'
                            : 'rgba(255,255,255,0.07)'
                        }`,
                        background:
                          deliverableInputs[m._id]?.assignedTo === a._id
                            ? 'rgba(139,92,246,0.1)'
                            : 'transparent',
                        color:
                          deliverableInputs[m._id]?.assignedTo === a._id
                            ? '#c4b5fd'
                            : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          background: 'rgba(165,180,207,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 8,
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
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="portal-input"
                  value={deliverableInputs[m._id]?.title || ''}
                  onChange={e =>
                    setDeliverableInputs(s => ({
                      ...s,
                      [m._id]: {
                        ...(s[m._id] || { description: '', assignedTo: '', title: '' }),
                        title: e.target.value,
                      },
                    }))
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter')
                      onDeliverableAdd(m._id, m.internalProject?._id, m)
                  }}
                  placeholder="Livrable attendu…"
                  style={{ fontSize: 13, padding: '6px 10px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => onDeliverableAdd(m._id, m.internalProject?._id, m)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(139,92,246,0.3)',
                    background: 'rgba(139,92,246,0.08)',
                    color: '#c4b5fd',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
              <input
                className="portal-input"
                value={deliverableInputs[m._id]?.description || ''}
                onChange={e =>
                  setDeliverableInputs(s => ({
                    ...s,
                    [m._id]: {
                      ...(s[m._id] || { title: '', assignedTo: '', description: '' }),
                      description: e.target.value,
                    },
                  }))
                }
                placeholder="Description optionnelle"
                style={{
                  fontSize: 12,
                  padding: '5px 10px',
                  width: '100%',
                  marginTop: 5,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </Section>

        {/* ── FICHIERS ── */}
        <Section icon="📎" title="Fichiers">
          {(m.files?.length ?? 0) === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(165,180,207,0.3)', margin: '0 0 10px' }}>
              Aucun fichier joint
            </p>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {m.files.map(f => (
                <div
                  key={f._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <FileIcon size={14} stroke="#38bdf8" style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.originalName}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {f.size > 1048576
                      ? `${(f.size / 1048576).toFixed(1)} Mo`
                      : `${Math.round(f.size / 1024)} Ko`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onMissionFileOpen(m._id, m.internalProject?._id, f._id)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(14,165,233,0.3)',
                      background: 'rgba(14,165,233,0.08)',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Ouvrir
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        onMissionFileDelete(m._id, m.internalProject?._id, f._id)
                      }
                      style={{
                        fontSize: 11,
                        padding: '3px 7px',
                        borderRadius: 6,
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
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="file"
              ref={el => {
                fileInputRefs.current[m._id] = el
              }}
              style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0]
                if (file) await onMissionFileUpload(m._id, m.internalProject?._id, file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRefs.current[m._id]?.click()}
              disabled={uploadingMission === m._id}
              style={{
                fontSize: 13,
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid rgba(165,180,207,0.18)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <UploadIcon size={13} />
              {uploadingMission === m._id ? 'Envoi…' : 'Joindre un fichier'}
            </button>
          </div>
        </Section>

        {/* ── DEADLINE (SA uniquement) ── */}
        {isSuperAdmin && (
          <Section icon="📅" title="Modifier la deadline">
            <input
              type="date"
              defaultValue={m.dueDate ? m.dueDate.substring(0, 10) : ''}
              key={`date-${m._id}`}
              onBlur={e => onMissionDateUpdate(m._id, m.internalProject?._id, e.target.value)}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 7,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            />
          </Section>
        )}
      </div>
    </>
  )
}
