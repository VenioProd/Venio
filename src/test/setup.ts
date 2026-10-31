import '@testing-library/jest-dom'
import { registerLazyMessages } from '../i18n'
import frLazy from '../i18n/fr/lazy'
import enLazy from '../i18n/en/lazy'

// Tests render private-area components directly: make their dictionaries available synchronously.
registerLazyMessages(frLazy, enLazy)

// Mock ResizeObserver — required for recharts ResponsiveContainer in jsdom
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
  }
  observe(el: Element) {
    // Simulate a 800x400 container so recharts renders SVG
    this.callback([{ contentRect: { width: 800, height: 400 } } as ResizeObserverEntry], this)
  }
  unobserve() {}
  disconnect() {}
}
