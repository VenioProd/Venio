import { type FormEvent } from 'react'
import type { Member, Project } from './constants'

export interface MissionFormState {
  projectId: string
  title: string
  description: string
  assignedTo: string[]
  dueDate: string
}

interface Props {
  show: boolean
  projects: Project[]
  admins: Member[]
  missionForm: MissionFormState
  setMissionForm: (updater: (f: MissionFormState) => MissionFormState) => void
  savingMission: boolean
  onSubmit: (e: FormEvent) => void | Promise<void>
  onClose: () => void
}

export default function CreateMissionModal({
  show,
  projects,
  admins,
  missionForm,
  setMissionForm,
  savingMission,
  onSubmit,
  onClose,
}: Props) {
  if (!show) return null
  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1001,
          backdropFilter: 'blur(3px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxWidth: '90vw',
          background: '#141824',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 1002,
          padding: '28px 28px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 22,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            Créer une mission
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="portal-label">Projet *</label>
            <select
              className="portal-input"
              value={missionForm.projectId}
              onChange={e => setMissionForm(f => ({ ...f, projectId: e.target.value }))}
              required
              style={{ width: '100%' }}
            >
              <option value="">— Choisir un projet —</option>
              {projects.map(p => (
                <option key={p._id} value={p._id}>
                  {p.entity} · {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Titre *</label>
            <input
              className="portal-input"
              value={missionForm.title}
              onChange={e => setMissionForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Titre de la mission"
              required
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="portal-label">Description</label>
            <textarea
              className="portal-input"
              value={missionForm.description}
              onChange={e => setMissionForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Détails, contexte…"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div>
            <label className="portal-label">
              Assigner à *{' '}
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>
                (plusieurs possibles)
              </span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {admins.map(a => {
                const selected = missionForm.assignedTo.includes(a._id)
                return (
                  <button
                    key={a._id}
                    type="button"
                    onClick={() =>
                      setMissionForm(f => ({
                        ...f,
                        assignedTo: selected
                          ? f.assignedTo.filter(id => id !== a._id)
                          : [...f.assignedTo, a._id],
                      }))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 10px',
                      borderRadius: 20,
                      border: `1px solid ${selected ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      background: selected ? 'rgba(16,185,129,0.12)' : 'transparent',
                      color: selected ? '#6ee7b7' : 'var(--text-secondary)',
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: selected ? 'rgba(16,185,129,0.2)' : 'rgba(165,180,207,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {a.name[0]?.toUpperCase()}
                    </div>
                    {a.name}
                    {selected && <span style={{ fontSize: 10 }}>✓</span>}
                  </button>
                )
              })}
            </div>
            {missionForm.assignedTo.length > 0 && (
              <div style={{ fontSize: 11, color: '#6ee7b7', marginTop: 5 }}>
                {missionForm.assignedTo.length} personne
                {missionForm.assignedTo.length > 1 ? 's' : ''} sélectionnée
                {missionForm.assignedTo.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div>
            <label className="portal-label">Deadline (optionnel)</label>
            <input
              type="date"
              className="portal-input"
              value={missionForm.dueDate}
              onChange={e => setMissionForm(f => ({ ...f, dueDate: e.target.value }))}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              className="portal-button"
              type="submit"
              disabled={savingMission}
              style={{ flex: 1 }}
            >
              {savingMission ? 'Création...' : 'Créer la mission'}
            </button>
            <button className="portal-button secondary" type="button" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
