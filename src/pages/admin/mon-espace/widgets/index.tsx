import React from 'react'
import type { WidgetKey } from './registry'

export function renderWidget(key: WidgetKey) {
  return <div data-widget={key}>{key}</div>
}
