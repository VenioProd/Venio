import React from 'react'
import type { ArrowSchool } from '../../../types/arrow.types'
import { STATUS_MAP, TEMPERATURE_MAP, SCHOOL_TYPE_MAP } from './constants'

interface Props {
  school: ArrowSchool
  onClose: () => void
  onEdit: () => void
  canManage: boolean
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13, minWidth: 160 }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </div>
  )
}

export default function SchoolDetailModal({ school, onClose, onEdit, canManage }: Props) {
  const status = STATUS_MAP[school.status]
  const temp = TEMPERATURE_MAP[school.temperature]
  const schoolType = SCHOOL_TYPE_MAP[school.schoolType]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 28 }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{school.name}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ background: `${status?.color}22`, color: status?.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                {status?.label}
              </span>
              <span style={{ color: temp?.color, fontSize: 13 }}>{temp?.label}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canManage && (
              <button onClick={onEdit} className="portal-button secondary" style={{ fontSize: 13, padding: '6px 14px' }}>Modifier</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>
        </div>

        <section style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>École</h3>
          <Row label="Type" value={schoolType?.label} />
          <Row label="Ville" value={school.city} />
          <Row label="Région" value={school.region} />
          <Row label="Nb élèves" value={school.studentCount !== null ? String(school.studentCount) : null} />
          <Row label="Email général" value={school.emailGeneral} />
        </section>

        <section style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Contact référent</h3>
          <Row label="Nom" value={school.contactName} />
          <Row label="Poste" value={school.contactRole} />
          <Row label="Email" value={school.contactEmail} />
          <Row label="Téléphone" value={school.contactPhone} />
        </section>

        <section style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Prospection</h3>
          <Row label="Source" value={school.source} />
          <Row label="Commercial" value={school.assignedTo?.name} />
          <Row label="Prochain contact" value={school.nextActionAt ? new Date(school.nextActionAt).toLocaleDateString('fr-FR') : null} />
          <Row label="Dernier contact" value={school.lastContactAt ? new Date(school.lastContactAt).toLocaleDateString('fr-FR') : null} />
        </section>

        {school.notes && (
          <section>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Notes</h3>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', margin: 0 }}>{school.notes}</p>
          </section>
        )}
      </div>
    </div>
  )
}
