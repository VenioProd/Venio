/* eslint-disable @typescript-eslint/no-explicit-any */
import { useInternalProjectListCtx } from './Context'

export default function ArrowTab() {
  const {
    arrowPilotage, arrowScorecardStates, setArrowScorecardStates,
    setViewTab, openArrowSectionEditor, projects, missions,
    arrowActiveProjects, arrowMissions, arrowCompletedMissions, arrowBlockedMissions,
    arrowAverageProgress, arrowMissionsByStatus, arrowUpcomingMissions,
    arrowDecisions, arrowCadence,
    missionsLoading, setSelectedMission, setShowMissionForm,
    setFilterEntity, setFilterStatus,
  } = useInternalProjectListCtx()
  return (
  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div className="portal-card" style={{ border: '1px solid rgba(139,92,246,0.18)', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(14,165,233,0.04))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 680 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: '#c4b5fd' }}>Pilotage interne</span>
          <h2 style={{ margin: '6px 0 8px', fontSize: 22, color: 'var(--text-primary)' }}>Arrow</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            Suivre le cap, les avancées, les blocages et les apprentissages Arrow depuis les projets internes Venio.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="portal-button secondary"
            type="button"
            onClick={() => { setFilterEntity('Arrow'); setViewTab('projects') }}
          >
            Voir les projets Arrow
          </button>
          <button
            className="portal-button"
            type="button"
            onClick={() => setShowMissionForm(true)}
          >
            Créer une mission
          </button>
        </div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12 }}>
      {[
        { label: 'Projets actifs', value: arrowActiveProjects.length, color: '#c4b5fd' },
        { label: 'Missions Arrow', value: arrowMissions.length, color: '#38bdf8' },
        { label: 'Terminées', value: arrowCompletedMissions.length, color: '#6ee7b7' },
        { label: 'Bloquées', value: arrowBlockedMissions.length, color: arrowBlockedMissions.length > 0 ? '#f87171' : '#a5b4cf' },
      ].map(card => (
        <button
          key={card.label}
          type="button"
          className="portal-card"
          onClick={() => {
            if (card.label === 'Projets actifs') { setFilterEntity('Arrow'); setFilterStatus('EN_COURS'); setViewTab('projects'); return }
            if (card.label === 'Terminées') { setFilterEntity('Arrow'); setFilterStatus('TERMINE'); setViewTab('projects'); return }
            setViewTab('missions')
          }}
          style={{ padding: 16, textAlign: 'left', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{card.label}</div>
          <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, color: card.color }}>{card.value}</div>
          <div style={{ fontSize: 11, color: 'rgba(165,180,207,0.45)', marginTop: 8 }}>Cliquer pour ouvrir</div>
        </button>
      ))}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
      <div className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Objectif de la semaine</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Ce qui doit guider les décisions et les tâches Arrow.</p>
          </div>
          <button type="button" onClick={() => openArrowSectionEditor('goals')} style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier · {arrowAverageProgress}% moyen</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {arrowPilotage.goals.map((goal: any, index: number) => (
            <button key={`${goal}-${index}`} type="button" onClick={() => openArrowSectionEditor('goals')} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: index === 0 ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${index === 0 ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: index === 0 ? 'rgba(139,92,246,0.14)' : 'rgba(165,180,207,0.08)', color: index === 0 ? '#c4b5fd' : '#a5b4cf', fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{goal}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Scorecard</h3>
          <button type="button" onClick={() => openArrowSectionEditor('scorecard')} style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.25)', background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
        </div>
        {arrowPilotage.scorecard.map((label: any, index: number) => {
          const state = arrowScorecardStates[index] ?? false
          return (
          <div key={`${label}-${index}`} onClick={() => index === 0 ? setViewTab('projects') : index === 1 ? setViewTab('missions') : openArrowSectionEditor('scorecard')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, color: state ? '#6ee7b7' : '#fbbf24', background: state ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${state ? 'rgba(16,185,129,0.24)' : 'rgba(251,191,36,0.24)'}` }}>
              {state ? 'OK' : 'À cadrer'}
            </span>
          </div>
        )})}
      </div>
    </div>

    <div className="portal-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Avancement opérationnel</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Lecture rapide des missions Arrow par statut.</p>
        </div>
        {missionsLoading && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chargement...</span>}
      </div>
      {arrowMissions.length === 0 ? (
        <div style={{ padding: '26px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 12px' }}>Aucune mission Arrow pour l’instant.</p>
          <button className="portal-button" type="button" onClick={() => setShowMissionForm(true)}>Créer la première mission</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12 }}>
          {arrowMissionsByStatus.map(column => (
            <div key={column.value} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: column.color }}>{column.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{column.missions.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {column.missions.slice(0, 4).map((m: any) => (
                  <button key={m._id} type="button" onClick={() => setSelectedMission(m._id)} style={{ width: '100%', textAlign: 'left', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 5 }}>{m.title}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${m.progress ?? 0}%`, background: column.color }} />
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.progress ?? 0}%</span>
                    </span>
                  </button>
                ))}
                {column.missions.length === 0 && <span style={{ fontSize: 13, color: 'rgba(165,180,207,0.35)', padding: '8px 0' }}>Vide</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <div className="portal-card">
        <h3 style={{ margin: '0 0 14px', fontSize: 16, color: 'var(--text-primary)' }}>Prochaines actions</h3>
        {arrowUpcomingMissions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Aucune action datée à suivre.</p>
        ) : arrowUpcomingMissions.map(m => {
          const isOverdue = m.dueDate && new Date(m.dueDate) < new Date()
          return (
            <button key={m._id} type="button" onClick={() => setSelectedMission(m._id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', border: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{m.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{m.internalProject?.name}</span>
              </span>
              <span style={{ fontSize: 12, color: isOverdue ? '#f87171' : '#a5b4cf', whiteSpace: 'nowrap' }}>
                {m.dueDate ? new Date(m.dueDate).toLocaleDateString('fr-FR') : 'Sans date'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Journal des décisions</h3>
          <button type="button" onClick={() => openArrowSectionEditor('decisions')} style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.25)', background: 'rgba(139,92,246,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {arrowDecisions.map((item: any, index: number) => (
            <button key={`${item.title}-${index}`} type="button" onClick={() => openArrowSectionEditor('decisions')} style={{ padding: '11px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd' }}>{item.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.date}</span>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>{item.decision}</p>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Responsable : {item.owner}</span>
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="portal-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Cadre de suivi</h3>
        <button type="button" onClick={() => openArrowSectionEditor('cadence')} style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', background: 'rgba(56,189,248,0.08)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>Modifier</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 10 }}>
        {arrowCadence.map((item: any, index: number) => (
          <button key={`${item.title}-${index}`} type="button" onClick={() => openArrowSectionEditor('cadence')} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginBottom: 5 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{item.text}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
  )
}
