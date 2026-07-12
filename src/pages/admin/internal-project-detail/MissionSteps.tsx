import type { Dispatch, SetStateAction } from 'react'
import type { Mission } from './types'

interface MissionStepsProps {
  mission: Mission
  isSuperAdmin: boolean
  expandedStep: string | null
  setExpandedStep: Dispatch<SetStateAction<string | null>>
  stepInputs: Record<string, string>
  setStepInputs: Dispatch<SetStateAction<Record<string, string>>>
  stepAssigneeInputs: Record<string, string>
  setStepAssigneeInputs: Dispatch<SetStateAction<Record<string, string>>>
  onToggleStep: (missionId: string, mission: Mission, stepId: string) => void
  onAddStep: (missionId: string, mission: Mission, title: string, assignedTo?: string) => void
  onDeleteStep: (missionId: string, mission: Mission, stepId: string) => void
  onStepDescriptionUpdate: (missionId: string, mission: Mission, stepId: string, description: string) => void
  onRequestReview: (missionId: string, stepId: string) => void
  onValidateStep: (missionId: string, stepId: string) => void
}

export default function MissionSteps({
  mission,
  isSuperAdmin,
  expandedStep,
  setExpandedStep,
  stepInputs,
  setStepInputs,
  stepAssigneeInputs,
  setStepAssigneeInputs,
  onToggleStep: handleToggleStep,
  onAddStep: handleAddStep,
  onDeleteStep: handleDeleteStep,
  onStepDescriptionUpdate: handleStepDescUpdate,
  onRequestReview: handleRequestReview,
  onValidateStep: handleValidateStep,
}: MissionStepsProps) {
  const doneSteps = mission.steps?.filter((step) => step.done).length ?? 0
  const totalSteps = mission.steps?.length ?? 0

  return (
    <>
      {/* Étapes */}
      {(mission.steps?.length > 0 || isSuperAdmin) && (
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
              ✅ Étapes
            </span>
            {totalSteps > 0 && (
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
                {doneSteps}/{totalSteps}
              </span>
            )}
          </div>
          {totalSteps > 0 && (
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginBottom: 8 }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 2,
                  background: '#10b981',
                  width: `${Math.round((doneSteps / totalSteps) * 100)}%`,
                  transition: 'width .3s',
                }}
              />
            </div>
          )}
          {mission.steps.map((step) => {
            const stepAssignee = step.assignedTo
              ? (mission.assignedTo || []).find((a) => a._id === step.assignedTo)
              : null
            const isOpen = expandedStep === step._id
            return (
              <div
                key={step._id}
                style={{
                  marginBottom: 5,
                  borderRadius: 7,
                  background: step.done
                    ? 'rgba(16,185,129,0.04)'
                    : step.waitingReview
                      ? 'rgba(234,179,8,0.04)'
                      : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${step.done ? 'rgba(16,185,129,0.15)' : step.waitingReview ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)'}`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}
                  onClick={() => setExpandedStep(isOpen ? null : step._id)}
                >
                  <input
                    type="checkbox"
                    checked={step.done}
                    onChange={(e) => {
                      e.stopPropagation()
                      if (!step.waitingReview) {
                        handleToggleStep(mission._id, mission, step._id)
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={step.waitingReview}
                    style={{
                      cursor: step.waitingReview ? 'default' : 'pointer',
                      width: 14,
                      height: 14,
                      accentColor: '#10b981',
                      flexShrink: 0,
                    }}
                  />
                  {stepAssignee && (
                    <div
                      title={stepAssignee.name}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'rgba(14, 165, 233, 0.15)',
                        border: '1px solid rgba(14, 165, 233, 0.3)',
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
                      fontSize: 12,
                      flex: 1,
                      color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: step.done ? 'line-through' : 'none',
                    }}
                  >
                    {step.title}
                  </span>
                  {step.description && <span style={{ fontSize: 10, opacity: 0.5 }}>📝</span>}
                  {step.waitingReview && !step.done && (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#fde047',
                        background: 'rgba(234,179,8,0.12)',
                        border: '1px solid rgba(234,179,8,0.25)',
                        borderRadius: 8,
                        padding: '1px 5px',
                      }}
                    >
                      En attente
                    </span>
                  )}
                  {/* Request review — assigned member, not SA */}
                  {!step.done && !step.waitingReview && !isSuperAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRequestReview(mission._id, step._id)
                      }}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 7,
                        border: '1px solid rgba(234,179,8,0.3)',
                        fontSize: 10,
                        cursor: 'pointer',
                        background: 'transparent',
                        color: '#fde047',
                      }}
                    >
                      Vérification
                    </button>
                  )}
                  {/* Validate — SA only */}
                  {step.waitingReview && !step.done && isSuperAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleValidateStep(mission._id, step._id)
                      }}
                      style={{
                        padding: '2px 7px',
                        borderRadius: 7,
                        border: '1px solid rgba(16,185,129,0.3)',
                        fontSize: 10,
                        cursor: 'pointer',
                        background: 'rgba(16,185,129,0.1)',
                        color: '#6ee7b7',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Valider
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteStep(mission._id, mission, step._id)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(248,113,113,0.5)',
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: '0 2px',
                      }}
                    >
                      ✕
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      opacity: 0.4,
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform .2s',
                      display: 'inline-block',
                    }}
                  >
                    ▾
                  </span>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 10px 8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <textarea
                      defaultValue={step.description || ''}
                      key={`desc-${step._id}`}
                      onBlur={(e) => handleStepDescUpdate(mission._id, mission, step._id, e.target.value)}
                      placeholder="Ajouter des détails, notes, contexte…"
                      rows={3}
                      style={{
                        width: '100%',
                        marginTop: 7,
                        fontSize: 12,
                        padding: '6px 9px',
                        borderRadius: 5,
                        border: '1px solid rgba(255,255,255,0.07)',
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
          })}
          {isSuperAdmin && (
            <div style={{ marginTop: 8 }}>
              {(mission.assignedTo || []).length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pour :</span>
                  <button
                    type="button"
                    onClick={() => setStepAssigneeInputs((s) => ({ ...s, [mission._id]: '' }))}
                    style={{
                      padding: '2px 7px',
                      borderRadius: 9,
                      border: `1px solid ${!stepAssigneeInputs[mission._id] ? 'rgba(165,180,207,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      background: !stepAssigneeInputs[mission._id] ? 'rgba(165,180,207,0.08)' : 'transparent',
                      color: !stepAssigneeInputs[mission._id] ? '#a5b4cf' : 'var(--text-secondary)',
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
                        setStepAssigneeInputs((s) => ({ ...s, [mission._id]: s[mission._id] === a._id ? '' : a._id }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 7px',
                        borderRadius: 9,
                        border: `1px solid ${stepAssigneeInputs[mission._id] === a._id ? 'rgba(14, 165, 233, 0.4)' : 'rgba(255,255,255,0.07)'}`,
                        background:
                          stepAssigneeInputs[mission._id] === a._id ? 'rgba(14, 165, 233, 0.1)' : 'transparent',
                        color: stepAssigneeInputs[mission._id] === a._id ? 'var(--primary)' : 'var(--text-secondary)',
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
                  value={stepInputs[mission._id] || ''}
                  onChange={(e) => setStepInputs((s) => ({ ...s, [mission._id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && stepInputs[mission._id]?.trim()) {
                      handleAddStep(
                        mission._id,
                        mission,
                        stepInputs[mission._id].trim(),
                        stepAssigneeInputs[mission._id] || undefined,
                      )
                    }
                  }}
                  placeholder="Nouvelle étape… (Entrée)"
                  style={{ fontSize: 12, padding: '5px 9px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (stepInputs[mission._id]?.trim()) {
                      handleAddStep(
                        mission._id,
                        mission,
                        stepInputs[mission._id].trim(),
                        stepAssigneeInputs[mission._id] || undefined,
                      )
                    }
                  }}
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
            </div>
          )}
        </div>
      )}
    </>
  )
}
