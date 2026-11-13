import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import {
  apiErrorCode,
  createCallInsightsApi,
  DEFAULT_API_PREFIX,
  type AnalysisResponse,
  type ApplyInput,
  type CallTranscript,
} from '../../services/callInsights'
import AnalysisReviewPanel from './AnalysisReviewPanel'
import OptOutAlert from './OptOutAlert'
import TranscriptView from './TranscriptView'
import './callInsights.css'

export interface CallInsightsProps {
  callId: string
  /** Préfixe des routes : `/api/commercial` dans l'espace du commercial. */
  apiPrefix?: string
  /** Délai entre deux relectures pendant une attente, en ms ; 0 désactive la relecture. */
  pollMs?: number
  /** Aucune validation possible (consultation). */
  readOnly?: boolean
  /** L'équipe peut lever la retenue d'une opposition ; l'externe seulement la confirmer. */
  canLiftHold?: boolean
  /** Appelée après une application réussie (pour rafraîchir la fiche autour). */
  onApplied?: () => void
  /**
   * Cet appel retient la fiche (`callHold.call`). Sert quand l'analyse a été effacée par une opposition à
   * l'enregistrement : l'équipe décide alors de la retenue par l'appel.
   */
  holdCall?: boolean
  className?: string
}

interface Snapshot {
  callId: string
  transcript: CallTranscript | null
  analysis: AnalysisResponse | null
  failed: boolean
  /** Relectures consécutives sans analyse alors que la transcription est terminée. */
  emptyPolls: number
}

/** Relectures sans analyse après la fin de la transcription, avant de conclure qu'il n'y en a pas. */
const EMPTY_POLL_LIMIT = 6

