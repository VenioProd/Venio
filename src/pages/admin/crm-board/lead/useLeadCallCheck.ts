import { useEffect, useState } from 'react'
import type { CallCheck } from '../../../../services/externalSales'
import { fetchLeadCallCheck } from '../rich/api'

/** Le blocage dépend de l'heure chez le prospect : relu de temps en temps tant que la fiche est ouverte. */
const REFRESH_MS = 5 * 60_000

/**
 * Pays, heure locale et ce qui empêche d'appeler le prospect maintenant, sur la
 * fiche de l'équipe (même calcul que la file du poste d'appel). Hors plage : un
 * bandeau, comme la maquette ; les autres blocages : une puce près de la barre d'appel.
 */
export function useLeadCallCheck(leadId: string, phone: string | undefined): CallCheck | null {
  const [check, setCheck] = useState<{ leadId: string; value: CallCheck } | null>(null)
  useEffect(() => {
    if (!phone) return
    let active = true
    const load = () =>
      fetchLeadCallCheck(leadId)
        .then((value) => {
          if (active) setCheck({ leadId, value })
        })
        .catch(() => undefined)
    void load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [leadId, phone])
  return phone && check?.leadId === leadId ? check.value : null
}
