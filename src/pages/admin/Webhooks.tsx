import React, { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { useToast } from '../../context/ToastContext'
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
  // `load` ne doit pas se recréer à chaque rendu : la fonction du contexte de
  // toasts n'est pas garantie stable, et une dépendance directe relancerait
  // l'effet de chargement en boucle.
  const toastRef = useRef(showToast)
  toastRef.current = showToast

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
      toastRef.current((err as Error).message || 'Erreur de chargement des webhooks', 'error')
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
        showToast('Endpoint mis à jour', 'success')
      } else {
        const created = await createWebhook(form)
        setRevealed({ secret: created.secret, name: created.endpoint.name })
      }
      setFormOpen(false)
      setEditId(null)
      setForm(emptyEndpointForm)
      await load()
    } catch (err) {
      setFormError((err as Error).message || 'Enregistrement impossible')
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
      showToast((err as Error).message || 'Modification impossible', 'error')
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
      showToast((err as Error).message || 'Rotation impossible', 'error')
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
        ? `Test réussi — HTTP ${outcome.httpStatus} en ${outcome.durationMs} ms`
        : `Test échoué — ${outcome?.httpStatus ? `HTTP ${outcome.httpStatus}` : outcome?.error || 'erreur réseau'}`
      setTestResult({ endpointId: endpoint._id, label })
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Test impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteWebhook(deleteTarget._id)
      showToast('Endpoint supprimé', 'success')
      if (selected?._id === deleteTarget._id) setSelected(null)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Suppression impossible', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const healthLabel = (endpoint: WebhookEndpoint): string => {
    if (endpoint.isActive) return `Actif · dernier succès ${formatDateTime(endpoint.lastSuccessAt)}`
    if (endpoint.disabledReason === 'AUTO_FAILURES') {
      return `Désactivé automatiquement le ${formatDateTime(endpoint.disabledAt)}`
    }
    return 'Désactivé manuellement'
  }

  return (
    <section className="admin-portal" style={{ paddingTop: '120px', minHeight: '100vh' }}>
      <div className="admin-container">
        <div className="admin-header">
          <h1>Webhooks sortants</h1>
          <button type="button" className="portal-button" onClick={openCreate}>
            Nouvel endpoint
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
          Chaque événement produisant une notification admin est poussé vers les endpoints actifs, signé avec l’en-tête{' '}
          <code>X-Venio-Signature</code>. Un endpoint est désactivé automatiquement après 20 échecs consécutifs.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
        ) : endpoints.length === 0 ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state-text">Aucun endpoint. Créez-en un pour pousser les événements vers Kuro.</p>
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Endpoint</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Types</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Santé</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint._id}>
                    <td style={{ padding: '10px 12px' }}>
                      <strong>{endpoint.name}</strong>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {endpoint.url}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {endpoint.eventTypes.length === 0 ? (
                        <span className="admin-badge">Tous les types</span>
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
                        <div style={{ color: '#f87171' }}>
                          {endpoint.consecutiveFailures} échec{endpoint.consecutiveFailures > 1 ? 's' : ''} consécutif
                          {endpoint.consecutiveFailures > 1 ? 's' : ''}
                        </div>
                      )}
                      {testResult?.endpointId === endpoint._id && (
                        <div style={{ marginTop: 4 }}>{testResult.label}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="admin-card-btn" onClick={() => setSelected(endpoint)}>
                          Journal
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--edit"
                          onClick={() => openEdit(endpoint)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void sendTest(endpoint)}
                        >
                          Tester
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void toggleActive(endpoint)}
                        >
                          {endpoint.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void rotate(endpoint)}
                        >
                          Régénérer le secret
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--delete"
                          onClick={() => setDeleteTarget(endpoint)}
                        >
                          Supprimer
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
          title="Supprimer l’endpoint"
          message={`Supprimer « ${deleteTarget.name} » et tout son journal de livraisons ? Cette action est définitive.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}

export default Webhooks
