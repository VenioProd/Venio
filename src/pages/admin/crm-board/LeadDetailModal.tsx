import React from 'react'
import { Link } from 'react-router-dom'
import CustomSelect from '../../../components/admin/CustomSelect'
import { fromDateTimeLocal, toDateTimeLocal } from '../../../lib/formatUtils'
import type { Lead, AdminUser } from '../../../types/crm.types'
import { CRM_STATUSES, CRM_TEMPERATURES, TEMPERATURE_MAP } from './constants'

interface LeadDetailModalProps {
  lead: Lead
  admins: AdminUser[]
  canManageCrm: boolean
  converting: string | null
  onClose: () => void
  onLeadChange: (updater: (prev: Lead | null) => Lead | null) => void
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
}

const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  admins,
  canManageCrm,
  converting,
  onClose,
  onLeadChange,
  onUpdateLead,
  onConvertToClient,
}) => {
  return (
    <div className="crm-modal-overlay" onClick={onClose}>
      <div className="crm-modal crm-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <h2>Notes d'interactions - {lead.company}</h2>
          <button className="crm-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-modal-info">
            <p><strong>Contact :</strong> {lead.contactName || '—'}</p>
            <p><strong>Email :</strong> {lead.contactEmail || '—'}</p>
            <p><strong>Téléphone :</strong> {lead.contactPhone || '—'}</p>
            <p><strong>Service :</strong> {lead.serviceType || '—'}</p>
            <p><strong>Chaleur :</strong> {TEMPERATURE_MAP[lead.leadTemperature || '']?.label || lead.leadTemperature}</p>
          </div>

          {/* Actions rapides : contact */}
          <div className="crm-modal-quick-actions">
            <span className="crm-modal-quick-label">Contact rapide</span>
            <div className="crm-modal-quick-btns">
              {lead.contactEmail && (
                <a
                  href={`mailto:${lead.contactEmail}`}
                  className="portal-button secondary crm-modal-quick-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ✉️ Envoyer un email
                </a>
              )}
              {lead.contactPhone && (
                <a
                  href={`tel:${lead.contactPhone.replace(/\s/g, '')}`}
                  className="portal-button secondary crm-modal-quick-btn"
                >
                  📞 Appeler
                </a>
              )}
              <button
                type="button"
                className="portal-button secondary crm-modal-quick-btn"
                onClick={() => {
                  const text = [
                    lead.contactName && `Contact: ${lead.contactName}`,
                    lead.contactEmail && `Email: ${lead.contactEmail}`,
                    lead.contactPhone && `Tél: ${lead.contactPhone}`,
                    lead.company && `Société: ${lead.company}`,
                  ].filter(Boolean).join('\n')
                  if (text) {
                    navigator.clipboard.writeText(text).then(() => alert('Infos contact copiées'))
                  }
                }}
              >
                📋 Copier les infos
              </button>
            </div>
          </div>

          {/* Actions rapides : statut, chaleur, assignation, prochaine action */}
          {canManageCrm && (
            <div className="crm-modal-quick-actions crm-modal-quick-fields">
              <span className="crm-modal-quick-label">Modifier le lead</span>
              <div className="crm-modal-quick-grid">
                <div className="crm-modal-quick-field">
                  <label>Statut</label>
                  <CustomSelect
                    className="portal-input"
                    value={lead.status || 'LEAD'}
                    onChange={(v) => {
                      onLeadChange((prev) => prev ? { ...prev, status: v } : prev)
                      onUpdateLead(lead._id, { status: v })
                    }}
                    options={CRM_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>Chaleur</label>
                  <CustomSelect
                    className="portal-input"
                    value={lead.leadTemperature || 'TIEDE'}
                    onChange={(v) => {
                      onLeadChange((prev) => prev ? { ...prev, leadTemperature: v } : prev)
                      onUpdateLead(lead._id, { leadTemperature: v })
                    }}
                    options={CRM_TEMPERATURES.map((t) => ({ value: t.key, label: t.label }))}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>Assigné à</label>
                  <CustomSelect
                    className="portal-input"
                    value={lead.assignedTo || ''}
                    onChange={(v) => {
                      const val = v || null
                      onLeadChange((prev) => prev ? { ...prev, assignedTo: val } : prev)
                      onUpdateLead(lead._id, { assignedTo: val })
                    }}
                    options={[{ value: '', label: 'Non assigné' }, ...admins.filter((a) => ['SUPER_ADMIN', 'ADMIN'].includes(a.role)).map((admin) => ({ value: admin._id, label: admin.name }))]}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>Prochaine action</label>
                  <input
                    type="datetime-local"
                    className="portal-input"
                    value={toDateTimeLocal(lead.nextActionAt) || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onLeadChange((prev) => prev ? { ...prev, nextActionAt: e.target.value ? fromDateTimeLocal(e.target.value) : null } : prev)}
                    onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                      const raw = e.target.value
                      const iso = raw ? fromDateTimeLocal(raw) : null
                      onUpdateLead(lead._id, { nextActionAt: iso })
                    }}
                  />
                </div>
              </div>
              <div className="crm-modal-quick-btns" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={async () => {
                    const now = new Date().toISOString()
                    const isEarlyStage = lead.status === 'LEAD' || lead.status === 'QUALIFIED'
                    onLeadChange((prev) => prev ? { ...prev, lastContactAt: now, ...(isEarlyStage ? { status: 'CONTACTED' } : {}) } : prev)
                    await onUpdateLead(lead._id, { lastContactAt: now, ...(isEarlyStage ? { status: 'CONTACTED' } : {}) })
                  }}
                >
                  ✓ Marquer comme contacté aujourd'hui
                </button>
              </div>
            </div>
          )}

          {/* Convertir en client (si WON) */}
          {lead.status === 'WON' && (
            <div className="crm-modal-quick-actions">
              {lead.clientAccountId ? (
                <Link
                  to={`/admin/comptes-clients/${lead.clientAccountId}`}
                  className="portal-button"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  onClick={onClose}
                >
                  👤 Voir le compte client
                </Link>
              ) : (
                <button
                  type="button"
                  className="portal-button"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  disabled={converting === lead._id}
                  onClick={async () => {
                    await onConvertToClient(lead)
                    onClose()
                  }}
                >
                  {converting === lead._id ? 'Conversion...' : '✓ Convertir en client'}
                </button>
              )}
            </div>
          )}

          <div className="crm-modal-notes">
            <label className="crm-modal-label">Notes détaillées des interactions</label>
            <textarea
              className="crm-modal-textarea"
              value={lead.interactionNotes || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onLeadChange((prev) => prev ? { ...prev, interactionNotes: e.target.value } : prev)}
              placeholder="Notez ici tous les détails des appels, emails, réunions avec ce prospect..."
              rows={10}
              disabled={!canManageCrm}
            />
          </div>
          {canManageCrm && (
            <div className="crm-modal-actions">
              <button
                className="portal-button"
                onClick={async () => {
                  await onUpdateLead(lead._id, { interactionNotes: lead.interactionNotes })
                  onClose()
                }}
              >
                Enregistrer les notes
              </button>
              <button className="portal-button secondary" onClick={onClose}>
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LeadDetailModal
