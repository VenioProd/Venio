import React from 'react'
import { apiDownload } from '../../../lib/api'
import {
  formatCurrency,
  parseCurrency,
  toDateTimeLocal,
  SUGGESTIONS_SERVICE_TYPES,
  SUGGESTIONS_DELIVERABLE_TYPES,
  SUGGESTIONS_TAGS,
} from '../../../lib/formatUtils'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { ProjectDetailsTabProps } from './types'

const BILLING_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  DRAFT: 'projects.billingStatus.draft',
  ISSUED: 'projects.billingStatus.issued',
  SENT: 'projects.billingStatus.sent',
  ACCEPTED: 'projects.billingStatus.accepted',
  PAID: 'projects.billingStatus.paid',
  CANCELLED: 'projects.billingStatus.cancelled',
}

const deadlineDueAtDisplay = (dueAt: string): string => (dueAt ? toDateTimeLocal(dueAt) : '')

const ProjectDetailsTab: React.FC<ProjectDetailsTabProps> = ({
  project,
  form,
  setForm,
  admins,
  billingDocuments,
  canEditProjects,
  canManageBilling,
  canViewBilling,
  serviceTypeInput,
  setServiceTypeInput,
  deliverableTypeInput,
  setDeliverableTypeInput,
  tagInput,
  setTagInput,
  setError,
  onSave,
  onAddServiceType,
  onRemoveServiceType,
  onAddDeliverableType,
  onRemoveDeliverableType,
  onAddDeadline,
  onUpdateDeadline,
  onRemoveDeadline,
  onAddTag,
  onRemoveTag,
  onCreateQuote,
  onCreateInvoice,
  onGeneratePdf,
  onMarkSent,
  onMarkPaid,
}) => {
  const { t } = useI18n()
  return (
    <div className="admin-form-section" style={{ marginTop: 24 }}>
      <h2>{t('projects.detailTab.heading')}</h2>
      <form className="portal-list" onSubmit={onSave}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.info.name')}
          </label>
          <input
            className="portal-input"
            placeholder={t('projects.detailTab.namePlaceholder')}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.description')}
          </label>
          <textarea
            className="portal-input"
            placeholder={t('projects.detailTab.description')}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.info.status')}
          </label>
          <CustomSelect
            className="portal-input"
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={[
              { value: 'EN_COURS', label: t('projects.status.inProgress') },
              { value: 'EN_ATTENTE', label: t('projects.status.onHold') },
              { value: 'TERMINE', label: t('projects.status.done') },
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.info.number')}
          </label>
          <input
            className="portal-input"
            placeholder={t('projects.detailTab.numberPlaceholder')}
            value={form.projectNumber ?? ''}
            onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.form.dates.start')}
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.form.dates.plannedEnd')}
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.endDate ?? ''}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.form.dates.actualDelivery')}
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.deliveredAt ?? ''}
              onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.mgmt.priority')}
          </label>
          <CustomSelect
            className="portal-input"
            value={form.priority ?? 'NORMALE'}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={[
              { value: 'BASSE', label: t('projects.priority.low') },
              { value: 'NORMALE', label: t('projects.priority.normal') },
              { value: 'HAUTE', label: t('projects.priority.high') },
              { value: 'URGENTE', label: t('projects.priority.urgent') },
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.ownerLabel')}
          </label>
          <CustomSelect
            className="portal-input"
            value={form.assignedTo}
            onChange={(v) => setForm({ ...form, assignedTo: v })}
            options={[
              { value: '', label: t('projects.form.mgmt.unassigned') },
              ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` })),
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.summaryLabel')}
          </label>
          <input
            className="portal-input"
            placeholder={t('projects.detailTab.summaryPlaceholder')}
            value={form.summary ?? ''}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.internalNotesLabel')}
          </label>
          <textarea
            className="portal-input"
            placeholder={t('projects.detailTab.internalNotesPlaceholder')}
            value={form.internalNotes ?? ''}
            onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <h2 style={{ marginTop: 24, marginBottom: 16 }}>{t('projects.detailTab.moduleOptions')}</h2>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.types.service')}
          </label>
          <datalist id="detail-service-types-suggestions">
            {SUGGESTIONS_SERVICE_TYPES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="portal-input"
              list="detail-service-types-suggestions"
              placeholder={t('projects.form.types.servicePlaceholder')}
              value={serviceTypeInput}
              onChange={(e) => setServiceTypeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddServiceType())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddServiceType}>
              {t('projects.form.add')}
            </button>
          </div>
          {(form.serviceTypes || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.serviceTypes || []).map((s, i) => (
                <span key={i} className="admin-tag">
                  {s}
                  <button type="button" onClick={() => onRemoveServiceType(i)} aria-label={t('projects.form.remove')}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.types.deliverable')}
          </label>
          <datalist id="detail-deliverable-types-suggestions">
            {SUGGESTIONS_DELIVERABLE_TYPES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="portal-input"
              list="detail-deliverable-types-suggestions"
              placeholder={t('projects.form.types.deliverablePlaceholder')}
              value={deliverableTypeInput}
              onChange={(e) => setDeliverableTypeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddDeliverableType())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddDeliverableType}>
              {t('projects.form.add')}
            </button>
          </div>
          {(form.deliverableTypes || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.deliverableTypes || []).map((s, i) => (
                <span key={i} className="admin-tag">
                  {s}
                  <button
                    type="button"
                    onClick={() => onRemoveDeliverableType(i)}
                    aria-label={t('projects.form.remove')}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.deadlines')}
          </label>
          {(form.deadlines || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                className="portal-input"
                placeholder={t('projects.detailTab.labelPlaceholder')}
                value={d.label}
                onChange={(e) => onUpdateDeadline(i, 'label', e.target.value)}
                style={{ flex: 1 }}
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type="datetime-local"
                  value={deadlineDueAtDisplay(d.dueAt)}
                  onChange={(e) => onUpdateDeadline(i, 'dueAt', e.target.value || '')}
                  style={{ width: 200 }}
                />
              </div>
              <button type="button" className="portal-button secondary" onClick={() => onRemoveDeadline(i)}>
                {t('projects.detailTab.removeShort')}
              </button>
            </div>
          ))}
          <button type="button" className="portal-button secondary" onClick={onAddDeadline}>
            {t('projects.detailTab.addDeadline')}
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.budget')}
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input
              className="portal-input"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={
                form.budget?.amount !== '' && form.budget?.amount != null ? formatCurrency(form.budget.amount) : ''
              }
              onChange={(e) => {
                const parsed = parseCurrency(e.target.value)
                setForm({ ...form, budget: { ...form.budget, amount: parsed === '' ? '' : parsed } })
              }}
              style={{ width: 140 }}
            />
            <CustomSelect
              className="portal-input"
              value={form.budget?.currency ?? 'EUR'}
              onChange={(v) => setForm({ ...form, budget: { ...form.budget, currency: v } })}
              options={[
                { value: 'EUR', label: 'EUR' },
                { value: 'USD', label: 'USD' },
                { value: 'CHF', label: 'CHF' },
              ]}
            />
          </div>
          <input
            className="portal-input"
            placeholder={t('projects.detailTab.budgetNotePlaceholder')}
            value={form.budget?.note ?? ''}
            onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.mgmt.tags')}
          </label>
          <datalist id="detail-tags-suggestions">
            {SUGGESTIONS_TAGS.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="portal-input"
              list="detail-tags-suggestions"
              placeholder={t('projects.form.mgmt.tagPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddTag())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddTag}>
              {t('projects.form.add')}
            </button>
          </div>
          {(form.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.tags || []).map((tag, i) => (
                <span key={i} className="admin-tag">
                  {tag}
                  <button type="button" onClick={() => onRemoveTag(i)} aria-label={t('projects.form.remove')}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.detailTab.billing')}
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="portal-input"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={
                form.billing?.amountInvoiced !== '' && form.billing?.amountInvoiced != null
                  ? formatCurrency(form.billing.amountInvoiced)
                  : ''
              }
              onChange={(e) => {
                const parsed = parseCurrency(e.target.value)
                setForm({ ...form, billing: { ...form.billing, amountInvoiced: parsed === '' ? '' : parsed } })
              }}
              style={{ width: 140 }}
            />
            <CustomSelect
              className="portal-input"
              value={form.billing?.billingStatus ?? 'NON_FACTURE'}
              onChange={(v) => setForm({ ...form, billing: { ...form.billing, billingStatus: v } })}
              options={[
                { value: 'NON_FACTURE', label: t('projects.form.budget.notBilled') },
                { value: 'PARTIEL', label: t('projects.form.budget.partial') },
                { value: 'FACTURE', label: t('projects.form.budget.billed') },
              ]}
            />
          </div>
          <input
            className="portal-input"
            placeholder={t('projects.detailTab.quoteRefPlaceholder')}
            value={form.billing?.quoteReference ?? ''}
            onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {t('projects.form.dates.reminder')}
          </label>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <input
              className="portal-input"
              type="datetime-local"
              value={toDateTimeLocal(form.reminderAt)}
              onChange={(e) => setForm({ ...form, reminderAt: e.target.value || '' })}
              style={{ width: 220 }}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.isArchived}
            onChange={(e) => setForm({ ...form, isArchived: e.target.checked })}
          />
          <span style={{ fontSize: '14px' }}>{t('projects.detailTab.archived')}</span>
        </label>

        <div className="project-form-section" style={{ marginTop: 32 }}>
          <div className="project-form-section-header">
            <div className="project-form-section-icon">🧾</div>
            <div>
              <h2 className="project-form-section-title">{t('projects.detailTab.billingTitle')}</h2>
              <p className="project-form-section-subtitle">{t('projects.detailTab.billingSubtitle')}</p>
            </div>
          </div>
          <div className="portal-list">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <button
                type="button"
                className="portal-button secondary"
                onClick={onCreateQuote}
                disabled={!canManageBilling}
              >
                {t('projects.detailTab.generateQuote')}
              </button>
              <button
                type="button"
                className="portal-button secondary"
                onClick={onCreateInvoice}
                disabled={!canManageBilling}
              >
                {t('projects.detailTab.generateInvoice')}
              </button>
            </div>
            {!canManageBilling && (
              <div className="admin-info" style={{ marginBottom: 16 }}>
                {t('projects.detailTab.billingReadOnly')}
              </div>
            )}
            {billingDocuments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t('projects.detailTab.noBillingDocs')}</p>
            ) : (
              <ul className="admin-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {billingDocuments.map((doc) => (
                  <li
                    key={doc._id}
                    className="admin-list-item"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {doc.type === 'QUOTE'
                          ? t('projects.detailTab.docQuote', { number: doc.number })
                          : t('projects.detailTab.docInvoice', { number: doc.number })}
                      </span>
                      <span className="admin-badge" style={{ textTransform: 'capitalize' }}>
                        {BILLING_STATUS_LABEL_KEYS[doc.status] ? t(BILLING_STATUS_LABEL_KEYS[doc.status]) : doc.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {t('projects.detailTab.total', {
                        amount: Number(doc.total || 0).toFixed(2),
                        currency: doc.currency || 'EUR',
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canViewBilling && doc.pdfStoragePath && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={async () => {
                            try {
                              const { blob } = await apiDownload(`/api/admin/billing/${doc._id}/pdf`)
                              const url = URL.createObjectURL(blob)
                              window.open(url, '_blank')
                            } catch (e: unknown) {
                              setError((e as Error).message || t('projects.detailTab.pdfDownloadError'))
                            }
                          }}
                        >
                          {t('projects.detailTab.downloadPdf')}
                        </button>
                      )}
                      {canManageBilling && !doc.pdfStoragePath && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onGeneratePdf(doc._id)}
                        >
                          {t('projects.detailTab.generatePdf')}
                        </button>
                      )}
                      {canManageBilling && doc.status !== 'SENT' && doc.status !== 'PAID' && doc.type === 'INVOICE' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkSent(doc._id)}
                        >
                          {t('projects.detailTab.markSent')}
                        </button>
                      )}
                      {canManageBilling && doc.type === 'INVOICE' && doc.status !== 'PAID' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkPaid(doc._id)}
                        >
                          {t('projects.detailTab.markPaid')}
                        </button>
                      )}
                      {canManageBilling && doc.type === 'QUOTE' && doc.status !== 'SENT' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkSent(doc._id)}
                        >
                          {t('projects.detailTab.markSent')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button className="portal-button" type="submit" style={{ marginTop: 24 }} disabled={!canEditProjects}>
          {t('projects.detailTab.saveChanges')}
        </button>
      </form>
    </div>
  )
}

export default ProjectDetailsTab
