import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { exportToCsv } from '../../../lib/exportCsv'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import ConfirmModal from '../../../components/ConfirmModal'
import type { Lead, LeadFormData, PipelineColumn, AdminUser, CrmStatusConfig } from '../../../types/crm.types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

import PipelineColumnComponent from './PipelineColumn'
import LeadTable from './LeadTable'
import LeadFormPanel from './LeadFormPanel'
import LeadDetailModal from './LeadDetailModal'
import {
  CRM_STATUSES,
  CRM_PRIORITIES,
  STATUS_MAP,
  PRIORITY_MAP,
  EMPTY_FORM,
} from './constants'

const CrmBoard = () => {
  const { user } = useAuth()
  const canManageCrm = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const [columns, setColumns] = useState<PipelineColumn[]>([])
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [viewMode, setViewMode] = useState<string>('table')
  const [showForm, setShowForm] = useState<boolean>(false)

  // Table view state
  const [search, setSearch] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [sortField, setSortField] = useState<string>('updatedAt')
  const [sortDir, setSortDir] = useState<string>('desc')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [form, setForm] = useState<LeadFormData>({ ...EMPTY_FORM })

  const [expandedLead, setExpandedLead] = useState<Lead | null>(null)

  const adminsById = useMemo(() => {
    const map: Record<string, AdminUser> = {}
    admins.forEach((admin) => {
      map[admin._id] = admin
    })
    return map
  }, [admins])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [pipelineRes, adminRes] = await Promise.all([
        apiFetch<{ columns?: PipelineColumn[] }>('/api/admin/crm/pipeline'),
        apiFetch<{ users?: AdminUser[] }>('/api/admin/admins'),
      ])
      setColumns(pipelineRes.columns || [])
      setAdmins(adminRes.users || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement CRM')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Flatten all leads from columns
  const allLeads = useMemo(() => {
    const leads: Lead[] = []
    columns.forEach((col) => {
      ;(col.leads || []).forEach((lead) => leads.push(lead))
    })
    return leads
  }, [columns])

  // Filtered & sorted leads for table view
  const filteredLeads = useMemo(() => {
    let leads = [...allLeads]

    if (search) {
      const q = search.toLowerCase()
      leads = leads.filter(
        (l) =>
          (l.company || '').toLowerCase().includes(q) ||
          (l.contactName || '').toLowerCase().includes(q) ||
          (l.contactEmail || '').toLowerCase().includes(q)
      )
    }
    if (filterStatus) leads = leads.filter((l) => l.status === filterStatus)
    if (filterPriority) leads = leads.filter((l) => l.priority === filterPriority)
    if (filterAssignee) leads = leads.filter((l) => l.assignedTo === filterAssignee)

    leads.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let va: any = (a as any)[sortField]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let vb: any = (b as any)[sortField]
      if (sortField === 'budget') {
        va = va ?? -1
        vb = vb ?? -1
      }
      if (sortField === 'status') {
        va = CRM_STATUSES.findIndex((s) => s.key === va)
        vb = CRM_STATUSES.findIndex((s) => s.key === vb)
      }
      if (sortField === 'priority') {
        va = CRM_PRIORITIES.findIndex((p) => p.key === va)
        vb = CRM_PRIORITIES.findIndex((p) => p.key === vb)
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return leads
  }, [allLeads, search, filterStatus, filterPriority, filterAssignee, sortField, sortDir])

  // Group leads by status for Monday.com style
  const groupedLeads = useMemo(() => {
    const groups: (CrmStatusConfig & { leads: Lead[] })[] = []
    CRM_STATUSES.forEach((status) => {
      const leads = filteredLeads.filter((l) => l.status === status.key)
      if (leads.length > 0 || !filterStatus) {
        groups.push({ ...status, leads })
      }
    })
    return groups
  }, [filteredLeads, filterStatus])

  const handleCreateLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        company: form.company,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        source: form.source,
        budget: form.budget === '' ? null : Number(form.budget),
        priority: form.priority,
        status: form.status,
        nextActionAt: form.nextActionAt ? new Date(form.nextActionAt).toISOString() : null,
        notes: form.notes,
        serviceType: form.serviceType,
        leadTemperature: form.leadTemperature,
        interactionNotes: form.interactionNotes,
        assignedTo: form.assignedTo || null,
      }
      await apiFetch('/api/admin/crm/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setForm({ ...EMPTY_FORM })
      setShowForm(false)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur création lead')
    }
  }

  const handleUpdateLead = async (leadId: string, patch: Record<string, unknown>) => {
    setError('')
    try {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour lead')
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    setError('')
    try {
      await apiFetch(`/api/admin/crm/leads/${leadId}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression lead')
    }
  }

  const [converting, setConverting] = useState<string | null>(null)
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)

  const handleConvertToClient = (lead: Lead) => {
    setConvertTarget(lead)
  }

  const confirmConvertToClient = async () => {
    if (!convertTarget) return
    const lead = convertTarget
    setConvertTarget(null)
    setError('')
    setConverting(lead._id)
    try {
      const res = await apiFetch<{ client?: { name: string } }>(`/api/admin/crm/leads/${lead._id}/convert-to-client`, { method: 'POST' })
      if (res.client) {
        setError('')
        await load()
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur conversion en client')
    } finally {
      setConverting(null)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault()
    const leadId = event.dataTransfer.getData('text/plain')
    if (!leadId) return
    await handleUpdateLead(leadId, { status })
  }

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, leadId: string) => {
    event.dataTransfer.setData('text/plain', leadId)
  }

  const toggleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField]
  )

  const toggleGroup = useCallback((statusKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [statusKey]: !prev[statusKey] }))
  }, [])

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterStatus('')
    setFilterPriority('')
    setFilterAssignee('')
  }, [])

  const totalLeads = allLeads.length
  const activeFilters = [filterStatus, filterPriority, filterAssignee, search].filter(Boolean).length

  return (
    <div className="portal-container crm-page-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>CRM & Prospection</span>
        </div>
        <div className="admin-header">
          <div>
            <h1>CRM & Prospection</h1>
            <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0', fontSize: '15px' }}>
              Pipeline commercial avec attribution, relances et automatisations
            </p>
          </div>
          <div className="admin-actions portal-actions-reveal" style={{ gap: 8 }}>
            {/* View toggle */}
            <div className="crm-view-toggle">
              <button
                className={`crm-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Vue tableau"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
              <button
                className={`crm-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                onClick={() => setViewMode('kanban')}
                title="Vue Kanban"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="6" height="18" rx="1" />
                  <rect x="9" y="3" width="6" height="12" rx="1" />
                  <rect x="16" y="3" width="6" height="15" rx="1" />
                </svg>
              </button>
            </div>
            <button
              className="portal-button secondary portal-action-link"
              type="button"
              title="Exporter CSV"
              onClick={() => {
                const headers = ['Entreprise', 'Contact', 'Email', 'Statut', 'Priorite', 'Budget', 'Assigne']
                const rows = filteredLeads.map((lead) => [
                  lead.company || '',
                  lead.contactName || '',
                  lead.contactEmail || '',
                  STATUS_MAP[lead.status]?.label || lead.status || '',
                  PRIORITY_MAP[lead.priority || '']?.label || lead.priority || '',
                  lead.budget != null ? String(lead.budget) : '',
                  adminsById[lead.assignedTo || '']?.name || 'Non assigne',
                ])
                exportToCsv('leads.csv', headers, rows)
              }}
            >
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </span>
              <span className="portal-action-label">Exporter CSV</span>
            </button>
            {canManageCrm && (
              <button className="portal-button" onClick={() => setShowForm((v) => !v)}>
                {showForm ? 'Masquer le formulaire' : '+ Nouveau lead'}
              </button>
            )}
            {canManageCrm && (
              <Link className="crm-settings-link" to="/admin/crm/settings" title="Paramètres des automatisations">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Automatisations
              </Link>
            )}
            <Link className="portal-button secondary portal-action-link" to="/admin/comptes-admin" title="Comptes admin">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <span className="portal-action-label">Comptes admin</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      {/* Lead creation form (collapsible) */}
      {showForm && canManageCrm && (
        <LeadFormPanel
          form={form}
          admins={admins}
          isSuperAdmin={user?.role === 'SUPER_ADMIN'}
          canManageCrm={canManageCrm}
          onFormChange={setForm}
          onSubmit={handleCreateLead}
        />
      )}

      {/* Main content area */}
      <div className="portal-card" style={{ marginTop: 24, padding: viewMode === 'table' ? 0 : undefined, overflow: 'visible' }}>
        {loading ? (
          <div className="admin-loading" style={{ padding: 32 }}>Chargement du pipeline...</div>
        ) : viewMode === 'kanban' ? (
          <div className="crm-board">
            {columns.map((column) => (
              <PipelineColumnComponent
                key={column.status}
                column={column}
                admins={admins}
                adminsById={adminsById}
                canManageCrm={canManageCrm}
                converting={converting}
                onUpdateLead={handleUpdateLead}
                onConvertToClient={handleConvertToClient}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        ) : (
          <LeadTable
            groupedLeads={groupedLeads}
            filteredLeads={filteredLeads}
            totalLeads={totalLeads}
            search={search}
            filterStatus={filterStatus}
            filterPriority={filterPriority}
            filterAssignee={filterAssignee}
            sortField={sortField}
            sortDir={sortDir}
            collapsedGroups={collapsedGroups}
            admins={admins}
            adminsById={adminsById}
            canManageCrm={canManageCrm}
            converting={converting}
            deleteConfirm={deleteConfirm}
            activeFilters={activeFilters}
            isSuperAdmin={user?.role === 'SUPER_ADMIN'}
            onSearchChange={setSearch}
            onFilterStatusChange={setFilterStatus}
            onFilterPriorityChange={setFilterPriority}
            onFilterAssigneeChange={setFilterAssignee}
            onClearFilters={clearFilters}
            onToggleSort={toggleSort}
            onToggleGroup={toggleGroup}
            onUpdateLead={handleUpdateLead}
            onConvertToClient={handleConvertToClient}
            onDeleteLead={handleDeleteLead}
            onSetDeleteConfirm={setDeleteConfirm}
            onExpandLead={setExpandedLead}
          />
        )}
      </div>

      {/* Modal for interaction notes */}
      {expandedLead && (
        <LeadDetailModal
          lead={expandedLead}
          admins={admins}
          canManageCrm={canManageCrm}
          converting={converting}
          onClose={() => setExpandedLead(null)}
          onLeadChange={setExpandedLead}
          onUpdateLead={handleUpdateLead}
          onConvertToClient={handleConvertToClient}
        />
      )}

      <ConfirmModal
        isOpen={convertTarget !== null}
        title="Convertir en client"
        message={convertTarget ? `Convertir "${convertTarget.company}" en client ?` : ''}
        confirmLabel="Convertir"
        cancelLabel="Annuler"
        variant="info"
        onConfirm={confirmConvertToClient}
        onCancel={() => setConvertTarget(null)}
      />
    </div>
  )
}

export default CrmBoard
