import { useI18n } from '../../../../context/I18nContext'
import { ENTITY_MAP } from '../constants'
import { sequenceStatusKey, stopReasonKey, type Sequence, type SequenceStatus } from './types'

interface Props {
  sequences: Sequence[]
  canAdminister: boolean
  busyId: string | null
  onOpen: (seq: Sequence) => void
  onToggle: (seq: Sequence) => void
  onEdit: (seq: Sequence) => void
  onDelete: (seq: Sequence) => void
  onNew: () => void
}

const STATUS_COLOR: Record<SequenceStatus, string> = {
  DRAFT: 'var(--dim)',
  ACTIVE: 'var(--mint)',
  PAUSED: 'var(--amber)',
}

export function StatusBadge({ status }: { status: SequenceStatus }) {
  const { t } = useI18n()
  return (
    <span className="crm-auto-st" style={{ ['--c' as string]: STATUS_COLOR[status] }}>
      <i />
      {t(sequenceStatusKey(status))}
    </span>
  )
}

function SequenceCard({
  seq,
  busy,
  canAdminister,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
}: {
  seq: Sequence
  busy: boolean
  canAdminister: boolean
  onOpen: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const lockTitle = canAdminister ? undefined : t('crmSeq.adminOnly')
  const stats = seq.stats ?? { total: 0, active: 0, paused: 0, completed: 0, stopped: 0, stoppedByReason: {} }
  const reasons = Object.entries(stats.stoppedByReason ?? {}).filter(([, n]) => n > 0)
  const entity = seq.entity ? ENTITY_MAP[seq.entity] : null
  return (
    <article className="crm-auto-rule crm-auto-glass" data-testid={`seq-${seq._id}`}>
      <div className="crm-auto-rule-h">
        <div>
          <h3>
            <button type="button" className="crm-seq-title" onClick={onOpen}>
              {seq.name}
            </button>
            <StatusBadge status={seq.status} />
          </h3>
          {seq.description && <small>{seq.description}</small>}
          <small className="crm-seq-meta">
            {t('crmSeq.stepsCount', { count: seq.steps.length })} ·{' '}
            {entity ? t(entity.labelKey) : t('crmSeq.entityAll')}
          </small>
        </div>
      </div>
      <dl className="crm-seq-stats">
        {(
          [
            ['total', stats.total],
            ['active', stats.active],
            ['paused', stats.paused],
            ['completed', stats.completed],
            ['stopped', stats.stopped],
          ] as const
        ).map(([key, value]) => (
          <div key={key}>
            <dt>{t(`crmSeq.stat.${key}` as const)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {reasons.length > 0 && (
        <p className="crm-seq-reasons">
          <b>{t('crmSeq.stat.reasons')} :</b>{' '}
          {reasons.map(([reason, n], i) => {
            const key = stopReasonKey(reason)
            return (
              <span key={reason}>
                {i > 0 ? ', ' : ''}
                {key ? t(key) : reason} ({n})
              </span>
            )
          })}
        </p>
      )}
      <div className="crm-auto-rule-f">
        <span className="crm-auto-sp" />
        <button
          type="button"
          className="crm-auto-link"
          onClick={onOpen}
          aria-label={t('crmSeq.act.openAria', { name: seq.name })}
        >
          {t('crmSeq.act.open')}
        </button>
        {canAdminister && (
          <>
            <button
              type="button"
              className="crm-auto-link"
              disabled={busy}
              onClick={onToggle}
              aria-label={
                seq.status === 'ACTIVE'
                  ? t('crmSeq.act.pauseAria', { name: seq.name })
                  : t('crmSeq.act.activateAria', { name: seq.name })
              }
              title={lockTitle}
            >
              {seq.status === 'ACTIVE' ? t('crmSeq.act.pause') : t('crmSeq.act.activate')}
            </button>
            <button
              type="button"
              className="crm-auto-link"
              disabled={busy}
              onClick={onEdit}
              aria-label={t('crmSeq.act.editAria', { name: seq.name })}
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="crm-auto-link"
              disabled={busy}
              onClick={onDelete}
              aria-label={t('crmSeq.act.deleteAria', { name: seq.name })}
            >
              {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function SequencesPanel({
  sequences,
  canAdminister,
  busyId,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
  onNew,
}: Props) {
  const { t } = useI18n()
  if (sequences.length === 0) {
    return (
      <div className="crm-auto-empty crm-auto-glass">
        <p>{t('crmSeq.none')}</p>
        {canAdminister && (
          <button
            type="button"
            className="portal-button crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
            onClick={onNew}
            style={{ marginTop: 12 }}
          >
            {t('crmSeq.create')}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="crm-auto-rules">
      {sequences.map((seq) => (
        <SequenceCard
          key={seq._id}
          seq={seq}
          busy={busyId === seq._id}
          canAdminister={canAdminister}
          onOpen={() => onOpen(seq)}
          onToggle={() => onToggle(seq)}
          onEdit={() => onEdit(seq)}
          onDelete={() => onDelete(seq)}
        />
      ))}
    </div>
  )
}
