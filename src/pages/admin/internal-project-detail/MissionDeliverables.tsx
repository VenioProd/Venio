import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '../../../context/I18nContext'
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
  const { t } = useI18n()
  const delivDone = (mission.deliverables || []).filter((deliverable) => deliverable.done).length

  return (
    <>
      {/* Livrables attendus */}
      {((mission.deliverables || []).length > 0 || isSuperAdmin) && (
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
              {t('projB.detail.deliverablesHeading')}
            </span>
            {(mission.deliverables || []).length > 0 && (
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
                {delivDone}/{(mission.deliverables || []).length}
              </span>
            )}
          </div>
          {(mission.deliverables || []).length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)',
                margin: '0 0 8px',
              }}
            >
              {t('projB.detail.noDeliverables')}
            </p>
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
                            background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
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
            <div style={{ marginTop: 6 }}>
              {(mission.assignedTo || []).length > 1 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('projB.detail.forLabel')}</span>
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
                      borderRadius: 'var(--r-md)',
                      border: `1px solid ${!deliverableInputs[mission._id]?.assignedTo ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                      background: !deliverableInputs[mission._id]?.assignedTo
                        ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                        : 'transparent',
                      color: !deliverableInputs[mission._id]?.assignedTo ? 'var(--primary)' : 'var(--text-secondary)',
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
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${deliverableInputs[mission._id]?.assignedTo === a._id ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'color-mix(in srgb, var(--text-primary) 7%, transparent)'}`,
                        background:
                          deliverableInputs[mission._id]?.assignedTo === a._id
                            ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
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
                  placeholder={t('projB.detail.deliverablePlaceholder')}
                  style={{ fontSize: 12, padding: '5px 9px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => handleDeliverableAdd(mission._id, mission)}
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
                placeholder={t('projB.detail.deliverableDescriptionPlaceholder')}
                style={{ fontSize: 11, padding: '4px 9px', width: '100%', marginTop: 4, boxSizing: 'border-box' }}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
