import { useCallback, useEffect, useState } from 'react'
import {
  listSessions,
  formatDate,
  SESSION_STATUS_LABEL,
  type EducationClass,
  type EducationSession,
} from '@/services/education'
import { SessionDetailDrawer } from '../SessionDetailDrawer'

export default function SessionsView({
  classes,
  incomingOpenId,
  onCloseIncomingOpen,
}: {
  classes: EducationClass[]
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
}) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const refreshSessions = useCallback(() => {
    listSessions(filterClass ? { classId: filterClass } : {})
      .then(r => {
        setItems(r.sessions)
        setError(null)
      })
      .catch(err =>
        setError(err instanceof Error ? err.message : 'Impossible de charger les séances'),
      )
  }, [filterClass])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (incomingOpenId) {
      setOpenSessionId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  return (
    <>
      <div>
        <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h1 className="edu-h1">Séances</h1>
          <select
            className="edu-select"
            style={{ width: 220 }}
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <p className="edu-sub">
          {items.length} séance{items.length > 1 ? 's' : ''}
        </p>
        {items.length === 0 ? (
          <div className="edu-empty">
            <div className="edu-empty-icon">📅</div>
            <div>
              {filterClass ? 'Aucune séance pour cette classe.' : 'Aucune séance encore.'}
            </div>
            <div className="edu-empty-sub">
              Les séances apparaîtront ici dès qu'elles sont planifiées depuis une classe.
            </div>
          </div>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Classe</th>
                <th>Séance</th>
                <th>Statut</th>
                <th>Présence</th>
              </tr>
            </thead>
            <tbody>
              {items.map(s => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const present = s.attendance.filter(a => a.state === 'PRESENT').length
                return (
                  <tr
                    key={s._id}
                    onClick={() => setOpenSessionId(s._id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{formatDate(s.date, true)}</td>
                    <td>
                      {cls && (
                        <span className="edu-pill">
                          <span
                            className="edu-pill-dot"
                            style={{ background: cls.color || '#22C55E' }}
                          />
                          {cls.name}
                        </span>
                      )}
                    </td>
                    <td>{s.title}</td>
                    <td>
                      <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td>
                      {present} / {s.attendance.length}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
          onChanged={refreshSessions}
        />
      )}
    </>
  )
}
