import type React from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { MISSION_STATUS_KEYS, labelFor } from './labels'
import type { Mission } from './types'

interface AnyFn {
  (...args: any[]): any
}

interface MissionDrawerCtx {
  missions: Mission[]
  selectedMission: string | null
  setSelectedMission: (v: string | null) => void
  user: { _id?: string } | null
  isSuperAdmin: boolean
  expandedStep: string | null
  setExpandedStep: (v: string | null) => void
  stepAssigneeInputs: Record<string, string>
  setStepAssigneeInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  deliverableInputs: Record<string, { title: string; description: string; assignedTo: string }>
  setDeliverableInputs: React.Dispatch<
    React.SetStateAction<Record<string, { title: string; description: string; assignedTo: string }>>
  >
  uploadingMission: string | null
  fileInputRefs: { current: Record<string, HTMLInputElement | null> }
  missionStepInputs: Record<string, string>
  setMissionStepInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  handleParticipantUpdate: AnyFn
  handleStepDescUpdate: AnyFn
  handleMissionStatusUpdate: AnyFn
  handleMissionToggleStep: AnyFn
  handleMissionAddStep: AnyFn
  handleMissionDateUpdate: AnyFn
  handleDeliverableAdd: AnyFn
  handleDeliverableToggle: AnyFn
  handleDeliverableDelete: AnyFn
  handleMissionFileUpload: AnyFn
  handleMissionFileOpen: AnyFn
  handleMissionFileDelete: AnyFn
  handleMissionProgressUpdate: AnyFn
  apiFetch: AnyFn
  setMissions: React.Dispatch<React.SetStateAction<Mission[]>>
  showToast: AnyFn
}

interface Props {
  ctx: MissionDrawerCtx
}

