import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import { formatDateTime } from '../../../i18n/format'
import { STATUS_CONFIG, daysRemaining, formatDate, type Intern } from './types'

interface Props {
  intern: Intern
  expanded: boolean
  isSuperAdmin: boolean
  resendingCredentials: string | null
  onToggle: () => void
  onEdit: (intern: Intern) => void
  onStatusChange: (internId: string, status: string) => void
  onTypeChange: (internId: string, type: 'STAGIAIRE' | 'ALTERNANT') => void
  onResendCredentials: (internId: string) => void
  onDelete: (internId: string) => void
}

export default function InternCard({
  intern,
  expanded,
  isSuperAdmin,
  resendingCredentials,
  onToggle,
  onEdit,
  onStatusChange,
  onTypeChange,
  onResendCredentials,
  onDelete,
}: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const status = STATUS_CONFIG[intern.status]
  const days = daysRemaining(intern.dateFin)
  const progress = calculateProgress(intern.dateDebut, intern.dateFin)

  return (
    <div className="ticket-card" style={{ borderLeft: `3px solid ${status.color}` }}>
      <div className="ticket-card-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={avatarStyle(status.color)}>{intern.userId.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600 }}>{intern.userId.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              {intern.poste}
              {intern.departement ? ` — ${intern.departement}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {formatDate(intern.dateDebut)} → {formatDate(intern.dateFin)}
          </span>
          {intern.status === 'ACTIF' && (
            <span
              style={{ fontSize: 11, color: days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : 'rgba(255,255,255,0.4)' }}
            >
              {days > 0 ? t('intern.card.daysLeft', { count: days }) : t('intern.status.finished')}
            </span>
          )}
          <Badge
            color={intern.type === 'ALTERNANT' ? 'var(--primary)' : '#9b9b9b'}
            background={intern.type === 'ALTERNANT' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(155,155,155,0.15)'}
          >
            {intern.type === 'ALTERNANT' ? t('intern.type.apprentice') : t('intern.type.intern')}
          </Badge>
          <Badge color={status.color} background={status.color + '22'}>
            {t(status.labelKey)}
          </Badge>
          <span
            style={{
              color: 'rgba(255,255,255,0.3)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {expanded && (
        <div
          className="ticket-card-body"
          style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Progress progress={progress} color={status.color} label={t('intern.card.progress')} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}>
            <div>
              <FieldLabel label={t('intern.card.fieldType')} />
              <select
                value={intern.type || 'STAGIAIRE'}
                onChange={(event) => onTypeChange(intern._id, event.target.value as 'STAGIAIRE' | 'ALTERNANT')}
                style={typeSelectStyle}
              >
                <option value="STAGIAIRE">{t('intern.type.intern')}</option>
                <option value="ALTERNANT">{t('intern.type.apprentice')}</option>
              </select>
            </div>
            <Field label={t('intern.card.fieldEmail')}>{intern.userId.email}</Field>
            {intern.userId.phone && <Field label={t('intern.card.fieldPhone')}>{intern.userId.phone}</Field>}
            <Field label={t('intern.card.fieldLastLogin')}>
              <span style={{ color: intern.userId.lastLoginAt ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                {intern.userId.lastLoginAt
                  ? formatDateTime(intern.userId.lastLoginAt, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : t('intern.card.neverLoggedIn')}
              </span>
            </Field>
            {intern.ecole && <Field label={t('intern.card.fieldSchool')}>{intern.ecole}</Field>}
            {intern.formation && <Field label={t('intern.card.fieldTraining')}>{intern.formation}</Field>}
            {intern.tuteur && <Field label={t('intern.card.fieldTutor')}>{intern.tuteur.name}</Field>}
          </div>
          {intern.notes && <Notes label={t('intern.card.notes')}>{intern.notes}</Notes>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="ticket-new-btn"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => navigate(`/admin/stagiaires/${intern._id}`)}
            >
              {t('intern.card.viewProfile')}
            </button>
            <button className="ticket-back-btn" onClick={() => onEdit(intern)}>
              {t('intern.card.edit')}
            </button>
            {intern.status === 'ACTIF' && (
              <button
                className="ticket-back-btn"
                style={{ color: 'var(--ink-faint)' }}
                onClick={() => onStatusChange(intern._id, 'TERMINE')}
              >
                {t('intern.card.markFinished')}
              </button>
            )}
            {intern.status === 'ACTIF' && (
              <button
                className="ticket-back-btn"
                style={{ color: '#ef4444' }}
                onClick={() => onStatusChange(intern._id, 'ANNULE')}
              >
                {t('intern.card.cancel')}
              </button>
            )}
            {intern.status !== 'ACTIF' && (
              <button
                className="ticket-back-btn"
                style={{ color: '#22c55e' }}
                onClick={() => onStatusChange(intern._id, 'ACTIF')}
              >
                {t('intern.card.reactivate')}
              </button>
            )}
            {isSuperAdmin && (
              <>
                <button
                  className="ticket-back-btn"
                  style={{ color: 'var(--primary)' }}
                  onClick={() => onResendCredentials(intern._id)}
                  disabled={resendingCredentials === intern._id}
                >
                  {resendingCredentials === intern._id ? t('intern.card.sending') : t('intern.card.resendCredentials')}
                </button>
                <button className="ticket-back-btn" style={{ color: '#ef4444' }} onClick={() => onDelete(intern._id)}>
                  {t('intern.card.delete')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function calculateProgress(start: string, end: string) {
  const total = new Date(end).getTime() - new Date(start).getTime()
  const elapsed = Date.now() - new Date(start).getTime()
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}

function Badge({ children, color, background }: { children: string; color: string; background: string }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background, color }}>
      {children}
    </span>
  )
}

function Progress({ progress, color, label }: { progress: number; color: string; label: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{progress}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div
          style={{
            height: '100%',
            borderRadius: 3,
            background: color,
            width: `${progress}%`,
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  )
}

function FieldLabel({ label }: { label: string }) {
  return (
    <>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{label}</span>
      <br />
    </>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <FieldLabel label={label} />
      <span style={{ color: '#fff', fontSize: 13 }}>{children}</span>
    </div>
  )
}
function Notes({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginBottom: 16 }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</span>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
        {children}
      </p>
    </div>
  )
}

const typeSelectStyle = {
  marginTop: 2,
  fontSize: 13,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'inherit',
  cursor: 'pointer',
}
const avatarStyle = (color: string) => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: color + '22',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
  fontWeight: 700,
  fontSize: 14,
})
