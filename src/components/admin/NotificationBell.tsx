import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import '../../styles/notifications.css'

type NotificationBellProps = {
  onNavigate?: () => void
}

const NotificationBell = ({ onNavigate }: NotificationBellProps) => {
  const { unreadCount, notifications, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleNotifClick = async (notif: { _id: string; link: string; isRead: boolean }) => {
    if (!notif.isRead) {
      await markAsRead(notif._id)
    }
    if (notif.link) {
      navigate(notif.link)
      onNavigate?.()
    }
    setOpen(false)
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'maintenant'
    if (minutes < 60) return `il y a ${minutes}min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `il y a ${hours}h`
    const days = Math.floor(hours / 24)
    return `il y a ${days}j`
  }

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="notif-bell-icon">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label="Notifications">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllAsRead}>
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="notif-dropdown-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">Aucune notification</div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif._id}
                  className={`notif-item ${!notif.isRead ? 'notif-item-unread' : ''}`}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="notif-item-content">
                    <span className="notif-item-title">{notif.title}</span>
                    {notif.message && (
                      <span className="notif-item-message">
                        {notif.message.length > 60 ? notif.message.slice(0, 60) + '...' : notif.message}
                      </span>
                    )}
                  </div>
                  <span className="notif-item-time">{formatTimeAgo(notif.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
