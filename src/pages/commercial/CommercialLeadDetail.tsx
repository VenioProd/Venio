import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import { LeadStatusBadge } from './CommercialLeads'
import {
  commercialApi,
  formatDate,
  REP_EDITABLE_STATUSES,
  STATUS_LABELS,
  type RepActivity,
  type RepInteraction,
  type RepLead,
  type RepLeadInput,
} from '../../services/externalSales'

const KIND_LABELS: Record<RepInteraction['kind'], string> = {
  CALL: 'Appel',
  MEETING: 'Rendez-vous',
  EMAIL: 'Email',
  NOTE: 'Note',
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

const CommercialLeadDetail = () => {
  const { id = '' } = useParams()
  const [lead, setLead] = useState<RepLead | null>(null)
  const [activities, setActivities] = useState<RepActivity[]>([])
  const [interactions, setInteractions] = useState<RepInteraction[]>([])
  const [form, setForm] = useState<RepLeadInput>({})
  const [exchange, setExchange] = useState<{ kind: RepInteraction['kind']; subject: string; body: string }>({
    kind: 'CALL',
    subject: '',
    body: '',
  })
  const [handoffMessage, setHandoffMessage] = useState('')
  const [confirmHandoff, setConfirmHandoff] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await commercialApi.lead(id)
      setLead(data.lead)
      setActivities(data.activities)
      setInteractions(data.interactions)
      setForm({
        company: data.lead.company,
        contactName: data.lead.contactName,
        contactEmail: data.lead.contactEmail,
        contactPhone: data.lead.contactPhone,
        source: data.lead.source,
        status: data.lead.status,
        nextActionAt: toDateInput(data.lead.nextActionAt),
        budget: data.lead.budget,
        notes: data.lead.notes,
      })
    } catch (err) {
      if ((err as { status?: number }).status === 404) setNotFound(true)
      else setError((err as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await action()
      setInfo(done)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (notFound) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-state-text">Ce lead n’existe pas ou ne vous est plus attribué.</p>
        <Link to="/commercial">Retour à mes leads</Link>
      </div>
    )
  }
  if (!lead)
    return error ? <div className="admin-error">{error}</div> : <div className="admin-loading">Chargement…</div>

  const readOnly = Boolean(lead.handedOffAt) || !REP_EDITABLE_STATUSES.includes(lead.status)
  const canHandOff = !readOnly && lead.status !== 'LOST'

  const field = (key: keyof RepLeadInput, type = 'text') => ({
    className: 'portal-input',
    type,
    disabled: readOnly,
    value: String(form[key] ?? ''),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value }),
  })

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    run(
      () =>
        commercialApi.updateLead(id, {
          ...form,
          budget: form.budget === null || String(form.budget) === '' ? null : Number(form.budget),
          nextActionAt: form.nextActionAt || null,
        }),
      'Fiche enregistrée',
    )
  }

  const logExchange = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      await commercialApi.logInteraction(id, exchange)
      setExchange({ kind: exchange.kind, subject: '', body: '' })
    }, 'Échange ajouté')
  }

  return (
    <>
      <div className="admin-breadcrumb">
        <Link to="/commercial">Mes leads</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)' }}>{lead.company}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{lead.company}</h1>
        <LeadStatusBadge lead={lead} />
      </div>

      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-success">{info}</div>}

      {lead.handedOffAt ? (
        <div className="commercial-handoff">
          Dossier transmis pour closing le {formatDate(lead.handedOffAt)}. Il reste à votre crédit ; l’équipe vous
          tiendra au courant de la signature.
        </div>
      ) : (
        canHandOff && (
          <div className="commercial-handoff">
            <strong>Le prospect est prêt à signer ?</strong>
            <p className="commercial-muted" style={{ margin: '6px 0 12px' }}>
              Transmettez le dossier : l’équipe prépare le devis et conclut. La fiche passe en lecture seule.
            </p>
            {confirmHandoff ? (
              <>
                <textarea
                  className="portal-input"
                  rows={3}
                  placeholder="Contexte pour le closer : budget, décideur, échéance…"
                  value={handoffMessage}
                  onChange={(event) => setHandoffMessage(event.target.value)}
                />
                <div className="admin-button-group" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="portal-button"
                    disabled={busy}
                    onClick={() => run(() => commercialApi.readyToClose(id, handoffMessage), 'Dossier transmis')}
                  >
                    Confirmer la transmission
                  </button>
                  <button type="button" className="portal-button secondary" onClick={() => setConfirmHandoff(false)}>
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="portal-button" onClick={() => setConfirmHandoff(true)}>
                Prêt à closer
              </button>
            )}
          </div>
        )
      )}

      <div className="commercial-detail">
        <form className="portal-card" onSubmit={save}>
          <div className="commercial-form-grid">
            <label className="commercial-wide">
              Entreprise
              <input {...field('company')} required />
            </label>
            <label>
              Contact
              <input {...field('contactName')} />
            </label>
            <label>
              Email
              <input {...field('contactEmail', 'email')} />
            </label>
            <label>
              Téléphone
              <input {...field('contactPhone')} />
            </label>
            <label>
              Source
              <input {...field('source')} />
            </label>
            <label>
              Statut
              {readOnly ? (
                <input className="portal-input" disabled value={STATUS_LABELS[lead.status]} />
              ) : (
                <CustomSelect
                  className="portal-input"
                  value={String(form.status)}
                  onChange={(value) => setForm({ ...form, status: value as RepLead['status'] })}
                  options={REP_EDITABLE_STATUSES.map((key) => ({ value: key, label: STATUS_LABELS[key] }))}
                />
              )}
            </label>
            <label>
              Prochaine action
              <input {...field('nextActionAt', 'date')} />
            </label>
            <label>
              Budget estimé (€ HT)
              <input {...field('budget', 'number')} min={0} />
            </label>
            <label className="commercial-wide">
              Notes
              <textarea {...field('notes')} rows={4} />
            </label>
          </div>
          {!readOnly && (
            <div className="admin-button-group" style={{ marginTop: 16 }}>
              <button className="portal-button" type="submit" disabled={busy}>
                Enregistrer
              </button>
            </div>
          )}
        </form>

        <div className="portal-card">
          <h2 style={{ marginTop: 0 }}>Échanges</h2>
          {!readOnly && (
            <form onSubmit={logExchange} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              <CustomSelect
                className="portal-input"
                value={exchange.kind}
                onChange={(value) => setExchange({ ...exchange, kind: value as RepInteraction['kind'] })}
                options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <input
                className="portal-input"
                placeholder="Objet"
                value={exchange.subject}
                onChange={(event) => setExchange({ ...exchange, subject: event.target.value })}
              />
              <textarea
                className="portal-input"
                rows={3}
                placeholder="Ce qui s’est dit"
                value={exchange.body}
                onChange={(event) => setExchange({ ...exchange, body: event.target.value })}
              />
              <button className="portal-button secondary" type="submit" disabled={busy}>
                Ajouter l’échange
              </button>
            </form>
          )}
          <ul className="commercial-timeline">
            {[
              ...interactions.map((item) => ({
                key: item._id,
                at: item.occurredAt,
                title: `${KIND_LABELS[item.kind]}${item.subject ? ` · ${item.subject}` : ''}`,
                body: item.body,
              })),
              ...activities.map((item) => ({
                key: item._id,
                at: item.createdAt,
                title: item.label,
                body: item.actorName ? `par ${item.actorName}` : '',
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((item) => (
                <li key={item.key}>
                  <strong>{item.title}</strong>
                  {item.body && <div style={{ whiteSpace: 'pre-wrap' }}>{item.body}</div>}
                  <small>{new Date(item.at).toLocaleString('fr-FR')}</small>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </>
  )
}

export default CommercialLeadDetail
