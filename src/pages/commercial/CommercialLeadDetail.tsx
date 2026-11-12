import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import LeadCallsList from '../../components/calls/LeadCallsList'
import { formatDuration } from '../../components/calls/leadCalls'
import { useI18n, type MessageKey } from '../../context/I18nContext'
import { formatDateTime } from '../../i18n/format'
import { LeadStatusBadge } from './CommercialLeads'
import CallBar from './softphone/CallBar'
import { useSoftphone } from './softphone/useSoftphone'
import {
  commercialApi,
  formatDay,
  REP_EDITABLE_STATUSES,
  STATUS_LABEL_KEYS,
  type RepActivity,
  type RepInteraction,
  type RepLead,
  type RepLeadInput,
} from '../../services/externalSales'

const KIND_LABEL_KEYS: Record<RepInteraction['kind'], MessageKey> = {
  CALL: 'commercial.kind.call',
  MEETING: 'commercial.kind.meeting',
  EMAIL: 'commercial.kind.email',
  NOTE: 'commercial.kind.note',
}

const ACTIVITY_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  CREATED: 'commercial.activity.created',
  READY_TO_CLOSE: 'commercial.activity.readyToClose',
  CONVERTED: 'commercial.activity.converted',
}

function activityTitle(activity: RepActivity, t: (key: MessageKey, params?: Record<string, string>) => string) {
  if (activity.type === 'STATUS_CHANGE' && activity.status) {
    return t('commercial.activity.statusChange', { status: t(STATUS_LABEL_KEYS[activity.status]) })
  }
  const key = ACTIVITY_LABEL_KEYS[activity.type]
  return key ? t(key) : activity.label
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

const CommercialLeadDetail = () => {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const [lead, setLead] = useState<RepLead | null>(null)
  const [activities, setActivities] = useState<RepActivity[]>([])
  const [interactions, setInteractions] = useState<RepInteraction[]>([])
  const [form, setForm] = useState<RepLeadInput>({})
  const [exchange, setExchange] = useState<{
    kind: RepInteraction['kind']
    subject: string
    body: string
    /** Appel passé depuis cette fiche et relié à l'échange consigné. */
    call?: { id: string; at: string | null; durationSec: number }
  }>({
    kind: 'CALL',
    subject: '',
    body: '',
  })
  const [callsKey, setCallsKey] = useState(0)
  const [handoffMessage, setHandoffMessage] = useState('')
  const [confirmHandoff, setConfirmHandoff] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  // Un appel qui se termine ici : la liste des appels se relit, et l'échange à consigner est relié à cet appel.
  const softphone = useSoftphone({
    onSettled: (call) => {
      setCallsKey((value) => value + 1)
      setExchange((current) => ({
        ...current,
        kind: 'CALL',
        call: {
          id: call.callId,
          at: call.record?.answeredAt ?? call.record?.startedAt ?? null,
          durationSec: call.record?.durationSec ?? call.elapsedSec,
        },
      }))
    },
  })

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
        <p className="admin-empty-state-text">{t('commercial.detail.notFound')}</p>
        <Link className="commercial-link" to="/commercial">
          {t('commercial.detail.back')}
        </Link>
      </div>
    )
  }
  if (!lead) {
    return error ? (
      <div className="admin-error">{error}</div>
    ) : (
      <div className="admin-loading">{t('commercial.loading')}</div>
    )
  }

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
      t('commercial.detail.saved'),
    )
  }

  const logExchange = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      const { call, ...entry } = exchange
      await commercialApi.logInteraction(id, {
        ...entry,
        ...(call ? { callId: call.id, ...(call.at ? { occurredAt: call.at } : {}) } : {}),
      })
      setExchange({ kind: exchange.kind, subject: '', body: '' })
    }, t('commercial.detail.exchangeAdded'))
  }

  return (
    <>
      <div className="admin-breadcrumb">
        <Link to="/commercial">{t('commercial.tab.leads')}</Link>
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
          {t('commercial.detail.handedOff', { date: formatDay(lead.handedOffAt) })}
        </div>
      ) : (
        canHandOff && (
          <div className="commercial-handoff">
            <strong>{t('commercial.detail.readyTitle')}</strong>
            <p className="commercial-muted" style={{ margin: '6px 0 12px' }}>
              {t('commercial.detail.readyHint')}
            </p>
            {confirmHandoff ? (
              <>
                <textarea
                  className="portal-input"
                  rows={3}
                  placeholder={t('commercial.detail.readyPlaceholder')}
                  value={handoffMessage}
                  onChange={(event) => setHandoffMessage(event.target.value)}
                />
                <div className="admin-button-group" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="portal-button"
                    disabled={busy}
                    onClick={() =>
                      run(() => commercialApi.readyToClose(id, handoffMessage), t('commercial.detail.readyDone'))
                    }
                  >
                    {t('commercial.detail.readyConfirm')}
                  </button>
                  <button type="button" className="portal-button secondary" onClick={() => setConfirmHandoff(false)}>
                    {t('commercial.detail.readyCancel')}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="portal-button" onClick={() => setConfirmHandoff(true)}>
                {t('commercial.detail.readyButton')}
              </button>
            )}
          </div>
        )
      )}

      {lead.callHold && (
        <p className="commercial-hold" role="status">
          <strong>{t('commercial.hold.title')}</strong> {t('commercial.hold.body')}
        </p>
      )}

      {!lead.handedOffAt && (
        <div className="softphone-detail">
          <CallBar
            controller={softphone}
            leadId={lead._id}
            phone={lead.contactPhone}
            disabled={busy}
            held={Boolean(lead.callHold)}
          />
        </div>
      )}

      <div className="commercial-detail">
        <form className="portal-card" onSubmit={save}>
          <div className="commercial-form-grid">
            <label className="commercial-wide">
              {t('commercial.field.company')}
              <input {...field('company')} required />
            </label>
            <label>
              {t('commercial.field.contact')}
              <input {...field('contactName')} />
            </label>
            <label>
              {t('commercial.field.email')}
              <input {...field('contactEmail', 'email')} />
            </label>
            <label>
              {t('commercial.field.phone')}
              <input {...field('contactPhone')} />
            </label>
            <label>
              {t('commercial.field.source')}
              <input {...field('source')} />
            </label>
            <label>
              {t('commercial.field.status')}
              {readOnly ? (
                <input className="portal-input" disabled value={t(STATUS_LABEL_KEYS[lead.status])} />
              ) : (
                <CustomSelect
                  value={String(form.status)}
                  onChange={(value) => setForm({ ...form, status: value as RepLead['status'] })}
                  options={REP_EDITABLE_STATUSES.map((key) => ({ value: key, label: t(STATUS_LABEL_KEYS[key]) }))}
                />
              )}
            </label>
            <label>
              {t('commercial.field.nextAction')}
              <input {...field('nextActionAt', 'date')} />
            </label>
            <label>
              {t('commercial.field.budget')}
              <input {...field('budget', 'number')} min={0} />
            </label>
            <label className="commercial-wide">
              {t('commercial.field.notes')}
              <textarea {...field('notes')} rows={4} />
            </label>
          </div>
          {!readOnly && (
            <div className="admin-button-group" style={{ marginTop: 16 }}>
              <button className="portal-button" type="submit" disabled={busy}>
                {t('commercial.detail.save')}
              </button>
            </div>
          )}
        </form>

        <div className="portal-card">
          <h2 style={{ marginTop: 0 }}>{t('commercial.detail.exchanges')}</h2>
          {!readOnly && (
            <form onSubmit={logExchange} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {exchange.call && (
                <p className="commercial-muted commercial-linked-call" role="status">
                  {t('commercial.detail.linkedCall', { duration: formatDuration(exchange.call.durationSec) })}{' '}
                  <button
                    type="button"
                    className="commercial-link-button"
                    onClick={() => setExchange({ ...exchange, call: undefined })}
                  >
                    {t('commercial.detail.unlinkCall')}
                  </button>
                </p>
              )}
              <CustomSelect
                value={exchange.kind}
                onChange={(value) => setExchange({ ...exchange, kind: value as RepInteraction['kind'] })}
                options={Object.entries(KIND_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) }))}
              />
              <input
                className="portal-input"
                placeholder={t('commercial.detail.exchangeSubject')}
                value={exchange.subject}
                onChange={(event) => setExchange({ ...exchange, subject: event.target.value })}
              />
              <textarea
                className="portal-input"
                rows={3}
                placeholder={t('commercial.detail.exchangeBody')}
                value={exchange.body}
                onChange={(event) => setExchange({ ...exchange, body: event.target.value })}
              />
              <button className="portal-button secondary" type="submit" disabled={busy}>
                {t('commercial.detail.exchangeAdd')}
              </button>
            </form>
          )}
          <ul className="commercial-timeline">
            {[
              ...interactions.map((item) => ({
                key: item._id,
                at: item.occurredAt,
                title: `${t(KIND_LABEL_KEYS[item.kind])}${item.subject ? ` · ${item.subject}` : ''}`,
                body: item.body,
              })),
              ...activities.map((item) => ({
                key: item._id,
                at: item.createdAt,
                title: activityTitle(item, t),
                body: item.actorName ? t('commercial.detail.byActor', { name: item.actorName }) : '',
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((item) => (
                <li key={item.key}>
                  <strong>{item.title}</strong>
                  {item.body && <div style={{ whiteSpace: 'pre-wrap' }}>{item.body}</div>}
                  <small>{formatDateTime(item.at)}</small>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="portal-card commercial-lead-calls">
        <LeadCallsList
          leadId={lead._id}
          refreshKey={callsKey}
          readOnly={Boolean(lead.handedOffAt)}
          onApplied={() => void load()}
        />
      </div>
    </>
  )
}

export default CommercialLeadDetail
