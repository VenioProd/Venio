import { describe, it, expect, vi } from 'vitest'
import { generateEducationAiDraft, nextAttendanceState, reviewEducationAiDraft } from './education'

describe('nextAttendanceState', () => {
  it('passe NON_RENSEIGNE → PRESENT (premier tap)', () => {
    expect(nextAttendanceState('NON_RENSEIGNE')).toBe('PRESENT')
  })

  it('cycle PRESENT → RETARD → ABSENT → EXCUSE → PRESENT', () => {
    expect(nextAttendanceState('PRESENT')).toBe('RETARD')
    expect(nextAttendanceState('RETARD')).toBe('ABSENT')
    expect(nextAttendanceState('ABSENT')).toBe('EXCUSE')
    expect(nextAttendanceState('EXCUSE')).toBe('PRESENT')
  })
})

describe('education AI API client', () => {
  it('centralizes generation and explicit review calls', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            generation: { id: 'g1', mode: 'checklist_action_plan', engine: 'test', createdAt: '' },
            draft: { text: '', fields: {} },
            provenance: {},
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ generation: { id: 'g1', reviewed: true, reviewedAt: '' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await generateEducationAiDraft('checklist_action_plan', { context: 'Préparer la séance' })
    await reviewEducationAiDraft('g1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/admin/education/ai/generate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/education/ai/generations/g1/review',
      expect.objectContaining({ method: 'POST' }),
    )
    fetchMock.mockRestore()
  })
})
