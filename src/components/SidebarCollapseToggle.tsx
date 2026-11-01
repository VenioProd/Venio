import { Pin, PinOff } from 'lucide-react'
import { useI18n } from '../context/I18nContext'
import './SidebarCollapseToggle.css'

interface Props {
  collapsed: boolean
  expanded?: boolean
  onToggle: () => void
}

const SidebarCollapseToggle = ({ collapsed, expanded = !collapsed, onToggle }: Props) => {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="sb-pivot-toggle"
      data-collapsed={collapsed ? 'true' : 'false'}
      onClick={onToggle}
      aria-label={collapsed ? t('shell.sidebar.pin') : t('shell.sidebar.unpin')}
      aria-pressed={!collapsed}
      aria-expanded={expanded}
      aria-controls="admin-rail-navigation"
      title={`${collapsed ? t('shell.sidebar.pin') : t('shell.sidebar.unpin')} (⌘\\)`}
    >
      {collapsed ? <Pin size={14} aria-hidden /> : <PinOff size={14} aria-hidden />}
    </button>
  )
}

export default SidebarCollapseToggle
