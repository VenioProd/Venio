import { apiFetch } from '../lib/api'
import type { PilotagePeriod, PilotageResponse } from '../types/pilotage.types'

export function fetchPilotage(period: PilotagePeriod): Promise<PilotageResponse> {
  return apiFetch(`/api/admin/crm/pilotage?period=${period}`)
}
