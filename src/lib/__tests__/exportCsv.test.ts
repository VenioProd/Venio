import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportToCsv } from '../exportCsv'

// Save the real createElement before any mocking
const realCreateElement = Document.prototype.createElement

describe('exportCsv', () => {
  it('can be imported without errors', () => {
    expect(typeof exportToCsv).toBe('function')
  })

  describe('exportToCsv', () => {
    let clickSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      clickSpy = vi.fn()

      // Mock URL.createObjectURL and URL.revokeObjectURL
      vi.stubGlobal('URL', {
        ...globalThis.URL,
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
      })

      // Mock document.createElement using the saved prototype method
      vi.spyOn(document, 'createElement').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((...args: any[]) => {
          const el = realCreateElement.apply(document, args as [string])
          if (args[0] === 'a') {
            el.click = clickSpy as unknown as () => void
          }
          return el
        }) as any,
      )

      vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node)
      vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('does not throw with valid inputs', () => {
      expect(() => exportToCsv('test.csv', ['Name', 'Value'], [['Alice', '100']])).not.toThrow()
    })

    it('triggers a click on the anchor element', () => {
      exportToCsv('test.csv', ['Name'], [['Alice']])
      expect(clickSpy).toHaveBeenCalledOnce()
    })

    it('calls URL.createObjectURL with a Blob', () => {
      exportToCsv('test.csv', ['Name'], [['Alice']])
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })

    it('calls URL.revokeObjectURL after download', () => {
      exportToCsv('test.csv', ['Name'], [['Alice']])
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })

    it('handles fields with commas and quotes without throwing', () => {
      expect(() => exportToCsv('test.csv', ['Name', 'Description'], [['Alice, Bob', 'She said "hello"']])).not.toThrow()
    })

    it('handles empty rows without throwing', () => {
      expect(() => exportToCsv('test.csv', ['A', 'B'], [])).not.toThrow()
    })
  })
})
