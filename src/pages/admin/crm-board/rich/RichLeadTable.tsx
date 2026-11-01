import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmModal from '../../../../components/ConfirmModal'
import { exportToCsv } from '../../../../lib/exportCsv'
import { useI18n } from '../../../../context/I18nContext'
import type { AdminUser, Lead } from '../../../../types/crm.types'
import { CRM_PROJECTS, CRM_STATUSES, CRM_TEMPERATURES } from '../constants'
import {
  COLUMN_GROUPS,
  COLUMN_MAP,
  DEFAULT_COLUMNS,
  RICH_COLUMNS,
  formatEuro,
  daysSince,
  isLate,
  isOpen,
  lastActivityOf,
  weightedOf,
  type ColumnContext,
} from './columns'
import {
  bulkLeads,
  createView,
  deleteView,
  listViews,
  updateView,
  type BulkAction,
  type CrmView,
  type RichFilters,
} from './api'
import './rich.css'

interface Props {
  leads: Lead[]
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  currentUserId?: string
  onOpenLead: (lead: Lead) => void
  onReload: () => Promise<void>
  onError: (message: string) => void
  /** Filtre plateforme tenu par l'URL (?project=) pour rester partageable entre les vues. */
  project: string
  onProjectChange: (project: string) => void
}

interface Sort {
  key: string
  dir: 1 | -1
}

const COLUMNS_STORAGE = 'venio.crm.columns.v1'
const NEW_BADGE = <span className="rich-new">Nouveau</span>

const BUILTIN_VIEWS: Array<{ id: string; name: string; filters: RichFilters }> = [
  { id: 'all', name: 'Tous les leads', filters: {} },
  { id: 'hot', name: 'Leads chauds', filters: { temperature: 'HOT' } },
  { id: 'late', name: 'Relances en retard', filters: { late: true } },
  { id: 'big', name: 'Gros comptes (> 30 k€)', filters: { big: true } },
]

function loadStoredColumns(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_STORAGE) || 'null')
    if (Array.isArray(raw) && raw.every((k) => typeof k === 'string' && COLUMN_MAP[k])) return raw
  } catch {
    /* stockage indisponible : colonnes par défaut */
  }
  return DEFAULT_COLUMNS
}

