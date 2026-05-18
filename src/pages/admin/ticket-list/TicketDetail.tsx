import React, { useRef } from 'react'
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG, formatDate, formatFileSize, isImage } from './types'
import type { Ticket, TicketFile } from './types'
import UserAvatar from '../../../components/UserAvatar'

interface TicketDetailProps {
  ticket: Ticket
  isArchive?: boolean
  isExpanded: boolean
  isSuperAdmin: boolean
  replyText: string
  replyFiles: File[]
  submitting: boolean
  onToggleExpand: () => void
  onReplyTextChange: (text: string) => void
  onReplyFilesChange: (files: File[]) => void
  onReply: (ticketId: string) => void
  onStatusChange: (ticketId: string, status: string) => void
  onArchive: (ticketId: string) => void
  onUnarchive: (ticketId: string) => void
  onDelete: (ticketId: string) => void
  onPreview: (preview: { url: string; name: string }) => void
}

const TicketDetail: React.FC<TicketDetailProps> = ({
  ticket,
  isArchive = false,
  isExpanded,
  isSuperAdmin,
  replyText,
  replyFiles,
  submitting,
  onToggleExpand,
  onReplyTextChange,
  onReplyFilesChange,
  onReply,
  onStatusChange,
  onArchive,
  onUnarchive,
  onDelete,
  onPreview,
}) => {
  const replyFileRef = useRef<HTMLInputElement>(null)

  const removeReplyFile = (idx: number) => onReplyFilesChange(replyFiles.filter((_, i) => i !== idx))

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

  const renderFilePreview = (files: File[]) => {
    if (files.length === 0) return null
    return (
      <div className="ticket-file-previews">
        {files.map((f, i) => (
          <div key={i} className="ticket-file-preview">
            {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt={f.name} /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            )}
            <span className="ticket-file-preview-name">{f.name}</span>
            <button type="button" className="ticket-file-remove" onClick={() => removeReplyFile(i)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}
      </div>
    )
  }

  const cat = CATEGORY_CONFIG[ticket.category]
  const pri = PRIORITY_CONFIG[ticket.priority]
  const st = STATUS_CONFIG[ticket.status]

  return (
    <div className={`ticket-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="ticket-card-header" onClick={onToggleExpand}>
        <div className="ticket-card-left">
          <span className="ticket-category-badge" style={{ background: cat.color }}>{cat.label}</span>
          <span className="ticket-priority-dot" style={{ background: pri.color }} title={pri.label} />
          <h3 className="ticket-card-title">{ticket.title}</h3>
        </div>
        <div className="ticket-card-right">
          <span className="ticket-status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
          {(ticket.attachments?.length || 0) > 0 && (
            <span style={{ opacity: 0.4, fontSize: 12 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2 }}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </span>
          )}
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Par
              <UserAvatar name={ticket.authorName} avatarUrl={ticket.authorAvatarUrl} size={24} />
              <strong>{ticket.authorName}</strong>
            </span>
            <span>{formatDate(ticket.createdAt)}</span>
            {ticket.archivedAt && <span style={{ color: '#64748b' }}>Archive le {formatDate(ticket.archivedAt)}</span>}
          </div>
          <div className="ticket-message">{ticket.message}</div>
          {renderAttachments(ticket.attachments)}

          {ticket.replies.length > 0 && (
            <div className="ticket-replies">
              {ticket.replies.map((reply) => (
                <div key={reply._id} className="ticket-reply">
                  <div className="ticket-reply-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={22} />
                      <strong>{reply.authorName}</strong>
                    </div>
                    <span>{formatDate(reply.createdAt)}</span>
                  </div>
                  <p>{reply.message}</p>
                  {renderAttachments(reply.attachments)}
                </div>
              ))}
            </div>
          )}

          {!isArchive && (
            <div className="ticket-actions">
              {isSuperAdmin && ticket.status !== 'FERME' && (
                <div className="ticket-reply-form">
                  <textarea value={replyText} onChange={(e) => onReplyTextChange(e.target.value)} placeholder="Votre reponse..." rows={2} />
                  {renderFilePreview(replyFiles)}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input ref={replyFileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files) onReplyFilesChange([...replyFiles, ...Array.from(e.target.files!)]); e.target.value = '' }} />
                    <button type="button" className="ticket-attach-btn" onClick={() => replyFileRef.current?.click()}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    </button>
                    <button className="ticket-submit-btn" onClick={() => onReply(ticket._id)} disabled={submitting || !replyText.trim()}>Repondre</button>
                    <select value={ticket.status} onChange={(e) => onStatusChange(ticket._id, e.target.value)} className="ticket-status-select">
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {isSuperAdmin && (ticket.status === 'FERME' || ticket.status === 'RESOLU') && (
                <button className="ticket-archive-btn" onClick={() => onArchive(ticket._id)} title="Archiver">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  Archiver
                </button>
              )}
              {isSuperAdmin && (
                <button className="ticket-delete-btn" onClick={() => onDelete(ticket._id)} title="Supprimer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {isArchive && isSuperAdmin && (
            <div className="ticket-actions">
              <button className="ticket-archive-btn" onClick={() => onUnarchive(ticket._id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Restaurer
              </button>
              <button className="ticket-delete-btn" onClick={() => onDelete(ticket._id)} title="Supprimer definitivement">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TicketDetail
