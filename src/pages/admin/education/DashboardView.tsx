import { Plus } from 'lucide-react'
import {
  formatDate,
  formatRelative,
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_COLOR,
  ASSIGNMENT_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  type EducationDashboard,
} from '../../../services/education'

/**
 * VENIO-27 — Cockpit intervenant multi-écoles.
 * Sections : Aujourd'hui · Cette semaine · À préparer · À corriger ·
 * Dernière séance par classe. Filtre école multi-écoles.
 * Vocabulaire neutre : "points d'attention pédagogiques" (pas de risque/alerte).
 */
export function DashboardView({
  dashboard,
  selectedSchool,
  onChangeSchool,
  onOpenClass,
  onCreateClass,
  reloadError,
  onReload,
}: {
  dashboard: EducationDashboard | null
  selectedSchool: string
  onChangeSchool: (school: string) => void
  onOpenClass: (id: string) => void
  onCreateClass: () => void
  reloadError: string | null
  onReload: () => void
}) {
  if (!dashboard) {
    return (
      <div>
        {reloadError ? (
          <div className="edu-banner-error" role="alert">
            {reloadError}
            <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>Réessayer</button>
          </div>
        ) : (
          <p className="edu-sub">Chargement…</p>
        )}
      </div>
    )
  }

  const c = dashboard.counters
  const schoolsToShow = dashboard.schools.length > 0 ? dashboard.schools : []

  return (
    <div>
      {reloadError && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 16 }}>
          {reloadError}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={onReload}>Réessayer</button>
        </div>
      )}

      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="edu-h1">Cockpit intervenant</h1>
          <p className="edu-sub">Ton point d'entrée quotidien — aujourd'hui, cette semaine et ce qui attend ton attention.</p>
        </div>
        <div className="edu-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {schoolsToShow.length > 0 && (
            <select
              className="edu-select"
              style={{ width: 'auto', minWidth: 180 }}
              value={selectedSchool}
              onChange={(e) => onChangeSchool(e.target.value)}
              aria-label="Filtrer par école"
            >
              <option value="">Toutes les écoles</option>
              {schoolsToShow.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button className="edu-btn" onClick={onCreateClass}><Plus size={14} /> Nouvelle classe</button>
        </div>
      </div>

      <div className="edu-kpi-grid">
        <Kpi label="Classes actives" value={c.activeClasses} />
        <Kpi label="Étudiants suivis" value={c.totalStudents} />
        <Kpi label="Aujourd'hui" value={c.todaySessions} sub="séance(s)" />
        <Kpi label="Cette semaine" value={c.weekSessions} sub="séance(s)" />
        <Kpi label="À préparer" value={c.toPrepare} sub="prochaines 72 h" />
        <Kpi label="À corriger" value={c.toGrade} sub={c.lateSubmissions > 0 ? `${c.lateSubmissions} en retard` : undefined} />
      </div>

      {/* Aujourd'hui */}
      <Section title="Aujourd'hui">
        {dashboard.today.length === 0 ? (
          <p className="edu-empty">Pas de séance aujourd'hui.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Heure</th><th>Classe</th><th>École</th><th>Séance</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.today.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(s.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{school || '—'}</td>
                    <td>{s.title}</td>
                    <td><span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Cette semaine */}
      <Section title="Cette semaine">
        {dashboard.week.length === 0 ? (
          <p className="edu-empty">Pas de séance planifiée cette semaine.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Date</th><th>Classe</th><th>École</th><th>Séance</th></tr>
            </thead>
            <tbody>
              {dashboard.week.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const school = (cls as { school?: string } | null)?.school
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{school || '—'}</td>
                    <td>{s.title}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À préparer */}
      <Section title="À préparer" subtitle="Séances planifiées dans les 72h prochaines">
        {dashboard.toPrepare.length === 0 ? (
          <p className="edu-empty">Rien à préparer dans l'immédiat.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Quand</th><th>Classe</th><th>Séance</th><th>Lieu</th></tr>
            </thead>
            <tbody>
              {dashboard.toPrepare.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                return (
                  <tr key={s._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{s.title}{s.theme && <span style={{ color: 'rgba(255,255,255,0.5)' }}> · {s.theme}</span>}</td>
                    <td>{s.location || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* À corriger */}
      <Section title="À corriger" subtitle={c.toGrade > 0 ? `${c.toGrade} copie(s) en attente` : 'Aucune correction en attente'}>
        {dashboard.toCorrect.length === 0 ? (
          <p className="edu-empty">Aucun devoir ouvert pour le moment.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Devoir</th><th>Classe</th><th>Type</th><th>Échéance</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.toCorrect.map((a) => {
                const cls = typeof a.classId === 'string' ? null : a.classId
                return (
                  <tr key={a._id} onClick={() => cls?._id && onOpenClass(cls._id)} style={{ cursor: 'pointer' }}>
                    <td>{a.title}</td>
                    <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                    <td>{ASSIGNMENT_KIND_LABEL[a.kind]}</td>
                    <td>{a.deadline ? formatDate(a.deadline) : '—'}</td>
                    <td>
                      <span className="edu-pill"><span className="edu-pill-dot" style={{ background: ASSIGNMENT_STATUS_COLOR[a.status] }} />{ASSIGNMENT_STATUS_LABEL[a.status]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Dernière séance par classe */}
      <Section title="Dernière séance par classe" subtitle="Rappel rapide : où on en est dans chaque classe.">
        {dashboard.lastSessionByClass.length === 0 ? (
          <p className="edu-empty">Aucune classe active.</p>
        ) : (
          <table className="edu-table">
            <thead>
              <tr><th>Classe</th><th>École</th><th>Dernière séance</th><th>Quand</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {dashboard.lastSessionByClass.map((row) => (
                <tr
                  key={row.class._id}
                  onClick={() => onOpenClass(row.class._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><span className="edu-pill"><span className="edu-pill-dot" style={{ background: row.class.color || '#22C55E' }} />{row.class.name}</span></td>
                  <td>{row.class.school || '—'}</td>
                  <td>{row.lastSession ? row.lastSession.title : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                  <td>{row.lastSession ? formatRelative(row.lastSession.date) : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                  <td>{row.lastSession ? <span className="edu-pill">{SESSION_STATUS_LABEL[row.lastSession.status]}</span> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Points d'attention pédagogiques (devoirs en retard) */}
      {c.lateSubmissions > 0 && (
        <Section title="Points d'attention pédagogiques" subtitle="Devoirs rendus en retard à corriger en priorité.">
          <p className="edu-sub">
            {c.lateSubmissions} soumission{c.lateSubmissions > 1 ? 's' : ''} en retard à examiner.
          </p>
        </Section>
      )}

      <Section title="Activité récente">
        {dashboard.activity.length === 0 ? (
          <p className="edu-empty">—</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {dashboard.activity.slice(0, 10).map((a) => (
              <li key={a._id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{formatRelative(a.createdAt)}</span>
                {' · '}
                <span>{a.action.toLowerCase()} {a.entityType}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="edu-h2">{title}</h2>
      {subtitle && <p className="edu-sub" style={{ marginBottom: 12 }}>{subtitle}</p>}
      {children}
    </section>
  )
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="edu-kpi">
      <div className="edu-kpi-label">{label}</div>
      <div className="edu-kpi-value">{value}</div>
      {sub && <div className="edu-kpi-sub">{sub}</div>}
    </div>
  )
}
