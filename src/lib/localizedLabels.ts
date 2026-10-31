import { translate, type MessageKey } from '../i18n'

/**
 * Table clé → libellé dont chaque valeur est résolue à la lecture, dans la langue active.
 * Garde l'API historique des tables `Record<K, string>` exportées par les services
 * (`STATUS_LABEL[status]`) tout en suivant le changement de langue.
 */
export function localizedLabels<K extends string>(keys: Record<K, MessageKey>): Record<K, string> {
  const table = {} as Record<K, string>
  for (const key of Object.keys(keys) as K[]) {
    Object.defineProperty(table, key, {
      enumerable: true,
      get: () => translate(keys[key]),
    })
  }
  return table
}
