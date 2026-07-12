import React from 'react'
import {
  formatCurrency,
  parseCurrency,
  toDateTimeLocal,
  SUGGESTIONS_SERVICE_TYPES,
  SUGGESTIONS_DELIVERABLE_TYPES,
  SUGGESTIONS_TAGS,
} from '../../../lib/formatUtils'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { ProjectDetailsTabProps } from './types'

const BILLING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'Émis',
  SENT: 'Envoyé',
  ACCEPTED: 'Accepté',
  PAID: 'Payé',
  CANCELLED: 'Annulé',
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
  return (
    <div className="admin-form-section" style={{ marginTop: 24 }}>
      <h2>Détails du projet</h2>
      <form className="portal-list" onSubmit={onSave}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Nom du projet
          </label>
          <input
            className="portal-input"
            placeholder="Nom"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Description
          </label>
          <textarea
            className="portal-input"
            placeholder="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Statut
          </label>
          <CustomSelect
            className="portal-input"
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={[
              { value: 'EN_COURS', label: 'En cours' },
              { value: 'EN_ATTENTE', label: 'En attente' },
              { value: 'TERMINE', label: 'Terminé' },
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Numéro de projet
          </label>
          <input
            className="portal-input"
            placeholder="Ex: PROJ-2025-001"
            value={form.projectNumber ?? ''}
            onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Date de début
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
              Fin prévue
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
              Livraison réelle
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
            Priorité
          </label>
          <CustomSelect
            className="portal-input"
            value={form.priority ?? 'NORMALE'}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={[
              { value: 'BASSE', label: 'Basse' },
              { value: 'NORMALE', label: 'Normale' },
              { value: 'HAUTE', label: 'Haute' },
              { value: 'URGENTE', label: 'Urgente' },
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Responsable projet (admin assigne)
          </label>
          <CustomSelect
            className="portal-input"
            value={form.assignedTo}
            onChange={(v) => setForm({ ...form, assignedTo: v })}
            options={[
              { value: '', label: 'Non assigne' },
              ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` })),
            ]}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Résumé (une phrase)
          </label>
          <input
            className="portal-input"
            placeholder="Résumé du projet"
            value={form.summary ?? ''}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Notes internes (admin uniquement)
          </label>
          <textarea
            className="portal-input"
            placeholder="Notes non visibles par le client"
            value={form.internalNotes ?? ''}
            onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <h2 style={{ marginTop: 24, marginBottom: 16 }}>Options de module</h2>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Types de prestation
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
              placeholder="Choisir ou saisir (ex: Design, Développement)"
              value={serviceTypeInput}
              onChange={(e) => setServiceTypeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddServiceType())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddServiceType}>
              Ajouter
            </button>
          </div>
          {(form.serviceTypes || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.serviceTypes || []).map((s, i) => (
                <span key={i} className="admin-tag">
                  {s}
                  <button type="button" onClick={() => onRemoveServiceType(i)} aria-label="Retirer">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Types de livrables
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
              placeholder="Choisir ou saisir (ex: Maquettes, Code source)"
              value={deliverableTypeInput}
              onChange={(e) => setDeliverableTypeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddDeliverableType())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddDeliverableType}>
              Ajouter
            </button>
          </div>
          {(form.deliverableTypes || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.deliverableTypes || []).map((s, i) => (
                <span key={i} className="admin-tag">
                  {s}
                  <button type="button" onClick={() => onRemoveDeliverableType(i)} aria-label="Retirer">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Deadlines
          </label>
          {(form.deadlines || []).map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                className="portal-input"
                placeholder="Libellé"
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
                Suppr.
              </button>
            </div>
          ))}
          <button type="button" className="portal-button secondary" onClick={onAddDeadline}>
            + Ajouter une deadline
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Budget
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
            placeholder="Note budget (optionnel)"
            value={form.budget?.note ?? ''}
            onChange={(e) => setForm({ ...form, budget: { ...form.budget, note: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Tags
          </label>
          <datalist id="detail-tags-suggestions">
            {SUGGESTIONS_TAGS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="portal-input"
              list="detail-tags-suggestions"
              placeholder="Ex: urgent, refonte (suggestions ou libre)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddTag())}
              style={{ flex: '1 1 200px', maxWidth: 280 }}
            />
            <button type="button" className="portal-button secondary" onClick={onAddTag}>
              Ajouter
            </button>
          </div>
          {(form.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(form.tags || []).map((t, i) => (
                <span key={i} className="admin-tag">
                  {t}
                  <button type="button" onClick={() => onRemoveTag(i)} aria-label="Retirer">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Facturation
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
                { value: 'NON_FACTURE', label: 'Non facturé' },
                { value: 'PARTIEL', label: 'Partiel' },
                { value: 'FACTURE', label: 'Facturé' },
              ]}
            />
          </div>
          <input
            className="portal-input"
            placeholder="Référence devis"
            value={form.billing?.quoteReference ?? ''}
            onChange={(e) => setForm({ ...form, billing: { ...form.billing, quoteReference: e.target.value } })}
            style={{ marginTop: 8 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Date de rappel
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
          <span style={{ fontSize: '14px' }}>Projet archivé</span>
        </label>

        <div className="project-form-section" style={{ marginTop: 32 }}>
          <div className="project-form-section-header">
            <div className="project-form-section-icon">🧾</div>
            <div>
              <h2 className="project-form-section-title">Devis & Factures</h2>
              <p className="project-form-section-subtitle">Génération et suivi des documents de facturation</p>
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
                + Générer un devis
              </button>
              <button
                type="button"
                className="portal-button secondary"
                onClick={onCreateInvoice}
                disabled={!canManageBilling}
              >
                + Générer une facture
              </button>
            </div>
            {!canManageBilling && (
              <div className="admin-info" style={{ marginBottom: 16 }}>
                Accès lecture seule à la facturation.
              </div>
            )}
            {billingDocuments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Aucun devis ou facture. Créez-en un avec les boutons ci-dessus.
              </p>
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
                        {doc.type === 'QUOTE' ? 'Devis' : 'Facture'} {doc.number}
                      </span>
                      <span className="admin-badge" style={{ textTransform: 'capitalize' }}>
                        {BILLING_STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Total : {Number(doc.total || 0).toFixed(2)} {doc.currency || 'EUR'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canViewBilling && doc.pdfStoragePath && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/admin/billing/${doc._id}/pdf`, {
                                credentials: 'same-origin',
                              })
                              if (!res.ok) throw new Error('PDF non disponible')
                              const blob = await res.blob()
                              const url = URL.createObjectURL(blob)
                              window.open(url, '_blank')
                            } catch (e: unknown) {
                              setError((e as Error).message || 'Erreur téléchargement PDF')
                            }
                          }}
                        >
                          Télécharger PDF
                        </button>
                      )}
                      {canManageBilling && !doc.pdfStoragePath && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onGeneratePdf(doc._id)}
                        >
                          Générer PDF
                        </button>
                      )}
                      {canManageBilling && doc.status !== 'SENT' && doc.status !== 'PAID' && doc.type === 'INVOICE' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkSent(doc._id)}
                        >
                          Marquer envoyé
                        </button>
                      )}
                      {canManageBilling && doc.type === 'INVOICE' && doc.status !== 'PAID' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkPaid(doc._id)}
                        >
                          Marquer payé
                        </button>
                      )}
                      {canManageBilling && doc.type === 'QUOTE' && doc.status !== 'SENT' && (
                        <button
                          type="button"
                          className="portal-button secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          onClick={() => onMarkSent(doc._id)}
                        >
                          Marquer envoyé
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
          Enregistrer les modifications
        </button>
      </form>
    </div>
  )
}

export default ProjectDetailsTab
