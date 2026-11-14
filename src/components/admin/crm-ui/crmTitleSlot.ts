import { createContext } from 'react'

/**
 * La coque du CRM affiche le titre du sous-onglet tant que l'écran n'a pas son
 * propre `CrmPageHead`. Chaque `CrmPageHead` monté dans un écran s'annonce ici,
 * et la coque retire alors le sien : un seul `h1` par page.
 */
export const CrmTitleSlot = createContext<{ register: () => () => void } | null>(null)
