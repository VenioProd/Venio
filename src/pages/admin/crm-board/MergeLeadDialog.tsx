import React, { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { apiFetch } from '../../../lib/api'
import type { Lead } from '../../../types/crm.types'
import { STATUS_MAP } from './constants'
import { fetchDuplicates, type DuplicateCandidate } from './duplicates'

interface MergeLeadDialogProps {
  /** Lead de la fiche : il est absorbé puis supprimé. */
  lead: Lead
  /** Autres leads parmi lesquels choisir la cible (ceux déjà chargés par le tableau). */
  candidates: Lead[]
  onCancel: () => void
  /** Appelé une fois la fusion faite (le lead de la fiche n'existe plus). */
  onMerged: (target: { _id: string; company: string }) => void
}

type Target = Pick<Lead, '_id' | 'company' | 'contactEmail' | 'contactPhone' | 'status'>

const MAX_RESULTS = 8

/**
 * « Fusionner dans… » : choisir le lead à conserver, confirmer, puis
 * POST /api/admin/crm/leads/:cible/merge. Les doublons probables du lead
 * sont proposés en tête ; une recherche libre couvre le reste.
 */
const MergeLeadDialog: React.FC<MergeLeadDialogProps> = ({ lead, candidates, onCancel, onMerged }) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<DuplicateCandidate[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchDuplicates({
      company: lead.company,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      excludeId: lead._id,
    }).then((found) => {
      if (!cancelled) setSuggestions(found)
    })
    return () => {
      cancelled = true
    }
  }, [lead._id, lead.company, lead.contactEmail, lead.contactPhone])

  const results = useMemo<Target[]>(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return suggestions
    return candidates
      .filter((c) => c._id !== lead._id)
      .filter((c) =>
        [c.company, c.contactName, c.contactEmail, c.contactPhone].some((v) => v?.toLowerCase().includes(needle)),
      )
      .slice(0, MAX_RESULTS)
  }, [query, suggestions, candidates, lead._id])

  const statusLabel = (status: string) => (STATUS_MAP[status] ? t(STATUS_MAP[status].labelKey) : status)

  const confirm = async () => {
    if (!target) return
    setSaving(true)
    setError('')
    try {
      await apiFetch(`/api/admin/crm/leads/${target._id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ sourceId: lead._id }),
      })
      onMerged({ _id: target._id, company: target.company })
    } catch (err: unknown) {
      setError((err as Error).message || t('crm.merge.error'))
      setSaving(false)
    }
  }

  return (
    <div className="crm-modal-overlay" onClick={onCancel}>
      <div
        className="crm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-merge-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="crm-modal-header">
          <h2 id="crm-merge-title">{t('crm.merge.title', { company: lead.company })}</h2>
        </div>
        <div className="crm-modal-body">
          {target ? (
            <>
              <p>{t('crm.merge.confirm', { source: lead.company, target: target.company })}</p>
              <p style={{ fontSize: 13, opacity: 0.8 }}>{t('crm.merge.consequences', { target: target.company })}</p>
              {error && (
                <p role="alert" style={{ color: 'var(--danger, #c00)' }}>
                  {error}
                </p>
              )}
              <div className="crm-modal-actions">
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={() => setTarget(null)}
                  disabled={saving}
                >
                  {t('crm.merge.back')}
                </button>
                <button type="button" className="portal-button" onClick={confirm} disabled={saving}>
                  {saving ? t('crm.merge.merging') : t('crm.merge.submit')}
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                className="portal-input"
                placeholder={t('crm.merge.search')}
                aria-label={t('crm.merge.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
              <p style={{ fontSize: 13, opacity: 0.8 }}>
                {query.trim() ? t('crm.merge.results') : t('crm.merge.suggestions')}
              </p>
              {results.length === 0 ? (
                <p>{t('crm.merge.none')}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {results.map((r) => (
                    <li key={r._id}>
                      <button
                        type="button"
                        className="portal-button secondary"
                        style={{ width: '100%', textAlign: 'left', marginBottom: 6 }}
                        onClick={() => setTarget(r)}
                      >
                        {r.company}
                        {r.contactEmail ? ` · ${r.contactEmail}` : ''}
                        {r.contactPhone ? ` · ${r.contactPhone}` : ''}
                        {` (${statusLabel(r.status)})`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="crm-modal-actions">
                <button type="button" className="portal-button secondary" onClick={onCancel}>
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default MergeLeadDialog
