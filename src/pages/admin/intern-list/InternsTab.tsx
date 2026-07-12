import { useMemo, type Dispatch, type SetStateAction } from 'react'
import InternCard from './InternCard'
import InternForm from './InternForm'
import { STATUS_CONFIG, type AdminUser, type Intern, type InternFormData } from './types'

interface Props {
  admins: AdminUser[]
  interns: Intern[]
  editingIntern: Intern | null
  form: InternFormData
  setForm: Dispatch<SetStateAction<InternFormData>>
  showForm: boolean
  submitting: boolean
  filterStatus: string
  setFilterStatus: Dispatch<SetStateAction<string>>
  expandedIntern: string | null
  setExpandedIntern: Dispatch<SetStateAction<string | null>>
  isSuperAdmin: boolean
  resendingCredentials: string | null
  onCreate: () => void
  onUpdate: () => void
  onCancelForm: () => void
  onEdit: (intern: Intern) => void
  onStatusChange: (internId: string, status: string) => void
  onTypeChange: (internId: string, type: 'STAGIAIRE' | 'ALTERNANT') => void
  onResendCredentials: (internId: string) => void
  onDelete: (internId: string) => void
}

export default function InternsTab({
  admins,
  interns,
  editingIntern,
  form,
  setForm,
  showForm,
  submitting,
  filterStatus,
  setFilterStatus,
  expandedIntern,
  setExpandedIntern,
  isSuperAdmin,
  resendingCredentials,
  onCreate,
  onUpdate,
  onCancelForm,
  onEdit,
  onStatusChange,
  onTypeChange,
  onResendCredentials,
  onDelete,
}: Props) {
  const filteredInterns = useMemo(
    () => interns.filter((intern) => filterStatus === 'all' || intern.status === filterStatus),
    [filterStatus, interns],
  )

  return (
    <>
      <div className="ticket-stats" style={{ marginBottom: 16 }}>
        {['all', 'ACTIF', 'TERMINE', 'ANNULE'].map((status) => {
          const label = status === 'all' ? 'Tous' : STATUS_CONFIG[status]?.label || status
          const color = status === 'all' ? 'var(--primary)' : STATUS_CONFIG[status]?.color || '#fff'
          const count = status === 'all' ? interns.length : interns.filter((intern) => intern.status === status).length
          return (
            <button
              key={status}
              className={`ticket-stat-card ${filterStatus === status ? 'active' : ''}`}
              style={{ borderColor: filterStatus === status ? color : 'transparent' }}
              onClick={() => setFilterStatus(status)}
            >
              <span style={{ color, fontWeight: 700, fontSize: 22 }}>{count}</span>{' '}
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{label}</span>
            </button>
          )
        })}
      </div>

      {showForm && (
        <InternForm
          admins={admins}
          editingIntern={editingIntern}
          form={form}
          setForm={setForm}
          submitting={submitting}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onCancel={onCancelForm}
        />
      )}

      <div className="ticket-list">
        {filteredInterns.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun membre</p>
        )}
        {filteredInterns.map((intern) => (
          <InternCard
            key={intern._id}
            intern={intern}
            expanded={expandedIntern === intern._id}
            isSuperAdmin={isSuperAdmin}
            resendingCredentials={resendingCredentials}
            onToggle={() => setExpandedIntern((current) => (current === intern._id ? null : intern._id))}
            onEdit={onEdit}
            onStatusChange={onStatusChange}
            onTypeChange={onTypeChange}
            onResendCredentials={onResendCredentials}
            onDelete={onDelete}
          />
        ))}
      </div>
    </>
  )
}
