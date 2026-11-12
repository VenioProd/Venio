import React, { useEffect, useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
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
const DuplicatesBanner: React.FC<DuplicateQuery> = ({
  company = '',
  contactEmail = '',
  contactPhone = '',
  excludeId,
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
    <div
      className="crm-duplicates-banner"
      role="status"
      style={{
        margin: '12px 0',
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid #d97706',
        background: 'color-mix(in srgb, #d97706 10%, transparent)',
      }}
    >
      <strong>{t('crm.duplicates.title', { count: duplicates.length })}</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {duplicates.map((d) => (
          <li key={d._id}>
            {d.company}
            {d.contactName ? ` — ${d.contactName}` : ''}
            {d.contactEmail ? ` · ${d.contactEmail}` : ''}
            {d.contactPhone ? ` · ${d.contactPhone}` : ''}
            {` (${statusLabel(d.status)}${d.archivedAt ? `, ${t('crm.duplicates.archived')}` : ''})`}
          </li>
        ))}
      </ul>
      <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.8 }}>{t('crm.duplicates.hint')}</p>
    </div>
  )
}

export default DuplicatesBanner
