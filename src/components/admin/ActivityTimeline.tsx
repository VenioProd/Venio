import React, { useEffect, useState, useCallback } from 'react'
import { fetchActivities } from '../../services/activityLog'
import type { ActivityLog, ActivityAction } from '../../types/activity.types'
import '../../styles/activity-timeline.css'

interface Props {
  projectId: string
}

const ACTION_ICONS: Record<ActivityAction, string> = {
  PROJECT_CREATED: '\u{1F680}',
  PROJECT_UPDATED: '\u{270F}\u{FE0F}',
  PROJECT_ARCHIVED: '\u{1F4E6}',
  PROJECT_UNARCHIVED: '\u{1F4E4}',
  STATUS_CHANGED: '\u{1F504}',
  TASK_CREATED: '\u{2795}',
  TASK_UPDATED: '\u{1F4DD}',
  TASK_MOVED: '\u{27A1}\u{FE0F}',
  TASK_DELETED: '\u{1F5D1}\u{FE0F}',
  TASK_COMMENT_ADDED: '\u{1F4AC}',
  DOCUMENT_UPLOADED: '\u{1F4CE}',
  SECTION_CREATED: '\u{1F4C1}',
  SECTION_DELETED: '\u{1F5D1}\u{FE0F}',
  ITEM_CREATED: '\u{1F4C4}',
  ITEM_DELETED: '\u{1F5D1}\u{FE0F}',
  UPDATE_POSTED: '\u{1F4E2}',
  BILLING_CREATED: '\u{1F9FE}',
}

const ACTION_COLORS: Record<string, string> = {
  PROJECT_CREATED: '#10b981',
  STATUS_CHANGED: '#f59e0b',
  TASK_CREATED: '#0ea5e9',
  TASK_MOVED: '#0284c7',
  TASK_DELETED: '#ef4444',
  DOCUMENT_UPLOADED: '#9b9b9b',
  UPDATE_POSTED: '#ffffff',
  BILLING_CREATED: '#f97316',
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "A l'instant"
  if (diffMin < 60) return `Il y a ${diffMin}min`
  if (diffHour < 24) return `Il y a ${diffHour}h`
  if (diffDay < 7) return `Il y a ${diffDay}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getActorName(actor: ActivityLog['actor']): string {
  if (typeof actor === 'object' && actor !== null) return actor.name || actor.email
  return 'Utilisateur'
}

export default function ActivityTimeline({ projectId }: Props) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)

  const load = useCallback(
    async (before?: string) => {
      try {
        const data = await fetchActivities(projectId, 30, before)
        if (before) {
          setActivities((prev) => [...prev, ...data])
        } else {
          setActivities(data)
        }
        setHasMore(data.length === 30)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    setLoading(true)
    setActivities([])
    load()
  }, [projectId, load])

  const loadMore = () => {
    if (activities.length === 0) return
    const oldest = activities[activities.length - 1].createdAt
    load(oldest)
  }

  if (loading) {
    return <div className="activity-loading">Chargement de l'activite...</div>
  }

  if (activities.length === 0) {
    return (
      <div className="activity-empty">
        <div className="activity-empty-icon">{'\u{1F4CB}'}</div>
        <p>Aucune activite enregistree pour ce projet</p>
      </div>
    )
  }

  // Group by date
  const groups: { label: string; items: ActivityLog[] }[] = []
  let currentLabel = ''
  for (const a of activities) {
    const d = new Date(a.createdAt)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    let label: string
    if (d.toDateString() === today.toDateString()) {
      label = "Aujourd'hui"
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = 'Hier'
    } else {
      label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    }
    if (label !== currentLabel) {
      groups.push({ label, items: [] })
      currentLabel = label
    }
    groups[groups.length - 1].items.push(a)
  }

  return (
    <div className="activity-timeline">
      {groups.map((group) => (
        <div key={group.label} className="activity-group">
          <div className="activity-group-label">{group.label}</div>
          <div className="activity-group-items">
            {group.items.map((a) => (
              <div key={a._id} className="activity-item">
                <div
                  className="activity-item-icon"
                  style={{
                    background: `${ACTION_COLORS[a.action] || '#0ea5e9'}20`,
                    color: ACTION_COLORS[a.action] || '#0ea5e9',
                  }}
                >
                  {ACTION_ICONS[a.action] || '\u{1F4CC}'}
                </div>
                <div className="activity-item-content">
                  <p className="activity-item-summary">
                    <span className="activity-item-actor">{getActorName(a.actor)}</span> {a.summary}
                  </p>
                  <span className="activity-item-time">{formatRelativeTime(a.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <button className="activity-load-more" onClick={loadMore}>
          Charger plus
        </button>
      )}
    </div>
  )
}
