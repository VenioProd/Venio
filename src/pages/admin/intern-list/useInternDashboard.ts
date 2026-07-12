import { useCallback, useState } from 'react'
import { apiFetch } from '../../../lib/api'

export function useInternDashboard() {
  const [dashboard, setDashboard] = useState<any[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [reminderLogs, setReminderLogs] = useState<any[]>([])
  const [sendingReminders, setSendingReminders] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; details?: any } | null>(null)

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const [data, logsResult] = await Promise.allSettled([
        apiFetch<any[]>('/api/admin/interns/dashboard'),
        apiFetch<{ logs: any[] }>('/api/admin/interns/reminder-logs'),
      ])
      if (data.status === 'fulfilled') setDashboard(data.value)
      if (logsResult.status === 'fulfilled') setReminderLogs(logsResult.value.logs || [])
    } catch {
      /* silent */
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  return {
    dashboard,
    dashboardLoading,
    reminderLogs,
    sendingReminders,
    setSendingReminders,
    reminderResult,
    setReminderResult,
    loadDashboard,
  }
}
