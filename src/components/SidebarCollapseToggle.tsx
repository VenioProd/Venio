import { ChevronLeft } from 'lucide-react'
import { useI18n } from '../context/I18nContext'
import './SidebarCollapseToggle.css'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

const SidebarCollapseToggle = ({ collapsed, onToggle }: Props) => {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="sb-pivot-toggle"
      data-collapsed={collapsed ? 'true' : 'false'}
      onClick={onToggle}
      aria-label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
      title={collapsed ? t('shell.sidebar.expandTitle') : t('shell.sidebar.collapseTitle')}
    >
      <ChevronLeft size={14} aria-hidden />
    </button>
  )
}

export default SidebarCollapseToggle
