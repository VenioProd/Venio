import React, { useState } from 'react'
import type { ArrowSchool } from '../../../types/arrow.types'
import { STATUS_MAP, TEMPERATURE_MAP, SCHOOL_TYPE_MAP, ARROW_STATUSES, ARROW_TEMPERATURES } from './constants'

interface Props {
  schools: ArrowSchool[]
  onEdit: (school: ArrowSchool) => void
  onDelete: (id: string) => void
  onSelect: (school: ArrowSchool) => void
  onPatch: (id: string, patch: Record<string, unknown>) => void
  canManage: boolean
}

export default function SchoolTable({ schools, onEdit, onDelete, onSelect, onPatch, canManage }: Props) {
  const [editingStatus, setEditingStatus] = useState<string | null>(null)
  const [editingTemp, setEditingTemp] = useState<string | null>(null)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['École', 'Statut', 'Température', 'Contact & Email', 'Commercial', 'Prochain contact', 'Relances', ''].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schools.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                Aucune école enregistrée · <span style={{ color: 'var(--primary)' }}>Cliquez sur "+ Ajouter une école" pour commencer</span>
              </td>
            </tr>
          )}
          {schools.map(school => {
            const status = STATUS_MAP[school.status]
            const temp = TEMPERATURE_MAP[school.temperature]
            const schoolType = SCHOOL_TYPE_MAP[school.schoolType]
            const isOverdue = school.nextActionAt && new Date(school.nextActionAt) < new Date() && !['SIGNE', 'NON_INTERESSE'].includes(school.status)
            const doneRelances = (school.relances ?? []).filter(r => r.done).length
            const totalRelances = (school.relances ?? []).filter(r => r.date).length

            return (
              <tr key={school._id}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* École */}
                <td style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => onSelect(school)}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{school.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {schoolType?.label || school.schoolType}
                    {school.city ? ` · ${school.city}` : ''}
                  </div>
                </td>

                {/* Statut — inline edit */}
                <td style={{ padding: '12px 14px' }}>
                  {canManage && editingStatus === school._id ? (
                    <select
                      autoFocus
                      value={school.status}
                      onChange={e => { onPatch(school._id, { status: e.target.value }); setEditingStatus(null) }}
                      onBlur={() => setEditingStatus(null)}
                      style={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', padding: '4px 6px', cursor: 'pointer' }}
                    >
                      {ARROW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  ) : (
                    <span
                      onClick={() => canManage && setEditingStatus(school._id)}
                      title={canManage ? 'Cliquer pour modifier' : undefined}
                      style={{
                        background: `${status?.color}20`, color: status?.color,
                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        whiteSpace: 'nowrap', cursor: canManage ? 'pointer' : 'default',
                        border: `1px solid ${status?.color}40`,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {status?.label || school.status}
                      {canManage && <span style={{ opacity: 0.5, fontSize: 10 }}>▼</span>}
                    </span>
                  )}
                </td>

                {/* Température — inline edit */}
                <td style={{ padding: '12px 14px' }}>
                  {canManage && editingTemp === school._id ? (
                    <select
                      autoFocus
                      value={school.temperature}
                      onChange={e => { onPatch(school._id, { temperature: e.target.value }); setEditingTemp(null) }}
                      onBlur={() => setEditingTemp(null)}
                      style={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', padding: '4px 6px', cursor: 'pointer' }}
                    >
                      {ARROW_TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  ) : (
                    <span
                      onClick={() => canManage && setEditingTemp(school._id)}
                      title={canManage ? 'Cliquer pour modifier' : undefined}
                      style={{ color: temp?.color, fontSize: 13, cursor: canManage ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >
                      {temp?.label || school.temperature}
                      {canManage && <span style={{ opacity: 0.4, fontSize: 10 }}>▼</span>}
                    </span>
                  )}
                </td>

                {/* Contact & Email */}
                <td style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => onSelect(school)}>
                  {school.contactName ? (
                    <>
                      <div style={{ fontSize: 13 }}>{school.contactName}
                        {school.contactRole && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {school.contactRole}</span>}
                      </div>
                      {school.contactEmail && (
                        <a href={`mailto:${school.contactEmail}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--primary)', fontSize: 12 }}>
                          {school.contactEmail}
                        </a>
                      )}
                    </>
                  ) : school.emailGeneral ? (
                    <a href={`mailto:${school.emailGeneral}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {school.emailGeneral}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>

                {/* Commercial */}
                <td style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => onSelect(school)}>
                  {school.assignedTo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {school.assignedTo.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13 }}>{school.assignedTo.name}</span>
                    </div>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>

                {/* Prochain contact */}
                <td style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => onSelect(school)}>
                  {school.nextActionAt ? (
                    <span style={{ fontSize: 13, color: isOverdue ? '#ef4444' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isOverdue && '⚠️ '}
                      {new Date(school.nextActionAt).toLocaleDateString('fr-FR')}
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>

                {/* Relances */}
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => {
                      const r = school.relances?.[i]
                      const isDone = r?.done
                      const isLate = r?.date && !isDone && new Date(r.date) < new Date()
                      const hasDate = r?.date
                      const color = isDone ? '#22c55e' : isLate ? '#ef4444' : hasDate ? '#f59e0b' : 'var(--border)'
                      return (
                        <span key={i}
                          title={hasDate ? `R${i + 1} — ${new Date(r!.date!).toLocaleDateString('fr-FR')}${r?.note ? ` · ${r.note}` : ''}` : `R${i + 1} non planifiée`}
                          style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `2px solid ${color}`, color, background: isDone ? '#22c55e18' : isLate ? '#ef444418' : hasDate ? '#f59e0b18' : 'transparent', flexShrink: 0 }}>
                          {isDone ? '✓' : i + 1}
                        </span>
                      )
                    })}
                    {totalRelances > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{doneRelances}/{totalRelances}</span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td style={{ padding: '12px 14px' }}>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, opacity: 0, transition: 'opacity 0.15s' }}
                      ref={el => {
                        if (el) {
                          const row = el.closest('tr')
                          if (row) {
                            row.addEventListener('mouseenter', () => { el.style.opacity = '1' })
                            row.addEventListener('mouseleave', () => { el.style.opacity = '0' })
                          }
                        }
                      }}>
                      <button onClick={e => { e.stopPropagation(); onEdit(school) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>
                        Modifier
                      </button>
                      <button onClick={e => { e.stopPropagation(); onDelete(school._id) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef444440', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
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
