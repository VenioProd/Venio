import { useI18n } from '../../context/I18nContext'

interface Props {
  onSnooze: (until: Date) => void
  onClose: () => void
}

function nextMonday9am(): Date {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMonday = (8 - day) % 7 || 7
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(9, 0, 0, 0)
  return d
}

function thisEvening(): Date {
  const d = new Date()
  d.setHours(18, 0, 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  return d
}

function tomorrow9am(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

const SnoozePopover = ({ onSnooze, onClose }: Props) => {
  const { t } = useI18n()
  const handle = (until: Date) => {
    onSnooze(until)
    onClose()
  }

  return (
    <div className="ix-snooze" role="menu">
      <span className="ix-snooze__label">{t('shared.dash.snoozeLabel')}</span>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(new Date(Date.now() + 3600 * 1000))}>
        1h
      </button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(thisEvening())}>
        {t('shared.dash.snoozeTonight')}
      </button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(tomorrow9am())}>
        {t('shared.dash.snoozeTomorrow')}
      </button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(nextMonday9am())}>
        {t('shared.dash.snoozeMonday')}
      </button>
      <button
        type="button"
        className="ix-snooze__opt"
        onClick={() => {
          const v = window.prompt(t('shared.dash.snoozeCustomPrompt'))
          if (v) handle(new Date(v))
        }}
      >
        {t('shared.dash.snoozeCustom')}
      </button>
    </div>
  )
}

export default SnoozePopover
