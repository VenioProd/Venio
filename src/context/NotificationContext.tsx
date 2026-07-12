import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  fetchNotifications as fetchNotificationsApi,
  fetchUnreadCount,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
} from '../services/notifications'
import { syncAppBadge } from '../lib/appBadge'
import { useAuth } from './AuthContext'
import { isAdminRole } from '../lib/permissions'
import type { AppNotification } from '../types/notification.types'

interface NotificationContextValue {
  unreadCount: number
  notifications: AppNotification[]
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const POLL_INTERVAL = 60_000

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const isAdmin = user && isAdminRole(user.role)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const refresh = useCallback(async () => {
    if (!isAdmin) return
    try {
      const [count, notifs] = await Promise.all([fetchUnreadCount(), fetchNotificationsApi()])
      setUnreadCount(count)
      setNotifications(notifs)
    } catch {
      // silently fail polling
    }
  }, [isAdmin])

  // Socket : écoute notification:new pour un refresh instantané de la cloche
  useEffect(() => {
    if (!isAdmin || !user) return
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })
    socketRef.current = socket

    socket.on('notification:new', (notif: AppNotification) => {
      setNotifications((prev) => {
        if (prev.some((n) => n._id === notif._id)) return prev
        return [notif, ...prev]
      })
      setUnreadCount((prev) => prev + 1)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAdmin, user])

  useEffect(() => {
    if (!isAdmin) {
      setUnreadCount(0)
      setNotifications([])
      return
    }

    refresh()
    intervalRef.current = setInterval(refresh, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAdmin, refresh])

  // Badging API : reflète unreadCount sur l'icône de l'app installée (PWA).
  // Non-bloquant : aucun effet si l'API n'est pas supportée ou si l'app n'est
  // pas installée. Clear quand l'utilisateur n'est plus admin / déconnecté.
  useEffect(() => {
    syncAppBadge(isAdmin ? unreadCount : 0)
  }, [unreadCount, isAdmin])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await markAsReadApi(id)
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // ignore
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadApi()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(
    () => ({ unreadCount, notifications, markAsRead, markAllAsRead, refresh }),
    [unreadCount, notifications, markAsRead, markAllAsRead, refresh],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
