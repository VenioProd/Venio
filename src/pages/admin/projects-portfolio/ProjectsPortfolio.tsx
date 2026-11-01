import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { sensitiveActionHeaders } from '../../../lib/sensitiveActions'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import ConfirmModal from '../../../components/ConfirmModal'
import {
  applyFilters,
  BUILTIN_VIEWS,
  dueLabel,
  EMPTY_FILTERS,
  riskLabel,
  sameFilters,
  type Filters,
  type PortfolioItem,
  type PortfolioOverview,
  type ProjectAction,
  type SavedView,
  type SortKey,
} from './portfolio'
import './ProjectsPortfolio.css'

type BulkAction = 'archive' | 'unarchive' | 'set-status' | 'set-assignee' | 'delete'
interface Admin {
  _id: string
  name: string
}

const STATUS_LABEL = { EN_COURS: 'En cours', EN_ATTENTE: 'En attente', TERMINE: 'Terminé' } as const
const STATUS_TONE = { EN_COURS: 'sky', EN_ATTENTE: 'amber', TERMINE: 'mint' } as const
const ACTION_LABEL: Record<ProjectAction, string> = {
  POSTPONE: 'Décaler l’échéance',
  REMIND_CLIENT: 'Relancer le client',
  REASSIGN: 'Réassigner',
  RESUME: 'Reprendre',
  INVOICE: 'Créer la facture',
  ARCHIVE: 'Archiver',
}

