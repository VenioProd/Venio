import { ChevronLeft } from 'lucide-react'
import './SidebarCollapseToggle.css'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

const SidebarCollapseToggle = ({ collapsed, onToggle }: Props) => (
  <button
    type="button"
    className="sb-pivot-toggle"
    data-collapsed={collapsed ? 'true' : 'false'}
    onClick={onToggle}
    aria-label={collapsed ? 'Étendre la navigation' : 'Réduire la navigation'}
    title={collapsed ? 'Étendre (⌘\\)' : 'Réduire (⌘\\)'}
  >
    <ChevronLeft size={14} aria-hidden />
  </button>
)

export default SidebarCollapseToggle
