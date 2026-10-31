import React from 'react'
import type { ProjectBudgetSectionProps } from './types'
import { formatCurrency, parseCurrency } from '../../../lib/formatUtils'
import { useI18n } from '../../../context/I18nContext'
import CustomSelect from '../../../components/admin/CustomSelect'

const ProjectBudgetSection: React.FC<ProjectBudgetSectionProps> = ({ form, setForm }) => {
  const { t } = useI18n()
  return (
    <div className="project-form-section">
      <div className="project-form-section-header">
        <div className="project-form-section-icon">💰</div>
        <div>
          <h2 className="project-form-section-title">{t('projects.form.budget.title')}</h2>
          <p className="project-form-section-subtitle">{t('projects.form.budget.subtitle')}</p>
        </div>
      </div>
      <div className="portal-list">
        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">💵</span>
            {t('projects.form.budget.estimated')}
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              className="portal-input"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.budget.amount !== '' && form.budget.amount != null ? formatCurrency(form.budget.amount) : ''}
              onChange={(e) => {
                const parsed = parseCurrency(e.target.value)
                setForm({ ...form, budget: { ...form.budget, amount: parsed === '' ? '' : parsed } })
              }}
              style={{ width: 160 }}
            />
            <CustomSelect
              className="portal-input"
              value={form.budget.currency}
              onChange={(v) => setForm({ ...form, budget: { ...form.budget, currency: v } })}
              options={[
                { value: 'EUR', label: 'EUR €' },
                { value: 'USD', label: 'USD $' },
                { value: 'CHF', label: 'CHF' },
              ]}
            />
          </div>
          <input
            className="portal-input"
            placeholder={t('projects.form.budget.notePlaceholder')}
            value={form.budget.note}
            onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">🧾</span>
            {t('projects.form.budget.billing')}
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="portal-input"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={
                form.billing.amountInvoiced !== '' && form.billing.amountInvoiced != null
                  ? formatCurrency(form.billing.amountInvoiced)
                  : ''
              }
              onChange={(e) => {
                const parsed = parseCurrency(e.target.value)
                setForm({ ...form, billing: { ...form.billing, amountInvoiced: parsed === '' ? '' : parsed } })
              }}
              style={{ width: 160 }}
            />
            <CustomSelect
              className="portal-input"
              value={form.billing.billingStatus}
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
            placeholder={t('projects.form.budget.quoteRefPlaceholder')}
            value={form.billing.quoteReference}
            onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>
      </div>
    </div>
  )
}

export default ProjectBudgetSection
