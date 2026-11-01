import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '../../../context/I18nContext'
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
  const { t } = useI18n()
  const doneSteps = mission.steps?.filter((step) => step.done).length ?? 0
  const totalSteps = mission.steps?.length ?? 0

  return (
    <>
      {/* Étapes */}
      {(mission.steps?.length > 0 || isSuperAdmin) && (
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
              {t('projB.detail.stepsHeading')}
            </span>
            {totalSteps > 0 && (
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
                {doneSteps}/{totalSteps}
              </span>
            )}
          </div>
          {totalSteps > 0 && (
            <div
              style={{
                height: 3,
                borderRadius: 'var(--r-hair)',
                background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 'var(--r-hair)',
                  background: 'var(--good)',
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
                      accentColor: 'var(--good)',
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
                        color: 'var(--warning)',
                        background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
                        borderRadius: 'var(--r-md)',
                        padding: '1px 5px',
                      }}
                    >
                      {t('projB.detail.stepWaiting')}
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
                        borderRadius: 'var(--r-md)',
                        border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                        fontSize: 10,
                        cursor: 'pointer',
                        background: 'transparent',
                        color: 'var(--warning)',
                      }}
                    >
                      {t('projB.detail.stepReview')}
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
                        borderRadius: 'var(--r-md)',
                        border: '1px solid color-mix(in srgb, var(--good) 30%, transparent)',
                        fontSize: 10,
                        cursor: 'pointer',
                        background: 'color-mix(in srgb, var(--good) 10%, transparent)',
                        color: 'var(--good)',
                        fontWeight: 600,
                      }}
                    >
                      {t('projB.detail.stepValidate')}
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
                        color: 'color-mix(in srgb, var(--critical) 50%, transparent)',
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
                  <div
                    style={{
                      padding: '0 10px 8px',
                      borderTop: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
                    }}
                  >
                    <textarea
                      defaultValue={step.description || ''}
                      key={`desc-${step._id}`}
                      onBlur={(e) => handleStepDescUpdate(mission._id, mission, step._id, e.target.value)}
                      placeholder={t('projB.detail.stepDetailsPlaceholder')}
                      rows={3}
                      style={{
                        width: '100%',
                        marginTop: 7,
                        fontSize: 12,
                        padding: '6px 9px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid color-mix(in srgb, var(--text-primary) 7%, transparent)',
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
          })}
          {isSuperAdmin && (
            <div style={{ marginTop: 8 }}>
              {(mission.assignedTo || []).length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('projB.detail.forLabel')}</span>
                  <button
                    type="button"
                    onClick={() => setStepAssigneeInputs((s) => ({ ...s, [mission._id]: '' }))}
                    style={{
                      padding: '2px 7px',
                      borderRadius: 'var(--r-md)',
                      border: `1px solid ${!stepAssigneeInputs[mission._id] ? 'color-mix(in srgb, var(--text-secondary) 35%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                      background: !stepAssigneeInputs[mission._id]
                        ? 'color-mix(in srgb, var(--text-secondary) 8%, transparent)'
                        : 'transparent',
                      color: !stepAssigneeInputs[mission._id] ? 'var(--text-secondary)' : 'var(--text-secondary)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {t('projB.detail.everyone')}
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
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${stepAssigneeInputs[mission._id] === a._id ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                        background:
                          stepAssigneeInputs[mission._id] === a._id
                            ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                            : 'transparent',
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
                          background: 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
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
                  placeholder={t('projB.detail.newStepPlaceholder')}
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
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
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
