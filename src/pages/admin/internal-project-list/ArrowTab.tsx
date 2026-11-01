/* eslint-disable @typescript-eslint/no-explicit-any */
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { useInternalProjectListCtx } from './Context'

export default function ArrowTab() {
  const { t } = useI18n()
  const {
    arrowPilotage,
    arrowScorecardStates,
    setArrowScorecardStates,
    setViewTab,
    openArrowSectionEditor,
    projects,
    missions,
    arrowActiveProjects,
    arrowMissions,
    arrowCompletedMissions,
    arrowBlockedMissions,
    arrowAverageProgress,
    arrowMissionsByStatus,
    arrowUpcomingMissions,
    arrowDecisions,
    arrowCadence,
    missionsLoading,
    setSelectedMission,
    setShowMissionForm,
    setFilterEntity,
    setFilterStatus,
  } = useInternalProjectListCtx()
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        className="portal-card"
        style={{
          border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, transparent), color-mix(in srgb, var(--primary) 4%, transparent))',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: 'var(--primary)',
              }}
            >
              {t('projA.arrow.eyebrow')}
            </span>
            <h2 style={{ margin: '6px 0 8px', fontSize: 22, color: 'var(--text-primary)' }}>Arrow</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              {t('projA.arrow.intro')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="portal-button secondary"
              type="button"
              onClick={() => {
                setFilterEntity('Arrow')
                setViewTab('projects')
              }}
            >
              {t('projA.arrow.viewProjects')}
            </button>
            <button className="portal-button" type="button" onClick={() => setShowMissionForm(true)}>
              {t('projA.common.createMission')}
            </button>
          </div>
        </div>
      </div>

      <div className="production-kpis production-arrow-kpis">
        {[
          {
            id: 'active',
            label: t('projA.arrow.cardActiveProjects'),
            value: arrowActiveProjects.length,
            color: 'var(--primary)',
          },
          {
            id: 'missions',
            label: t('projA.arrow.cardMissions'),
            value: arrowMissions.length,
            color: 'var(--text-secondary)',
          },
          {
            id: 'completed',
            label: t('projA.arrow.cardCompleted'),
            value: arrowCompletedMissions.length,
            color: 'var(--good)',
          },
          {
            id: 'blocked',
            label: t('projA.arrow.cardBlocked'),
            value: arrowBlockedMissions.length,
            color: arrowBlockedMissions.length > 0 ? 'var(--critical)' : 'var(--text-secondary)',
          },
        ].map((card) => (
          <button
            key={card.id}
            type="button"
            className="portal-card"
            onClick={() => {
              if (card.id === 'active') {
                setFilterEntity('Arrow')
                setFilterStatus('EN_COURS')
                setViewTab('projects')
                return
              }
              if (card.id === 'completed') {
                setFilterEntity('Arrow')
                setFilterStatus('TERMINE')
                setViewTab('projects')
                return
              }
              setViewTab('missions')
            }}
            style={{
              padding: 16,
              textAlign: 'left',
              border: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div
              style={{
                fontSize: 11,
                color: 'color-mix(in srgb, var(--text-secondary) 45%, transparent)',
                marginTop: 8,
              }}
            >
              {t('projA.arrow.clickToOpen')}
            </div>
          </button>
        ))}
      </div>

      <div className="production-arrow-columns">
        <div className="portal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>
                {t('projA.pilot.section.goals')}
              </h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('projA.arrow.goalsHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openArrowSectionEditor('goals')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                borderRadius: 'var(--r-md)',
                padding: '5px 9px',
                cursor: 'pointer',
              }}
            >
              {t('projA.arrow.editAverage', { progress: arrowAverageProgress })}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {arrowPilotage.goals.map((goal: any, index: number) => (
              <button
                key={`${goal}-${index}`}
                type="button"
                onClick={() => openArrowSectionEditor('goals')}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  background:
                    index === 0
                      ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                      : 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                  border: `1px solid ${index === 0 ? 'color-mix(in srgb, var(--primary) 22%, transparent)' : 'color-mix(in srgb, var(--text-primary) 6%, transparent)'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 'var(--r-sm)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background:
                      index === 0
                        ? 'color-mix(in srgb, var(--primary) 14%, transparent)'
                        : 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
                    color: index === 0 ? 'var(--primary)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{goal}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="portal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>
              {t('projA.pilot.section.scorecard')}
            </h3>
            <button
              type="button"
              onClick={() => openArrowSectionEditor('scorecard')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                borderRadius: 'var(--r-md)',
                padding: '5px 9px',
                cursor: 'pointer',
              }}
            >
              {t('common.edit')}
            </button>
          </div>
          {arrowPilotage.scorecard.map((label: any, index: number) => {
            const state = arrowScorecardStates[index] ?? false
            return (
              <div
                key={`${label}-${index}`}
                onClick={() =>
                  index === 0
                    ? setViewTab('projects')
                    : index === 1
                      ? setViewTab('missions')
                      : openArrowSectionEditor('scorecard')
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '9px 0',
                  borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-md)',
                    color: state ? 'var(--good)' : 'var(--warning)',
                    background: state
                      ? 'color-mix(in srgb, var(--good) 10%, transparent)'
                      : 'color-mix(in srgb, var(--warning) 10%, transparent)',
                    border: `1px solid ${state ? 'color-mix(in srgb, var(--good) 24%, transparent)' : 'color-mix(in srgb, var(--warning) 24%, transparent)'}`,
                  }}
                >
                  {state ? 'OK' : t('projA.arrow.toScope')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="portal-card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{t('projA.arrow.progressTitle')}</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              {t('projA.arrow.progressHint')}
            </p>
          </div>
          {missionsLoading && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('common.loading')}</span>
          )}
        </div>
        {arrowMissions.length === 0 ? (
          <div style={{ padding: '26px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>
              {t('projA.arrow.noMission')}
            </p>
            <button className="portal-button" type="button" onClick={() => setShowMissionForm(true)}>
              {t('projA.arrow.createFirstMission')}
            </button>
          </div>
        ) : (
          <div className="production-arrow-cadence">
            {arrowMissionsByStatus.map((column) => (
              <div
                key={column.value}
                style={{
                  borderRadius: 'var(--r-md)',
                  border: '1px solid color-mix(in srgb, var(--text-primary) 7%, transparent)',
                  background: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
                  padding: 12,
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      color: column.color,
                    }}
                  >
                    {column.label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{column.missions.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {column.missions.slice(0, 4).map((m: any) => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => setSelectedMission(m._id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 11px',
                        borderRadius: 'var(--r-md)',
                        border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                        background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          marginBottom: 5,
                        }}
                      >
                        {m.title}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 'var(--r-hair)',
                            background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              height: '100%',
                              width: `${m.progress ?? 0}%`,
                              background: column.color,
                            }}
                          />
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.progress ?? 0}%</span>
                      </span>
                    </button>
                  ))}
                  {column.missions.length === 0 && (
                    <span
                      style={{
                        fontSize: 13,
                        color: 'color-mix(in srgb, var(--text-secondary) 35%, transparent)',
                        padding: '8px 0',
                      }}
                    >
                      {t('projA.arrow.emptyColumn')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="production-arrow-columns">
        <div className="portal-card">
          <h3 style={{ margin: '0 0 14px', fontSize: 16, color: 'var(--text-primary)' }}>
            {t('projA.arrow.nextActions')}
          </h3>
          {arrowUpcomingMissions.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{t('projA.arrow.noDatedAction')}</p>
          ) : (
            arrowUpcomingMissions.map((m) => {
              const isOverdue = m.dueDate && new Date(m.dueDate) < new Date()
              return (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => setSelectedMission(m._id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 0',
                    border: 0,
                    borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {m.title}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {m.internalProject?.name}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: isOverdue ? 'var(--critical)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.dueDate ? formatDate(m.dueDate) : t('projA.common.noDate')}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="portal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>
              {t('projA.pilot.section.decisions')}
            </h3>
            <button
              type="button"
              onClick={() => openArrowSectionEditor('decisions')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                borderRadius: 'var(--r-md)',
                padding: '5px 9px',
                cursor: 'pointer',
              }}
            >
              {t('common.edit')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {arrowDecisions.map((item: any, index: number) => (
              <button
                key={`${item.title}-${index}`}
                type="button"
                onClick={() => openArrowSectionEditor('decisions')}
                style={{
                  padding: '11px 12px',
                  borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.date}</span>
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {item.decision}
                </p>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {t('projA.arrow.owner', { owner: item.owner })}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="portal-card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>{t('projA.pilot.section.cadence')}</h3>
          <button
            type="button"
            onClick={() => openArrowSectionEditor('cadence')}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--primary)',
              border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
              background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
              borderRadius: 'var(--r-md)',
              padding: '5px 9px',
              cursor: 'pointer',
            }}
          >
            {t('common.edit')}
          </button>
        </div>
        <div className="production-arrow-scorecards">
          {arrowCadence.map((item: any, index: number) => (
            <button
              key={`${item.title}-${index}`}
              type="button"
              onClick={() => openArrowSectionEditor('cadence')}
              style={{
                padding: 12,
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--text-primary) 2.5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 5 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{item.text}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
