import React, { useEffect, useState } from 'react'
import { GitMerge } from 'lucide-react'
import { CrmBanner } from '../../../components/admin/crm-ui'
import { useI18n } from '../../../context/I18nContext'
import './lead/lead.css'
import { STATUS_MAP } from './constants'
import {
  DUPLICATE_DEBOUNCE_MS,
  fetchDuplicates,
  hasDuplicateInput,
  type DuplicateCandidate,
  type DuplicateQuery,
} from './duplicates'

/**
 * Bandeau « doublons probables » du formulaire de création : interroge le
 * serveur 500 ms après la dernière frappe sur l'entreprise, l'e-mail ou le
 * téléphone. Informatif : ne bloque jamais la saisie (le blocage éventuel est
 * un réglage serveur).
 */
const DuplicatesBanner: React.FC<DuplicateQuery & { onMerge?: () => void }> = ({
  company = '',
  contactEmail = '',
  contactPhone = '',
  excludeId,
  onMerge,
}) => {
  const { t } = useI18n()
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const statusLabel = (status: string) => (STATUS_MAP[status] ? t(STATUS_MAP[status].labelKey) : status)

  useEffect(() => {
    if (!hasDuplicateInput({ company, contactEmail, contactPhone })) {
      setDuplicates([])
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void fetchDuplicates({ company, contactEmail, contactPhone, excludeId }).then((found) => {
        if (!cancelled) setDuplicates(found)
      })
    }, DUPLICATE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [company, contactEmail, contactPhone, excludeId])

  if (duplicates.length === 0) return null
  return (
    <CrmBanner
      tone="amber"
      role="status"
      icon={<GitMerge />}
      title={t('crm.duplicates.title', { count: duplicates.length })}
      actions={
        onMerge && (
          <button type="button" className="crm-ui-btn crm-ui-btn--sm" onClick={onMerge}>
            {t('crm.merge.open')}
          </button>
        )
      }
    >
      <span className="crm-lead-dup">
        {duplicates.map((d) => (
          <span key={d._id} className="crm-lead-dup__row">
            {d.company}
            {d.contactName ? ` — ${d.contactName}` : ''}
            {d.contactEmail ? ` · ${d.contactEmail}` : ''}
            {d.contactPhone ? ` · ${d.contactPhone}` : ''}
            {` (${statusLabel(d.status)}${d.archivedAt ? `, ${t('crm.duplicates.archived')}` : ''})`}
          </span>
        ))}
        <span className="crm-lead-dup__hint">{t(onMerge ? 'crm.duplicates.hintExisting' : 'crm.duplicates.hint')}</span>
      </span>
    </CrmBanner>
  )
}

export default DuplicatesBanner
