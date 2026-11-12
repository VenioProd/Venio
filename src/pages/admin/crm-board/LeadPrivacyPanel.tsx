import { useCallback, useEffect, useState } from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import { useConfirm } from '../../../hooks/useConfirm'
import type { MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import './crmPrivacy.css'
import { apiDownload, apiFetch } from '../../../lib/api'
import type { ConsentStatus, Lead, LeadConsent, LegalBasis } from '../../../types/crm.types'

/**
 * Bloc « Données personnelles » de la fiche lead (RGPD, chantier 3D) :
 * consentement et base légale, opposition (« ne pas contacter »), présence dans
 * la liste de suppression ; export et anonymisation pour les administrateurs du CRM.
 */

interface PrivacyStatus {
  consent: LeadConsent
  doNotContact: boolean
  doNotContactAt: string | null
  doNotContactReason: string
  anonymizedAt: string | null
  suppressed: boolean
  canAdminister: boolean
}

interface Props {
  lead: Lead
  canManageCrm: boolean
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  /** Reflète la modification dans la fiche ouverte. */
  onLocalChange: (patch: Partial<Lead>) => void
}

const CONSENT_STATUSES: ConsentStatus[] = ['UNKNOWN', 'GRANTED', 'WITHDRAWN']
const LEGAL_BASES: LegalBasis[] = ['LEGITIMATE_INTEREST', 'CONSENT', 'CONTRACT']
const longDate = (iso?: string | null) =>
  iso ? formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export default function LeadPrivacyPanel({ lead, canManageCrm, onUpdateLead, onLocalChange }: Props) {
  const { t } = useI18n()
  const { confirm, ConfirmDialog } = useConfirm()
  const [status, setStatus] = useState<PrivacyStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<'export' | 'anonymize' | 'save' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Le serveur dit si l'utilisateur administre le CRM (miroir de administersCrm) : export et anonymisation.
  const isCrmAdmin = status?.canAdminister === true

  // Incrémenté pour relire le statut après une modification.
  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    apiFetch<PrivacyStatus>(`/api/admin/crm/leads/${lead._id}/privacy`)
      .then((next) => {
        if (!alive) return
        setStatus(next)
        setFailed(false)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [lead._id, version])

  const save = async (patch: Record<string, unknown>, local: Partial<Lead>) => {
    setBusy('save')
    setMessage(null)
    try {
      onLocalChange(local)
      await onUpdateLead(lead._id, patch)
      load()
    } catch {
      setMessage({ kind: 'error', text: t('crmPrivacy.saveError') })
    } finally {
      setBusy(null)
    }
  }

  const exportData = async () => {
    setBusy('export')
    setMessage(null)
    try {
      const { blob, filename } = await apiDownload(`/api/admin/crm/leads/${lead._id}/personal-data`)
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = filename || `lead-${lead._id}-donnees-personnelles.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch {
      setMessage({ kind: 'error', text: t('crmPrivacy.exportError') })
    } finally {
      setBusy(null)
    }
  }

  const anonymize = async () => {
    const ok = await confirm({
      title: t('crmPrivacy.anonymizeTitle'),
      message: t('crmPrivacy.anonymizeConfirm'),
      confirmLabel: t('crmPrivacy.anonymize'),
      variant: 'danger',
    })
    if (!ok) return
    setBusy('anonymize')
    setMessage(null)
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${lead._id}/anonymize`, { method: 'POST' })
      onLocalChange(res.lead)
      setMessage({ kind: 'ok', text: t('crmPrivacy.anonymizeDone') })
      load()
    } catch {
      setMessage({ kind: 'error', text: t('crmPrivacy.anonymizeError') })
    } finally {
      setBusy(null)
    }
  }

  const consent = status?.consent ?? lead.consent ?? { status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST' }
  const doNotContact = status?.doNotContact ?? Boolean(lead.doNotContact)
  const anonymizedAt = status?.anonymizedAt ?? lead.anonymizedAt ?? null
  const editable = canManageCrm && !anonymizedAt && busy === null

  return (
    <div className="crm-modal-notes crm-privacy-panel" aria-label={t('crmPrivacy.panel.title')} role="group">
      <label className="crm-modal-label">{t('crmPrivacy.panel.title')}</label>
      {failed && <p className="crm-privacy-error">{t('crmPrivacy.panel.loadError')}</p>}
      {!status && !failed && <p className="rich-dim">{t('crmPrivacy.panel.loading')}</p>}

      {anonymizedAt && (
        <p className="crm-privacy-note">{t('crmPrivacy.anonymized', { date: longDate(anonymizedAt) })}</p>
      )}

      <div className="crm-modal-quick-grid">
        <div className="crm-modal-quick-field">
          <label>{t('crmPrivacy.consent.label')}</label>
          {editable ? (
            <CustomSelect
              value={consent.status}
              onChange={(v) =>
                void save({ consent: { status: v } }, { consent: { ...consent, status: v as ConsentStatus } })
              }
              options={CONSENT_STATUSES.map((s) => ({ value: s, label: t(`crmPrivacy.consent.${s}` as MessageKey) }))}
            />
          ) : (
            <span>{t(`crmPrivacy.consent.${consent.status}` as MessageKey)}</span>
          )}
        </div>
        <div className="crm-modal-quick-field">
          <label>{t('crmPrivacy.basis.label')}</label>
          {editable ? (
            <CustomSelect
              value={consent.basis}
              onChange={(v) =>
                void save({ consent: { basis: v } }, { consent: { ...consent, basis: v as LegalBasis } })
              }
              options={LEGAL_BASES.map((b) => ({ value: b, label: t(`crmPrivacy.basis.${b}` as MessageKey) }))}
            />
          ) : (
            <span>{t(`crmPrivacy.basis.${consent.basis}` as MessageKey)}</span>
          )}
        </div>
      </div>
      {consent.at && (
        <p className="rich-dim">
          {t('crmPrivacy.consent.since', { date: longDate(consent.at), source: consent.source || '—' })}
        </p>
      )}

      <label className="crm-privacy-check">
        <input
          type="checkbox"
          checked={doNotContact}
          disabled={!editable}
          onChange={(e) => void save({ doNotContact: e.target.checked }, { doNotContact: e.target.checked })}
        />{' '}
        <strong>{t('crmPrivacy.doNotContact.label')}</strong>
      </label>
      <p className="rich-dim">
        {doNotContact && status?.doNotContactAt
          ? t('crmPrivacy.doNotContact.since', { date: longDate(status.doNotContactAt) })
          : t('crmPrivacy.doNotContact.hint')}
      </p>
      {status?.suppressed && (
        <p className="crm-privacy-note" role="note">
          {t('crmPrivacy.suppressed')}
        </p>
      )}

      {isCrmAdmin && (
        <div className="crm-modal-quick-btns" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="portal-button secondary"
            disabled={busy !== null}
            onClick={() => void exportData()}
          >
            {busy === 'export' ? t('crmPrivacy.exporting') : t('crmPrivacy.export')}
          </button>
          {!anonymizedAt && (
            <button
              type="button"
              className="portal-button secondary danger"
              disabled={busy !== null}
              onClick={() => void anonymize()}
            >
              {t('crmPrivacy.anonymize')}
            </button>
          )}
        </div>
      )}
      {message && (
        <p className={message.kind === 'error' ? 'crm-privacy-error' : 'crm-privacy-note'} role="status">
          {message.text}
        </p>
      )}
      {ConfirmDialog}
    </div>
  )
}
