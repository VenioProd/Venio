import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import { ACCOUNTING, errorText, Metrics } from './shared'
import FinanceConfiguration from './FinanceConfiguration'
import FinanceSchedule from './FinanceSchedule'
import FinanceInvoices from './FinanceInvoices'
import FinanceShares from './FinanceShares'
import FinanceCosts from './FinanceCosts'
import type {
  Beneficiary,
  CostLine,
  Dashboard,
  FinanceResponse,
  Invoice,
  Payment,
  RuleVersion,
  ShareTemplate,
  ProjectCost,
} from './types'
import '../AccountingPortal.css'

interface TabData {
  finance: FinanceResponse
  invoices: Invoice[]
  payments: Payment[]
  versions: RuleVersion[]
  beneficiaries: Beneficiary[]
  templates: ShareTemplate[]
  costs: CostLine[]
  costDetails: ProjectCost[]
}

export default function ProjectAccountingTab({ projectId, clientId }: { projectId: string; clientId?: string }) {
  const { user } = useAuth()
  const canView = hasPermission(user, PERMISSIONS.VIEW_ACCOUNTING)
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const canIssue = hasPermission(user, PERMISSIONS.MANAGE_BILLING)
  const canDownload = hasPermission(user, PERMISSIONS.VIEW_BILLING)
  const { hash } = useLocation()
  const [data, setData] = useState<TabData | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const load = useCallback(() => {
    if (!canView) return Promise.resolve()
    return Promise.all([
      apiFetch<FinanceResponse>(`${ACCOUNTING}/projects/${projectId}/finance`),
      apiFetch<Dashboard>(`${ACCOUNTING}/project-finance/dashboard`),
      apiFetch<{ payments: Payment[] }>(`${ACCOUNTING}/projects/${projectId}/payments`),
      apiFetch<{ versions: RuleVersion[] }>(`${ACCOUNTING}/projects/${projectId}/share-rules`),
      apiFetch<{ beneficiaries: Beneficiary[] }>(`${ACCOUNTING}/beneficiaries`),
      apiFetch<{ templates: ShareTemplate[] }>(`${ACCOUNTING}/share-templates`),
      apiFetch<{ lines: CostLine[] }>(`${ACCOUNTING}/projects/${projectId}/costs`),
    ]).then(([finance, dashboard, payments, versions, beneficiaries, templates, costs]) => {
      setData({
        finance,
        invoices: dashboard.projects.find((row) => row.project._id === projectId)?.invoices || [],
        payments: payments.payments,
        versions: versions.versions,
        beneficiaries: beneficiaries.beneficiaries,
        templates: templates.templates,
        costs: costs.lines,
        costDetails: dashboard.projects.find((row) => row.project._id === projectId)?.costs || [],
      })
      setError('')
      setRevision((value) => value + 1)
    })
  }, [projectId, canView])
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  useEffect(() => {
    if (data && hash.startsWith('#facture-')) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [data, hash])
  if (!canView) return null
  return (
    <div className="pf-workspace">
      {error && (
        <p className="admin-error" role="alert">
          {error}{' '}
          <button
            className="portal-button secondary"
            onClick={() => void load().catch((error) => setError(errorText(error)))}
          >
            Actualiser
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Chargement de la comptabilité du projet…</p>}
      {data && (
        <>
          <Metrics summary={data.finance.summary} full />
          <FinanceConfiguration
            key={`configuration-${revision}-${clientId}`}
            projectId={projectId}
            clientId={clientId}
            finance={data.finance.finance}
            canManage={canManage}
            onSaved={load}
          />
          <FinanceSchedule data={data.finance} projectId={projectId} canManage={canManage} onSaved={load} />
          {data.finance.finance && (
            <FinanceInvoices
              invoices={data.invoices}
              payments={data.payments}
              canManage={canManage}
              canIssue={canIssue}
              canDownload={canDownload}
              onSaved={load}
            />
          )}
          {!data.finance.finance && (
            <p>Enregistrez une configuration financière pour suivre les factures dans cet onglet.</p>
          )}
          <FinanceShares
            projectId={projectId}
            data={data.finance}
            versions={data.versions}
            templates={data.templates}
            beneficiaries={data.beneficiaries}
            canManage={canManage}
            onSaved={load}
          />
          <FinanceCosts
            key={`costs-${revision}`}
            projectId={projectId}
            lines={data.costs}
            costDetails={data.costDetails}
            canManage={canManage}
            onSaved={load}
          />
        </>
      )}
    </div>
  )
}
