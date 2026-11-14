import React, { useRef, type ReactNode } from 'react'
import { CalendarCheck, Inbox } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { CrmEmpty } from '../../../components/admin/crm-ui'
import type { Lead, WorklistGroupKey } from '../../../types/crm.types'
import WorklistSection, { type WorklistListProps } from '../crm-board/worklist/WorklistSection'
import { useRowFocus } from '../crm-board/worklist/useRowFocus'

interface ListViewProps extends WorklistListProps {
  group: Extract<WorklistGroupKey, 'upcoming' | 'drifting'>
  leads: Lead[]
  filtered: boolean
  clearFilters: ReactNode
}

/** « Cette semaine » et « À ne pas laisser filer » : une seule liste, mêmes lignes et mêmes actions. */
export default function ListView({
  group,
  leads,
  filtered,
  clearFilters,
  onPatch,
  onLogContact,
  onAddNote,
  ...rowProps
}: ListViewProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const emptyRef = useRef<HTMLDivElement>(null)
  const { track, announcement } = useRowFocus(leads, containerRef, emptyRef)
  const week = group === 'upcoming'

  return (
    <div className="crm-today-stack" ref={containerRef}>
      <p className="crm-ui-sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <WorklistSection
        group={group}
        leads={leads}
        empty={
          <div ref={emptyRef} tabIndex={-1} className="crm-today-focus-target">
            <CrmEmpty
              icon={week ? <CalendarCheck /> : <Inbox />}
              title={t(week ? 'crmToday.empty.weekTitle' : 'crmToday.empty.keepTitle')}
              action={filtered ? clearFilters : undefined}
            >
              {filtered ? t('crmToday.empty.filtered') : t(week ? 'crmToday.empty.week' : 'crmToday.empty.keep')}
            </CrmEmpty>
          </div>
        }
        onPatch={(id, patch) => track(id, () => onPatch(id, patch))}
        onLogContact={(id, payload) => track(id, () => onLogContact(id, payload))}
        onAddNote={(id, text) => track(id, () => onAddNote(id, text))}
        {...rowProps}
      />
    </div>
  )
}
