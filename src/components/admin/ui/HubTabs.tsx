import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './AdminHub.css'

export interface HubTab {
  id: string
  label: string
  to: string
  count?: number
  /** Calculé avec la politique de permission du module d'origine. */
  allowed?: boolean
  content: ReactNode
}

interface HubTabsProps {
  label: string
  tabs: readonly HubTab[]
  children?: (tablist: ReactNode) => ReactNode
}

export default function HubTabs({ label, tabs, children }: HubTabsProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const uid = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const visible = tabs.filter((tab) => tab.allowed !== false)
  const active = visible.find((tab) => tab.to === location.pathname.replace(/\/$/, ''))
  const suffix = `${location.search}${location.hash}`

  if (!active) return <Navigate to={`${visible[0]?.to ?? '/admin/mon-espace'}${suffix}`} replace />

  const revealTab = (tab: HTMLElement) => {
    const list = listRef.current
    if (!list) return
    // Déplacer uniquement la barre : scrollIntoView ferait aussi défiler la page.
    if (tab.offsetLeft < list.scrollLeft) list.scrollLeft = tab.offsetLeft
    else if (tab.offsetLeft + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = tab.offsetLeft + tab.offsetWidth - list.clientWidth
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (event.key === ' ') {
      event.preventDefault()
      navigate(`${visible[index].to}${suffix}`)
      return
    }
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % visible.length
        break
      case 'ArrowLeft':
        next = (index - 1 + visible.length) % visible.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = visible.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const tab = listRef.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]')[next]
    tab?.focus({ preventScroll: true })
    if (tab) revealTab(tab)
    navigate(`${visible[next].to}${suffix}`)
  }

  const tablist = (
    <div ref={listRef} className="admin-hub-tabs" role="tablist" aria-label={label} aria-orientation="horizontal">
      {visible.map((tab, index) => (
        <Link
          key={tab.id}
          id={`${uid}-tab-${tab.id}`}
          role="tab"
          aria-label={tab.count === undefined ? undefined : `${tab.label} ${tab.count}`}
          aria-selected={tab.id === active.id}
          aria-controls={`${uid}-panel-${tab.id}`}
          tabIndex={tab.id === active.id ? 0 : -1}
          to={`${tab.to}${suffix}`}
          onFocus={(event) => revealTab(event.currentTarget)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="admin-hub-tabs__count">{tab.count}</span>}
        </Link>
      ))}
    </div>
  )

  return (
    <>
      {children ? children(tablist) : tablist}
      {visible.map((tab) => (
        <section
          key={tab.id}
          id={`${uid}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab.id}`}
          hidden={tab.id !== active.id}
          tabIndex={0}
          className="admin-hub-panel"
          data-hub-tab={tab.id}
        >
          {tab.id === active.id && tab.content}
        </section>
      ))}
    </>
  )
}
