import type { Dispatch, SetStateAction } from 'react'
import { useI18n } from '../../../context/I18nContext'

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

export default function ArrowSectionEditorModal({
  section,
  draft,
  setDraft,
  defaults,
  labels,
  saving,
  onClose,
  onSave,
}: Props) {
  const { t } = useI18n()
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
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('projA.editor.title', { label: labels[section] })}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {t('projA.editor.help')}
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
            {t('projA.editor.restore')}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="portal-button secondary" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="portal-button" type="button" onClick={onSave} disabled={saving}>
              {saving ? t('projA.common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
