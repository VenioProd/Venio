import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download, AlertTriangle, CheckCircle2, FileText, Database, RefreshCw,
  Play, Eye,
} from 'lucide-react'
import { ApiError } from '../../../lib/api'
import {
  listNotionImportLogs,
  previewNotionImport,
  runNotionImport,
  formatDate,
  type EducationClass,
  type NotionImportLog,
  type NotionImportPayload,
  type NotionImportStats,
  type NotionPreviewResult,
} from '../../../services/education'

interface Props {
  classes: EducationClass[]
}

function emptyStats(): NotionImportStats {
  return { created: 0, updated: 0, skipped: 0, errors: 0 }
}

function statusLabel(status: NotionImportLog['status']): string {
  switch (status) {
    case 'success': return 'Succès'
    case 'partial': return 'Partiel'
    case 'error': return 'Erreur'
    case 'running': return 'En cours'
    case 'pending': return 'En attente'
    default: return status
  }
}

function statusColor(status: NotionImportLog['status']): string {
  switch (status) {
    case 'success': return '#22C55E'
    case 'partial': return '#F59E0B'
    case 'error': return '#EF4444'
    case 'running': return '#0EA5E9'
    default: return '#94A3B8'
  }
}

function classLabel(log: NotionImportLog, classes: EducationClass[]): string {
  if (!log.classId) return '—'
  const klass = classes.find((c) => c._id === log.classId)
  return klass ? klass.name : log.classId
}

