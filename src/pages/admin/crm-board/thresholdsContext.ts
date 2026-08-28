import { createContext, useContext } from 'react'
import type { WorklistThresholds } from '../../../types/crm.types'
import { DEFAULT_WORKLIST_THRESHOLDS } from './constants'

/**
 * Seuils d'alerte configurés dans /admin/crm/settings, servis par le serveur.
 * Passés par contexte plutôt qu'en props : les badges d'alerte sont rendus au
 * fond de l'arbre (cartes Kanban, lignes de tableau) et les seuils ne sont pas
 * une donnée de ces composants.
 */
export const CrmThresholdsContext = createContext<WorklistThresholds>(DEFAULT_WORKLIST_THRESHOLDS)

export function useCrmThresholds(): WorklistThresholds {
  return useContext(CrmThresholdsContext)
}
