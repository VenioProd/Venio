import React, { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { exportToCsv } from '../../../lib/exportCsv'
import ConfirmModal from '../../../components/ConfirmModal'
import type { ArrowSchool, ArrowSchoolFormData } from '../../../types/arrow.types'
import SchoolTable from './SchoolTable'
import SchoolFormPanel from './SchoolFormPanel'
import SchoolDetailModal from './SchoolDetailModal'
import { ARROW_STATUSES, EMPTY_FORM, STATUS_MAP } from './constants'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

interface AdminUser { _id: string; name: string; email: string }

export default function ArrowProspection() {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_CRM)

  const [schools, setSchools] = useState<ArrowSchool[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ArrowSchool | null>(null)
  const [form, setForm] = useState<ArrowSchoolFormData>({ ...EMPTY_FORM })
  const [selected, setSelected] = useState<ArrowSchool | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ schools: ArrowSchool[]; admins: AdminUser[] }>('/api/admin/arrow-prospection')
      setSchools(data.schools)
      setAdmins(data.admins)
    } catch (err: any) {
      setError(err.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = schools.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (filterAssignee && s.assignedTo?._id !== filterAssignee) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.city.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const openAdd = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, assignedTo: user?._id || '' })
    setShowForm(true)
  }

  const openEdit = (school: ArrowSchool) => {
    setEditing(school)
    setForm({
      name: school.name,
      schoolType: school.schoolType,
      city: school.city,
      region: school.region,
      studentCount: school.studentCount !== null ? String(school.studentCount) : '',
      emailGeneral: school.emailGeneral,
      contactName: school.contactName,
      contactRole: school.contactRole,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      status: school.status,
      temperature: school.temperature,
      source: school.source,
      notes: school.notes,
      nextActionAt: school.nextActionAt ? school.nextActionAt.slice(0, 10) : '',
      lastContactAt: school.lastContactAt ? school.lastContactAt.slice(0, 10) : '',
      assignedTo: school.assignedTo?._id || '',
      relances: school.relances ?? [],
    })
    setShowForm(true)
    setSelected(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        studentCount: form.studentCount ? Number(form.studentCount) : null,
        nextActionAt: form.nextActionAt || null,
        lastContactAt: form.lastContactAt || null,
        assignedTo: form.assignedTo || null,
      }
      if (editing) {
        await apiFetch(`/api/admin/arrow-prospection/${editing._id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        await apiFetch('/api/admin/arrow-prospection', { method: 'POST', body: JSON.stringify(payload) })
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/admin/arrow-prospection/${id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await load()
    } catch (err: any) {
      setError(err.message || 'Erreur suppression')
    }
  }

  const handlePatch = async (id: string, patch: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/admin/arrow-prospection/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
    } catch {}
  }

  const handleStatusChange = async (school: ArrowSchool, newStatus: string) => {
    try {
      await apiFetch(`/api/admin/arrow-prospection/${school._id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      await load()
    } catch {}
  }

  const handleExport = () => {
    const headers = ['Nom', 'Type', 'Ville', 'Région', 'Nb élèves', 'Email général', 'Contact', 'Poste contact', 'Email contact', 'Téléphone', 'Statut', 'Température', 'Source', 'Commercial', 'Prochain contact', 'Notes']
    const rows = filtered.map(s => [
      s.name, s.schoolType, s.city, s.region,
      s.studentCount !== null ? String(s.studentCount) : '',
      s.emailGeneral, s.contactName, s.contactRole, s.contactEmail, s.contactPhone,
      s.status, s.temperature, s.source, s.assignedTo?.name ?? '',
      s.nextActionAt ? new Date(s.nextActionAt).toLocaleDateString('fr-FR') : '',
      s.notes,
    ])
    exportToCsv('arrow-prospection.csv', headers, rows)
  }

  return (
    <div className="portal-container crm-page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎯</span> Arrow — Prospection écoles
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {schools.length} école{schools.length !== 1 ? 's' : ''} · {schools.filter(s => s.status === 'SIGNE').length} signée{schools.filter(s => s.status === 'SIGNE').length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} className="portal-button secondary" style={{ fontSize: 13 }}>Export CSV</button>
          {canManage && (
            <button onClick={openAdd} className="portal-button" style={{ fontSize: 13 }}>+ Ajouter une école</button>
          )}
        </div>
      </div>

      {error && <div className="admin-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="portal-input"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <select className="portal-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Tous les statuts</option>
          {ARROW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="portal-input" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">Tous les commerciaux</option>
          {admins.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['table', 'kanban'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                background: viewMode === v ? 'var(--primary)' : 'var(--bg-card)', color: viewMode === v ? '#fff' : 'var(--text-secondary)' }}>
              {v === 'table' ? 'Tableau' : 'Kanban'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>Chargement...</div>
      ) : viewMode === 'table' ? (
        <div className="admin-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <SchoolTable
            schools={filtered}
            admins={admins}
            onEdit={openEdit}
            onDelete={id => setDeleteConfirm(id)}
            onSelect={setSelected}
            onPatch={handlePatch}
            canManage={canManage}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 16 }}>
          {ARROW_STATUSES.map(col => {
            const colSchools = filtered.filter(s => s.status === col.key)
            return (
              <div key={col.key} style={{ minWidth: 220, flex: '0 0 220px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: col.color }}>{col.label}</span>
                  <span style={{ fontSize: 12, background: `${col.color}22`, color: col.color, borderRadius: 10, padding: '2px 8px' }}>{colSchools.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colSchools.map(school => (
                    <div key={school._id}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px', cursor: 'pointer' }}
                      onClick={() => setSelected(school)}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{school.name}</div>
                      {school.city && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{school.city}</div>}
                      {school.contactName && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{school.contactName}</div>}
                      {school.assignedTo && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>👤 {school.assignedTo.name}</div>
                      )}
                      {school.nextActionAt && (
                        <div style={{ fontSize: 11, marginTop: 4, color: new Date(school.nextActionAt) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                          📅 {new Date(school.nextActionAt).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                      {canManage && (
                        <select
                          value={school.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleStatusChange(school, e.target.value)}
                          style={{ marginTop: 8, fontSize: 11, width: '100%', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', padding: '3px 4px' }}
                        >
                          {ARROW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Panneau formulaire */}
      {showForm && (
        <div>
          <SchoolFormPanel
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            loading={saving}
            editing={editing}
            admins={admins}
          />
        </div>
      )}

      {/* Détail */}
      {selected && (
        <SchoolDetailModal
          school={selected}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          canManage={canManage}
        />
      )}

      {/* Confirmation suppression */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Supprimer cette école"
          message="Cette action est irréversible."
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => { handleDelete(deleteConfirm) }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
