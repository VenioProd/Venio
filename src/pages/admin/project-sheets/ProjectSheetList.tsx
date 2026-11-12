import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import type { ProjectSheetListItem, ProjectSheetListResponse, ProjectSheet } from '../../../types/projectSheet.types'
import { API_BASE, psKey } from './shared'
import { ReviewBadge, SheetMark, StatusBadge, useFieldLabel } from './parts'
import './ProjectSheets.css'

const DEBOUNCE_MS = 300

export default function ProjectSheetList() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const fieldLabel = useFieldLabel()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [archived, setArchived] = useState(false)
  const [sheets, setSheets] = useState<ProjectSheetListItem[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const id = ++requestId.current
    const params = new URLSearchParams()
    if (debounced) params.set('q', debounced)
    if (archived) params.set('archived', 'true')
    const qs = params.toString()
    setLoading(true)
    setError(false)
    apiFetch<ProjectSheetListResponse>(API_BASE + (qs ? '?' + qs : ''))
      .then((data) => {
        if (id !== requestId.current) return
        setSheets(data.sheets ?? [])
        setCanEdit(!!data.canEdit)
      })
      .catch(() => {
        if (id === requestId.current) setError(true)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [debounced, archived])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      setCreateError(t(psKey('list.nameRequired')))
      return
    }
    setBusy(true)
    setCreateError('')
    try {
      const res = await apiFetch<{ sheet: ProjectSheet }>(API_BASE, { method: 'POST', body: JSON.stringify({ name }) })
      navigate('/admin/projets/fiches/' + res.sheet.slug)
    } catch (err) {
      setCreateError(err instanceof Error && err.message ? err.message : t(psKey('list.createError')))
    } finally {
      setBusy(false)
    }
  }

  const searching = debounced.length > 0
  return (
    <div className="ps-page">
      <section className="ps-intro">
        <div>
          <h2>{t(psKey('list.title'))}</h2>
          <p>{t(psKey('list.subtitle'))}</p>
        </div>
        {canEdit && !creating && (
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => setCreating(true)}>
            + {t(psKey('list.new'))}
          </button>
        )}
      </section>

      {canEdit && creating && (
        <form className="ps-create" onSubmit={create}>
          <label>
            {t(psKey('list.newName'))}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus />
          </label>
          <div className="ps-actions">
            <button type="submit" className="ps-btn ps-btn--primary" disabled={busy}>
              {t(psKey('list.create'))}
            </button>
            <button
              type="button"
              className="ps-btn"
              disabled={busy}
              onClick={() => {
                setCreating(false)
                setCreateError('')
                setNewName('')
              }}
            >
              {t(psKey('list.cancel'))}
            </button>
          </div>
          {createError && (
            <p role="alert" className="ps-error">
              {createError}
            </p>
          )}
        </form>
      )}

      <div className="ps-toolbar">
        <input
          type="search"
          className="ps-search"
          aria-label={t(psKey('list.searchLabel'))}
          placeholder={t(psKey('list.searchPlaceholder'))}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="ps-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t(psKey('list.showArchived'))}
        </label>
        {!loading && !error && <span className="ps-count">{t(psKey('list.count'), { count: sheets.length })}</span>}
      </div>

      {loading && sheets.length === 0 ? (
        <p role="status">{t(psKey('list.loading'))}</p>
      ) : error ? (
        <p role="alert" className="ps-error">
          {t(psKey('list.error'))}
        </p>
      ) : sheets.length === 0 ? (
        <p className="ps-empty-list">
          {searching ? t(psKey('list.emptySearch'), { q: debounced }) : t(psKey('list.empty'))}
        </p>
      ) : (
        <ul className="ps-grid" aria-busy={loading}>
          {sheets.map((sheet) => (
            <li key={sheet._id} className={'ps-card' + (sheet.archived ? ' is-archived' : '')}>
              <Link className="ps-card__link" to={'/admin/projets/fiches/' + sheet.slug}>
                <div className="ps-card__head">
                  <SheetMark name={sheet.name} logoUrl={sheet.logoUrl} accentColor={sheet.accentColor} />
                  <h3>{sheet.name}</h3>
                </div>
                <div className="ps-badges">
                  <StatusBadge status={sheet.status} />
                  <ReviewBadge review={sheet.reviewStatus} />
                  {sheet.archived && <span className="ps-badge">{t(psKey('list.archived'))}</span>}
                </div>
                <p className="ps-card__oneliner">{sheet.oneLiner || <em>{t(psKey('list.noOneLiner'))}</em>}</p>
                <p className="ps-card__meta">
                  {sheet.referent
                    ? t(psKey('list.referent'), { name: sheet.referent.name })
                    : t(psKey('list.noReferent'))}
                </p>
              </Link>
              {searching && sheet.matches && sheet.matches.length > 0 && (
                <ul className="ps-matches" aria-label={t(psKey('list.matches'))}>
                  {sheet.matches.map((m, i) => (
                    <li key={i}>
                      <strong>{fieldLabel(m.field)}</strong>
                      <span>{m.excerpt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
