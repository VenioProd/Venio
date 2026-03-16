import React from 'react'
import type { ProjectBudgetSectionProps } from './types'
import { formatCurrency, parseCurrency } from '../../../lib/formatUtils'
import CustomSelect from '../../../components/admin/CustomSelect'

const ProjectBudgetSection: React.FC<ProjectBudgetSectionProps> = ({ form, setForm }) => (
  <div className="project-form-section">
    <div className="project-form-section-header">
      <div className="project-form-section-icon">💰</div>
      <div>
        <h2 className="project-form-section-title">Budget & Facturation</h2>
        <p className="project-form-section-subtitle">Gestion financière du projet</p>
      </div>
    </div>
    <div className="portal-list">
      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">💵</span>
          Budget estimé
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
          placeholder="Note sur le budget"
          value={form.budget.note}
          onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">🧾</span>
          Facturation
        </label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="portal-input"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={form.billing.amountInvoiced !== '' && form.billing.amountInvoiced != null ? formatCurrency(form.billing.amountInvoiced) : ''}
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
              { value: 'NON_FACTURE', label: 'Non facturé' },
              { value: 'PARTIEL', label: 'Partiel' },
              { value: 'FACTURE', label: 'Facturé' },
            ]}
          />
        </div>
        <input
          className="portal-input"
          placeholder="Référence devis (ex: DEV-2026-001)"
          value={form.billing.quoteReference}
          onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
          style={{ marginTop: 8 }}
        />
      </div>
    </div>
  </div>
)

export default ProjectBudgetSection
