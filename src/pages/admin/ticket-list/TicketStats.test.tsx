import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketStats from './TicketStats'
import type { KpiData } from './types'

const { createPdf, pdfModuleLoaded, savePdf } = vi.hoisted(() => ({
  createPdf: vi.fn(),
  pdfModuleLoaded: vi.fn(),
  savePdf: vi.fn(),
}))

vi.mock('jspdf', () => {
  pdfModuleLoaded()
  return {
    jsPDF: createPdf,
  }
})

const kpi: KpiData = {
  totalCreated: 3,
  archived: 0,
  resolved: 2,
  open: 1,
  inProgress: 0,
  byCategory: { QUESTION: 1, DEMANDE: 1, PROBLEME: 1 },
  byPriority: { BASSE: 0, NORMALE: 2, HAUTE: 1, URGENTE: 0 },
  totalReplies: 4,
  avgResponseTime: 2,
  resolutionRate: 67,
  topAuthors: [{ name: 'Ada Lovelace', count: 2 }],
}

describe('TicketStats PDF export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPdf.mockImplementation(function MockPdf() {
      return {
        setFontSize: vi.fn(),
        setFont: vi.fn(),
        setTextColor: vi.fn(),
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        line: vi.fn(),
        text: vi.fn(),
        save: savePdf,
      }
    })
  })

  it('loads jsPDF only when the user requests the PDF, then saves the report', async () => {
    render(<TicketStats kpi={kpi} kpiPeriod="week" setKpiPeriod={vi.fn()} />)

    expect(pdfModuleLoaded).not.toHaveBeenCalled()
    expect(createPdf).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /telecharger pdf/i }))

    await waitFor(() => expect(pdfModuleLoaded).toHaveBeenCalledOnce())
    expect(createPdf).toHaveBeenCalledOnce()
    expect(savePdf).toHaveBeenCalledWith(expect.stringMatching(/^kpi-tickets-semaine-\d{4}-\d{2}-\d{2}\.pdf$/))
  })
})