export default function CallInsights({
  callId,
  apiPrefix = DEFAULT_API_PREFIX,
  pollMs = 5000,
  readOnly = false,
  canLiftHold = false,
  onApplied,
  holdCall = false,
  className = '',
}: CallInsightsProps) {
  const { t } = useI18n()
  const api = useMemo(() => createCallInsightsApi(apiPrefix), [apiPrefix])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<'analysis' | 'transcript'>('analysis')
  const [quote, setQuote] = useState<{ text: string; nonce: number } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  const fetchAll = useCallback(async () => {
    try {
      const [transcript, analysis] = await Promise.all([api.transcript(callId), api.analysis(callId)])
      return { ok: true as const, transcript, analysis }
    } catch {
      return { ok: false as const }
    }
  }, [api, callId])

  const absorb = useCallback(
    (result: Awaited<ReturnType<typeof fetchAll>>) =>
      setSnapshot((previous) => {
        const before = previous?.callId === callId ? previous : null
        if (!result.ok)
          return {
            callId,
            transcript: before?.transcript ?? null,
            analysis: before?.analysis ?? null,
            failed: true,
            emptyPolls: before?.emptyPolls ?? 0,
          }
        const empty = result.transcript?.status === 'DONE' && !result.analysis
        return { callId, ...result, failed: false, emptyPolls: empty ? (before?.emptyPolls ?? 0) + 1 : 0 }
      }),
    [callId],
  )

  const refresh = useCallback(async () => absorb(await fetchAll()), [absorb, fetchAll])

  useEffect(() => {
    let live = true
    void fetchAll().then((result) => live && absorb(result))
    return () => {
      live = false
    }
  }, [fetchAll, absorb])

  const current = snapshot?.callId === callId ? snapshot : null
  const transcriptStatus = current?.transcript?.status
  const analysisStatus = current?.analysis?.analysis.status
  const waitingTranscript = transcriptStatus === 'PENDING' || transcriptStatus === 'PROCESSING'
  const waitingAnalysis =
    transcriptStatus === 'DONE' &&
    (analysisStatus === 'PENDING' || (!current?.analysis && current !== null && current.emptyPolls < EMPTY_POLL_LIMIT))
  const waiting = !current?.failed && (waitingTranscript || waitingAnalysis)

  useEffect(() => {
    if (!current || !waiting || !pollMs) return
    let live = true
    const timer = setTimeout(() => {
      void fetchAll().then((result) => live && absorb(result))
    }, pollMs)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [current, waiting, pollMs, fetchAll, absorb])

  function showQuote(text: string) {
    setQuote((previous) => ({ text, nonce: (previous?.nonce ?? 0) + 1 }))
    setTab('transcript')
  }

  async function retry() {
    setRetrying(true)
    setRetryFailed(false)
    try {
      await api.retry(callId)
      await refresh()
    } catch {
      setRetryFailed(true)
    } finally {
      setRetrying(false)
    }
  }

  async function apply(input: ApplyInput) {
    try {
      await api.apply(callId, input)
    } catch (failure) {
      // Quelqu'un d'autre a déjà relu l'analyse, ou elle a changé d'état : on affiche l'état réel avant le message.
      if (['ANALYSIS_ALREADY_REVIEWED', 'ANALYSIS_NOT_READY'].includes(apiErrorCode(failure))) await refresh()
      throw failure
    }
    await refresh()
    onApplied?.()
  }

  async function decideHold(action: 'CONFIRM' | 'DISMISS') {
    await api.optOut(callId, action)
    await refresh()
    onApplied?.()
  }

  async function reject() {
    await api.reject(callId)
    await refresh()
  }

  // ── États ──
  if (!current) {
    return (
      <div className={`call-insights ${className}`.trim()}>
        <p className="ci-state" role="status">
          {t('callInsights.loading')}
        </p>
      </div>
    )
  }
  if (current.failed && !current.transcript && !current.analysis) {
    return (
      <div className={`call-insights ${className}`.trim()}>
        <div className="ci-state ci-state--error" role="alert">
          <p>{t('callInsights.loadError')}</p>
          <button type="button" className="portal-button secondary" onClick={() => void refresh()}>
            {t('callInsights.retry')}
          </button>
        </div>
      </div>
    )
  }

  const { transcript, analysis } = current
  const output = analysis?.analysis.output ?? null

  function analysisSide() {
    if (!transcript) return <p className="ci-state">{t('callInsights.noTranscript')}</p>
    if (transcript.status === 'PENDING' || transcript.status === 'PROCESSING')
      return (
        <p className="ci-state ci-state--wait" role="status">
          <span className="ci-spinner" aria-hidden />
          {t(transcript.status === 'PENDING' ? 'callInsights.wait.transcriptPending' : 'callInsights.wait.transcript')}
        </p>
      )
    if (transcript.status === 'FAILED')
      return (
        <p className="ci-state ci-state--error" role="alert">
          {t('callInsights.transcriptFailed')}
        </p>
      )
    if (transcript.status === 'SKIPPED') return <p className="ci-state">{t('callInsights.transcriptSkipped')}</p>

    if (!analysis) {
      if (waitingAnalysis)
        return (
          <p className="ci-state ci-state--wait" role="status">
            <span className="ci-spinner" aria-hidden />
            {t('callInsights.wait.analysis')}
          </p>
        )
      return (
        <div className="ci-state">
          <p>{t('callInsights.noAnalysis')}</p>
          {!readOnly && (
            <button type="button" className="portal-button secondary" disabled={retrying} onClick={() => void retry()}>
              {t('callInsights.analysis.start')}
            </button>
          )}
          {retryFailed && (
            <p className="ci-error" role="alert">
              {t('callInsights.error.retry')}
            </p>
          )}
        </div>
      )
    }
    if (analysis.analysis.status === 'PENDING')
      return (
        <p className="ci-state ci-state--wait" role="status">
          <span className="ci-spinner" aria-hidden />
          {t('callInsights.wait.analysis')}
        </p>
      )
    if (analysis.analysis.status === 'FAILED' || !output)
      return (
        <div className="ci-state ci-state--error">
          <p role="alert">{t('callInsights.analysisFailed')}</p>
          {!readOnly && (
            <button type="button" className="portal-button secondary" disabled={retrying} onClick={() => void retry()}>
              {retrying ? t('callInsights.analysis.retrying') : t('callInsights.analysis.retry')}
            </button>
          )}
          {retryFailed && (
            <p className="ci-error" role="alert">
              {t('callInsights.error.retry')}
            </p>
          )}
        </div>
      )
    return (
      <AnalysisReviewPanel
        key={analysis.analysis._id}
        analysis={analysis.analysis}
        current={analysis.current}
        acceptableKeys={analysis.acceptableKeys}
        actionChoices={analysis.actionChoices}
        onApply={apply}
        onReject={reject}
        onQuote={showQuote}
        readOnly={readOnly}
      />
    )
  }

  const hasTranscript = transcript?.status === 'DONE'
  // La retenue de la fiche peut venir d'un autre appel : seul celui qui l'a posée la décide (sinon 409 NO_CALL_HOLD).
  const hold = analysis?.current.callHold as { call?: unknown } | null | undefined
  const heldHere = Boolean(hold) && (!hold?.call || String(hold.call) === callId)
  const erasedHold = !analysis && holdCall && canLiftHold && !readOnly

  return (
    <div className={`call-insights ${className}`.trim()}>
      {(output?.optOut.detected || erasedHold) && (
        <OptOutAlert
          quote={output?.optOut.quote ?? null}
          onQuote={hasTranscript ? showQuote : undefined}
          held={heldHere || erasedHold}
          onConfirm={readOnly ? undefined : () => decideHold('CONFIRM')}
          onLift={readOnly || !canLiftHold ? undefined : () => decideHold('DISMISS')}
        />
      )}

      {current.failed && (
        <p className="ci-error" role="alert">
          {t('callInsights.refreshError')}
        </p>
      )}

      <div className="ci-tabs" role="tablist" aria-label={t('callInsights.tabs.label')}>
        {(['analysis', 'transcript'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`ci-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`ci-panel-${name}`}
            className={`admin-tab ${tab === name ? 'active' : ''}`}
            onClick={() => setTab(name)}
          >
            {t(`callInsights.tabs.${name}`)}
          </button>
        ))}
      </div>

      <div className="ci-layout">
        <div
          className="ci-panel"
          role="tabpanel"
          id="ci-panel-analysis"
          aria-labelledby="ci-tab-analysis"
          data-active={tab === 'analysis'}
        >
          {analysisSide()}
        </div>
        <div
          className="ci-panel"
          role="tabpanel"
          id="ci-panel-transcript"
          aria-labelledby="ci-tab-transcript"
          data-active={tab === 'transcript'}
        >
          {hasTranscript ? (
            <TranscriptView
              segments={transcript.segments}
              highlight={quote?.text ?? null}
              highlightNonce={quote?.nonce ?? 0}
            />
          ) : (
            <p className="ci-state">{t('callInsights.transcript.unavailable')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
