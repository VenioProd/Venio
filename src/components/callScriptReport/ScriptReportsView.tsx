import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import {
  getScriptReport,
  listScriptReports,
  type ScriptReport,
  type ScriptReportRow,
} from '../../services/callScriptReports'
import './scriptReports.css'

/**
 * Rapports hebdomadaires des scripts : historique des semaines et rapport ouvert.
 * Le même écran sert l'externe (ses rapports) et l'équipe (les siens, ou ceux de
 * toute l'équipe pour un administrateur du CRM, filtrables par membre).
 */
export default function ScriptReportsView({ base, team = false }: { base: string; team?: boolean }) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<ScriptReportRow[] | null>(null)
  const [canSeeTeam, setCanSeeTeam] = useState(false)
  const [author, setAuthor] = useState('')
  const [authors, setAuthors] = useState<Array<{ _id: string; name: string }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [report, setReport] = useState<ScriptReport | null>(null)
  const [error, setError] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const load = useCallback(() => {
    listScriptReports(base, author || undefined)
      .then((data) => {
        setRows(data.reports)
        setCanSeeTeam(Boolean(data.canSeeTeam))
        if (!author) {
          const seen = new Map<string, string>()
          for (const row of data.reports) if (row.author) seen.set(row.author._id, row.author.name)
          setAuthors([...seen].map(([_id, name]) => ({ _id, name })).sort((a, b) => a.name.localeCompare(b.name)))
        }
        setSelected((current) =>
          current && data.reports.some((r) => r._id === current) ? current : (data.reports[0]?._id ?? null),
        )
      })
      .then(() => setError(false))
      .catch(() => setError(true))
  }, [base, author])

  useEffect(load, [load])

  useEffect(() => {
    if (!selected) return
    let active = true
    getScriptReport(base, selected)
      .then((data) => active && setReport(data.report))
      .catch(() => active && setDetailError(selected))
    return () => {
      active = false
    }
  }, [base, selected])

  const day = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), [locale])
  const when = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale])
  const range = (row: ScriptReportRow) =>
    t('callScriptReport.range', {
      start: day.format(new Date(row.weekStart)),
      end: day.format(new Date(new Date(row.weekEnd).getTime() - 86_400_000)),
    })
  const weekLabel = (row: ScriptReportRow) =>
    t('callScriptReport.week', { week: row.weekKey.split('-W')[1] ?? row.weekKey })

  return (
    <section className="script-reports" aria-labelledby="script-reports-title">
      <header className="sr-head">
        <h2 id="script-reports-title">{t('callScriptReport.title')}</h2>
        <p className="sr-muted">{t(team ? 'callScriptReport.introTeam' : 'callScriptReport.intro')}</p>
      </header>

      {team && canSeeTeam && authors.length > 1 && (
        <label className="sr-filter">
          {t('callScriptReport.author')}
          <select value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">{t('callScriptReport.allAuthors')}</option>
            {authors.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error ? (
        <div className="sr-state sr-state--error" role="alert">
          <p>{t('callScriptReport.loadError')}</p>
          <button type="button" className="portal-button secondary" onClick={load}>
            {t('callScriptReport.retry')}
          </button>
        </div>
      ) : rows === null ? (
        <p className="sr-state" role="status">
          {t('callScriptReport.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="sr-state">{t('callScriptReport.empty')}</p>
      ) : (
        <div className="sr-layout">
          <nav className="sr-weeks" aria-label={t('callScriptReport.weeks')}>
            <ul>
              {rows.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    className="sr-week"
                    aria-current={row._id === selected ? 'true' : undefined}
                    onClick={() => setSelected(row._id)}
                  >
                    <span className="sr-week-title">
                      {weekLabel(row)}
                      {team && canSeeTeam && row.author && !author && (
                        <span className="sr-muted"> · {row.author.name}</span>
                      )}
                    </span>
                    <span className="sr-muted">{range(row)}</span>
                    <span className="sr-week-meta">
                      <span className={`sr-badge sr-badge--${row.status.toLowerCase()}`}>
                        {t(`callScriptReport.status.${row.status}` as MessageKey)}
                      </span>
                      {row.stats.conversionRate !== null && <strong>{row.stats.conversionRate} %</strong>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sr-detail" aria-live="polite">
            {detailError === selected ? (
              <p className="sr-state sr-state--error" role="alert">
                {t('callScriptReport.loadError')}
              </p>
            ) : !report || report._id !== selected ? (
              <p className="sr-state" role="status">
                {t('callScriptReport.loading')}
              </p>
            ) : (
              <ReportDetail report={report} title={`${weekLabel(report)} · ${range(report)}`} when={when} />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function ReportDetail({ report, title, when }: { report: ScriptReport; title: string; when: Intl.DateTimeFormat }) {
  const { t } = useI18n()
  const { stats, output } = report
  const rate = stats.conversionRate
  const reachedTarget = rate !== null && rate >= stats.targetConversionRate

  return (
    <article className="sr-report">
      <header className="sr-report-head">
        <h3>
          {title}
          {report.author && !report.own && <span className="sr-muted"> · {report.author.name}</span>}
        </h3>
        <span className={`sr-badge sr-badge--${report.status.toLowerCase()}`}>
          {t(`callScriptReport.status.${report.status}` as MessageKey)}
        </span>
      </header>

      <div className="sr-kpis">
        <div className="sr-kpi sr-kpi--main">
          <span className="sr-kpi-label">{t('callScriptReport.conversion')}</span>
          <strong className={reachedTarget ? 'sr-good' : undefined}>
            {rate === null ? t('callScriptReport.noReach') : `${rate} %`}
          </strong>
          <div
            className="sr-gauge"
            role="img"
            aria-label={`${t('callScriptReport.conversion')} ${rate ?? 0} %, ${t('callScriptReport.target', { rate: stats.targetConversionRate })}`}
          >
            <span className="sr-gauge-fill" style={{ width: `${Math.min(rate ?? 0, 100)}%` }} />
            <span className="sr-gauge-target" style={{ left: `${stats.targetConversionRate}%` }} />
          </div>
          <span className="sr-muted">
            {t('callScriptReport.target', { rate: stats.targetConversionRate })} ·{' '}
            {t('callScriptReport.conversionHelp')}
          </span>
        </div>
        <Kpi label={t('callScriptReport.calls')} value={stats.calls} />
        <Kpi label={t('callScriptReport.reached')} value={stats.reached} />
        <Kpi label={t('callScriptReport.meetings')} value={stats.conversions} />
        <Kpi
          label={t('callScriptReport.transcripts')}
          value={stats.transcriptsAnalyzed}
          note={
            stats.transcripts > stats.transcriptsAnalyzed
              ? t('callScriptReport.transcriptsCapped', {
                  analyzed: stats.transcriptsAnalyzed,
                  total: stats.transcripts,
                })
              : undefined
          }
        />
      </div>

      {stats.byScript.length > 0 && (
        <section className="sr-block">
          <h4>{t('callScriptReport.byScript')}</h4>
          <div className="sr-table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th scope="col">{t('callScriptReport.script')}</th>
                  <th scope="col">{t('callScriptReport.calls')}</th>
                  <th scope="col">{t('callScriptReport.reached')}</th>
                  <th scope="col">{t('callScriptReport.meetings')}</th>
                  <th scope="col">{t('callScriptReport.rate')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.byScript.map((row) => (
                  <tr key={row.tag}>
                    <th scope="row">{row.tag || t('callScriptReport.noScript')}</th>
                    <td>{row.calls}</td>
                    <td>{row.reached}</td>
                    <td>{row.conversions}</td>
                    <td>{row.reached ? `${Math.round((row.conversions / row.reached) * 100)} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.status === 'PENDING' && <p className="sr-state">{t('callScriptReport.pending')}</p>}
      {report.status === 'SKIPPED' && report.skipReason && (
        <p className="sr-state">{t(`callScriptReport.skipped.${report.skipReason}` as MessageKey)}</p>
      )}
      {report.status === 'FAILED' && (
        <p className="sr-state sr-state--error">
          {t('callScriptReport.failed')}{' '}
          {report.retryable &&
            report.nextRetryAt &&
            t('callScriptReport.failedRetry', { date: when.format(new Date(report.nextRetryAt)) })}
        </p>
      )}

      {output && (
        <>
          <section className="sr-block">
            <h4>{t('callScriptReport.summary')}</h4>
            <p>{output.summary}</p>
            <p>{output.conversionReading}</p>
          </section>

          <section className="sr-block">
            <h4>{t('callScriptReport.objections')}</h4>
            {output.objections.length === 0 ? (
              <p className="sr-muted">{t('callScriptReport.none')}</p>
            ) : (
              <ol className="sr-objections">
                {output.objections.map((o, i) => (
                  <li key={i}>
                    <div className="sr-objection-head">
                      <strong>{o.label}</strong>
                      <span className="sr-count">{t('callScriptReport.occurrences', { count: o.occurrences })}</span>
                    </div>
                    {o.quotes.map((q, j) => (
                      <blockquote key={j}>« {q} »</blockquote>
                    ))}
                    <p>
                      <span className="sr-label">{t('callScriptReport.tryResponse')}</span> {o.response}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="sr-moments">
            <Moments title={t('callScriptReport.advancing')} items={output.advancing} tone="good" />
            <Moments title={t('callScriptReport.losing')} items={output.losing} tone="bad" />
          </div>

          <section className="sr-block">
            <h4>{t('callScriptReport.changes')}</h4>
            {output.scriptChanges.length === 0 ? (
              <p className="sr-muted">{t('callScriptReport.none')}</p>
            ) : (
              <ul className="sr-changes">
                {output.scriptChanges.map((c, i) => (
                  <li key={i}>
                    {c.current && (
                      <p className="sr-before">
                        <span className="sr-label">{t('callScriptReport.instead')}</span> <s>{c.current}</s>
                      </p>
                    )}
                    <p className="sr-after">
                      <span className="sr-label">{t('callScriptReport.try')}</span> {c.proposed}
                    </p>
                    <p className="sr-muted">
                      <span className="sr-label">{t('callScriptReport.why')}</span> {c.why}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="sr-foot sr-muted">
            <p>{t('callScriptReport.quotesNote')}</p>
            {output.droppedQuotes > 0 && <p>{t('callScriptReport.dropped', { count: output.droppedQuotes })}</p>}
            {report.model && <p>{t('callScriptReport.model', { model: report.model })}</p>}
          </footer>
        </>
      )}
    </article>
  )
}

function Kpi({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="sr-kpi">
      <span className="sr-kpi-label">{label}</span>
      <strong>{value}</strong>
      {note && <span className="sr-muted">{note}</span>}
    </div>
  )
}

function Moments({
  title,
  items,
  tone,
}: {
  title: string
  items: Array<{ label: string; quote: string | null }>
  tone: 'good' | 'bad'
}) {
  const { t } = useI18n()
  return (
    <section className={`sr-block sr-block--${tone}`}>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="sr-muted">{t('callScriptReport.none')}</p>
      ) : (
        <ul className="sr-list">
          {items.map((m, i) => (
            <li key={i}>
              <strong>{m.label}</strong>
              {m.quote && <blockquote>« {m.quote} »</blockquote>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
