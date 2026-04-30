import React from 'react'
import type { ArrowSchool } from '../../../types/arrow.types'
import { STATUS_MAP, TEMPERATURE_MAP, SCHOOL_TYPE_MAP } from './constants'

interface Props {
  schools: ArrowSchool[]
  onEdit: (school: ArrowSchool) => void
  onDelete: (id: string) => void
  onSelect: (school: ArrowSchool) => void
  canManage: boolean
}

export default function SchoolTable({ schools, onEdit, onDelete, onSelect, canManage }: Props) {
  if (schools.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px 0' }}>
        Aucune école dans cette vue.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>École</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ville</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Contact</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Statut</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Temp.</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Commercial</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Prochain contact</th>
            <th style={{ padding: '8px 12px', textAlign: 'left' }}></th>
          </tr>
        </thead>
        <tbody>
          {schools.map(school => {
            const status = STATUS_MAP[school.status]
            const temp = TEMPERATURE_MAP[school.temperature]
            const schoolType = SCHOOL_TYPE_MAP[school.schoolType]
            const isOverdue = school.nextActionAt && new Date(school.nextActionAt) < new Date() && !['SIGNE', 'NON_INTERESSE'].includes(school.status)

            return (
              <tr
                key={school._id}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => onSelect(school)}
              >
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{school.name}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{schoolType?.label || school.schoolType}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{school.city || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {school.contactName
                    ? <span>{school.contactName}{school.contactRole ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {school.contactRole}</span> : ''}</span>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {school.contactEmail
                    ? <a href={`mailto:${school.contactEmail}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--primary)' }}>{school.contactEmail}</a>
                    : school.emailGeneral
                      ? <a href={`mailto:${school.emailGeneral}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)' }}>{school.emailGeneral}</a>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ background: `${status?.color}22`, color: status?.color, padding: '3px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {status?.label || school.status}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ color: temp?.color, fontSize: 13 }}>{temp?.label?.split(' ')[0] || '—'}</span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                  {school.assignedTo?.name || '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {school.nextActionAt
                    ? <span style={{ color: isOverdue ? '#ef4444' : 'var(--text-secondary)', fontSize: 13 }}>
                        {new Date(school.nextActionAt).toLocaleDateString('fr-FR')}
                        {isOverdue && ' ⚠️'}
                      </span>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </td>
                <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => onEdit(school)}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => onDelete(school._id)}
                        style={{ background: 'none', border: '1px solid #ef444440', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}
                      >
                        Suppr.
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