export default function MissionDetailDrawer({ ctx }: Props) {
  const { t } = useI18n()
  const {
    missions,
    selectedMission,
    setSelectedMission,
    user,
    isSuperAdmin,
    expandedStep,
    setExpandedStep,
    stepAssigneeInputs,
    setStepAssigneeInputs,
    deliverableInputs,
    setDeliverableInputs,
    uploadingMission,
    fileInputRefs,
    missionStepInputs,
    setMissionStepInputs,
    handleParticipantUpdate,
    handleStepDescUpdate,
    handleMissionStatusUpdate,
    handleMissionToggleStep,
    handleMissionAddStep,
    handleMissionDateUpdate,
    handleDeliverableAdd,
    handleDeliverableToggle,
    handleDeliverableDelete,
    handleMissionFileUpload,
    handleMissionFileOpen,
    handleMissionFileDelete,
    handleMissionProgressUpdate,
    apiFetch,
    setMissions,
    showToast,
  } = ctx
  const m = missions.find((x) => x._id === selectedMission)
  if (!m) return null
  const statusLabel = (status: string) => labelFor(t, MISSION_STATUS_KEYS, status)
  const SC: Record<string, string> = { A_FAIRE: 'var(--warning)', EN_COURS: 'var(--primary)', TERMINE: 'var(--good)' }
  const SBg: Record<string, string> = {
    A_FAIRE: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    EN_COURS: 'color-mix(in srgb, var(--primary) 12%, transparent)',
    TERMINE: 'color-mix(in srgb, var(--good) 12%, transparent)',
  }
  const SBo: Record<string, string> = {
    A_FAIRE: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    EN_COURS: 'color-mix(in srgb, var(--primary) 30%, transparent)',
    TERMINE: 'color-mix(in srgb, var(--good) 30%, transparent)',
  }
  const doneCount = m.steps?.filter((s) => s.done).length ?? 0
  const totalSteps = m.steps?.length ?? 0
  const delivDone = (m.deliverables || []).filter((d) => d.done).length
  const isOverdue = m.dueDate && m.status !== 'TERMINE' && new Date(m.dueDate) < new Date()
  const myParticipant = (m.participants || []).find((p) => p.user?._id === user?._id)

  const Section = ({
    icon,
    title,
    badge,
    children,
  }: {
    icon: string
    title: string
    badge?: ReactNode
    children: ReactNode
  }) => (
    <div
      style={{
        padding: '18px 24px',
        borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'none',
            letterSpacing: 'normal',
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
        onClick={() => setSelectedMission(null)}
      />
      <div
        style={{
          position: 'fixed',
          top: 90,
          right: 0,
          bottom: 0,
          width: 'min(560px, 100vw)',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid color-mix(in srgb, var(--text-primary) 7%, transparent)',
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
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, transparent) 0%, transparent 100%)',
            borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                    color: 'var(--primary)',
                  }}
                >
                  {m.internalProject?.entity}
                </span>
                <span style={{ fontSize: 12, color: 'color-mix(in srgb, var(--text-secondary) 50%, transparent)' }}>
                  ·
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.internalProject?.name}</span>
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
                    {t('projA.common.overdue')}
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
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {m.description}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedMission(null)}
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
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
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 'var(--r-pill)',
                color: SC[m.status],
                background: SBg[m.status],
                border: `1px solid ${SBo[m.status]}`,
              }}
            >
              {statusLabel(m.status)}
            </span>
            {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const)
              .filter((v) => v !== m.status)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleMissionStatusUpdate(m._id, m.internalProject?._id, v)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                    fontSize: 12,
                    cursor: 'pointer',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  {statusLabel(v)}
                </button>
              ))}
            {m.dueDate && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  color: isOverdue ? 'var(--critical)' : 'var(--text-secondary)',
                  fontWeight: isOverdue ? 600 : 400,
                }}
              >
                📅 {formatDate(m.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* ── PROGRESSION GLOBALE ── */}
        <Section icon="📊" title={t('projA.drawer.overallProgress')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 'var(--r-sm)',
                background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 'var(--r-sm)',
                  background:
                    (m.progress ?? 0) === 100
                      ? 'linear-gradient(90deg,var(--good),var(--good))'
                      : 'linear-gradient(90deg,var(--primary),var(--primary))',
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
              onBlur={(e) => {
                const v = Math.min(100, Math.max(0, Number(e.target.value)))
                e.target.value = String(v)
                handleMissionProgressUpdate(m._id, m.internalProject?._id, v)
              }}
              style={{
                width: 52,
                fontSize: 15,
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
                background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                color: (m.progress ?? 0) === 100 ? 'var(--good)' : 'var(--primary)',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>%</span>
          </div>
          {totalSteps > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              {t('projA.drawer.stepsCount', { done: doneCount, total: totalSteps })} ·{' '}
              {(m.deliverables || []).length > 0 &&
                t('projA.drawer.deliverablesCount', { done: delivDone, total: (m.deliverables || []).length })}
            </div>
          )}
        </Section>

        {/* ── PROGRESSION INDIVIDUELLE ── */}
        {(m.participants || []).length > 0 &&
          (() => {
            const avgProgress = Math.round(
              (m.participants || []).reduce((s, p) => s + (p.progress ?? 0), 0) / m.participants.length,
            )
            const blockedCount = (m.participants || []).filter((p) => p.blocked).length
            return (
              <Section
                icon="👥"
                title={t('projA.drawer.memberProgress')}
                badge={
                  blockedCount > 0 ? (
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
                      {t('projA.drawer.blockedCount', { count: blockedCount })}
                    </span>
                  ) : undefined
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(m.participants || []).map((p) => {
                    const canEdit = isSuperAdmin || p.user?._id === user?._id
                    // Étapes assignées à cette personne
                    const mySteps = (m.steps || []).filter((s) => s.assignedTo === p.user?._id)
                    const myStepsDone = mySteps.filter((s) => s.done).length
                    // Étapes communes (non assignées)
                    const commonSteps = (m.steps || []).filter((s) => !s.assignedTo)
                    const commonDone = commonSteps.filter((s) => s.done).length
                    // Livrables assignés à cette personne
                    const myDelivs = (m.deliverables || []).filter((d) => d.assignedTo === p.user?._id)
                    const myDelivsDone = myDelivs.filter((d) => d.done).length
                    // Contribution inégale : 30+ points sous la moyenne
                    const isBehind = m.participants.length > 1 && avgProgress - (p.progress ?? 0) >= 30
                    // Couleur avatar selon état
                    const avatarBg = p.blocked
                      ? 'color-mix(in srgb, var(--critical) 15%, transparent)'
                      : p.status === 'TERMINE'
                        ? 'color-mix(in srgb, var(--good) 15%, transparent)'
                        : p.user?._id === user?._id
                          ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                          : 'color-mix(in srgb, var(--text-secondary) 12%, transparent)'
                    const avatarBorder = p.blocked
                      ? 'color-mix(in srgb, var(--critical) 40%, transparent)'
                      : p.status === 'TERMINE'
                        ? 'color-mix(in srgb, var(--good) 40%, transparent)'
                        : p.user?._id === user?._id
                          ? 'color-mix(in srgb, var(--primary) 30%, transparent)'
                          : 'color-mix(in srgb, var(--text-secondary) 20%, transparent)'
                    const avatarColor = p.blocked
                      ? 'var(--critical)'
                      : p.status === 'TERMINE'
                        ? 'var(--good)'
                        : p.user?._id === user?._id
                          ? 'var(--primary)'
                          : 'var(--text-secondary)'
                    const cardBorder = p.blocked
                      ? 'color-mix(in srgb, var(--critical) 25%, transparent)'
                      : isBehind
                        ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                        : p.user?._id === user?._id
                          ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                          : 'color-mix(in srgb, var(--text-primary) 5%, transparent)'
                    const cardBg = p.blocked
                      ? 'color-mix(in srgb, var(--critical) 4%, transparent)'
                      : p.user?._id === user?._id
                        ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                        : 'color-mix(in srgb, var(--text-primary) 2%, transparent)'
                    const barColor = p.blocked
                      ? 'var(--critical)'
                      : p.progress === 100
                        ? 'var(--good)'
                        : p.user?._id === user?._id
                          ? 'var(--primary)'
                          : 'var(--text-secondary)'

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
                        <div style={{ padding: '12px 14px' }}>
                          {/* Ligne 1 : avatar + nom + badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
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
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                              {p.user?.name}
                            </span>
                            {p.user?._id === user?._id && (
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
                                {t('projA.drawer.me')}
                              </span>
                            )}
                            {p.blocked && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-md)',
                                  background: 'color-mix(in srgb, var(--critical) 15%, transparent)',
                                  border: '1px solid color-mix(in srgb, var(--critical) 35%, transparent)',
                                  color: 'var(--critical)',
                                  fontWeight: 600,
                                }}
                              >
                                {t('projA.drawer.blocked')}
                              </span>
                            )}
                            {!p.blocked && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 'var(--r-md)',
                                  color: SC[p.status] || 'var(--text-secondary)',
                                  background:
                                    SBg[p.status] || 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                                  border: `1px solid ${SBo[p.status] || 'color-mix(in srgb, var(--text-primary) 10%, transparent)'}`,
                                }}
                              >
                                {statusLabel(p.status)}
                              </span>
                            )}
                            {isBehind && !p.blocked && (
                              <span
                                title={t('projA.drawer.behindGroup')}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  borderRadius: 'var(--r-md)',
                                  background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                                  border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                  color: 'var(--warning)',
                                }}
                              >
                                {t('projA.common.overdue')}
                              </span>
                            )}
                          </div>

                          {/* Barre de progression + % */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                            <div
                              style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 'var(--r-hair)',
                                background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                                overflow: 'hidden',
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
                                  handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { progress: v })
                                }}
                                style={{
                                  width: 44,
                                  fontSize: 13,
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
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: p.progress === 100 ? 'var(--good)' : 'var(--primary)',
                                  minWidth: 28,
                                  textAlign: 'right',
                                }}
                              >
                                {p.progress ?? 0}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
                          </div>

                          {/* Étapes + livrables calculés */}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: canEdit ? 8 : 0 }}>
                            {mySteps.length > 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: myStepsDone === mySteps.length ? 'var(--good)' : 'var(--text-secondary)',
                                  background:
                                    myStepsDone === mySteps.length
                                      ? 'color-mix(in srgb, var(--good) 8%, transparent)'
                                      : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                  borderRadius: 'var(--r-sm)',
                                  padding: '2px 7px',
                                  border: `1px solid ${myStepsDone === mySteps.length ? 'color-mix(in srgb, var(--good) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)'}`,
                                }}
                              >
                                {t('projA.drawer.personalSteps', { done: myStepsDone, total: mySteps.length })}
                              </span>
                            )}
                            {commonSteps.length > 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                  borderRadius: 'var(--r-sm)',
                                  padding: '2px 7px',
                                  border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                                }}
                              >
                                {t('projA.drawer.sharedSteps', { done: commonDone, total: commonSteps.length })}
                              </span>
                            )}
                            {myDelivs.length > 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: myDelivsDone === myDelivs.length ? 'var(--primary)' : 'var(--text-secondary)',
                                  background:
                                    myDelivsDone === myDelivs.length
                                      ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                                      : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                  borderRadius: 'var(--r-sm)',
                                  padding: '2px 7px',
                                  border: `1px solid ${myDelivsDone === myDelivs.length ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)'}`,
                                }}
                              >
                                {t('projA.drawer.personalDeliverables', { done: myDelivsDone, total: myDelivs.length })}
                              </span>
                            )}
                            {mySteps.length === 0 &&
                              commonSteps.length === 0 &&
                              myDelivs.length === 0 &&
                              (m.steps || []).length === 0 && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: 'color-mix(in srgb, var(--text-secondary) 35%, transparent)',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  {t('projA.common.noStepDefined')}
                                </span>
                              )}
                          </div>

                          {/* Boutons statut */}
                          {canEdit && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(['A_FAIRE', 'EN_COURS', 'TERMINE'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, { status: v })
                                  }
                                  style={{
                                    padding: '3px 9px',
                                    borderRadius: 'var(--r-md)',
                                    border: `1px solid ${p.status === v ? SBo[v] : 'color-mix(in srgb, var(--text-primary) 8%, transparent)'}`,
                                    background: p.status === v ? SBg[v] : 'transparent',
                                    color: p.status === v ? SC[v] : 'var(--text-secondary)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    fontWeight: p.status === v ? 600 : 400,
                                    transition: 'all .15s',
                                  }}
                                >
                                  {statusLabel(v)}
                                </button>
                              ))}
                              {/* Bouton Bloqué */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, {
                                    blocked: !p.blocked,
                                    blockedReason: p.blocked ? '' : p.blockedReason,
                                  })
                                }
                                style={{
                                  padding: '3px 9px',
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
                                  fontWeight: p.blocked ? 600 : 400,
                                  marginLeft: 'auto',
                                  transition: 'all .15s',
                                }}
                              >
                                {p.blocked ? t('projA.drawer.unblock') : t('projA.drawer.reportBlocker')}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Raison du blocage */}
                        {p.blocked && (
                          <div
                            style={{
                              padding: '8px 14px 12px',
                              borderTop: '1px solid color-mix(in srgb, var(--critical) 15%, transparent)',
                              background: 'color-mix(in srgb, var(--critical) 3%, transparent)',
                            }}
                          >
                            {canEdit ? (
                              <textarea
                                defaultValue={p.blockedReason || ''}
                                key={`blocked-${p._id}-${p.blockedReason}`}
                                onBlur={(e) =>
                                  handleParticipantUpdate(m._id, m.internalProject?._id, p.user?._id, {
                                    blockedReason: e.target.value,
                                  })
                                }
                                placeholder={t('projA.drawer.blockerPlaceholder')}
                                rows={2}
                                style={{
                                  width: '100%',
                                  fontSize: 12,
                                  padding: '6px 9px',
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
                              <p style={{ fontSize: 12, color: 'var(--critical)', margin: 0, lineHeight: 1.5 }}>
                                "{p.blockedReason}"
                              </p>
                            ) : (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: 'color-mix(in srgb, var(--critical) 50%, transparent)',
                                  margin: 0,
                                  fontStyle: 'italic',
                                }}
                              >
                                {t('projA.drawer.noReason')}
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
          title={t('projA.drawer.steps')}
          badge={
            totalSteps > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--good) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--good) 20%, transparent)',
                  color: 'var(--good)',
                }}
              >
                {doneCount}/{totalSteps}
              </span>
            ) : undefined
          }
        >
          {totalSteps > 0 ? (
            m.steps.map((step) => {
              const stepAssignee = step.assignedTo ? (m.assignedTo || []).find((a) => a._id === step.assignedTo) : null
              const isOpen = expandedStep === step._id
              return (
                <div
                  key={step._id}
                  style={{
                    marginBottom: 6,
                    borderRadius: 'var(--r-md)',
                    background: step.done
                      ? 'color-mix(in srgb, var(--good) 4%, transparent)'
                      : step.waitingReview
                        ? 'color-mix(in srgb, var(--warning) 4%, transparent)'
                        : 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                    border: `1px solid ${step.done ? 'color-mix(in srgb, var(--good) 15%, transparent)' : step.waitingReview ? 'color-mix(in srgb, var(--warning) 20%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)'}`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }}
                    onClick={() => setExpandedStep(isOpen ? null : step._id)}
                  >
                    <input
                      type="checkbox"
                      checked={step.done}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleMissionToggleStep(m._id, m.internalProject?._id, m, step._id)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--good)', flexShrink: 0 }}
                    />
                    {stepAssignee && (
                      <div
                        title={stepAssignee.name}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--primary)',
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
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6 }}>📝</span>
                    )}
                    {step.waitingReview && !step.done && (
                      <>
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--warning)',
                            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
                            borderRadius: 'var(--r-md)',
                            padding: '1px 6px',
                          }}
                        >
                          {t('projA.drawer.stepPending')}
                        </span>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                const data = (await apiFetch(
                                  `/api/admin/internal-projects/${m.internalProject?._id}/missions/${m._id}/steps/${step._id}/validate-step`,
                                  { method: 'POST' },
                                )) as { mission: Mission }
                                setMissions((ms) => ms.map((x) => (x._id === m._id ? data.mission : x)))
                              } catch {}
                            }}
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 'var(--r-sm)',
                              border: '1px solid color-mix(in srgb, var(--good) 35%, transparent)',
                              background: 'color-mix(in srgb, var(--good) 10%, transparent)',
                              color: 'var(--good)',
                              cursor: 'pointer',
                            }}
                          >
                            {t('projA.drawer.validate')}
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
                        borderTop: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
                      }}
                    >
                      <textarea
                        defaultValue={step.description || ''}
                        key={`desc-${step._id}`}
                        onBlur={(e) => handleStepDescUpdate(m._id, m.internalProject?._id, m, step._id, e.target.value)}
                        placeholder={t('projA.drawer.stepNotesPlaceholder')}
                        rows={3}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          fontSize: 12,
                          padding: '7px 10px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
                          background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
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
            <p style={{ fontSize: 13, color: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)', margin: 0 }}>
              {t('projA.common.noStepDefined')}
            </p>
          )}
          {isSuperAdmin && (
            <div style={{ marginTop: 10 }}>
              {(m.assignedTo || []).length > 1 && (
                <div style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('projA.drawer.forLabel')}</span>
                  <button
                    type="button"
                    onClick={() => setStepAssigneeInputs((s) => ({ ...s, [m._id]: '' }))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--r-md)',
                      border: `1px solid ${!stepAssigneeInputs[m._id] ? 'color-mix(in srgb, var(--text-secondary) 35%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                      background: !stepAssigneeInputs[m._id]
                        ? 'color-mix(in srgb, var(--text-secondary) 8%, transparent)'
                        : 'transparent',
                      color: !stepAssigneeInputs[m._id] ? 'var(--text-secondary)' : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {t('projA.drawer.everyone')}
                  </button>
                  {(m.assignedTo || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() => setStepAssigneeInputs((s) => ({ ...s, [m._id]: s[m._id] === a._id ? '' : a._id }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${stepAssigneeInputs[m._id] === a._id ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                        background:
                          stepAssigneeInputs[m._id] === a._id
                            ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                            : 'transparent',
                        color: stepAssigneeInputs[m._id] === a._id ? 'var(--primary)' : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
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
                  onChange={(e) => setMissionStepInputs((s) => ({ ...s, [m._id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && missionStepInputs[m._id]?.trim())
                      handleMissionAddStep(
                        m._id,
                        m.internalProject?._id,
                        m,
                        missionStepInputs[m._id].trim(),
                        stepAssigneeInputs[m._id] || undefined,
                      )
                  }}
                  placeholder={t('projA.drawer.newStepPlaceholder')}
                  style={{ fontSize: 13, padding: '6px 10px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (missionStepInputs[m._id]?.trim())
                      handleMissionAddStep(
                        m._id,
                        m.internalProject?._id,
                        m,
                        missionStepInputs[m._id].trim(),
                        stepAssigneeInputs[m._id] || undefined,
                      )
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                    color: 'var(--primary)',
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
          title={t('projA.drawer.deliverables')}
          badge={
            (m.deliverables || []).length > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                  color: 'var(--primary)',
                }}
              >
                {delivDone}/{(m.deliverables || []).length}
              </span>
            ) : undefined
          }
        >
          {(m.deliverables || []).length === 0 ? (
            <p style={{ fontSize: 13, color: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)', margin: 0 }}>
              {t('projA.drawer.noDeliverable')}
            </p>
          ) : (
            (m.deliverables || []).map((d) => {
              const da = d.assignedTo ? (m.assignedTo || []).find((a) => a._id === d.assignedTo) : null
              return (
                <div
                  key={d._id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 8,
                    padding: '10px 12px',
                    borderRadius: 'var(--r-md)',
                    background: d.done
                      ? 'color-mix(in srgb, var(--primary) 4%, transparent)'
                      : 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                    border: `1px solid ${d.done ? 'color-mix(in srgb, var(--primary) 18%, transparent)' : 'color-mix(in srgb, var(--text-primary) 5%, transparent)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={d.done}
                    onChange={() => handleDeliverableToggle(m._id, m.internalProject?._id, m, d._id)}
                    style={{
                      cursor: 'pointer',
                      width: 15,
                      height: 15,
                      accentColor: 'var(--primary)',
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
                            background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
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
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.4 }}>
                        {d.description}
                      </p>
                    )}
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeliverableDelete(m._id, m.internalProject?._id, m, d._id)}
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid color-mix(in srgb, var(--critical) 20%, transparent)',
                        background: 'color-mix(in srgb, var(--critical) 5%, transparent)',
                        color: 'var(--critical)',
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
                <div style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('projA.drawer.forLabel')}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverableInputs((s) => ({
                        ...s,
                        [m._id]: { ...(s[m._id] || { title: '', description: '' }), assignedTo: '' },
                      }))
                    }
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--r-md)',
                      border: `1px solid ${!deliverableInputs[m._id]?.assignedTo ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                      background: !deliverableInputs[m._id]?.assignedTo
                        ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                        : 'transparent',
                      color: !deliverableInputs[m._id]?.assignedTo ? 'var(--primary)' : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {t('projA.drawer.everyone')}
                  </button>
                  {(m.assignedTo || []).map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      onClick={() =>
                        setDeliverableInputs((s) => ({
                          ...s,
                          [m._id]: {
                            ...(s[m._id] || { title: '', description: '' }),
                            assignedTo: s[m._id]?.assignedTo === a._id ? '' : a._id,
                          },
                        }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${deliverableInputs[m._id]?.assignedTo === a._id ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                        background:
                          deliverableInputs[m._id]?.assignedTo === a._id
                            ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                            : 'transparent',
                        color:
                          deliverableInputs[m._id]?.assignedTo === a._id ? 'var(--primary)' : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
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
                  onChange={(e) =>
                    setDeliverableInputs((s) => ({
                      ...s,
                      [m._id]: { ...(s[m._id] || { description: '', assignedTo: '' }), title: e.target.value },
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDeliverableAdd(m._id, m.internalProject?._id, m)
                  }}
                  placeholder={t('projA.drawer.newDeliverablePlaceholder')}
                  style={{ fontSize: 13, padding: '6px 10px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => handleDeliverableAdd(m._id, m.internalProject?._id, m)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                    color: 'var(--primary)',
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
                onChange={(e) =>
                  setDeliverableInputs((s) => ({
                    ...s,
                    [m._id]: { ...(s[m._id] || { title: '', assignedTo: '' }), description: e.target.value },
                  }))
                }
                placeholder={t('projA.drawer.deliverableDescPlaceholder')}
                style={{ fontSize: 12, padding: '5px 10px', width: '100%', marginTop: 5, boxSizing: 'border-box' }}
              />
            </div>
          )}
        </Section>

        {/* ── FICHIERS ── */}
        <Section icon="📎" title={t('projA.common.files')}>
          {(m.files?.length ?? 0) === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)',
                margin: '0 0 10px',
              }}
            >
              {t('projA.drawer.noFile')}
            </p>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {m.files.map((f) => (
                <div
                  key={f._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                    padding: '8px 10px',
                    borderRadius: 'var(--r-md)',
                    background: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
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
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {f.size > 1048576
                      ? t('projA.drawer.sizeMb', { size: (f.size / 1048576).toFixed(1) })
                      : t('projA.drawer.sizeKb', { size: Math.round(f.size / 1024) })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleMissionFileOpen(m._id, m.internalProject?._id, f._id)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                      background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {t('projA.drawer.open')}
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleMissionFileDelete(m._id, m.internalProject?._id, f._id)}
                      style={{
                        fontSize: 11,
                        padding: '3px 7px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid color-mix(in srgb, var(--critical) 20%, transparent)',
                        background: 'color-mix(in srgb, var(--critical) 5%, transparent)',
                        color: 'var(--critical)',
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
              ref={(el) => {
                fileInputRefs.current[m._id] = el
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
              onClick={() => fileInputRefs.current[m._id]?.click()}
              disabled={uploadingMission === m._id}
              style={{
                fontSize: 13,
                padding: '7px 14px',
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--text-secondary) 18%, transparent)',
                background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {uploadingMission === m._id ? t('projA.drawer.uploading') : t('projA.common.attachFile')}
            </button>
          </div>
        </Section>

        {/* ── DEADLINE (SA uniquement) ── */}
        {isSuperAdmin && (
          <Section icon="📅" title={t('projA.drawer.editDeadline')}>
            <input
              type="date"
              defaultValue={m.dueDate ? m.dueDate.substring(0, 10) : ''}
              key={`date-${m._id}`}
              onBlur={(e) => handleMissionDateUpdate(m._id, m.internalProject?._id, e.target.value)}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 'var(--r-md)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
                background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
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
