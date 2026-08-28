import React, { useCallback, useEffect, useState } from 'react'
import {
  fetchLeadRevenue,
  fetchProjectCandidates,
  linkProjectToLead,
  unlinkProjectFromLead,
} from '../../services/pilotage'
import type { LeadProject, LeadRevenueResponse } from '../../types/pilotage.types'
import './RevenueChain.css'

interface RevenueChainProps {
  leadId: string
  canManage: boolean
}

const money = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const DOCUMENT_LABELS: Record<string, string> = { QUOTE: 'Devis', INVOICE: 'Facture' }

/**
 * Ce que ce lead a réellement produit.
 *
 * Le signé et l'encaissé sont montrés séparément : ils ne mesurent pas la même
 * chose et ne s'égalisent pas — une facture d'acompte ne couvre qu'une part du
 * devis. Le budget déclaré à la saisie est rappelé en regard, parce que l'écart
 * entre ce qu'on espérait et ce qu'on a signé est l'information utile.
 */
const RevenueChain: React.FC<RevenueChainProps> = ({ leadId, canManage }) => {
  const [data, setData] = useState<LeadRevenueResponse | null>(null)
  const [candidates, setCandidates] = useState<LeadProject[]>([])
  const [candidateReason, setCandidateReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchLeadRevenue(leadId))
      setError('')
    } catch (err) {
      setError((err as Error).message || 'Impossible de charger la chaîne commerciale')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const openLink = async () => {
    setLinkOpen(true)
    try {
      const response = await fetchProjectCandidates(leadId)
      setCandidates(response.candidates)
      setCandidateReason(response.reason ?? null)
    } catch (err) {
      setError((err as Error).message || 'Impossible de charger les projets')
    }
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
      if (linkOpen) {
        const response = await fetchProjectCandidates(leadId)
        setCandidates(response.candidates)
      }
    } catch (err) {
      setError((err as Error).message || 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <div className="admin-loading">Chargement de la chaîne…</div>
  if (!data) return error ? <div className="admin-error">{error}</div> : null

  const documentsByProject = (projectId: string) => data.documents.filter((document) => document.project === projectId)

  return (
    <div className="revenue-chain">
      <div className="revenue-summary">
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">Budget annoncé</span>
          <span className="revenue-summary-value is-muted">
            {data.lead.budget ? money.format(data.lead.budget) : '—'}
          </span>
        </div>
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">Signé</span>
          <span className="revenue-summary-value">{money.format(data.summary.signed)}</span>
        </div>
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">Encaissé</span>
          <span className="revenue-summary-value">{money.format(data.summary.collected)}</span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {data.projects.length === 0 ? (
        <p className="revenue-empty">
          Aucun projet rattaché à ce lead. Rien ne relie donc ses affaires à ce qui a été facturé.
        </p>
      ) : (
        <ul className="revenue-projects">
          {data.projects.map((project) => (
            <li key={project._id} className="revenue-project">
              <div className="revenue-project-head">
                <span className="revenue-project-name">{project.name}</span>
                <span className="revenue-project-status">{project.status}</span>
                {canManage && (
                  <button
                    type="button"
                    className="revenue-unlink"
                    disabled={busy}
                    onClick={() => void run(() => unlinkProjectFromLead(leadId, project._id))}
                  >
                    Détacher
                  </button>
                )}
              </div>

              {documentsByProject(project._id).length === 0 ? (
                <p className="revenue-note">Aucun devis ni facture pour l'instant.</p>
              ) : (
                <ul className="revenue-documents">
                  {documentsByProject(project._id).map((document) => (
                    <li key={document._id}>
                      <span className="revenue-doc-type">{DOCUMENT_LABELS[document.type] ?? document.type}</span>
                      <span className="revenue-doc-number">{document.number}</span>
                      <span className="revenue-doc-status">{document.status}</span>
                      <span className="revenue-doc-total">{money.format(document.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="revenue-link">
          {!linkOpen ? (
            <button type="button" className="portal-button secondary" onClick={() => void openLink()}>
              Rattacher un projet existant
            </button>
          ) : candidateReason === 'NO_CLIENT_ACCOUNT' ? (
            <p className="revenue-note">
              Ce lead n'a pas encore de compte client : convertissez-le d'abord pour pouvoir lui rattacher un projet.
            </p>
          ) : candidates.length === 0 ? (
            <p className="revenue-note">Aucun projet libre chez ce client.</p>
          ) : (
            <ul className="revenue-candidates">
              {candidates.map((project) => (
                <li key={project._id}>
                  <span>{project.name}</span>
                  <button
                    type="button"
                    className="portal-button secondary"
                    disabled={busy}
                    onClick={() => void run(() => linkProjectToLead(leadId, project._id))}
                  >
                    Rattacher
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default RevenueChain
