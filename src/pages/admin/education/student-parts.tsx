/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, X, Trash2, Upload } from 'lucide-react'
import {
  listStudents,
  createStudent,
  importStudentsCsv,
  deleteStudent,
  studentDisplayName,
  type EducationStudent,
  type EducationStudentImportResult,
} from '../../../services/education'
import { StudentProfileDrawer } from './StudentProfileDrawer'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

const STUDENT_STATUS_LABEL: Record<EducationStudent['status'], string> = {
  ACTIVE: 'Actif',
  PAUSE: 'En pause',
  ABANDON: 'Abandon',
  TERMINE: 'Terminé',
}

const STUDENTS_PAGE_SIZE = 25

export function StudentsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [students, setStudents] = useState<EducationStudent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [profileStudent, setProfileStudent] = useState<EducationStudent | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await listStudents({
        classId,
        search: search.trim() || undefined,
        limit: STUDENTS_PAGE_SIZE,
        skip: page * STUDENTS_PAGE_SIZE,
        sort: 'lastName firstName',
      })
      setError(null)
      setStudents(r.students)
      setTotal(r.total)
      if (page > 0 && r.students.length === 0 && r.total > 0)
        setPage(Math.max(0, Math.ceil(r.total / STUDENTS_PAGE_SIZE) - 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les étudiants')
    }
  }, [classId, page, search])

  useEffect(() => {
    // Pagination and search are server-side; refresh when their request parameters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>
          {total} étudiant{total > 1 ? 's' : ''}
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

      <div className="edu-row" style={{ marginBottom: 12 }}>
        <label className="edu-search" style={{ flex: 1 }}>
          <Search size={14} aria-hidden="true" />
          <input
            className="edu-input"
            aria-label="Rechercher un étudiant"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Rechercher par nom ou email…"
          />
        </label>
      </div>
      {error && (
        <div className="edu-empty" role="alert">
          {error}
        </div>
      )}

      {!error && students.length === 0 ? (
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
            {students.map((s) => (
              <tr
                key={s._id}
                onClick={() => setProfileStudent(s)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setProfileStudent(s)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Ouvrir la fiche de ${studentDisplayName(s)}`}
                style={{ cursor: 'pointer' }}
              >
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
                  <span className="edu-pill">{STUDENT_STATUS_LABEL[s.status]}</span>
                </td>
                <td>
                  <button
                    className="edu-btn-icon"
                    title="Supprimer"
                    aria-label={`Supprimer ${studentDisplayName(s)}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (!confirm(`Supprimer ${studentDisplayName(s)} ?`)) return
                      try {
                        await deleteStudent(s._id)
                        await refresh()
                        onChanged()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Suppression impossible')
                      }
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

      {total > STUDENTS_PAGE_SIZE && (
        <div className="edu-row between" style={{ marginTop: 12 }} aria-label="Pagination des étudiants">
          <button className="edu-btn ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
            Précédent
          </button>
          <span className="edu-sub">
            Page {page + 1} sur {Math.ceil(total / STUDENTS_PAGE_SIZE)}
          </span>
          <button
            className="edu-btn ghost"
            disabled={(page + 1) * STUDENTS_PAGE_SIZE >= total}
            onClick={() => setPage((current) => current + 1)}
          >
            Suivant
          </button>
        </div>
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
      {profileStudent && (
        <StudentProfileDrawer
          student={profileStudent}
          onClose={() => setProfileStudent(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export function QuickAddStudent({
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
      <div
        className="edu-drawer"
        style={{ width: 'min(480px, 90vw)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-student-title"
      >
        <div className="edu-drawer-head">
          <h2 id="quick-add-student-title" className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Nouvel étudiant
          </h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer le formulaire étudiant">
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
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Nom</label>
              <input
                className="edu-input"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Email</label>
            <input
              className="edu-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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

export function CsvImport({
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
  const [preview, setPreview] = useState<EducationStudentImportResult | null>(null)

  async function runImport(dryRun: boolean) {
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      const response = await importStudentsCsv(classId, csv, { dryRun })
      if (dryRun) {
        setPreview(response)
      } else {
        setResult(
          `${response.inserted || 0} étudiant${response.inserted === 1 ? '' : 's'} importé${response.inserted === 1 ? '' : 's'}` +
            (response.skipped
              ? `, ${response.skipped} ligne${response.skipped > 1 ? 's' : ''} ignorée${response.skipped > 1 ? 's' : ''}.`
              : '.'),
        )
        setPreview(null)
        setTimeout(onImported, 600)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div
        className="edu-drawer"
        style={{ width: 'min(640px, 96vw)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
      >
        <div className="edu-drawer-head">
          <h2 id="csv-import-title" className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Importer un CSV
          </h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer l’import CSV">
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <p className="edu-sub" style={{ marginTop: 0 }}>
            Première ligne = en-têtes. Colonnes reconnues : <code>prenom</code>, <code>nom</code>, <code>email</code>,{' '}
            <code>telephone</code>, <code>id</code>. Séparateur : <code>,</code> <code>;</code> ou tabulation.
          </p>
          <textarea
            className="edu-textarea"
            style={{ minHeight: 240, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value)
              setPreview(null)
              setResult(null)
            }}
            aria-label="Contenu CSV à importer"
          />
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 8 }}>{error}</div>}
          {result && <div style={{ color: '#22C55E', fontSize: 13, marginTop: 8 }}>{result}</div>}
          {preview && (
            <div className="edu-empty" style={{ marginTop: 10 }}>
              <strong>
                {preview.valid || 0} ligne{preview.valid === 1 ? '' : 's'} prête{preview.valid === 1 ? '' : 's'}
              </strong>
              <div className="edu-sub">
                {preview.totalRows || 0} ligne{preview.totalRows === 1 ? '' : 's'} analysée
                {preview.totalRows === 1 ? '' : 's'} · {preview.skipped} ignorée{preview.skipped > 1 ? 's' : ''}
              </div>
              {preview.errors.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {preview.errors.slice(0, 8).map((rowError) => (
                    <li key={`${rowError.row}-${rowError.error}`}>
                      Ligne {rowError.row} : {rowError.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Fermer
          </button>
          <button className="edu-btn ghost" disabled={importing} onClick={() => runImport(true)}>
            {importing ? 'Analyse…' : 'Prévisualiser'}
          </button>
          <button className="edu-btn" disabled={importing || !preview?.valid} onClick={() => runImport(false)}>
            {importing ? 'Import…' : `Importer ${preview?.valid || 0}`}
          </button>
        </div>
      </div>
    </>
  )
}
