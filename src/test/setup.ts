import '@testing-library/jest-dom'

// Mock ResizeObserver — required for recharts ResponsiveContainer in jsdom
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
  }
  observe(el: Element) {
    // Simulate a 800x400 container so recharts renders SVG
    this.callback(
      [{ contentRect: { width: 800, height: 400 } } as ResizeObserverEntry],
      this,
    )
  }
  unobserve() {}
  disconnect() {}
}
