import type fr from '../fr/bulk'

const en: Record<keyof typeof fr, string> = {
  'bulk.toolbar': 'Bulk actions',
  'bulk.selected': '{count, plural, one {# selected} other {# selected}}',
  'bulk.announce': '{count, plural, =0 {No items selected} one {# item selected} other {# items selected}}',
  'bulk.clear': 'Clear selection',
  'bulk.selectAll': 'Select all',
  'bulk.selectAllAria': 'Select all items on this page',
  'bulk.selectRowAria': 'Select {name}',
  'bulk.working': 'Working…',
  'bulk.action.delete': 'Delete',
  'bulk.action.archive': 'Archive',
  'bulk.action.unarchive': 'Unarchive',
  'bulk.action.status': 'Status',
  'bulk.action.priority': 'Priority',
  'bulk.action.assignee': 'Assignee',
  'bulk.action.dueDate': 'Due date',
  'bulk.action.noAssignee': 'Nobody',
  'bulk.action.noDueDate': 'No due date',
  'bulk.confirm.deleteTitle': 'Delete selection',
  'bulk.confirm.deleteMessage':
    '{count, plural, one {Permanently delete # item?} other {Permanently delete # items?}} This cannot be undone.',
  'bulk.result.success': '{count, plural, one {# item done} other {# items done}}',
  'bulk.result.partial': '{ok} succeeded, {failed} failed',
  'bulk.result.failure': 'No item could be processed',
  'bulk.result.error': 'The bulk action failed',
}

export default en
