import type { Dispatch, SetStateAction } from 'react'

type ArrowPilotageSection = 'goals' | 'scorecard' | 'decisions' | 'cadence'

interface Props {
  section: ArrowPilotageSection
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  defaults: Record<ArrowPilotageSection, string[]>
  labels: Record<ArrowPilotageSection, string>
  saving: boolean
  onClose: () => void
  onSave: () => void
}

export default function ArrowSectionEditorModal({ section, draft, setDraft, defaults, labels, saving, onClose, onSave }: Props) {
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1001, backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 640,
          maxWidth: '92vw',
          background: '#141824',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 1002,
          padding: '26px 28px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Modifier · {labels[section]}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Une ligne par élément. Décisions : date | titre | décision | responsable. Cadre : titre | contenu.
            </p>
          </div>
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
            X
          </button>
        </div>
        <textarea
          className="portal-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={section === 'goals' ? 7 : 10}
          style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.55 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14, alignItems: 'center' }}>
          <button
            className="portal-button secondary"
            type="button"
            onClick={() => setDraft(defaults[section].join('\n'))}
          >
            Restaurer le modèle
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="portal-button secondary" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="portal-button" type="button" onClick={onSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
