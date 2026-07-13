import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDownload } from '../lib/api'
import { classWorkspaceExportUrl, downloadClassWorkspaceExport } from './education'

vi.mock('../lib/api', () => ({
  apiDownload: vi.fn(),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}))

describe('class workspace export client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:class-export'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses a deterministic class URL and the matching sensitive-action confirmation', async () => {
    vi.mocked(apiDownload).mockResolvedValue({
      blob: new Blob(['{}'], { type: 'application/json' }),
      filename: 'classe-demo-workspace.json',
      contentType: 'application/json; charset=utf-8',
    })

    expect(classWorkspaceExportUrl('classe / 1', 'json')).toBe(
      '/api/admin/education/exports/classes/classe%20%2F%201?format=json',
    )
    await downloadClassWorkspaceExport('classe / 1', 'json')

    expect(apiDownload).toHaveBeenCalledWith('/api/admin/education/exports/classes/classe%20%2F%201?format=json', {
      headers: { 'X-Venio-Confirm': 'EDUCATION_CLASS_EXPORT' },
    })
  })
})
