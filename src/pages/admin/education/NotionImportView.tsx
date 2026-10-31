import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, AlertTriangle, CheckCircle2, FileText, Database, RefreshCw, Play, Eye } from 'lucide-react'
import { ApiError } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatShortDate } from './eduFormat'
import {
  listNotionImportLogs,
  previewNotionImport,
  runNotionImport,
  type EducationClass,
  type NotionImportLog,
  type NotionImportPayload,
  type NotionImportStats,
  type NotionPreviewResult,
} from '../../../services/education'

interface Props {
  onImported?: () => void
  classes: EducationClass[]
}

function emptyStats(): NotionImportStats {
  return { created: 0, updated: 0, skipped: 0, errors: 0 }
}

function statusLabel(status: NotionImportLog['status']): string {
  switch (status) {
    case 'success':
      return translate('common.success')
    case 'partial':
      return translate('eduA.notion.status.partial')
    case 'error':
      return translate('common.error')
    case 'running':
      return translate('eduA.notion.status.running')
    case 'pending':
      return translate('eduA.notion.status.pending')
    default:
      return status
  }
}

function statusColor(status: NotionImportLog['status']): string {
  switch (status) {
    case 'success':
      return '#22C55E'
    case 'partial':
      return '#F59E0B'
    case 'error':
      return '#EF4444'
    case 'running':
      return '#0EA5E9'
    default:
      return '#94A3B8'
  }
}

function classLabel(log: NotionImportLog, classes: EducationClass[]): string {
  if (!log.classId) return '—'
  const klass = classes.find((c) => c._id === log.classId)
  return klass ? klass.name : log.classId
}

