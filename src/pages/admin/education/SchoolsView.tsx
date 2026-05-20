import { useCallback, useEffect, useState } from 'react'
import { Building2, ChevronRight, RefreshCw } from 'lucide-react'
import {
  listEducationBySchool,
  type SchoolBucket,
} from '../../../services/education'

/**
 * VENIO-32 — Fiches école légères.
 *
 * Aggregation simple à partir des classes existantes : pas de modèle
 * dédié, pas de migration. Sert de hub par école : liste des classes,
 * total étudiants, lien vers la classe détaillée.
 */

export function SchoolsView({
  onOpenClass,
}: {
  onOpenClass: (classId: string) => void
}) {
  const [buckets, setBuckets] = useState<SchoolBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await listEducationBySchool()
      setBuckets(r.schools)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="edu-h1">Écoles</h1>
          <p className="edu-sub">
            {buckets.length} école{buckets.length > 1 ? 's' : ''} suivie{buckets.length > 1 ? 's' : ''}.
            Vue agrégée depuis le champ <code>école</code> de chaque classe.
          </p>
        </div>
        <button className="edu-btn ghost" onClick={refresh}><RefreshCw size={14} /> Rafraîchir</button>
      </div>

      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refresh}>Réessayer</button>
        </div>
      )}

      {loading && !buckets.length && <div className="edu-sub">Chargement…</div>}

      {!loading && buckets.length === 0 && (
        <div className="edu-empty">
          <div className="edu-empty-icon"><Building2 size={20} /></div>
          <div>Aucune école pour l'instant.</div>
          <div className="edu-empty-sub">
            Ajoute le champ "École" sur tes classes (ESIC, EMA, ISIFA…) pour activer cette vue.
          </div>
        </div>
      )}

      {buckets.map((b) => {
        const active = b.classes.filter((c) => c.status === 'ACTIVE').length
        return (
          <div key={b.school} className="edu-school-bucket">
            <div className="edu-school-bucket-head">
              <div className="edu-row" style={{ gap: 10 }}>
                <Building2 size={18} style={{ color: 'rgba(255,255,255,0.55)' }} />
                <span className="edu-school-bucket-name">{b.school}</span>
              </div>
              <div className="edu-school-bucket-meta">
                {b.classes.length} classe{b.classes.length > 1 ? 's' : ''}
                {' · '}{active} active{active > 1 ? 's' : ''}
                {' · '}{b.studentCount} étudiant{b.studentCount > 1 ? 's' : ''}
              </div>
            </div>
            <div className="edu-school-bucket-classes">
              {b.classes.map((c) => (
                <button
                  key={c._id}
                  className="edu-school-bucket-class"
                  onClick={() => onOpenClass(c._id)}
                >
                  <span className="edu-side-dot" style={{ background: c.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                      {[c.level, c.program].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.35)' }} />
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
