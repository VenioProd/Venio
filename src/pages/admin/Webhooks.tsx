import PageHeader from '../../components/admin/ui/PageHeader'
import './OrganisationSysteme.css'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import { translate } from '../../i18n'
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from '../../services/webhooks'
import DeliveryLog from './webhooks/DeliveryLog'
import EndpointEditorModal from './webhooks/EndpointEditorModal'
import SecretRevealModal from './webhooks/SecretRevealModal'
import {
  emptyEndpointForm,
  eventTypeLabel,
  formatDateTime,
  type EndpointFormState,
  type WebhookEndpoint,
} from './webhooks/types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

/**
 * Console des webhooks sortants : configuration des endpoints, santé de
 * chacun, journal des livraisons et rejeu manuel.
 *
 * Le style vient des primitives admin (.admin-portal, .admin-table…), que le
 * thème MONOLITHE portail habille globalement — aucun CSS dédié ici.
 */
const Webhooks: React.FC = () => {
  const { showToast } = useToast()
  const { t } = useI18n()
  // `load` ne doit pas se recréer à chaque rendu : la fonction du contexte de
  // toasts n'est pas garantie stable, et une dépendance directe relancerait
  // l'effet de chargement en boucle.
  const toastRef = useRef(showToast)
  useEffect(() => {
    toastRef.current = showToast
  }, [showToast])

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ endpointId: string; label: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EndpointFormState>(emptyEndpointForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [revealed, setRevealed] = useState<{ secret: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null)
  const [selected, setSelected] = useState<WebhookEndpoint | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listWebhooks()
      setEndpoints(data.endpoints || [])
      setEventTypes(data.eventTypes || [])
    } catch (err) {
      toastRef.current((err as Error).message || translate('adminTech.webhooks.loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditId(null)
    setForm(emptyEndpointForm)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (endpoint: WebhookEndpoint) => {
    setEditId(endpoint._id)
    setForm({ name: endpoint.name, url: endpoint.url, eventTypes: [...endpoint.eventTypes] })
    setFormError('')
    setFormOpen(true)
  }

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (editId) {
        await updateWebhook(editId, form)
        showToast(t('adminTech.webhooks.updated'), 'success')
      } else {
        const created = await createWebhook(form)
        setRevealed({ secret: created.secret, name: created.endpoint.name })
      }
      setFormOpen(false)
      setEditId(null)
      setForm(emptyEndpointForm)
      await load()
    } catch (err) {
      setFormError((err as Error).message || t('adminTech.webhooks.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    try {
      await updateWebhook(endpoint._id, { isActive: !endpoint.isActive })
      await load()
    } catch (err) {
      showToast((err as Error).message || t('adminTech.webhooks.toggleError'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const rotate = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    try {
      const rotated = await rotateWebhookSecret(endpoint._id)
      setRevealed({ secret: rotated.secret, name: endpoint.name })
      await load()
    } catch (err) {
      showToast((err as Error).message || t('adminTech.webhooks.rotateError'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const sendTest = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    setTestResult(null)
    try {
      const { outcome } = await testWebhook(endpoint._id)
      const label = outcome?.ok
        ? t('adminTech.webhooks.testOk', { status: outcome.httpStatus ?? '', ms: outcome.durationMs })
        : t('adminTech.webhooks.testFailed', {
            detail: outcome?.httpStatus
              ? t('adminTech.webhooks.httpStatus', { status: outcome.httpStatus })
              : outcome?.error || t('adminTech.webhooks.networkError'),
          })
      setTestResult({ endpointId: endpoint._id, label })
      await load()
    } catch (err) {
      showToast((err as Error).message || t('adminTech.webhooks.testError'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteWebhook(deleteTarget._id)
      showToast(t('adminTech.webhooks.deleted'), 'success')
      if (selected?._id === deleteTarget._id) setSelected(null)
      await load()
    } catch (err) {
      showToast((err as Error).message || t('adminTech.webhooks.deleteError'), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const healthLabel = (endpoint: WebhookEndpoint): string => {
    if (endpoint.isActive) {
      return t('adminTech.webhooks.healthActive', { date: formatDateTime(endpoint.lastSuccessAt) })
    }
    if (endpoint.disabledReason === 'AUTO_FAILURES') {
      return t('adminTech.webhooks.healthAutoDisabled', { date: formatDateTime(endpoint.disabledAt) })
    }
    return t('adminTech.webhooks.healthManuallyDisabled')
  }

  return (
    <section className="lot-c-page webhooks-page">
      <div className="admin-container">
        <PageHeader
          eyebrow={t('adminOps.zone.system')}
          title={t('adminTech.webhooks.title')}
          actions={
            <button type="button" className="portal-button" onClick={openCreate}>
              {t('adminTech.webhooks.newEndpoint')}
            </button>
          }
        />

        <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
          {t('adminTech.webhooks.introLead')} <code>X-Venio-Signature</code>
          {t('adminTech.webhooks.introTail')}
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {t('adminTech.webhooks.loading')}
          </div>
        ) : endpoints.length === 0 ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state-text">{t('adminTech.webhooks.empty')}</p>
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colEndpoint')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colTypes')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colHealth')}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint._id}>
                    <td style={{ padding: '10px 12px' }}>
                      <strong>{endpoint.name}</strong>
                      <div
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                      >
                        {endpoint.url}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {endpoint.eventTypes.length === 0 ? (
                        <span className="admin-badge">{t('adminTech.webhooks.allTypes')}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {endpoint.eventTypes.slice(0, 3).map((type) => (
                            <span key={type} className="admin-badge">
                              {eventTypeLabel(type)}
                            </span>
                          ))}
                          {endpoint.eventTypes.length > 3 && (
                            <span className="admin-badge">+{endpoint.eventTypes.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
                      <div>{healthLabel(endpoint)}</div>
                      {endpoint.consecutiveFailures > 0 && (
                        <div style={{ color: 'var(--critical)' }}>
                          {t('adminTech.webhooks.consecutiveFailures', { count: endpoint.consecutiveFailures })}
                        </div>
                      )}
                      {testResult?.endpointId === endpoint._id && (
                        <div style={{ marginTop: 4 }}>{testResult.label}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="admin-card-btn" onClick={() => setSelected(endpoint)}>
                          {t('adminTech.webhooks.log')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--edit"
                          onClick={() => openEdit(endpoint)}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void sendTest(endpoint)}
                        >
                          {t('adminTech.webhooks.test')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void toggleActive(endpoint)}
                        >
                          {endpoint.isActive ? t('adminTech.webhooks.disable') : t('adminTech.webhooks.enable')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void rotate(endpoint)}
                        >
                          {t('adminTech.webhooks.rotateSecret')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--delete"
                          onClick={() => setDeleteTarget(endpoint)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DeliveryLog endpoints={endpoints} selected={selected} onSelect={setSelected} />
      </div>

      {formOpen && (
        <EndpointEditorModal
          form={form}
          eventTypes={eventTypes}
          saving={saving}
          isEdit={Boolean(editId)}
          error={formError}
          onChange={setForm}
          onSubmit={submitForm}
          onClose={() => {
            setFormOpen(false)
            setEditId(null)
            setFormError('')
          }}
        />
      )}

      {revealed && (
        <SecretRevealModal secret={revealed.secret} endpointName={revealed.name} onClose={() => setRevealed(null)} />
      )}

      {deleteTarget && (
        <ConfirmModal
          isOpen
          title={t('adminTech.webhooks.deleteTitle')}
          message={t('adminTech.webhooks.deleteMessage', { name: deleteTarget.name })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}

export default Webhooks
