import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { logInteraction } from '../../../services/interactions'
import { translate } from '../../../i18n'
import type { AdminUser, Lead, LeadFormData, WorklistResponse } from '../../../types/crm.types'
import { TEAM_CALL_DESK_PREFIX } from '../crm-board/teamDeskApi'

/** Analyse d'appel prête à valider : `GET /api/admin/call-desk/pending` (aucun contenu d'appel). */
export interface PendingAnalysis {
  callId: string
  leadId: string
  company: string
  callDate: string
  durationSec: number | null
  author: { _id: string; name: string } | null
}

/** Fiche retenue pour opposition, à décider (la citation est relue par la décision elle-même). */
export interface PendingHold {
  leadId: string
  company: string
  at: string
  author: { _id: string; name: string } | null
}

export interface PendingResponse {
  analyses: PendingAnalysis[]
  analysesTotal: number
  holds: PendingHold[]
  holdsTotal: number
}

/**
 * Données et actions du moment « Aujourd'hui » : la file de travail
 * (`/crm/worklist`), les membres (nom de l'attributaire), et, pour qui gère le
 * CRM, ce qui attend sa décision (`/call-desk/pending`). Les actions sont
 * celles de l'ancienne file (`CrmBoard` en mode file) : même route, même
 * charge, même rechargement de la seule file après chaque action.
 */
export function useTodayData({
  canManageCrm,
  onWorklistCounts,
}: {
  canManageCrm: boolean
  onWorklistCounts?: (counts: WorklistResponse['counts']) => void
}) {
  const [worklist, setWorklist] = useState<WorklistResponse | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [pending, setPending] = useState<PendingResponse | null>(null)
  const [pendingError, setPendingError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null)
  const countsRef = useRef(onWorklistCounts)
  useEffect(() => {
    countsRef.current = onWorklistCounts
  })

  const loadWorklist = useCallback(async () => {
    try {
      const data = await apiFetch<WorklistResponse>('/api/admin/crm/worklist')
      setWorklist(data)
      if (data.counts) countsRef.current?.(data.counts)
    } catch (err: unknown) {
      setError((err as Error).message || translate('crm.error.loadWorklist'))
    }
  }, [])

  const loadPending = useCallback(async () => {
    if (!canManageCrm) return
    try {
      setPending(await apiFetch<PendingResponse>(`${TEAM_CALL_DESK_PREFIX}/pending`))
      setPendingError(false)
    } catch {
      setPendingError(true)
    }
  }, [canManageCrm])

  useEffect(() => {
    let active = true
    apiFetch<{ users?: AdminUser[] }>('/api/admin/admins')
      .then((data) => active && setAdmins(data.users || []))
      .catch(() => undefined)
    void Promise.resolve()
      .then(() => Promise.all([loadWorklist(), loadPending()]))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadWorklist, loadPending])

  const findLead = (leadId: string): Lead | null => {
    if (!worklist) return null
    for (const leads of Object.values(worklist.groups)) {
      const lead = leads.find((item) => item._id === leadId)
      if (lead) return lead
    }
    return null
  }

  // Une action verrouille sa ligne, puis recharge la file seule. En cas d'échec,
  // le rechargement remet la ligne dans son état réel et l'erreur reste affichée.
  const runLeadAction = async (leadId: string, action: () => Promise<unknown>) => {
    setError('')
    setBusyLeadId(leadId)
    let succeeded = false
    try {
      await action()
      succeeded = true
    } catch (err: unknown) {
      setError((err as Error).message || translate('crm.error.leadAction'))
    } finally {
      await loadWorklist()
      setBusyLeadId(null)
    }
    return succeeded
  }

  const patchLead = (leadId: string, patch: Record<string, unknown>) =>
    apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) })

  const lostReasons = worklist?.lostReasons ?? []
  /** Vrai si le patch ferme une affaire sans motif : il est alors demandé ici, pas par l'API. */
  const needsLostReason = (patch: Record<string, unknown>) =>
    patch.status === 'LOST' && !patch.lostReason && lostReasons.length > 0

  const patch = (leadId: string, change: Record<string, unknown>) =>
    runLeadAction(leadId, () => patchLead(leadId, change))

  const logContact = (leadId: string, payload: { nextActionAt: string | null; note: string }) =>
    runLeadAction(leadId, async () => {
      await patchLead(leadId, { lastContactAt: new Date().toISOString(), nextActionAt: payload.nextActionAt })
      if (payload.note) await logInteraction('LEAD', leadId, { kind: 'NOTE', body: payload.note })
    })

  const addNote = (leadId: string, text: string) =>
    runLeadAction(leadId, () => logInteraction('LEAD', leadId, { kind: 'NOTE', body: text }))

  const createLead = async (form: LeadFormData) => {
    setError('')
    try {
      await apiFetch<{ lead: Lead }>('/api/admin/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          company: form.company,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          source: form.source,
          project: form.project,
          // Sans choix explicite, le serveur déduit l'entité du projet.
          ...(form.entity ? { entity: form.entity } : {}),
          budget: form.budget === '' ? null : Number(form.budget),
          priority: form.priority,
          status: form.status,
          nextActionAt: form.nextActionAt ? new Date(form.nextActionAt).toISOString() : null,
          notes: form.notes,
          serviceType: form.serviceType,
          leadTemperature: form.leadTemperature,
          interactionNotes: form.interactionNotes,
          assignedTo: form.assignedTo || null,
        }),
      })
      void loadWorklist()
      return true
    } catch (err: unknown) {
      setError((err as Error).message || translate('crm.error.create'))
      return false
    }
  }

  return {
    worklist,
    admins,
    pending,
    pendingError,
    loading,
    error,
    setError,
    busyLeadId,
    lostReasons,
    findLead,
    needsLostReason,
    patch,
    logContact,
    addNote,
    createLead,
    loadWorklist,
    loadPending,
  }
}
