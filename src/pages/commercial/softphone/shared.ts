import { createContext } from 'react'
import type { SettledCall, Softphone } from './engine'
import type { SoftphoneSession } from './useSoftphone'

/** Écran d'où l'appel est parti : celui où son résultat se saisit. */
export interface CallOrigin {
  leadId: string
  /** Chemin de l'écran, sans requête. */
  path: string
  /** Requête de l'écran, gardée pour y revenir (`?from=…` de la fiche). */
  search: string
  company: string | null
}

/** Appel terminé hors de son écran d'origine : son résultat reste à saisir. */
export interface OwedCall {
  call: SettledCall
  origin: CallOrigin
  /** Utilisateur qui a passé l'appel. */
  owner: string
}

/**
 * Softphone partagé par les écrans d'un même espace (le CRM de l'équipe) : l'appel survit au changement
 * d'écran. Sans fournisseur, chaque écran garde son propre softphone (espace du commercial externe).
 */
export interface SharedSoftphone {
  engine: Softphone
  session: SoftphoneSession
  /** Chemin affiché, sans requête. */
  path: string
  /** Écran d'où est parti le dernier appel. */
  origin: CallOrigin | null
  owed: OwedCall | null
  start: (leadId: string, mode: 'power' | undefined, company: string | null) => void
  /** Remet le résultat dû à son écran d'origine ; vrai une seule fois. */
  take: (owed: OwedCall) => boolean
  /** Une barre d'appel montre l'appel en cours ; la fonction rendue la retire. */
  show: () => () => void
}

export const SharedSoftphoneContext = createContext<SharedSoftphone | null>(null)
