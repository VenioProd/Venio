import type React from 'react'
import { apiFetch } from '../../../lib/api'

interface AdminUser {
  _id: string
  name: string
  role: string
  email?: string
}

interface Props {
  admins: AdminUser[]
  notifRecipients: { _id: string; name: string; email: string; role: string }[]
  setNotifRecipients: React.Dispatch<React.SetStateAction<{ _id: string; name: string; email: string; role: string }[]>>
  notifSaving: boolean
  setNotifSaving: (v: boolean) => void
  notifSuccess: boolean
  setNotifSuccess: (v: boolean) => void
}

export default function ParametresTab({
  admins,
  notifRecipients,
  setNotifRecipients,
  notifSaving,
  setNotifSaving,
  notifSuccess,
  setNotifSuccess,
}: Props) {
  const allAdminUsers = admins.filter((a) => a.role === 'SUPER_ADMIN' || a.role === 'RH' || a.role === 'ADMIN')
  const selectedIds = new Set(notifRecipients.map((r) => r._id))

  const toggle = (id: string) => {
    setNotifRecipients((prev) =>
      prev.find((r) => r._id === id) ? prev.filter((r) => r._id !== id) : [...prev, admins.find((a) => a._id === id) as unknown as { _id: string; name: string; email: string; role: string }],
    )
  }

  const save = async () => {
    setNotifSaving(true)
    setNotifSuccess(false)
    try {
      await apiFetch('/api/admin/interns/settings/report-notifs', {
        method: 'PATCH',
        body: JSON.stringify({ recipientIds: Array.from(selectedIds) }),
      })
      setNotifSuccess(true)
      setTimeout(() => setNotifSuccess(false), 3000)
    } catch {
      /* silent */
    } finally {
      setNotifSaving(false)
    }
  }

  return (
    <div className="portal-card" style={{ maxWidth: 600, marginTop: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Notifications — rapports d'activité</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Choisissez qui reçoit un email et une notification quand un membre soumet un rapport. Si aucun destinataire n'est sélectionné, seuls les
        Super Admins sont notifiés.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {allAdminUsers.map((a) => (
          <label
            key={a._id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              padding: '10px 14px',
              borderRadius: 10,
              background: selectedIds.has(a._id) ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selectedIds.has(a._id) ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.08)'}`,
              transition: 'all 0.15s',
            }}
          >
            <input type="checkbox" checked={selectedIds.has(a._id)} onChange={() => toggle(a._id)} style={{ accentColor: '#0ea5e9', width: 16, height: 16 }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
            <span
              style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {a.role === 'SUPER_ADMIN' ? 'Super Admin' : a.role}
            </span>
          </label>
        ))}
      </div>
      {notifSuccess && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>Enregistré</p>}
      <button className="portal-button" onClick={save} disabled={notifSaving} style={{ alignSelf: 'flex-start' }}>
        {notifSaving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  )
}