export function NotionImportView({ classes }: Props) {
  const [pageInput, setPageInput] = useState('')
  const [dbInput, setDbInput] = useState('')
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')

  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<NotionPreviewResult | null>(null)
  const [lastImport, setLastImport] = useState<NotionImportLog | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [tokenMissing, setTokenMissing] = useState(false)

  const [logs, setLogs] = useState<NotionImportLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const wantsDatabase = useMemo(() => dbInput.trim().length > 0, [dbInput])
  const wantsPage = useMemo(() => pageInput.trim().length > 0, [pageInput])

  const refreshLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const r = await listNotionImportLogs({ limit: 10 })
      setLogs(r.logs)
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Impossible de charger les imports passés.')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { refreshLogs() }, [refreshLogs])

  function buildPayload(): NotionImportPayload {
    const payload: NotionImportPayload = {}
    if (pageInput.trim()) payload.pageIdOrUrl = pageInput.trim()
    if (dbInput.trim()) payload.databaseIdOrUrl = dbInput.trim()
    if (query.trim()) payload.query = query.trim()
    if (classId) payload.classId = classId
    return payload
  }

  function handleApiError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 503) {
        setTokenMissing(true)
        setError(null)
        return
      }
      setError(err.message)
      return
    }
    setError(err instanceof Error ? err.message : 'Erreur inconnue')
  }

  async function onPreview() {
    setError(null)
    setTokenMissing(false)
    setPreviewing(true)
    setPreview(null)
    try {
      const r = await previewNotionImport(buildPayload())
      setPreview(r)
    } catch (err) {
      handleApiError(err)
    } finally {
      setPreviewing(false)
    }
  }

  async function onImport() {
    setError(null)
    setTokenMissing(false)
    setImporting(true)
    setLastImport(null)
    try {
      const r = await runNotionImport(buildPayload())
      setLastImport(r.log)
      setPreview(null)
      await refreshLogs()
    } catch (err) {
      handleApiError(err)
    } finally {
      setImporting(false)
    }
  }

  const canSubmit = (wantsPage || wantsDatabase)
    && !(wantsPage && wantsDatabase)
    && (!wantsDatabase || !!classId)

  return (
    <div className="edu-notion">
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="edu-h1">
            <Download size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Import Notion
          </h1>
          <p className="edu-sub">
            Importe une page Notion comme note, ou une base de données Notion comme étudiants
            d'une classe. Les rappels suivants sont mis à jour côté serveur :
            pages et lignes déjà importées sont rafraîchies, pas dupliquées.
          </p>
        </div>
        <button className="edu-btn ghost" onClick={refreshLogs} disabled={logsLoading} title="Rafraîchir les imports passés">
          <RefreshCw size={14} className={logsLoading ? 'edu-spin' : ''} /> Rafraîchir
        </button>
      </div>

      {tokenMissing && (
        <div className="edu-notion-banner warn" role="alert">
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>Notion non configuré côté serveur.</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Définir la variable d'environnement <code>NOTION_API_TOKEN</code> dans le backend
              (intégration interne Notion partagée avec la page ou la base à importer).
            </div>
          </div>
        </div>
      )}

      <div className="edu-notion-form">
        <div className="edu-form-group">
          <label><FileText size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />Page Notion (URL ou ID)</label>
          <input
            className="edu-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="https://www.notion.so/Ma-page-... ou un ID 32 caractères"
            disabled={wantsDatabase}
          />
          <div className="edu-notion-hint">
            Importe la page comme note (titre + blocs convertis en Markdown).
          </div>
        </div>

        <div className="edu-notion-sep">
          <span>ou</span>
        </div>

        <div className="edu-form-group">
          <label><Database size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />Base Notion (URL ou ID)</label>
          <input
            className="edu-input"
            value={dbInput}
            onChange={(e) => setDbInput(e.target.value)}
            placeholder="URL de base de données Notion ou ID 32 caractères"
            disabled={wantsPage}
          />
          <div className="edu-notion-hint">
            Importe les lignes comme étudiants d'une classe. Champs reconnus : Nom, Prénom, Email, Téléphone.
          </div>
        </div>

        <div className="edu-grid-2">
          <div className="edu-form-group">
            <label>Classe cible (étudiants)</label>
            <select
              className="edu-select"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!wantsDatabase}
            >
              <option value="">— Sélectionner une classe —</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}{c.school ? ` · ${c.school}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="edu-form-group">
            <label>Filtre nom (optionnel)</label>
            <input
              className="edu-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ne garde que les lignes contenant…"
              disabled={!wantsDatabase}
            />
          </div>
        </div>

        {wantsPage && wantsDatabase && (
          <div className="edu-notion-hint warn">
            Choisis soit une page, soit une base de données — pas les deux.
          </div>
        )}

        <div className="edu-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="edu-btn ghost"
            onClick={onPreview}
            disabled={!canSubmit || previewing || importing}
            title="Lance un dry-run, sans écriture en base"
          >
            <Eye size={14} /> {previewing ? 'Aperçu en cours…' : 'Aperçu (dry-run)'}
          </button>
          <button
            className="edu-btn"
            onClick={onImport}
            disabled={!canSubmit || previewing || importing}
          >
            <Play size={14} /> {importing ? 'Import en cours…' : 'Lancer l\'import'}
          </button>
        </div>
      </div>

      {error && (
        <div className="edu-notion-banner error" role="alert">
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>{error}</div>
        </div>
      )}

      {preview && (
        <ResultCard
          title="Résultat de l'aperçu (aucune écriture)"
          stats={preview.stats}
          messages={preview.messages}
          errors={preview.errors}
          source={preview.sourceType}
          variant="preview"
        />
      )}

      {lastImport && (
        <ResultCard
          title={`Import terminé — ${statusLabel(lastImport.status)}`}
          stats={lastImport.stats}
          messages={lastImport.messages}
          errors={lastImport.errors}
          source={lastImport.sourceType}
          variant={lastImport.status === 'error' ? 'error' : lastImport.status === 'partial' ? 'partial' : 'success'}
        />
      )}

      <div>
        <h2 className="edu-h2">Derniers imports</h2>
        {logsError && (
          <div className="edu-notion-banner error" role="alert">
            <AlertTriangle size={18} />
            <div style={{ flex: 1 }}>{logsError}</div>
            <button className="edu-btn ghost" onClick={refreshLogs}>Réessayer</button>
          </div>
        )}
        {!logsError && logs.length === 0 && !logsLoading && (
          <div className="edu-empty edu-empty-compact">
            <div className="edu-empty-icon">📥</div>
            <div>Aucun import Notion enregistré pour l'instant.</div>
          </div>
        )}
        {logs.length > 0 && (
          <div className="edu-notion-logs">
            {logs.map((log) => (
              <LogRow key={log._id} log={log} classes={classes} />
            ))}
          </div>
        )}
      </div>

      <NotionImportStyles />
    </div>
  )
}

function ResultCard({
  title, stats, messages, errors, source, variant,
}: {
  title: string
  stats: NotionImportStats
  messages: string[]
  errors: string[]
  source: 'page' | 'database'
  variant: 'preview' | 'success' | 'partial' | 'error'
}) {
  const total = stats.created + stats.updated + stats.skipped + stats.errors
  return (
    <div className={`edu-notion-result is-${variant}`}>
      <div className="edu-notion-result-head">
        {variant === 'success' && <CheckCircle2 size={16} />}
        {(variant === 'partial' || variant === 'error') && <AlertTriangle size={16} />}
        {variant === 'preview' && <Eye size={16} />}
        <strong>{title}</strong>
        <span className="edu-notion-result-source">
          {source === 'page' ? <FileText size={12} /> : <Database size={12} />}
          {source === 'page' ? 'Page' : 'Base de données'}
        </span>
      </div>
      <div className="edu-notion-stats">
        <Stat label="Créés" value={stats.created} color="#22C55E" />
        <Stat label="Mis à jour" value={stats.updated} color="#0EA5E9" />
        <Stat label="Ignorés" value={stats.skipped} color="#94A3B8" />
        <Stat label="Erreurs" value={stats.errors} color="#EF4444" />
        <Stat label="Total" value={total} color="#F59E0B" />
      </div>
      {messages.length > 0 && (
        <div className="edu-notion-list">
          <div className="edu-notion-list-title">Messages</div>
          <ul>
            {messages.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}
            {messages.length > 50 && <li className="edu-notion-list-more">… +{messages.length - 50} de plus</li>}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div className="edu-notion-list errors">
          <div className="edu-notion-list-title">Erreurs</div>
          <ul>
            {errors.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}
            {errors.length > 50 && <li className="edu-notion-list-more">… +{errors.length - 50} de plus</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="edu-notion-stat">
      <div className="edu-notion-stat-value" style={{ color }}>{value}</div>
      <div className="edu-notion-stat-label">{label}</div>
    </div>
  )
}

function LogRow({ log, classes }: { log: NotionImportLog; classes: EducationClass[] }) {
  const [open, setOpen] = useState(false)
  const color = statusColor(log.status)
  return (
    <div className="edu-notion-log" style={{ borderLeftColor: color }}>
      <button className="edu-notion-log-head" onClick={() => setOpen((v) => !v)}>
        <div className="edu-notion-log-main">
          <span className="edu-notion-log-status" style={{ background: color }}>{statusLabel(log.status)}</span>
          <span className="edu-notion-log-source">
            {log.sourceType === 'page' ? <FileText size={12} /> : <Database size={12} />}
            {log.sourceType === 'page' ? 'Page' : 'Base'}
          </span>
          <span className="edu-notion-log-date">{formatDate(log.createdAt, true)}</span>
          {log.classId && <span className="edu-pill">{classLabel(log, classes)}</span>}
        </div>
        <div className="edu-notion-log-stats">
          <span title="Créés"><strong style={{ color: '#22C55E' }}>{log.stats.created}</strong> créés</span>
          <span title="Mis à jour"><strong style={{ color: '#0EA5E9' }}>{log.stats.updated}</strong> maj</span>
          <span title="Ignorés"><strong style={{ color: '#94A3B8' }}>{log.stats.skipped}</strong> ignorés</span>
          {log.stats.errors > 0 && (
            <span title="Erreurs"><strong style={{ color: '#EF4444' }}>{log.stats.errors}</strong> err.</span>
          )}
        </div>
      </button>
      {open && (
        <div className="edu-notion-log-body">
          {log.sourceUrl && (
            <div className="edu-notion-log-meta">Source : <code>{log.sourceUrl}</code></div>
          )}
          {log.messages.length > 0 && (
            <details open>
              <summary>{log.messages.length} message{log.messages.length > 1 ? 's' : ''}</summary>
              <ul>
                {log.messages.slice(0, 50).map((m, i) => <li key={i}>{m}</li>)}
                {log.messages.length > 50 && <li>… +{log.messages.length - 50}</li>}
              </ul>
            </details>
          )}
          {log.errors.length > 0 && (
            <details open>
              <summary style={{ color: '#FCA5A5' }}>{log.errors.length} erreur{log.errors.length > 1 ? 's' : ''}</summary>
              <ul>
                {log.errors.slice(0, 50).map((m, i) => <li key={i} style={{ color: '#FCA5A5' }}>{m}</li>)}
                {log.errors.length > 50 && <li>… +{log.errors.length - 50}</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function NotionImportStyles() {
  return (
    <style>{`
      .edu-notion { display: flex; flex-direction: column; gap: 16px; }
      .edu-notion-form {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 16px;
      }
      .edu-notion-sep {
        display: flex; align-items: center; gap: 8px;
        margin: 4px 0 12px;
        font-size: 11px; color: rgba(255,255,255,0.45);
        text-transform: uppercase; letter-spacing: 0.1em;
      }
      .edu-notion-sep::before, .edu-notion-sep::after {
        content: ''; flex: 1; height: 1px;
        background: rgba(255,255,255,0.08);
      }
      .edu-notion-hint {
        font-size: 11.5px; color: rgba(255,255,255,0.5);
        margin-top: 4px;
      }
      .edu-notion-hint.warn { color: #FCD34D; }
      .edu-notion-banner {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 14px; border-radius: 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .edu-notion-banner.warn {
        border-color: rgba(245,158,11,0.4);
        background: rgba(245,158,11,0.08);
      }
      .edu-notion-banner.error {
        border-color: rgba(239,68,68,0.4);
        background: rgba(239,68,68,0.08);
      }
      .edu-notion-banner code {
        background: rgba(0,0,0,0.35); padding: 1px 6px;
        border-radius: 4px; font-size: 12px;
      }

      .edu-notion-result {
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        padding: 14px 16px;
        display: flex; flex-direction: column; gap: 12px;
      }
      .edu-notion-result.is-success { border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.06); }
      .edu-notion-result.is-partial { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.06); }
      .edu-notion-result.is-error { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.06); }
      .edu-notion-result.is-preview { border-color: rgba(14,165,233,0.35); background: rgba(14,165,233,0.06); }
      .edu-notion-result-head {
        display: flex; align-items: center; gap: 8px;
        font-size: 13.5px;
      }
      .edu-notion-result-source {
        margin-left: auto;
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 11px; color: rgba(255,255,255,0.6);
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .edu-notion-stats {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
      }
      .edu-notion-stat {
        background: rgba(0,0,0,0.25);
        border-radius: 8px;
        padding: 10px;
        text-align: center;
      }
      .edu-notion-stat-value { font-size: 22px; font-weight: 700; }
      .edu-notion-stat-label { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; }
      .edu-notion-list { font-size: 12px; }
      .edu-notion-list-title {
        font-size: 11px; color: rgba(255,255,255,0.55);
        text-transform: uppercase; letter-spacing: 0.08em;
        margin-bottom: 4px;
      }
      .edu-notion-list ul { margin: 0; padding-left: 18px; line-height: 1.55; }
      .edu-notion-list.errors ul li { color: #FCA5A5; }
      .edu-notion-list-more { color: rgba(255,255,255,0.45); list-style: none; margin-left: -18px; }

      .edu-notion-logs { display: flex; flex-direction: column; gap: 8px; }
      .edu-notion-log {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-left: 3px solid #94A3B8;
        border-radius: 10px;
        overflow: hidden;
      }
      .edu-notion-log-head {
        width: 100%; text-align: left;
        background: none; border: none;
        padding: 10px 14px;
        cursor: pointer;
        display: flex; align-items: center; gap: 16px;
        flex-wrap: wrap;
        color: inherit;
      }
      .edu-notion-log-head:hover { background: rgba(255,255,255,0.04); }
      .edu-notion-log-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .edu-notion-log-status {
        font-size: 10.5px; font-weight: 600;
        padding: 2px 8px; border-radius: 4px;
        color: #0B0F17;
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .edu-notion-log-source {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 11px; color: rgba(255,255,255,0.6);
      }
      .edu-notion-log-date { font-size: 12px; color: rgba(255,255,255,0.7); }
      .edu-notion-log-stats {
        margin-left: auto;
        display: flex; align-items: center; gap: 12px;
        font-size: 12px; color: rgba(255,255,255,0.7);
      }
      .edu-notion-log-body {
        padding: 0 14px 12px;
        font-size: 12.5px; color: rgba(255,255,255,0.78);
      }
      .edu-notion-log-meta {
        font-size: 12px; color: rgba(255,255,255,0.55);
        margin: 4px 0 8px;
        overflow-wrap: anywhere;
      }
      .edu-notion-log-meta code {
        background: rgba(0,0,0,0.35); padding: 1px 6px;
        border-radius: 4px; font-size: 11.5px;
      }
      .edu-notion-log-body summary { cursor: pointer; padding: 4px 0; }
      .edu-notion-log-body ul { margin: 4px 0 8px; padding-left: 18px; line-height: 1.5; }

      .edu-spin { animation: edu-notion-spin 1s linear infinite; }
      @keyframes edu-notion-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      @media (max-width: 700px) {
        .edu-notion-stats { grid-template-columns: repeat(2, 1fr); }
        .edu-notion-log-stats { margin-left: 0; }
      }
    `}</style>
  )
}

export default NotionImportView