const money = (n: number | null) => (n == null ? '' : `${Math.round(n).toLocaleString('fr-FR')} €`)
const initials = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export default function ProjectsPortfolio() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const meId = user?._id
  const [data, setData] = useState<PortfolioOverview | null>(null)
  const [error, setError] = useState(false)
  const [views, setViews] = useState<SavedView[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingView, setSavingView] = useState<string | null>(null)
  const [inline, setInline] = useState<{ id: string; kind: 'POSTPONE' | 'REASSIGN' } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiFetch<PortfolioOverview>('/api/admin/projects/overview')
      .then((d) => {
        if (!Array.isArray(d?.items)) throw new Error('invalid overview')
        setData(d)
        setError(false)
      })
      .catch(() => setError(true))
  }, [])
  const loadViews = useCallback(() => {
    apiFetch<{ views: SavedView[] }>('/api/admin/projects/views')
      .then((r) => setViews(r.views))
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    loadViews()
    apiFetch<{ users: Admin[] }>('/api/admin/admins')
      .then((r) => setAdmins(r.users || []))
      .catch(() => {})
  }, [load, loadViews])

  const rows = useMemo(() => (data ? applyFilters(data.items, filters, meId) : []), [data, filters, meId])
  const visibleIds = useMemo(() => new Set(rows.map((r) => r._id)), [rows])
  const picked = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds])
  const allPicked = rows.length > 0 && picked.length === rows.length

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    if (!data) return c
    for (const v of BUILTIN_VIEWS) c[v.id] = applyFilters(data.items, v.filters, meId).length
    return c
  }, [data, meId])

  const bulk = async (action: BulkAction, ids: string[], value?: string | null, confirmed = false) => {
    if (!ids.length || busy) return
    setBusy(true)
    try {
      const res = await apiFetch<{ succeeded: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>(
        '/api/admin/projects/bulk',
        {
          method: 'POST',
          headers: confirmed ? sensitiveActionHeaders('PROJECT_DELETE') : undefined,
          body: JSON.stringify({ action, ids, value }),
        },
      )
      if (res.failed) {
        const first = res.results.find((r) => !r.ok)
        showToast(`${res.succeeded} réussi(s), ${res.failed} en échec : ${first?.error ?? 'erreur'}`, 'error')
      } else {
        showToast(`${res.succeeded} projet(s) mis à jour`, 'success')
      }
      setSelected(new Set())
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusy(false)
    }
  }

  const postpone = async (id: string, date: string) => {
    if (!date) return
    try {
      await apiFetch(`/api/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ endDate: date }) })
      showToast('Échéance décalée', 'success')
      setInline(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action impossible', 'error')
    }
  }

  const saveView = async (name: string) => {
    if (!name.trim()) return
    try {
      await apiFetch('/api/admin/projects/views', { method: 'POST', body: JSON.stringify({ name, filters }) })
      setSavingView(null)
      loadViews()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Vue non enregistrée', 'error')
    }
  }
  const deleteView = async (id: string) => {
    await apiFetch(`/api/admin/projects/views/${id}`, { method: 'DELETE' }).catch(() => {})
    loadViews()
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (error) return <p role="alert">Impossible de charger les projets. <button type="button" className="pf-link" onClick={load}>Réessayer</button></p>
  if (!data) return <p role="status">Chargement…</p>

  const { pulse } = data
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const doAction = (item: PortfolioItem, a: ProjectAction) => {
    if (a === 'POSTPONE' || a === 'REASSIGN') return setInline({ id: item._id, kind: a })
    if (a === 'RESUME') return bulk('set-status', [item._id], 'EN_COURS')
    if (a === 'ARCHIVE') return bulk('archive', [item._id])
  }

  return (
    <div className="pf">
      <p className="pf-lead" aria-live="polite">
        <strong className={pulse.late ? 'pf-neg' : ''}>{pulse.late} en retard</strong>, {pulse.atRisk} à risque · {pulse.active} actifs ·{' '}
        {pulse.dueIn7Days} échéances cette semaine
        {pulse.toBill ? ` · ${pulse.toBill} livré(s) à facturer` : ''}
      </p>

      <section className="pf-card pf-pulse" aria-label="Indicateurs du portefeuille">
        <Pulse label="Actifs" value={pulse.active} sub={`sur ${pulse.total} · ${pulse.done} terminés`} />
        <Pulse label="En retard" value={pulse.late} hot={pulse.late > 0} sub={`${pulse.atRisk} à risque`} />
        <Pulse label="Échéances 7 j" value={pulse.dueIn7Days} sub={`${pulse.dueIn48h} dans les 48 h`} />
        <Pulse
          label="Budget consommé"
          isNew
          value={pulse.budget.pct == null ? '—' : `${pulse.budget.pct} %`}
          sub={pulse.budget.total ? `${money(pulse.budget.invoiced)} sur ${money(pulse.budget.total)}` : 'aucun budget saisi'}
          meter={pulse.budget.pct}
        />
        <Pulse
          label="Charge équipe"
          isNew
          value={pulse.load.pct == null ? '—' : `${pulse.load.pct} %`}
          sub={pulse.load.overloaded ? `${pulse.load.overloaded} personne(s) surchargée(s)` : 'dans la capacité'}
          meter={pulse.load.pct}
        />
      </section>

      <div className="pf-grid">
        <div className="pf-col">
          <section className="pf-card pf-queue" aria-label="À traiter">
            <header className="pf-card-h">
              <h2>
                À traiter <span className={`pf-count ${data.queue.length ? 'hot' : ''}`}>{data.queue.length}</span>
              </h2>
            </header>
            {data.queue.length === 0 ? (
              <p className="pf-empty">Rien d’urgent : aucun projet en retard, à risque ou à facturer.</p>
            ) : (
              <ul>
                {data.queue.map((item) => (
                  <li key={item._id} className="pf-q">
                    <div className="pf-q-t">
                      <Link to={`/admin/projets/${item._id}`}>{item.name}</Link>
                      <span>
                        {item.client?.name ?? '—'}
                        {item.assignedTo ? ` · ${item.assignedTo.name}` : ''}
                      </span>
                      <div className="pf-why">
                        {item.risks
                          .filter((r) => r.code !== 'WAITING_CLIENT' || item.risks.length === 1)
                          .map((r) => {
                            const l = riskLabel(r, item)
                            return (
                              <span key={r.code} className={`pf-chip ${l.tone}`}>
                                {l.text}
                              </span>
                            )
                          })}
                      </div>
                    </div>
                    <div className="pf-q-a">
                      {inline?.id === item._id && inline.kind === 'POSTPONE' ? (
                        <PostponeForm onSubmit={(d) => postpone(item._id, d)} onCancel={() => setInline(null)} />
                      ) : inline?.id === item._id && inline.kind === 'REASSIGN' ? (
                        <select
                          className="pf-sel"
                          aria-label={`Nouveau responsable de ${item.name}`}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) bulk('set-assignee', [item._id], e.target.value).then(() => setInline(null))
                          }}
                        >
                          <option value="" disabled>
                            Choisir…
                          </option>
                          {admins.map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.actions.map((a, idx) =>
                          a === 'REMIND_CLIENT' || a === 'INVOICE' ? (
                            <Link key={a} to={`/admin/projets/${item._id}`} className={`pf-btn ${idx === 0 ? 'primary' : ''}`}>
                              {ACTION_LABEL[a]}
                            </Link>
                          ) : (
                            <button key={a} type="button" className={`pf-btn ${idx === 0 ? 'primary' : ''}`} onClick={() => doAction(item, a)}>
                              {ACTION_LABEL[a]}
                            </button>
                          ),
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pf-card" aria-label="Portefeuille clients">
            <header className="pf-card-h">
              <h2>Portefeuille clients</h2>
            </header>
            <div className="pf-views" role="group" aria-label="Vues">
              {BUILTIN_VIEWS.map((v) => (
                <button key={v.id} type="button" className="pf-flt" aria-pressed={sameFilters(filters, v.filters)} onClick={() => setFilters(v.filters)}>
                  {v.label} <span className="pf-count">{counts[v.id] ?? 0}</span>
                </button>
              ))}
              {views.map((v) => (
                <span key={v._id} className="pf-view-wrap">
                  <button type="button" className="pf-flt" aria-pressed={sameFilters(filters, { ...EMPTY_FILTERS, ...v.filters })} onClick={() => setFilters({ ...EMPTY_FILTERS, ...v.filters })}>
                    {v.name}
                    {v.shared ? ' ·partagée' : ''}
                  </button>
                  {v.mine && (
                    <button type="button" className="pf-x" aria-label={`Supprimer la vue ${v.name}`} onClick={() => deleteView(v._id)}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {savingView === null ? (
                <button type="button" className="pf-flt add" onClick={() => setSavingView('')}>
                  + Enregistrer la vue
                </button>
              ) : (
                <form
                  className="pf-inline"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveView(savingView)
                  }}
                >
                  <input className="pf-input" autoFocus aria-label="Nom de la vue" maxLength={60} value={savingView} onChange={(e) => setSavingView(e.target.value)} placeholder="Nom de la vue" />
                  <button type="submit" className="pf-btn primary">
                    OK
                  </button>
                  <button type="button" className="pf-btn" onClick={() => setSavingView(null)}>
                    Annuler
                  </button>
                </form>
              )}
            </div>

            <div className="pf-fbar">
              <input className="pf-input" type="search" aria-label="Rechercher un projet" placeholder="Projet, client, n°…" value={filters.q} onChange={(e) => set('q', e.target.value)} />
              <select className="pf-sel" aria-label="Statut" value={filters.status} onChange={(e) => set('status', e.target.value)}>
                <option value="">Statut : tous</option>
                <option value="EN_COURS">En cours</option>
                <option value="EN_ATTENTE">En attente</option>
                <option value="TERMINE">Terminé</option>
              </select>
              <select className="pf-sel" aria-label="Responsable" value={filters.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Responsable : tous</option>
                {admins.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select className="pf-sel" aria-label="Priorité" value={filters.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="">Priorité : toutes</option>
                <option value="URGENTE">Urgente</option>
                <option value="HAUTE">Haute</option>
                <option value="NORMALE">Normale</option>
                <option value="BASSE">Basse</option>
              </select>
              <select className="pf-sel" aria-label="Tri" value={filters.sort} onChange={(e) => set('sort', e.target.value as SortKey)}>
                <option value="urgency">Tri : urgence</option>
                <option value="dueDate">Échéance</option>
                <option value="budget">Budget consommé</option>
                <option value="name">Nom</option>
              </select>
            </div>

            <div className="pf-table" role="table" aria-label="Projets clients">
              <div className="pf-th" role="row">
                <input type="checkbox" className="pf-chk" aria-label="Tout sélectionner" checked={allPicked} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r._id)) : new Set())} />
                <span>Projet</span>
                <span>Statut</span>
                <span className="pf-h-prog">Avancement</span>
                <span>Échéance</span>
                <span>Budget</span>
                <span>Resp.</span>
              </div>
              {rows.length === 0 && <p className="pf-empty">Aucun projet ne correspond à ces filtres.</p>}
              {rows.map((i) => {
                const on = selected.has(i._id)
                const tone = STATUS_TONE[i.status]
                const dueTone = i.overdueDays > 0 ? 'late' : i.daysToDue !== null && i.daysToDue <= 7 && i.status !== 'TERMINE' ? 'soon' : ''
                const budTone = i.budgetPct == null ? '' : i.budgetPct > 100 ? 'bad' : i.budgetPct >= 85 ? 'warn' : ''
                return (
                  <div key={i._id} className="pf-tr" role="row" aria-selected={on}>
                    <input type="checkbox" className="pf-chk" aria-label={`Sélectionner ${i.name}`} checked={on} onChange={() => toggle(i._id)} />
                    <div className="pf-cell-n">
                      <Link to={`/admin/projets/${i._id}`}>{i.name}</Link>
                      <span>{[i.client?.name, i.priority !== 'NORMALE' ? i.priority.toLowerCase() : null].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div className="pf-cell-st">
                      <span className={`pf-chip dot ${i.overdueDays > 0 ? 'rose' : tone}`}>{i.overdueDays > 0 ? 'En retard' : STATUS_LABEL[i.status]}</span>
                    </div>
                    <div className="pf-cell-pr">
                      <span className="pf-mono">{i.progress} %</span>
                      <div className="pf-meter"><i style={{ width: `${i.progress}%` }} /></div>
                    </div>
                    <div className={`pf-cell-d ${dueTone}`}>{dueLabel(i)}</div>
                    <div className={`pf-cell-b ${budTone}`}>
                      {i.budgetPct == null ? '—' : `${i.budgetPct} %`}
                      {i.budget.amount ? <small>{money(i.budget.amount)}</small> : null}
                    </div>
                    <div className="pf-cell-r">{i.assignedTo ? <span className="pf-av" title={i.assignedTo.name}>{initials(i.assignedTo.name)}</span> : '—'}</div>
                  </div>
                )
              })}
            </div>

            {picked.length > 0 && (
              <div className="pf-bulk" role="region" aria-label="Actions groupées">
                <span className="pf-bulk-n">{picked.length} sélectionné(s)</span>
                <select className="pf-sel" aria-label="Changer le statut" value="" disabled={busy} onChange={(e) => e.target.value && bulk('set-status', picked, e.target.value)}>
                  <option value="">Statut…</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="TERMINE">Terminé</option>
                </select>
                <select className="pf-sel" aria-label="Changer le responsable" value="" disabled={busy} onChange={(e) => e.target.value && bulk('set-assignee', picked, e.target.value)}>
                  <option value="">Responsable…</option>
                  {admins.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="pf-btn" disabled={busy} onClick={() => bulk('archive', picked)}>
                  Archiver
                </button>
                <button type="button" className="pf-btn danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Supprimer
                </button>
                <button type="button" className="pf-x" aria-label="Désélectionner" onClick={() => setSelected(new Set())}>
                  ×
                </button>
              </div>
            )}
            <div className="pf-foot">
              <span>
                {rows.length} sur {data.items.length}
              </span>
              <span className="pf-mono">consommé = facturé ÷ budget</span>
            </div>
          </section>
        </div>

        <div className="pf-col pf-side">
          <section className="pf-card" aria-label="Échéances">
            <header className="pf-card-h">
              <h2>
                Échéances · 14 jours <span className="pf-new">nouveau</span>
              </h2>
            </header>
            {data.upcoming.length === 0 ? (
              <p className="pf-empty">Aucune échéance dans les 14 jours.</p>
            ) : (
              <ul className="pf-tl">
                {data.upcoming.map((u) => (
                  <li key={u._id}>
                    <time className={u.overdueDays > 0 ? 'pf-neg' : ''}>{u.overdueDays > 0 ? `−${u.overdueDays} j` : new Date(u.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</time>
                    <div>
                      <Link to={`/admin/projets/${u._id}`}>{u.name}</Link>
                      <span>{u.assignedTo?.name ?? 'Non assigné'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="pf-card" aria-label="Charge par personne">
            <header className="pf-card-h">
              <h2>
                Charge par personne <span className="pf-new">nouveau</span>
              </h2>
            </header>
            {data.workload.length === 0 ? (
              <p className="pf-empty">Aucune tâche ouverte assignée.</p>
            ) : (
              <ul className="pf-load">
                {data.workload.map((w) => (
                  <li key={w._id}>
                    <span className="pf-av">{initials(w.name)}</span>
                    <div>
                      <b>{w.name}</b>
                      <span>
                        {w.projects} projet(s) · {w.openTasks} tâche(s)
                      </span>
                      <div className={`pf-meter ${w.loadPct > 100 ? 'bad' : w.loadPct >= 85 ? 'warn' : ''}`}>
                        <i style={{ width: `${Math.min(100, w.loadPct)}%` }} />
                      </div>
                    </div>
                    <span className={`pf-mono ${w.loadPct > 100 ? 'pf-neg' : ''}`}>{w.loadPct} %</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Supprimer définitivement ?"
        message={`${picked.length} projet(s) et leurs sections, tâches et fichiers seront supprimés. Les projets qui portent une facture, une écriture ou un devis envoyé seront refusés : archivez-les plutôt.`}
        confirmLabel="Supprimer"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          bulk('delete', picked, null, true)
        }}
      />
    </div>
  )
}

function Pulse({ label, value, sub, hot, isNew, meter }: { label: string; value: number | string; sub: string; hot?: boolean; isNew?: boolean; meter?: number | null }) {
  return (
    <div className={`pf-pc ${hot ? 'hot' : ''}`}>
      <span className="pf-pc-l">
        {label} {isNew && <span className="pf-new">nouveau</span>}
      </span>
      <span className="pf-pc-v">{value}</span>
      <span className="pf-pc-s">{sub}</span>
      {meter != null && (
        <div className={`pf-meter ${meter > 100 ? 'bad' : meter >= 85 ? 'warn' : ''}`}>
          <i style={{ width: `${Math.min(100, meter)}%` }} />
        </div>
      )}
    </div>
  )
}

function PostponeForm({ onSubmit, onCancel }: { onSubmit: (date: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState('')
  return (
    <form
      className="pf-inline"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(date)
      }}
    >
      <input className="pf-input" type="date" aria-label="Nouvelle échéance" value={date} onChange={(e) => setDate(e.target.value)} required />
      <button type="submit" className="pf-btn primary">
        OK
      </button>
      <button type="button" className="pf-btn" onClick={onCancel}>
        Annuler
      </button>
    </form>
  )
}
