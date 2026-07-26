import { apiFetch } from '../lib/api'
import type { ClientBillingDocument, QuoteProposal, QuoteTotals } from '../types/quote.types'

interface ProposalResponse {
  proposal: QuoteProposal
  totals: QuoteTotals
}

export function listProposals(projectId: string): Promise<{ proposals: QuoteProposal[] }> {
  return apiFetch(`/api/projects/${projectId}/proposals`)
}

export function getProposal(projectId: string, proposalId: string): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}`)
}

export function saveAnswers(
  projectId: string,
  proposalId: string,
  answers: { question: string; value: string }[],
): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/answers`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  })
}

// Seuls les identifiants voyagent : le total affiché vient toujours du serveur.
export function saveSelection(
  projectId: string,
  proposalId: string,
  selectedOptionalLineIds: string[],
): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/selection`, {
    method: 'PATCH',
    body: JSON.stringify({ selectedOptionalLineIds }),
  })
}

export function signProposal(
  projectId: string,
  proposalId: string,
  signerName: string,
): Promise<{ billingDocument: ClientBillingDocument }> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/sign`, {
    method: 'POST',
    body: JSON.stringify({ signerName, consent: true }),
  })
}

export function listBillingDocuments(projectId: string): Promise<{ documents: ClientBillingDocument[] }> {
  return apiFetch(`/api/projects/${projectId}/billing`)
}

export function billingPdfUrl(projectId: string, documentId: string): string {
  return `/api/projects/${projectId}/billing/${documentId}/pdf`
}
