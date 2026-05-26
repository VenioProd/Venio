import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import {
  listStudents,
  createStudent,
  importStudentsCsv,
  deleteStudent,
  studentDisplayName,
  type EducationStudent,
} from '@/services/education'

export default function StudentsTab({
  classId,
  onChanged,
}: {
  classId: string
  onChanged: () => void
}) {
  const [students, setStudents] = useState<EducationStudent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const refresh = useCallback(async () => {
    const r = await listStudents({ classId })
    setStudents(r.students)
  }, [classId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>
          {students.length} étudiant{students.length > 1 ? 's' : ''}
        </strong>
        <div className="edu-row" style={{ gap: 6 }}>
          <button className="edu-btn ghost" onClick={() => setShowImport(true)}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="edu-btn" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="edu-empty">Aucun étudiant. Ajoute-en un ou importe ta liste en CSV.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Présence</th>
              <th>Moy.</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s._id}>
                <td>{studentDisplayName(s)}</td>
                <td style={{ color: 'rgba(255,255,255,0.65)' }}>{s.email || '—'}</td>
                <td>
                  <span style={{ color: '#22C55E' }}>{s.attendanceCount}</span>
                  {' / '}
                  <span style={{ color: '#EF4444' }}>{s.absenceCount}</span>
                  {' / '}
                  <span style={{ color: '#F59E0B' }}>{s.lateCount}</span>
                </td>
                <td>{s.averageGrade != null ? s.averageGrade.toFixed(1) : '—'}</td>
                <td>
                  <span className="edu-pill">{s.status}</span>
                </td>
                <td>
                  <button
                    className="edu-btn-icon"
                    title="Supprimer"
                    onClick={async () => {
                      if (!confirm(`Supprimer ${studentDisplayName(s)} ?`)) return
                      await deleteStudent(s._id)
                      await refresh()
                      onChanged()
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <QuickAddStudent
          classId={classId}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {showImport && (
        <CsvImport
          classId={classId}
          onClose={() => setShowImport(false)}
          onImported={async () => {
            setShowImport(false)
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function QuickAddStudent({
  classId,
  onClose,
  onSaved,
}: {
  classId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(480px, 90vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Nouvel étudiant
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Prénom</label>
              <input
                className="edu-input"
                autoFocus
                value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Nom</label>
              <input
                className="edu-input"
                value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Email</label>
            <input
              className="edu-input"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="edu-btn"
            disabled={!form.lastName.trim() || saving}
            onClick={async () => {
              setSaving(true)
              setError(null)
              try {
                await createStudent({ classId, ...form })
                onSaved()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </>
  )
}

function CsvImport({
  classId,
  onClose,
  onImported,
}: {
  classId: string
  onClose: () => void
  onImported: () => void
}) {
  const [csv, setCsv] = useState('prenom,nom,email\n')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(640px, 96vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Importer un CSV
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <p className="edu-sub" style={{ marginTop: 0 }}>
            Première ligne = en-têtes. Colonnes reconnues : <code>prenom</code>,{' '}
            <code>nom</code>, <code>email</code>, <code>telephone</code>, <code>id</code>.
            Séparateur : <code>,</code> <code>;</code> ou tabulation.
          </p>
          <textarea
            className="edu-textarea"
            style={{ minHeight: 240, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            value={csv}
            onChange={e => setCsv(e.target.value)}
          />
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 8 }}>{error}</div>}
          {result && <div style={{ color: '#22C55E', fontSize: 13, marginTop: 8 }}>{result}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            className="edu-btn"
            disabled={importing}
            onClick={async () => {
              setImporting(true)
              setError(null)
              setResult(null)
              try {
                const r = await importStudentsCsv(classId, csv)
                setResult(
                  `${r.inserted} étudiant${r.inserted > 1 ? 's' : ''} importé${
                    r.inserted > 1 ? 's' : ''
                  }.`,
                )
                setTimeout(onImported, 600)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Erreur')
              } finally {
                setImporting(false)
              }
            }}
          >
            {importing ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>
    </>
  )
}
