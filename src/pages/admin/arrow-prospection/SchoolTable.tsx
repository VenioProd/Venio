import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { ArrowRelance, ArrowSchool } from '../../../types/arrow.types'
import { STATUS_MAP, TEMPERATURE_MAP, SCHOOL_TYPE_MAP, ARROW_STATUSES, ARROW_TEMPERATURES, EMPTY_RELANCE } from './constants'

interface AdminUser { _id: string; name: string; email: string }

interface Props {
  schools: ArrowSchool[]
  admins: AdminUser[]
  onEdit: (school: ArrowSchool) => void
  onDelete: (id: string) => void
  onSelect: (school: ArrowSchool) => void
  onPatch: (id: string, patch: Record<string, unknown>) => void
  canManage: boolean
}

// Popover relance inline
function RelancePopover({ relance, index, onSave, onClose, anchorEl }: {
  relance: ArrowRelance
  index: number
  onSave: (r: ArrowRelance) => void
  onClose: () => void
  anchorEl: HTMLElement | null
}) {
  const [r, setR] = useState<ArrowRelance>({ ...relance })
  const ref = useRef<HTMLDivElement>(null)
  const rect = anchorEl?.getBoundingClientRect()
  const top = rect ? rect.bottom + 6 : 0
  const left = rect ? Math.min(rect.left, window.innerWidth - 276) : 0

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return ReactDOM.createPortal(
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 2000,
      background: '#13151f', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10, padding: 14, width: 260,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Relance {index + 1}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="portal-input" type="date" value={r.date ? r.date.slice(0, 10) : ''}
          onChange={e => setR(prev => ({ ...prev, date: e.target.value || null }))} />
        <input className="portal-input" placeholder="Note (optionnel)" value={r.note}
          onChange={e => setR(prev => ({ ...prev, note: e.target.value }))} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: r.done ? '#22c55e' : 'var(--text-secondary)' }}>
          <input type="checkbox" checked={r.done} onChange={e => setR(prev => ({ ...prev, done: e.target.checked }))} />
          Marquée comme faite
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="portal-button" style={{ flex: 1, fontSize: 12, padding: '6px 0' }}
            onClick={() => { onSave(r); onClose() }}>
            Enregistrer
          </button>
          {r.date && (
            <button onClick={() => { onSave({ date: null, done: false, note: '' }); onClose() }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ef444440', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
              Effacer
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function SchoolTable({ schools, admins, onEdit, onDelete, onSelect, onPatch, canManage }: Props) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [relancePopover, setRelancePopover] = useState<{ schoolId: string; index: number; anchor: HTMLElement } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleGroup = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  // Grouper par statut
  const grouped = ARROW_STATUSES.map(s => ({
    ...s,
    schools: schools.filter(sc => sc.status === s.key),
  })).filter(g => g.schools.length > 0 || schools.length === 0)

  return (
    <div className="crm-table-container">
      <div className="crm-table-scroll">
        <table className="crm-table">
          <thead>
            <tr>
              <th className="crm-th">École</th>
              <th className="crm-th">Type · Ville</th>
              <th className="crm-th">Contact</th>
              <th className="crm-th">Email</th>
              <th className="crm-th">Température</th>
              <th className="crm-th">Commercial</th>
              <th className="crm-th">Prochain contact</th>
              <th className="crm-th">Relances</th>
              {canManage && <th className="crm-th"></th>}
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 && (
              <tr>
                <td colSpan={canManage ? 9 : 8} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Aucune école enregistrée · <span style={{ color: 'var(--primary)' }}>Cliquez sur "+ Ajouter une école" pour commencer</span>
                </td>
              </tr>
            )}
            {grouped.map(group => {
              const isCollapsed = collapsed[group.key]
              if (group.schools.length === 0) return null
              return (
                <React.Fragment key={group.key}>
                  {/* Header de groupe */}
                  <tr className="crm-group-row" onClick={() => toggleGroup(group.key)}>
                    <td colSpan={canManage ? 9 : 8}>
                      <div className="crm-group-header" style={{ '--group-color': group.color } as React.CSSProperties}>
                        <span className={`crm-group-chevron ${isCollapsed ? '' : 'open'}`}>▶</span>
                        <span className="crm-group-color-bar" style={{ background: group.color }} />
                        <span className="crm-group-label">{group.label}</span>
                        <span className="crm-group-count">{group.schools.length} école{group.schools.length !== 1 ? 's' : ''}</span>
                      </div>
                    </td>
                  </tr>

                  {/* Lignes */}
                  {!isCollapsed && group.schools.map(school => {
                    const isOverdue = school.nextActionAt && new Date(school.nextActionAt) < new Date() && !['SIGNE', 'NON_INTERESSE'].includes(school.status)
                    const doneRelances = (school.relances ?? []).filter(r => r.done).length
                    const totalRelances = (school.relances ?? []).filter(r => r.date).length

                    return (
                      <tr key={school._id} className="crm-table-row" onClick={() => onSelect(school)}>

                        {/* École */}
                        <td className="crm-td crm-td-company">
                          <span className="crm-row-color-indicator" style={{ background: group.color }} />
                          <strong>{school.name}</strong>
                        </td>

                        {/* Type · Ville */}
                        <td className="crm-td">
                          <span className="crm-table-badge">{SCHOOL_TYPE_MAP[school.schoolType]?.label || school.schoolType}</span>
                          {school.city && <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 12 }}>{school.city}</span>}
                        </td>

                        {/* Contact */}
                        <td className="crm-td">
                          {school.contactName
                            ? <>{school.contactName}{school.contactRole && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {school.contactRole}</span>}</>
                            : '—'}
                        </td>

                        {/* Email */}
                        <td className="crm-td crm-td-email" onClick={e => e.stopPropagation()}>
                          {school.contactEmail
                            ? <a href={`mailto:${school.contactEmail}`} className="crm-email-link">{school.contactEmail}</a>
                            : school.emailGeneral
                              ? <a href={`mailto:${school.emailGeneral}`} className="crm-email-link" style={{ opacity: 0.6 }}>{school.emailGeneral}</a>
                              : '—'}
                        </td>

                        {/* Température inline */}
                        <td className="crm-td crm-td-temperature" onClick={e => e.stopPropagation()}>
                          {canManage ? (
                            <CustomSelect
                              className="crm-inline-select"
                              value={school.temperature}
                              onChange={v => onPatch(school._id, { temperature: v })}
                              options={ARROW_TEMPERATURES.map(t => ({ value: t.key, label: t.label }))}
                            />
                          ) : (
                            <span style={{ color: TEMPERATURE_MAP[school.temperature]?.color }}>{TEMPERATURE_MAP[school.temperature]?.label}</span>
                          )}
                        </td>

                        {/* Commercial inline */}
                        <td className="crm-td" onClick={e => e.stopPropagation()}>
                          {canManage ? (
                            <CustomSelect
                              className="crm-inline-select crm-inline-assignee"
                              value={school.assignedTo?._id || ''}
                              onChange={v => onPatch(school._id, { assignedTo: v || null })}
                              options={[{ value: '', label: 'Non assigné' }, ...admins.map(a => ({ value: a._id, label: a.name }))]}
                            />
                          ) : (
                            <span>{school.assignedTo?.name || '—'}</span>
                          )}
                        </td>

                        {/* Prochain contact */}
                        <td className={`crm-td ${isOverdue ? 'crm-td-overdue' : ''}`}>
                          {school.nextActionAt ? new Date(school.nextActionAt).toLocaleDateString('fr-FR') : '—'}
                          {isOverdue && <span className="crm-overdue-tag">En retard</span>}
                        </td>

                        {/* Relances */}
                        <td className="crm-td" onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {[0, 1, 2].map(i => {
                              const r = school.relances?.[i]
                              const isDone = r?.done
                              const isLate = r?.date && !isDone && new Date(r.date) < new Date()
                              const hasDate = r?.date
                              const color = isDone ? '#22c55e' : isLate ? '#ef4444' : hasDate ? '#f59e0b' : 'rgba(255,255,255,0.2)'
                              const isOpen = relancePopover?.schoolId === school._id && relancePopover?.index === i
                              return (
                                <div key={i} style={{ position: 'relative' }}>
                                  <span
                                    onClick={e => { if (canManage) setRelancePopover(isOpen ? null : { schoolId: school._id, index: i, anchor: e.currentTarget as HTMLElement }) }}
                                    title={hasDate ? `R${i + 1} — ${new Date(r!.date!).toLocaleDateString('fr-FR')}${r?.note ? ` · ${r.note}` : ''}` : `R${i + 1} — cliquer pour planifier`}
                                    style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `2px solid ${color}`, color, background: isDone ? '#22c55e18' : isLate ? '#ef444418' : hasDate ? '#f59e0b18' : 'transparent', cursor: canManage ? 'pointer' : 'default', flexShrink: 0 }}>
                                    {isDone ? '✓' : i + 1}
                                  </span>
                                  {isOpen && canManage && (
                                    <RelancePopover
                                      relance={school.relances?.[i] ?? { ...EMPTY_RELANCE }}
                                      index={i}
                                      anchorEl={relancePopover?.anchor ?? null}
                                      onSave={updated => {
                                        const next = [0, 1, 2].map(j => school.relances?.[j] ?? { ...EMPTY_RELANCE })
                                        next[i] = updated
                                        onPatch(school._id, { relances: next })
                                      }}
                                      onClose={() => setRelancePopover(null)}
                                    />
                                  )}
                                </div>
                              )
                            })}
                            {totalRelances > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{doneRelances}/{totalRelances}</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        {canManage && (
                          <td className="crm-td crm-td-actions" onClick={e => e.stopPropagation()}>
                            <div className="crm-row-actions">
                              <CustomSelect
                                className="crm-inline-select crm-inline-status"
                                value={school.status}
                                onChange={v => onPatch(school._id, { status: v })}
                                options={ARROW_STATUSES.map(s => ({ value: s.key, label: s.label }))}
                              />
                              <button className="crm-btn-notes" onClick={() => onEdit(school)} title="Modifier">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              {deleteConfirm === school._id ? (
                                <div className="crm-delete-confirm">
                                  <button className="crm-btn-confirm-delete" onClick={() => { onDelete(school._id); setDeleteConfirm(null) }}>Oui</button>
                                  <button className="crm-btn-cancel-delete" onClick={() => setDeleteConfirm(null)}>Non</button>
                                </div>
                              ) : (
                                <button className="crm-btn-delete" onClick={() => setDeleteConfirm(school._id)} title="Supprimer">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