export function NotionImportView({ classes, onImported }: Props) {
  const { t } = useI18n()
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
      setLogsError(err instanceof Error ? err.message : translate('eduA.notion.logsError'))
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshLogs()
  }, [refreshLogs])

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
    setError(err instanceof Error ? err.message : translate('eduA.notion.unknownError'))
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
      onImported?.()
      setPreview(null)
      await refreshLogs()
    } catch (err) {
      handleApiError(err)
    } finally {
      setImporting(false)
    }
  }

  const canSubmit = (wantsPage || wantsDatabase) && !(wantsPage && wantsDatabase) && (!wantsDatabase || !!classId)

  return (
    <div className="edu-notion">
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="edu-h1">
            <Download size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            {t('eduA.notion.title')}
          </h1>
          <p className="edu-sub">{t('eduA.notion.subtitle')}</p>
        </div>
        <button
          className="edu-btn ghost"
          onClick={refreshLogs}
          disabled={logsLoading}
          title={t('eduA.notion.refreshTitle')}
        >
          <RefreshCw size={14} className={logsLoading ? 'edu-spin' : ''} /> {t('eduA.notion.refresh')}
        </button>
      </div>

      {tokenMissing && (
        <div className="edu-notion-banner warn" role="alert">
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>{t('eduA.notion.notConfigured')}</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>{t('eduA.notion.notConfiguredHelp')}</div>
          </div>
        </div>
      )}

      <div className="edu-notion-form">
        <div className="edu-form-group">
          <label>
            <FileText size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            {t('eduA.notion.pageLabel')}
          </label>
          <input
            className="edu-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder={t('eduA.notion.pagePlaceholder')}
            disabled={wantsDatabase}
          />
          <div className="edu-notion-hint">{t('eduA.notion.pageHint')}</div>
        </div>

        <div className="edu-notion-sep">
          <span>{t('eduA.notion.or')}</span>
        </div>

        <div className="edu-form-group">
          <label>
            <Database size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            {t('eduA.notion.dbLabel')}
          </label>
          <input
            className="edu-input"
            value={dbInput}
            onChange={(e) => setDbInput(e.target.value)}
            placeholder={t('eduA.notion.dbPlaceholder')}
            disabled={wantsPage}
          />
          <div className="edu-notion-hint">{t('eduA.notion.dbHint')}</div>
        </div>

        <div className="edu-grid-2">
          <div className="edu-form-group">
            <label>{t('eduA.notion.targetClass')}</label>
            <select
              className="edu-select"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!wantsDatabase}
            >
              <option value="">{t('eduA.notion.selectClass')}</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                  {c.school ? ` · ${c.school}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="edu-form-group">
            <label>{t('eduA.notion.nameFilter')}</label>
            <input
              className="edu-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('eduA.notion.nameFilterPlaceholder')}
              disabled={!wantsDatabase}
            />
          </div>
        </div>

        {wantsPage && wantsDatabase && <div className="edu-notion-hint warn">{t('eduA.notion.eitherOr')}</div>}

        <div className="edu-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="edu-btn ghost"
            onClick={onPreview}
            disabled={!canSubmit || previewing || importing}
            title={t('eduA.notion.previewTitle')}
          >
            <Eye size={14} /> {previewing ? t('eduA.notion.previewing') : t('eduA.notion.preview')}
          </button>
          <button className="edu-btn" onClick={onImport} disabled={!canSubmit || previewing || importing}>
            <Play size={14} /> {importing ? t('eduA.notion.importing') : t('eduA.notion.runImport')}
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
          title={t('eduA.notion.previewResult')}
          stats={preview.stats}
          messages={preview.messages}
          errors={preview.errors}
          source={preview.sourceType}
          variant="preview"
        />
      )}

      {lastImport && (
        <ResultCard
          title={t('eduA.notion.importDone', { status: statusLabel(lastImport.status) })}
          stats={lastImport.stats}
          messages={lastImport.messages}
          errors={lastImport.errors}
          source={lastImport.sourceType}
          variant={lastImport.status === 'error' ? 'error' : lastImport.status === 'partial' ? 'partial' : 'success'}
        />
      )}

      <div>
        <h2 className="edu-h2">{t('eduA.notion.recent')}</h2>
        {logsError && (
          <div className="edu-notion-banner error" role="alert">
            <AlertTriangle size={18} />
            <div style={{ flex: 1 }}>{logsError}</div>
            <button className="edu-btn ghost" onClick={refreshLogs}>
              {t('eduA.common.retry')}
            </button>
          </div>
        )}
        {!logsError && logs.length === 0 && !logsLoading && (
          <div className="edu-empty edu-empty-compact">
            <div className="edu-empty-icon">📥</div>
            <div>{t('eduA.notion.noImports')}</div>
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
  title,
  stats,
  messages,
  errors,
  source,
  variant,
}: {
  title: string
  stats: NotionImportStats
  messages: string[]
  errors: string[]
  source: 'page' | 'database'
  variant: 'preview' | 'success' | 'partial' | 'error'
}) {
  const { t } = useI18n()
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
          {source === 'page' ? t('eduA.notion.sourcePage') : t('eduA.notion.sourceDatabase')}
        </span>
      </div>
      <div className="edu-notion-stats">
        <Stat label={t('eduA.notion.stat.created')} value={stats.created} color="#22C55E" />
        <Stat label={t('eduA.notion.stat.updated')} value={stats.updated} color="#0EA5E9" />
        <Stat label={t('eduA.notion.stat.skipped')} value={stats.skipped} color="#94A3B8" />
        <Stat label={t('eduA.notion.stat.errors')} value={stats.errors} color="#EF4444" />
        <Stat label={t('eduA.notion.stat.total')} value={total} color="#F59E0B" />
      </div>
      {messages.length > 0 && (
        <div className="edu-notion-list">
          <div className="edu-notion-list-title">{t('eduA.notion.messages')}</div>
          <ul>
            {messages.slice(0, 50).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
            {messages.length > 50 && (
              <li className="edu-notion-list-more">{t('eduA.notion.more', { count: messages.length - 50 })}</li>
            )}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div className="edu-notion-list errors">
          <div className="edu-notion-list-title">{t('eduA.notion.stat.errors')}</div>
          <ul>
            {errors.slice(0, 50).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
            {errors.length > 50 && (
              <li className="edu-notion-list-more">{t('eduA.notion.more', { count: errors.length - 50 })}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="edu-notion-stat">
      <div className="edu-notion-stat-value" style={{ color }}>
        {value}
      </div>
      <div className="edu-notion-stat-label">{label}</div>
    </div>
  )
}

function LogRow({ log, classes }: { log: NotionImportLog; classes: EducationClass[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const color = statusColor(log.status)
  return (
    <div className="edu-notion-log" style={{ borderLeftColor: color }}>
      <button className="edu-notion-log-head" onClick={() => setOpen((v) => !v)}>
        <div className="edu-notion-log-main">
          <span className="edu-notion-log-status" style={{ background: color }}>
            {statusLabel(log.status)}
          </span>
          <span className="edu-notion-log-source">
            {log.sourceType === 'page' ? <FileText size={12} /> : <Database size={12} />}
            {log.sourceType === 'page' ? t('eduA.notion.sourcePage') : t('eduA.notion.sourceBase')}
          </span>
          <span className="edu-notion-log-date">{formatShortDate(log.createdAt, true)}</span>
          {log.classId && <span className="edu-pill">{classLabel(log, classes)}</span>}
        </div>
        <div className="edu-notion-log-stats">
          <span title={t('eduA.notion.stat.created')}>
            <strong style={{ color: '#22C55E' }}>{log.stats.created}</strong> {t('eduA.notion.log.created')}
          </span>
          <span title={t('eduA.notion.stat.updated')}>
            <strong style={{ color: '#0EA5E9' }}>{log.stats.updated}</strong> {t('eduA.notion.log.updated')}
          </span>
          <span title={t('eduA.notion.stat.skipped')}>
            <strong style={{ color: 'var(--text-secondary)' }}>{log.stats.skipped}</strong>{' '}
            {t('eduA.notion.log.skipped')}
          </span>
          {log.stats.errors > 0 && (
            <span title={t('eduA.notion.stat.errors')}>
              <strong style={{ color: '#EF4444' }}>{log.stats.errors}</strong> {t('eduA.notion.log.errors')}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="edu-notion-log-body">
          {log.sourceUrl && (
            <div className="edu-notion-log-meta">
              {t('eduA.notion.source')} <code>{log.sourceUrl}</code>
            </div>
          )}
          {log.messages.length > 0 && (
            <details open>
              <summary>{t('eduA.notion.messageCount', { count: log.messages.length })}</summary>
              <ul>
                {log.messages.slice(0, 50).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
                {log.messages.length > 50 && <li>… +{log.messages.length - 50}</li>}
              </ul>
            </details>
          )}
          {log.errors.length > 0 && (
            <details open>
              <summary style={{ color: '#FCA5A5' }}>
                {t('eduA.notion.errorCount', { count: log.errors.length })}
              </summary>
              <ul>
                {log.errors.slice(0, 50).map((m, i) => (
                  <li key={i} style={{ color: '#FCA5A5' }}>
                    {m}
                  </li>
                ))}
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
