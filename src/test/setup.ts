import '@testing-library/jest-dom/vitest'

// Mock ResizeObserver — required for recharts ResponsiveContainer in jsdom
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
  }
  observe(_el: Element) {
    // Simulate a 800x400 container so recharts renders SVG
    this.callback(
      [{ contentRect: { width: 800, height: 400 } } as ResizeObserverEntry],
      this,
    )
  }
  unobserve() {}
  disconnect() {}
}

// IntersectionObserver — needed by some lazy/scroll components in jsdom
if (typeof globalThis.IntersectionObserver === 'undefined') {
  // Minimal mock for jsdom
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
    root = null
    rootMargin = ''
    thresholds = []
  }
}

// matchMedia — used by responsive hooks/components, missing in jsdom
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// localStorage — vitest 4 + jsdom 28 doesn't expose a working localStorage.
// Install a minimal in-memory impl on both window and globalThis so code that
// references `localStorage` (without `window.`) works too.
function installLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: ls,
    })
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: ls,
  })
}
installLocalStorage()
