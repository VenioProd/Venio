/** Champs d'enrichissement du lead, acceptés à l'identique par l'API admin et l'API agent. */
export function normalizeEnrichedLeadFields(body: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = {}
  if (body.probability !== undefined) {
    const value = Number(body.probability)
    out.probability = body.probability === null || Number.isNaN(value) ? null : Math.min(100, Math.max(0, value))
  }
  if (body.expectedCloseAt !== undefined)
    out.expectedCloseAt = body.expectedCloseAt ? new Date(body.expectedCloseAt) : null
  if (Array.isArray(body.tags)) {
    out.tags = [...new Set(body.tags.map((t: unknown) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
  }
  if (body.sourceDetail !== undefined) out.sourceDetail = String(body.sourceDetail || '').slice(0, 300)
  if (body.sector !== undefined) out.sector = String(body.sector || '').slice(0, 80)
  if (body.companySize !== undefined) out.companySize = String(body.companySize || '').slice(0, 40)
  if (body.nextActionLabel !== undefined) out.nextActionLabel = String(body.nextActionLabel || '').slice(0, 200)
  if (
    body.nextActionType !== undefined &&
    ['', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'OTHER'].includes(body.nextActionType)
  ) {
    out.nextActionType = body.nextActionType
  }
  if (body.utm !== undefined) {
    out.utm =
      body.utm && typeof body.utm === 'object'
        ? Object.fromEntries(
            Object.entries(body.utm)
              .slice(0, 10)
              .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 200)]),
          )
        : null
  }
  if (body.archived !== undefined) out.archivedAt = body.archived ? new Date() : null
  if (body.automationPaused !== undefined) out.automationPausedAt = body.automationPaused ? new Date() : null
  return out
}
