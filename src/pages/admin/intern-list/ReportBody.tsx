import { useI18n } from '../../../context/I18nContext'
import type { ActivityReport } from './types'
import { isImage, formatFileSize, formatDateTime } from './types'

interface Props {
  report: ActivityReport
  showAdminActions: boolean
  isAdmin: boolean
  onValidate: (id: string, status: string) => void
  onOpenComment: (reportId: string, status: string, current: string) => void
  onDelete: (id: string) => void
}

export default function ReportBody({ report, showAdminActions, isAdmin, onValidate, onOpenComment, onDelete }: Props) {
  const { t } = useI18n()
  return (
    <div
      style={{ padding: '16px 20px', borderTop: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)' }}
    >
      {/* Contenu */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('intern.report.summary')}</span>
        <p
          style={{
            color: 'var(--text-primary)',
            fontSize: 14,
            margin: '4px 0 0',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}
        >
          {report.contenu}
        </p>
      </div>

      {/* Tâches */}
      {report.taches.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('intern.report.tasksDone')}</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {report.taches.map((task, i) => (
              <li key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                {task}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pieces jointes */}
      {report.attachments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('intern.report.attachments')}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {report.attachments.map((f, i) => (
              <a
                key={i}
                href={`/api/admin/interns/reports/files/${f.filename}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--r-sm)',
                  background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                  color: 'var(--primary)',
                  fontSize: 12,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isImage(f.mimetype) ? '🖼️' : '📄'} {f.originalName}
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({formatFileSize(f.size)})</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Commentaire admin */}
      {report.commentaireAdmin && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            marginBottom: 12,
            borderLeft: '3px solid var(--primary)',
          }}
        >
          <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>
            {t('intern.report.adminComment')}
          </span>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>{report.commentaireAdmin}</p>
        </div>
      )}

      {/* Validation info */}
      {report.status === 'VALIDE' && report.validePar && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          {report.valideAt
            ? t('intern.report.validatedByOn', { name: report.validePar.name, date: formatDateTime(report.valideAt) })
            : t('intern.report.validatedBy', { name: report.validePar.name })}
        </div>
      )}

      {/* Actions admin */}
      {showAdminActions && isAdmin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {report.status !== 'VALIDE' && (
            <button
              className="ticket-new-btn"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => onValidate(report._id, 'VALIDE')}
            >
              {t('intern.report.validate')}
            </button>
          )}
          {report.status === 'VALIDE' && (
            <button
              className="ticket-back-btn"
              style={{ fontSize: 12 }}
              onClick={() => onValidate(report._id, 'SOUMIS')}
            >
              {t('intern.report.unvalidate')}
            </button>
          )}
          <button
            className="ticket-back-btn"
            style={{ fontSize: 12 }}
            onClick={() => onOpenComment(report._id, report.status, report.commentaireAdmin || '')}
          >
            {t('intern.report.comment')}
          </button>
        </div>
      )}

      {/* Actions stagiaire (supprimer si pas valide) */}
      {!showAdminActions && report.status !== 'VALIDE' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="ticket-back-btn"
            style={{ fontSize: 12, color: 'var(--critical)' }}
            onClick={() => onDelete(report._id)}
          >
            {t('intern.report.delete')}
          </button>
        </div>
      )}
    </div>
  )
}
