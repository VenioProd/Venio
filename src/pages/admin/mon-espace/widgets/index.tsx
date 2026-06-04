import React from 'react'
import type { WidgetKey } from './registry'
import TaskListWidget from './TaskListWidget'
import NoteCollectionWidget from './NoteCollectionWidget'
import PostItWall from './PostItWall'
import { KpiWidget, PinnedWidget, ActivityWidget, WeekWidget } from './OverviewWidgets'
import { ClockWidget, PomodoroWidget, GoalWidget, ShortcutsWidget } from './AmbianceWidgets'

export function renderWidget(key: WidgetKey): React.ReactNode {
  switch (key) {
    case 'todo': return <TaskListWidget mode="todo" />
    case 'doing': return <TaskListWidget mode="doing" />
    case 'overdue': return <TaskListWidget mode="overdue" />
    case 'week': return <WeekWidget />
    case 'notes': return <NoteCollectionWidget noteType="NOTE" />
    case 'notebook': return <NoteCollectionWidget noteType="DRAFT" />
    case 'ideas': return <NoteCollectionWidget noteType="IDEA" />
    case 'postit': return <PostItWall />
    case 'kpis': return <KpiWidget />
    case 'pinned': return <PinnedWidget />
    case 'activity': return <ActivityWidget />
    case 'shortcuts': return <ShortcutsWidget />
    case 'clock': return <ClockWidget />
    case 'pomodoro': return <PomodoroWidget />
    case 'goal': return <GoalWidget />
    default: return null
  }
}
