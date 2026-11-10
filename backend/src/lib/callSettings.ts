import { getCountries, type CountryCode } from 'libphonenumber-js'
import { callError } from './callImports.js'

export function validateCallSettings(updates: Record<string, unknown>) {
  const outcomes = updates.callOutcomes
  if (outcomes !== undefined) {
    if (!Array.isArray(outcomes) || outcomes.length < 1 || outcomes.length > 9)
      throw callError(400, '1 à 9 résultats requis')
    const values = new Set<string>()
    for (const item of outcomes) {
      if (
        !item ||
        typeof item.value !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,59}$/.test(item.value) ||
        values.has(item.value) ||
        !['NONE', 'VOICEMAIL', 'CALLBACK', 'MEETING', 'LOST', 'WRONG_NUMBER', 'DO_NOT_CALL'].includes(item.effect) ||
        typeof item.reached !== 'boolean' ||
        (item.retryAfterMinutes !== null &&
          (typeof item.retryAfterMinutes !== 'number' ||
            !Number.isFinite(item.retryAfterMinutes) ||
            item.retryAfterMinutes <= 0)) ||
        !['fr', 'en'].every((lang) => typeof item[lang] === 'string' && item[lang].trim() && item[lang].length <= 120)
      )
        throw callError(400, 'Résultats invalides ou en double')
      values.add(item.value)
    }
  }
  const tags = updates.callScriptTags
  if (
    tags !== undefined &&
    (!Array.isArray(tags) ||
      tags.length > 30 ||
      new Set(tags).size !== tags.length ||
      tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag !== tag.trim() || tag.length > 60))
  )
    throw callError(400, 'Scripts invalides')
  const region = updates.callDefaultRegion
  if (region !== undefined && (typeof region !== 'string' || !getCountries().includes(region as CountryCode)))
    throw callError(400, 'Région invalide')
}