function matches(lead: Lead, f: RichFilters, now: Date): boolean {
  if (f.q) {
    const q = f.q.toLowerCase()
    const hay = [lead.company, lead.contactName, lead.contactEmail, lead.source, ...(lead.tags ?? [])].join(' ').toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (f.project && lead.project !== f.project) return false
  if (f.owner === 'none' ? lead.assignedTo : f.owner && lead.assignedTo !== f.owner) return false
  if (f.source && lead.source !== f.source) return false
  if (f.temperature === 'HOT' ? !['CHAUD', 'TRES_CHAUD'].includes(lead.leadTemperature || '') : f.temperature && lead.leadTemperature !== f.temperature) return false
  if (f.tag && !(lead.tags ?? []).includes(f.tag)) return false
  if (f.late && !isLate(lead, now)) return false
  if (f.big && (lead.budget ?? 0) <= 30000) return false
  return true
}

export default function RichLeadTable({ leads, admins, adminsById, canManageCrm, currentUserId, onOpenLead, onReload, onError, project, onProjectChange }: Props) {
  const { t } = useI18n()
  const now = useMemo(() => new Date(), [leads])
  const ctx: ColumnContext = useMemo(() => ({ t: t as ColumnContext['t'], adminsById, now }), [t, adminsById, now])

  const [filters, setFilters] = useState<RichFilters>({})
  const [builtin, setBuiltin] = useState('all')
  const [activeView, setActiveView] = useState<string | null>(null)
  const [views, setViews] = useState<CrmView[]>([])
  const [columns, setColumns] = useState<string[]>(loadStoredColumns)
  const [sort, setSort] = useState<Sort>({ key: 'weighted', dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewScope, setViewScope] = useState<'PRIVATE' | 'TEAM'>('PRIVATE')
  const [pending, setPending] = useState<{ action: BulkAction; payload?: Record<string, unknown>; label: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listViews().then(setViews).catch(() => setViews([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE, JSON.stringify(columns))
    } catch {
      /* préférence non persistée */
    }
  }, [columns])

  useEffect(() => {
    if (!colsOpen) return
    const close = (e: MouseEvent) => {
      if (!colsRef.current?.contains(e.target as Node)) setColsOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setColsOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [colsOpen])

  const effective = useMemo(() => ({ ...filters, project }), [filters, project])
  const visible = useMemo(() => leads.filter((l) => matches(l, effective, now)), [leads, effective, now])
  const rows = useMemo(() => {
    const col = COLUMN_MAP[sort.key] ?? COLUMN_MAP.weighted
    return [...visible].sort((a, b) => {
      const x = col.sortValue(a, ctx)
      const y = col.sortValue(b, ctx)
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
    })
  }, [visible, sort, ctx])

  const shown = columns.map((k) => COLUMN_MAP[k]).filter(Boolean)
  const open = visible.filter(isOpen)
  const totals = {
    open: open.reduce((s, l) => s + (l.budget ?? 0), 0),
    weighted: open.reduce((s, l) => s + weightedOf(l), 0),
    won: visible.filter((l) => l.status === 'WON').reduce((s, l) => s + (l.budget ?? 0), 0),
    idle: open.filter((l) => (daysSince(lastActivityOf(l), now) ?? 0) >= 7).length,
    late: open.filter((l) => isLate(l, now)).length,
  }

  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean) as string[])].sort(), [leads])
  const allOn = rows.length > 0 && rows.every((l) => selected.has(l._id))
  const filterCount = Object.entries(effective).filter(([, v]) => v).length

  const patchFilters = (patch: RichFilters) => {
    if ('project' in patch) onProjectChange(patch.project ?? '')
    setFilters((f) => ({ ...f, ...patch }))
    setBuiltin('')
    setActiveView(null)
  }
  const applyBuiltin = (id: string) => {
    const v = BUILTIN_VIEWS.find((x) => x.id === id)
    setBuiltin(id)
    setActiveView(null)
    setFilters({ ...(v?.filters ?? {}) })
    onProjectChange(v?.filters.project ?? '')
  }
  const applySaved = (view: CrmView) => {
    setActiveView(view._id)
    setBuiltin('')
    setFilters({ ...view.filters })
    onProjectChange(view.filters.project ?? '')
    if (view.columns?.length) setColumns(view.columns.filter((k) => COLUMN_MAP[k]))
    if (view.sort) setSort({ key: view.sort.key, dir: view.sort.dir })
  }
  const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === 'company' ? 1 : -1 }))
  const toggleColumn = (key: string) =>
    setColumns((cols) => (cols.includes(key) ? cols.filter((k) => k !== key) : RICH_COLUMNS.map((c) => c.key).filter((k) => cols.includes(k) || k === key)))

  const saveView = async () => {
    const name = viewName.trim()
    if (!name) return
    try {
      const created = await createView({ name, scope: viewScope, filters: effective, columns, sort, mode: 'table' })
      setViews((v) => [...v, created])
      setActiveView(created._id)
      setBuiltin('')
      setSaving(false)
      setViewName('')
    } catch (err) {
      onError((err as Error).message || 'Impossible d’enregistrer la vue')
    }
  }
  const removeView = async (view: CrmView) => {
    try {
      await deleteView(view._id)
      setViews((v) => v.filter((x) => x._id !== view._id))
      if (activeView === view._id) applyBuiltin('all')
    } catch (err) {
      onError((err as Error).message || 'Suppression impossible')
    }
  }
  const saveColumnsInView = async () => {
    const view = views.find((v) => v._id === activeView)
    if (!view) return
    try {
      const updated = await updateView(view._id, { columns, sort, filters: effective })
      setViews((vs) => vs.map((x) => (x._id === updated._id ? updated : x)))
      setNotice(`Colonnes enregistrées dans « ${view.name} »`)
    } catch (err) {
      onError((err as Error).message || 'Enregistrement impossible')
    }
  }

  const runBulk = useCallback(
    async (action: BulkAction, payload: Record<string, unknown> = {}) => {
      setBusy(true)
      try {
        const res = await bulkLeads([...selected], action, payload)
        setNotice(res.failed ? `${res.ok} lead(s) traité(s), ${res.failed} refusé(s)` : `${res.ok} lead(s) traité(s)`)
        setSelected(new Set())
        await onReload()
      } catch (err) {
        onError((err as Error).message || 'Action groupée impossible')
      } finally {
        setBusy(false)
        setPending(null)
      }
    },
    [selected, onReload, onError],
  )

  const exportSelected = () => {
    const chosen = rows.filter((l) => selected.has(l._id))
    exportToCsv('crm-leads.csv', shown.map((c) => c.label), chosen.map((l) => shown.map((c) => c.csv(l, ctx))))
    setNotice(`Export CSV : ${chosen.length} lead(s) × ${shown.length} colonnes`)
  }

  const tags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags ?? []))].sort(), [leads])

  return (
    <div className="rich-wrap">
      <section className="rich-kpis" aria-label="Indicateurs du pipeline">
        {[
          ['Pipeline ouvert', formatEuro(totals.open), `${open.length} leads`, false],
          ['Pondéré', formatEuro(totals.weighted), 'montant × probabilité', true],
          ['Gagné', formatEuro(totals.won), `${visible.filter((l) => l.status === 'WON').length} deals`, false],
          ['Sans activité 7 j', String(totals.idle), 'cible des relances auto', true],
          ['Relances en retard', String(totals.late), totals.late ? 'à traiter' : 'tout est à jour', false],
        ].map(([label, value, hint, isNew]) => (
          <div key={String(label)} className="rich-kpi">
            <small>
              {label}
              {isNew ? NEW_BADGE : null}
            </small>
            <b>{value}</b>
            <em>{hint}</em>
          </div>
        ))}
      </section>

      <div className="rich-views" role="group" aria-label="Vues enregistrées">
        {BUILTIN_VIEWS.map((v) => (
          <button key={v.id} type="button" className="rich-chip" aria-pressed={builtin === v.id} onClick={() => applyBuiltin(v.id)}>
            {v.name}
            <em>{leads.filter((l) => matches(l, v.filters, now)).length}</em>
          </button>
        ))}
        {views.map((v) => (
          <span key={v._id} className="rich-chip-wrap">
            <button type="button" className="rich-chip" aria-pressed={activeView === v._id} onClick={() => applySaved(v)}>
              {v.name}
              <em>{v.scope === 'TEAM' ? 'équipe' : 'privée'}</em>
            </button>
            {(v.owner === currentUserId || !currentUserId) && canManageCrm && (
              <button type="button" className="rich-chip-x" aria-label={`Supprimer la vue ${v.name}`} onClick={() => removeView(v)}>×</button>
            )}
          </span>
        ))}
        <button type="button" className="rich-chip rich-chip--add" onClick={() => setSaving((s) => !s)} aria-expanded={saving}>
          + Enregistrer cette vue{NEW_BADGE}
        </button>
      </div>

      {saving && (
        <form className="rich-save" onSubmit={(e) => { e.preventDefault(); void saveView() }}>
          <label>
            <span>Nom de la vue</span>
            <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={80} autoFocus />
          </label>
          <label>
            <span>Visibilité</span>
            <select value={viewScope} onChange={(e) => setViewScope(e.target.value as 'PRIVATE' | 'TEAM')}>
              <option value="PRIVATE">Privée</option>
              <option value="TEAM">Équipe</option>
            </select>
          </label>
          <button type="submit" className="rich-btn rich-btn--primary" disabled={!viewName.trim()}>Enregistrer</button>
          <button type="button" className="rich-btn" onClick={() => setSaving(false)}>Annuler</button>
          <small>{columns.length} colonnes, tri et filtres actuels.</small>
        </form>
      )}

      <div className="rich-filters" role="search">
        <label className="rich-search">
          <span className="rich-sr">Rechercher un lead</span>
          <input type="search" placeholder="Entreprise, contact, tag…" value={filters.q ?? ''} onChange={(e) => patchFilters({ q: e.target.value })} />
        </label>
        <select aria-label="Projet" value={project} onChange={(e) => patchFilters({ project: e.target.value })}>
          <option value="">Projet</option>
          {CRM_PROJECTS.map((p) => <option key={p.key} value={p.key}>{t(p.labelKey)}</option>)}
        </select>
        <select aria-label="Commercial" value={filters.owner ?? ''} onChange={(e) => patchFilters({ owner: e.target.value })}>
          <option value="">Commercial</option>
          <option value="none">Non assignés</option>
          {admins.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
        <select aria-label="Source" value={filters.source ?? ''} onChange={(e) => patchFilters({ source: e.target.value })}>
          <option value="">Source</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Température" value={filters.temperature ?? ''} onChange={(e) => patchFilters({ temperature: e.target.value })}>
          <option value="">Température</option>
          <option value="HOT">Chaud et plus</option>
          {CRM_TEMPERATURES.map((x) => <option key={x.key} value={x.key}>{t(x.labelKey)}</option>)}
        </select>
        {tags.length > 0 && (
          <select aria-label="Tag" value={filters.tag ?? ''} onChange={(e) => patchFilters({ tag: e.target.value })}>
            <option value="">Tag</option>
            {tags.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        {filterCount > 0 && <button type="button" className="rich-link-btn" onClick={() => applyBuiltin('all')}>Réinitialiser</button>}
        <span className="rich-grow" />
        <div className="rich-cols" ref={colsRef}>
          <button type="button" className="rich-btn" aria-haspopup="dialog" aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}>
            Colonnes{NEW_BADGE}
          </button>
          {colsOpen && (
            <div className="rich-colpn" role="dialog" aria-label="Colonnes du tableau">
              <header>
                <h3>Colonnes</h3>
                <button type="button" className="rich-link-btn" onClick={() => setColumns(DEFAULT_COLUMNS)}>Par défaut</button>
              </header>
              <div className="rich-cl">
                {COLUMN_GROUPS.map((g) => (
                  <fieldset key={g}>
                    <legend>{g}</legend>
                    {RICH_COLUMNS.filter((c) => c.group === g).map((c) => (
                      <label key={c.key} className={c.locked ? 'is-locked' : ''}>
                        <input type="checkbox" checked={columns.includes(c.key)} disabled={c.locked} onChange={() => toggleColumn(c.key)} />
                        {c.label}
                        {c.isNew ? NEW_BADGE : null}
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <footer>
                {activeView && <button type="button" className="rich-btn" onClick={saveColumnsInView}>Enregistrer dans la vue</button>}
                <button type="button" className="rich-btn rich-btn--primary" onClick={() => setColsOpen(false)}>Terminé</button>
              </footer>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <p className="rich-notice" role="status">
          {notice}
          <button type="button" aria-label="Fermer" onClick={() => setNotice('')}>×</button>
        </p>
      )}

      <div className="rich-table-wrap">
        <table className="rich-table" aria-label="Leads">
          <thead>
            <tr>
              {canManageCrm && (
                <th className="rich-ck">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = !allOn && rows.some((l) => selected.has(l._id)) }}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((l) => l._id)) : new Set())}
                  />
                </th>
              )}
              {shown.map((c, i) => (
                <th key={c.key} className={`${c.align === 'right' ? 'is-r' : ''} ${i === 0 ? 'is-sticky' : ''}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  <button type="button" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {c.isNew ? NEW_BADGE : null}
                    <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead._id} className={selected.has(lead._id) ? 'is-sel' : ''} onClick={() => onOpenLead(lead)}>
                {canManageCrm && (
                  <td className="rich-ck" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${lead.company}`}
                      checked={selected.has(lead._id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s)
                          if (e.target.checked) next.add(lead._id)
                          else next.delete(lead._id)
                          return next
                        })
                      }
                    />
                  </td>
                )}
                {shown.map((c, i) => (
                  <td key={c.key} data-l={c.label} className={`${c.align === 'right' ? 'is-r' : ''} ${i === 0 ? 'is-sticky' : ''}`}>
                    {i === 0 ? (
                      <button type="button" className="rich-open" onClick={(e) => { e.stopPropagation(); onOpenLead(lead) }}>
                        {c.render(lead, ctx)}
                      </button>
                    ) : (
                      c.render(lead, ctx)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="rich-empty">Aucun lead ne correspond à ces filtres.</p>}
        <div className="rich-foot">
          <span>{rows.length} leads · {shown.length} colonnes affichées</span>
          <span>Total ouvert {formatEuro(totals.open)} · pondéré {formatEuro(totals.weighted)}</span>
        </div>
      </div>

      {selected.size > 0 && canManageCrm && (
        <div className="rich-bulk" role="region" aria-label="Actions groupées">
          <span className="rich-bulk-n"><b>{selected.size}</b> sélectionné(s){NEW_BADGE}</span>
          <select aria-label="Assigner à" value="" disabled={busy} onChange={(e) => e.target.value && setPending({ action: 'assign', payload: { userId: e.target.value }, label: `Assigner ${selected.size} lead(s) à ${adminsById[e.target.value]?.name ?? ''}` })}>
            <option value="">Assigner…</option>
            {admins.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <select aria-label="Changer le statut" value="" disabled={busy} onChange={(e) => e.target.value && setPending({ action: 'status', payload: { status: e.target.value }, label: `Passer ${selected.size} lead(s) en « ${t(CRM_STATUSES.find((s) => s.key === e.target.value)!.labelKey)} »` })}>
            <option value="">Statut…</option>
            {CRM_STATUSES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
          </select>
          <button type="button" className="rich-btn" disabled={busy} onClick={() => { const tag = window.prompt('Tag à ajouter aux leads sélectionnés')?.trim(); if (tag) void runBulk('tag', { tag }) }}>Tag</button>
          <button type="button" className="rich-btn" disabled={busy} onClick={() => setPending({ action: 'archive', label: `Archiver ${selected.size} lead(s) ? Ils quittent le pipeline mais restent restaurables.` })}>Archiver</button>
          <button type="button" className="rich-btn" onClick={exportSelected}>Exporter</button>
          <button type="button" className="rich-btn rich-btn--danger" disabled={busy} onClick={() => setPending({ action: 'delete', label: `Supprimer définitivement ${selected.size} lead(s), leurs tâches et leurs échanges ? Préférez l’archivage.` })}>Supprimer</button>
          <button type="button" className="rich-x" aria-label="Désélectionner tout" onClick={() => setSelected(new Set())}>×</button>
        </div>
      )}

      <ConfirmModal
        isOpen={pending !== null}
        title="Confirmer l’action groupée"
        message={pending?.label ?? ''}
        confirmLabel="Confirmer"
        cancelLabel="Annuler"
        variant={pending?.action === 'delete' ? 'danger' : 'info'}
        onConfirm={() => pending && void runBulk(pending.action, pending.payload)}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
