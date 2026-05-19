import { InboxItem, InboxActionKind } from './types'

interface Props {
  item: InboxItem
  focused?: boolean
  onAction: (kind: InboxActionKind, item: InboxItem) => void
}

const InboxCard = ({ item, focused, onAction }: Props) => {
  const cls = [
    'ix-card',
    focused ? 'ix-card--focused' : '',
    item.snoozedUntil ? 'ix-card--snoozed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} data-id={item.id}>
      <span
        className="ix-tag"
        style={{
          color: item.tag.color,
          background: `${item.tag.color}26`,
          borderLeft: `3px solid ${item.tag.color}`,
          textShadow: `0 0 6px ${item.tag.color}99`,
        }}
      >
        {item.tag.label}
      </span>
      <div className="ix-card__body">
        <div className="ix-card__title">{item.title}</div>
        <div className="ix-card__meta">
          {item.meta.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </div>
      <div className="ix-card__actions">
        {item.actions.map((a) => (
          <button
            key={a.kind}
            type="button"
            className={`ix-btn ix-btn--${a.kind}`}
            onClick={() => onAction(a.kind, item)}
            title={a.shortcut ? `Raccourci: ${a.shortcut.toUpperCase()}` : undefined}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default InboxCard
