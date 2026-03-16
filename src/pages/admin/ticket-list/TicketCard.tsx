import React from 'react'
import { CATEGORY_CONFIG, STATUS_CONFIG, formatDate, formatFileSize, isImage } from './types'
import type { Ticket, TicketFile } from './types'
import { apiFetch } from '../../../lib/api'

interface TicketCardProps {
  ticket: Ticket
  isExpanded: boolean
  onToggleExpand: () => void
  onPreview: (preview: { url: string; name: string }) => void
  onReload: () => void
}

const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  isExpanded,
  onToggleExpand,
  onPreview,
  onReload,
}) => {
  const cat = CATEGORY_CONFIG[ticket.category]
  const st = STATUS_CONFIG[ticket.status]

  const handleExpand = () => {
    const opening = !isExpanded
    onToggleExpand()
    // Marquer comme lu + archiver si le ticket a des reponses et n'est pas deja ferme
    if (opening && ticket.replies.length > 0 && ticket.status !== 'FERME' && !ticket.isArchived) {
      apiFetch(`/api/admin/tickets/${ticket._id}/mark-read`, { method: 'PATCH' })
        .then(() => onReload())
        .catch(() => {})
    }
  }

  const renderAttachments = (files: TicketFile[] | undefined) => {
    if (!files || files.length === 0) return null
    return (
      <div className="ticket-attachments">
        {files.map((f, i) => (
          <div key={i} className="ticket-attachment">
            {isImage(f.mimetype) ? (
              <img src={`/api/admin/tickets/files/${f.filename}`} alt={f.originalName} className="ticket-attachment-img"
                onClick={() => onPreview({ url: `/api/admin/tickets/files/${f.filename}`, name: f.originalName })} />
            ) : (
              <a href={`/api/admin/tickets/files/${f.filename}`} target="_blank" rel="noopener noreferrer" className="ticket-attachment-file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span>{f.originalName}</span>
                <span className="ticket-attachment-size">{formatFileSize(f.size)}</span>
              </a>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`ticket-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="ticket-card-header" onClick={handleExpand}>
        <div className="ticket-card-left">
          <span className="ticket-category-badge" style={{ background: cat.color }}>{cat.label}</span>
          <h3 className="ticket-card-title">{ticket.title}</h3>
        </div>
        <div className="ticket-card-right">
          <span className="ticket-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
          {ticket.replies.length > 0 && <span className="ticket-reply-count">{ticket.replies.length} reponse{ticket.replies.length > 1 ? 's' : ''}</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.4 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
      {isExpanded && (
        <div className="ticket-card-body">
          <div className="ticket-meta">
            <span>{formatDate(ticket.createdAt)}</span>
          </div>
          <div className="ticket-message">{ticket.message}</div>
          {renderAttachments(ticket.attachments)}
          {ticket.replies.length > 0 && (
            <div className="ticket-replies">
              {ticket.replies.map((reply) => (
                <div key={reply._id} className="ticket-reply">
                  <div className="ticket-reply-header">
                    <strong>{reply.authorName}</strong>
                    <span>{formatDate(reply.createdAt)}</span>
                  </div>
                  <p>{reply.message}</p>
                  {renderAttachments(reply.attachments)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TicketCard
