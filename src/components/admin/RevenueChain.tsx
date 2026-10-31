import React, { useCallback, useEffect, useState } from 'react'
import {
  fetchLeadRevenue,
  fetchProjectCandidates,
  linkProjectToLead,
  unlinkProjectFromLead,
} from '../../services/pilotage'
import type { LeadProject, LeadRevenueResponse } from '../../types/pilotage.types'
import { useI18n } from '../../context/I18nContext'
import { formatMoney } from '../../i18n/format'
import type { MessageKey } from '../../i18n'
import './RevenueChain.css'

interface RevenueChainProps {
  leadId: string
  canManage: boolean
}

const money = (value: number) => formatMoney(value, 'EUR', { maximumFractionDigits: 0 })

const DOCUMENT_LABEL_KEYS: Record<string, MessageKey> = {
  QUOTE: 'compB.revenue.docQuote',
  INVOICE: 'compB.revenue.docInvoice',
}

/**
 * Ce que ce lead a réellement produit.
 *
 * Le signé et l'encaissé sont montrés séparément : ils ne mesurent pas la même
 * chose et ne s'égalisent pas — une facture d'acompte ne couvre qu'une part du
 * devis. Le budget déclaré à la saisie est rappelé en regard, parce que l'écart
 * entre ce qu'on espérait et ce qu'on a signé est l'information utile.
 */
const RevenueChain: React.FC<RevenueChainProps> = ({ leadId, canManage }) => {
  const { t } = useI18n()
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
      setError((err as Error).message || t('compB.revenue.loadError'))
    } finally {
      setLoading(false)
    }
  }, [leadId, t])

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
      setError((err as Error).message || t('compB.revenue.projectsError'))
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
      setError((err as Error).message || t('compB.revenue.actionError'))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <div className="admin-loading">{t('compB.revenue.loading')}</div>
  if (!data) return error ? <div className="admin-error">{error}</div> : null

  const documentsByProject = (projectId: string) => data.documents.filter((document) => document.project === projectId)

  return (
    <div className="revenue-chain">
      <div className="revenue-summary">
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">{t('compB.revenue.budget')}</span>
          <span className="revenue-summary-value is-muted">{data.lead.budget ? money(data.lead.budget) : '—'}</span>
        </div>
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">{t('compB.revenue.signed')}</span>
          <span className="revenue-summary-value">{money(data.summary.signed)}</span>
        </div>
        <div className="revenue-summary-item">
          <span className="revenue-summary-label">{t('compB.revenue.collected')}</span>
          <span className="revenue-summary-value">{money(data.summary.collected)}</span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {data.projects.length === 0 ? (
        <p className="revenue-empty">{t('compB.revenue.noProject')}</p>
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
                    {t('compB.revenue.unlink')}
                  </button>
                )}
              </div>

              {documentsByProject(project._id).length === 0 ? (
                <p className="revenue-note">{t('compB.revenue.noDocument')}</p>
              ) : (
                <ul className="revenue-documents">
                  {documentsByProject(project._id).map((document) => (
                    <li key={document._id}>
                      <span className="revenue-doc-type">
                        {DOCUMENT_LABEL_KEYS[document.type] ? t(DOCUMENT_LABEL_KEYS[document.type]) : document.type}
                      </span>
                      <span className="revenue-doc-number">{document.number}</span>
                      <span className="revenue-doc-status">{document.status}</span>
                      <span className="revenue-doc-total">{money(document.total)}</span>
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
              {t('compB.revenue.linkExisting')}
            </button>
          ) : candidateReason === 'NO_CLIENT_ACCOUNT' ? (
            <p className="revenue-note">{t('compB.revenue.noClientAccount')}</p>
          ) : candidates.length === 0 ? (
            <p className="revenue-note">{t('compB.revenue.noFreeProject')}</p>
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
                    {t('compB.revenue.link')}
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
