import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  searchEducationAdvanced, fetchSearchFacets,
  ASSIGNMENT_STATUS_LABEL, ASSIGNMENT_KIND_LABEL, SESSION_STATUS_LABEL,
  studentDisplayName, formatDate,
  type AdvancedSearchEntity, type AdvancedSearchResult, type SearchFacets,
  type EducationAssignmentKind,
} from '../../../services/education'

/**
 * VENIO-33 — Recherche pédagogique avancée.
 * Filtres : texte, école, classe, type d'entité, type de devoir, statut, dates.
 * Résultats actionnables : clic sur une carte renvoie un callback typé.
 */

type SelectedRef =
  | { kind: 'class'; id: string }
  | { kind: 'session'; id: string }
  | { kind: 'assignment'; id: string }
  | { kind: 'student'; id: string; classId?: string }
  | { kind: 'note'; id: string }

export function AdvancedSearchView({
  onPickClass,
  onPickAssignment,
  onPickSession,
}: {
  onPickClass?: (id: string) => void
  onPickAssignment?: (id: string) => void
  onPickSession?: (id: string) => void
}) {
  const [facets, setFacets] = useState<SearchFacets | null>(null)
  const [filters, setFilters] = useState({
    q: '',
    entity: 'all' as AdvancedSearchEntity,
    school: '',
    classId: '',
    kind: '' as EducationAssignmentKind | '',
    status: '',
    from: '',
    to: '',
  })
  const [result, setResult] = useState<AdvancedSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSearchFacets().then(setFacets).catch(() => setFacets({ classes: [], schools: [] }))
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await searchEducationAdvanced(filters)
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la recherche')
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Debounce automatique sur changement de filtres
  useEffect(() => {
    const t = setTimeout(search, 250)
    return () => clearTimeout(t)
  }, [search])

  const totalResults = useMemo(() => {
    if (!result) return 0
    return result.counts.classes + result.counts.students + result.counts.sessions + result.counts.assignments + result.counts.notes
  }, [result])

  function reset() {
    setFilters({ q: '', entity: 'all', school: '', classId: '', kind: '', status: '', from: '', to: '' })
  }

  function handlePick(ref: SelectedRef) {
    if (ref.kind === 'class' && onPickClass) onPickClass(ref.id)
    else if (ref.kind === 'assignment' && onPickAssignment) onPickAssignment(ref.id)
    else if (ref.kind === 'session' && onPickSession) onPickSession(ref.id)
    else if (ref.kind === 'student' && ref.classId && onPickClass) onPickClass(ref.classId)
  }

  // Selon entity courante, on propose les statuts pertinents
  const statusOptions: Array<[string, string]> = filters.entity === 'sessions'
    ? Object.entries(SESSION_STATUS_LABEL)
    : filters.entity === 'assignments'
      ? Object.entries(ASSIGNMENT_STATUS_LABEL)
      : []

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="edu-h1">Recherche avancée</h1>
          <p className="edu-sub">
            Filtres combinés sur toutes les entités pédagogiques.
            {result && ` ${totalResults} résultat${totalResults > 1 ? 's' : ''}.`}
          </p>
        </div>
        <button className="edu-btn ghost" onClick={reset}><X size={14} /> Réinitialiser</button>
      </div>

      <div className="edu-search-advanced-filters">
        <div className="edu-form-group">
          <label>Texte</label>
          <input
            className="edu-input"
            value={filters.q}
            placeholder="Mots-clés (titre, contenu)…"
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div className="edu-form-group">
          <label>Type</label>
          <select className="edu-select" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value as AdvancedSearchEntity, status: '' })}>
            <option value="all">Tout</option>
            <option value="classes">Classes</option>
            <option value="students">Étudiants</option>
            <option value="sessions">Séances</option>
            <option value="assignments">Devoirs</option>
            <option value="notes">Notes</option>
          </select>
        </div>
        <div className="edu-form-group">
          <label>École</label>
          <select className="edu-select" value={filters.school} onChange={(e) => setFilters({ ...filters, school: e.target.value, classId: '' })}>
            <option value="">Toutes</option>
            {facets?.schools.map((s) => (
              <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
            ))}
          </select>
        </div>
        <div className="edu-form-group">
          <label>Classe</label>
          <select className="edu-select" value={filters.classId} onChange={(e) => setFilters({ ...filters, classId: e.target.value })}>
            <option value="">Toutes</option>
            {facets?.classes
              .filter((c) => !filters.school || c.school === filters.school)
              .map((c) => (
                <option key={c._id} value={c._id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>
              ))}
          </select>
        </div>
        {(filters.entity === 'assignments' || filters.entity === 'all') && (
          <div className="edu-form-group">
            <label>Kind devoir</label>
            <select className="edu-select" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as EducationAssignmentKind | '' })}>
              <option value="">Tous</option>
              {Object.entries(ASSIGNMENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
        {statusOptions.length > 0 && (
          <div className="edu-form-group">
            <label>Statut</label>
            <select className="edu-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Tous</option>
              {statusOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
        <div className="edu-form-group">
          <label>Depuis</label>
          <input type="date" className="edu-input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div className="edu-form-group">
          <label>Jusqu'au</label>
          <input type="date" className="edu-input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
      </div>

      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={search}>Réessayer</button>
        </div>
      )}

      {loading && <div className="edu-sub" style={{ marginTop: 12 }}>Recherche en cours…</div>}

      {!loading && result && totalResults === 0 && (
        <div className="edu-empty">
          <div className="edu-empty-icon"><Search size={20} /></div>
          <div>Aucun résultat avec ces filtres.</div>
          <div className="edu-empty-sub">Élargis tes critères ou réinitialise.</div>
        </div>
      )}

      {result && result.results.classes.length > 0 && (
        <div className="edu-search-advanced-section">
          <h3>Classes ({result.counts.classes})</h3>
          {result.results.classes.map((c) => (
            <button key={c._id} className="edu-search-advanced-row" onClick={() => handlePick({ kind: 'class', id: c._id })}>
              <span className="edu-side-dot" style={{ background: c.color, width: 10, height: 10 }} />
              <div className="edu-search-advanced-row-main">
                <div className="edu-search-advanced-row-title">{c.name}</div>
                <div className="edu-search-advanced-row-meta">
                  {[c.school, c.level, c.program].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {result && result.results.students.length > 0 && (
        <div className="edu-search-advanced-section">
          <h3>Étudiants ({result.counts.students})</h3>
          {result.results.students.map((s) => {
            const cls = typeof s.classId === 'string' ? null : s.classId
            return (
              <button
                key={s._id}
                className="edu-search-advanced-row"
                onClick={() => handlePick({ kind: 'student', id: s._id, classId: cls?._id })}
              >
                <div className="edu-search-advanced-row-main">
                  <div className="edu-search-advanced-row-title">{studentDisplayName(s)}</div>
                  <div className="edu-search-advanced-row-meta">
                    {s.email ? `${s.email} · ` : ''}
                    {cls?.name ?? '—'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {result && result.results.sessions.length > 0 && (
        <div className="edu-search-advanced-section">
          <h3>Séances ({result.counts.sessions})</h3>
          {result.results.sessions.map((s) => {
            const cls = typeof s.classId === 'string' ? null : s.classId
            return (
              <button key={s._id} className="edu-search-advanced-row" onClick={() => handlePick({ kind: 'session', id: s._id })}>
                <div className="edu-search-advanced-row-main">
                  <div className="edu-search-advanced-row-title">{s.title}</div>
                  <div className="edu-search-advanced-row-meta">
                    {formatDate(s.date, true)} · {SESSION_STATUS_LABEL[s.status]}
                    {cls && ` · ${cls.name}`}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {result && result.results.assignments.length > 0 && (
        <div className="edu-search-advanced-section">
          <h3>Devoirs ({result.counts.assignments})</h3>
          {result.results.assignments.map((a) => {
            const cls = typeof a.classId === 'string' ? null : a.classId
            return (
              <button key={a._id} className="edu-search-advanced-row" onClick={() => handlePick({ kind: 'assignment', id: a._id })}>
                <div className="edu-search-advanced-row-main">
                  <div className="edu-search-advanced-row-title">{a.title}</div>
                  <div className="edu-search-advanced-row-meta">
                    {ASSIGNMENT_KIND_LABEL[a.kind]} · {ASSIGNMENT_STATUS_LABEL[a.status]}
                    {a.deadline && ` · ${formatDate(a.deadline)}`}
                    {cls && ` · ${cls.name}`}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {result && result.results.notes.length > 0 && (
        <div className="edu-search-advanced-section">
          <h3>Notes ({result.counts.notes})</h3>
          {result.results.notes.map((n) => (
            <button key={n._id} className="edu-search-advanced-row">
              <div className="edu-search-advanced-row-main">
                <div className="edu-search-advanced-row-title">{n.title || 'Sans titre'}</div>
                <div className="edu-search-advanced-row-meta">{n.markdown.slice(0, 110).replace(/\s+/g, ' ') || '—'}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
