import { describe, it, expect } from 'vitest'
import { logActivity } from '../lib/activityLog.js'

describe('activityLog module', () => {
  it('should export logActivity as a function', () => {
    expect(logActivity).toBeDefined()
    expect(typeof logActivity).toBe('function')
  })

  it('logActivity should be an async function', () => {
    // Async functions have constructor name "AsyncFunction"
    expect(logActivity.constructor.name).toBe('AsyncFunction')
  })
})
