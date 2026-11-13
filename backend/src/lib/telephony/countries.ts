import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import type { ICrmSettings } from '../../types/models/index.js'
import { phoneTimeZones } from './timeZones.js'

/**
 * Pays appelables (lot P, décisions 3 et 6 du propriétaire, 13 nov. 2026) :
 * France et Union européenne ouvertes par défaut ; Royaume-Uni, Canada et
 * États-Unis présents mais fermés tant que leurs règles ne sont pas validées.
 */

export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const

export const CALL_COUNTRIES = [...EU_COUNTRIES, 'GB', 'CA', 'US'] as const

export interface CallCountryRule {
  code: string
  enabled: boolean
  /** Le numéro par défaut (`TWILIO_CALLER_ID`) peut être présenté dans ce pays faute de numéro propre. */
  defaultCallerId: boolean
}

export const DEFAULT_CALL_COUNTRIES: CallCountryRule[] = CALL_COUNTRIES.map((code) => {
  const eu = (EU_COUNTRIES as readonly string[]).includes(code)
  return { code, enabled: eu, defaultCallerId: eu }
})

/** Règles des pays ; les réglages antérieurs au lot P n'en ont pas. */
export function callCountryRules(settings: Pick<ICrmSettings, 'telephony'>): CallCountryRule[] {
  const stored = settings.telephony?.countries
  if (!stored?.length) return DEFAULT_CALL_COUNTRIES
  return stored.map((rule) => ({ code: rule.code, enabled: rule.enabled, defaultCallerId: rule.defaultCallerId }))
}

export interface PhoneTarget {
  /** E.164. */
  e164: string
  /** Pays du numéro (ISO 3166-1), `null` pour un numéro non géographique. */
  country: string | null
  /** Fuseaux possibles ; vide = inconnu. */
  timeZones: string[]
}

/** Numéro E.164, pays et fuseaux possibles ; `null` si le numéro n'est pas valide. */
export function phoneTarget(value: string, defaultRegion: string): PhoneTarget | null {
  const phone = parsePhoneNumberFromString(value.trim().replace(/^00/, '+'), defaultRegion as CountryCode)
  if (!phone?.isValid()) return null
  const country = phone.country ?? null
  return { e164: phone.number, country, timeZones: phoneTimeZones(country, phone.nationalNumber) }
}

const E164 = /^\+[1-9]\d{6,14}$/

/**
 * Numéro présenté vers un pays : `TWILIO_CALLER_ID_<PAYS>` s'il est défini et valide,
 * sinon le numéro par défaut seulement si la règle du pays l'autorise ; `null` sinon.
 */
export function callerIdFor(country: string | null, rules: CallCountryRule[], defaultCallerId: string): string | null {
  if (!country) return null
  const own = process.env[`TWILIO_CALLER_ID_${country}`]?.trim()
  if (own && E164.test(own)) return own
  return rules.find((rule) => rule.code === country)?.defaultCallerId ? defaultCallerId : null
}
