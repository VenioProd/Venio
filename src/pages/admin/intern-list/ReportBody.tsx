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
  return (
    <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Contenu */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Compte-rendu</span>
        <p
          style={{
            color: 'rgba(255,255,255,0.8)',
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
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Taches realisees</span>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {report.taches.map((t, i) => (
              <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pieces jointes */}
      {report.attachments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Pieces jointes</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {report.attachments.map((f, i) => (
              <a
                key={i}
                href={`/api/admin/interns/reports/files/${f.filename}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--primary)',
                  fontSize: 12,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isImage(f.mimetype) ? '🖼️' : '📄'} {f.originalName}
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>({formatFileSize(f.size)})</span>
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
            borderRadius: 6,
            background: 'rgba(204, 255, 0, 0.08)',
            marginBottom: 12,
            borderLeft: '3px solid var(--primary)',
          }}
        >
          <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>Commentaire admin</span>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>{report.commentaireAdmin}</p>
        </div>
      )}

      {/* Validation info */}
      {report.status === 'VALIDE' && report.validePar && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
          Valide par {report.validePar.name}
          {report.valideAt ? ` le ${formatDateTime(report.valideAt)}` : ''}
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
              Valider
            </button>
          )}
          {report.status === 'VALIDE' && (
            <button
              className="ticket-back-btn"
              style={{ fontSize: 12 }}
              onClick={() => onValidate(report._id, 'SOUMIS')}
            >
              Annuler validation
            </button>
          )}
          <button
            className="ticket-back-btn"
            style={{ fontSize: 12 }}
            onClick={() => onOpenComment(report._id, report.status, report.commentaireAdmin || '')}
          >
            Commenter
          </button>
        </div>
      )}

      {/* Actions stagiaire (supprimer si pas valide) */}
      {!showAdminActions && report.status !== 'VALIDE' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="ticket-back-btn"
            style={{ fontSize: 12, color: '#ef4444' }}
            onClick={() => onDelete(report._id)}
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
