import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VENIO-105 PDF bundle configuration', () => {
  it('keeps PDF imports behind the shared dynamic loader', () => {
    const files = [
      'src/components/admin/GestionKpi.tsx',
      'src/components/admin/InternKpi.tsx',
      'src/pages/admin/ticket-list/TicketStats.tsx',
    ]

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).toContain('import { loadJsPdf } from')
      expect(source).not.toMatch(/from ['"]jspdf['"]/)
      expect(source).not.toMatch(/import\(['"]jspdf['"]\)/)
    }

    const loader = readFileSync(resolve(process.cwd(), 'src/lib/loadPdf.ts'), 'utf8')
    expect(loader).toContain("import('jspdf')")
    expect(loader).not.toMatch(/from ['"]jspdf['"]/)
  })
})
