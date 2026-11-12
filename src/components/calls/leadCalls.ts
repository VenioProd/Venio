import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCallsApi, type LeadCall } from '../../services/calls'
import type { AnalysisStatus, TranscriptStatus } from '../../services/callInsights'

const TRANSCRIPT_FINAL: TranscriptStatus[] = ['DONE', 'FAILED', 'SKIPPED']
const ANALYSIS_FINAL: AnalysisStatus[] = ['READY', 'APPLIED', 'PARTIAL', 'REJECTED', 'FAILED']

/** Au-delà, on ne relit plus : l'appel est trop ancien pour qu'un résultat arrive encore. */
const WAIT_LIMIT_MS = 20 * 60_000
/** Sans enregistrement 3 minutes après la fin, il n'y en aura pas (réglage coupé). */
const NO_RECORDING_GRACE_MS = 3 * 60_000

const timeOf = (call: LeadCall) => Date.parse(call.endedAt ?? call.answeredAt ?? call.startedAt ?? '') || null

/** Vrai quand plus rien n'est attendu pour cet appel (transcript et analyse définitifs, ou jamais prévus). */
export function isCallSettled(call: LeadCall, now: number = Date.now()): boolean {
  const at = timeOf(call)
  // Jamais connecté, ou trop ancien : rien à attendre.
  if (at === null || now - at > WAIT_LIMIT_MS) return true
  if (call.recording.objection || call.recording.status === 'STOPPED') return true
  const transcript = call.transcriptStatus
  if (!transcript) return call.recording.status === 'NONE' && now - at > NO_RECORDING_GRACE_MS
  if (!TRANSCRIPT_FINAL.includes(transcript)) return false
  if (transcript !== 'DONE') return true
  return call.analysisStatus !== null && ANALYSIS_FINAL.includes(call.analysisStatus)
}

/** Un appel décroché : seul cas où il y a un transcript ou un enregistrement à consulter. */
export const wasAnswered = (call: LeadCall) =>
  Boolean(call.answeredAt) || call.transcriptStatus !== null || call.recording.status !== 'NONE'

export interface UseLeadCalls {
  calls: LeadCall[]
  loading: boolean
  error: boolean
  reload: () => void
}

/**
 * Appels d'une fiche, relus tant que l'un d'eux attend un transcript ou une analyse (délai croissant, 6 à 30 s).
 * `refreshKey` force une relecture, par exemple après la fin d'un appel.
 */
export function useLeadCalls(leadId: string | null, apiPrefix?: string, refreshKey: unknown = 0): UseLeadCalls {
  const api = useMemo(() => createCallsApi(apiPrefix), [apiPrefix])
  const [state, setState] = useState<{ leadId: string | null; calls: LeadCall[]; error: boolean } | null>(null)
  const [tick, setTick] = useState(0)
  const attempts = useRef(0)
  const reload = useCallback(() => {
    attempts.current = 0
    setTick((value) => value + 1)
  }, [])

  const current = state?.leadId === leadId ? state : null
  const waiting = Boolean(current && !current.error && current.calls.some((call) => !isCallSettled(call)))
  const calls = current?.calls
  const failed = current?.error

  // Lecture : à chaque changement de fiche, de clé de relance ou de tick.
  useEffect(() => {
    if (!leadId) return
    let live = true
    api
      .forLead(leadId)
      .then((list) => live && setState({ leadId, calls: list, error: false }))
      .catch(
        () =>
          live &&
          setState((previous) => ({ leadId, calls: previous?.leadId === leadId ? previous.calls : [], error: true })),
      )
    return () => {
      live = false
    }
  }, [api, leadId, refreshKey, tick])

  // Relance : tant qu'un appel attend, avec un délai croissant.
  useEffect(() => {
    if (!leadId || !waiting) return
    const delay = Math.min(30_000, 6_000 + attempts.current * 3_000)
    const timer = setTimeout(() => {
      attempts.current += 1
      setTick((value) => value + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [leadId, waiting, calls, failed])

  return {
    calls: current?.calls ?? [],
    loading: Boolean(leadId) && current === null,
    error: current?.error ?? false,
    reload,
  }
}

/** `m:ss`, ou `h:mm:ss` au-delà d'une heure. */
export function formatDuration(totalSec: number) {
  const seconds = Math.max(0, Math.floor(totalSec))
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours ? `${hours}:${pad(minutes)}` : minutes}:${pad(seconds % 60)}`
}
