import fr from './fr'
import en from './en'

export type Locale = 'fr' | 'en'
/** Every key of the French dictionary — `en` is typed to cover exactly the same set. */
export type MessageKey = keyof typeof fr
export type MessageParams = Record<string, string | number>

const locales: Record<Locale, Record<string, string>> = { fr, en }

/** BCP 47 tags handed to `Intl` for each UI language. */
export const INTL_LOCALES: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' }

let activeLocale: Locale = 'fr'

/** Called by I18nProvider so that non-React code (formatters, toasts) follows the UI language. */
export function setActiveLocale(locale: Locale): void {
  activeLocale = locale
}

export function getActiveLocale(): Locale {
  return activeLocale
}

/** `Intl` tag of the active UI language (`fr-FR` / `en-GB`). */
export function intlLocale(locale: Locale = activeLocale): string {
  return INTL_LOCALES[locale]
}

/**
 * Message syntax: `{name}` for a value, and
 * `{count, plural, one {# item} other {# items}}` for plurals (`#` = the number).
 */
export function formatMessage(template: string, params: MessageParams | undefined, locale: Locale): string {
  if (!params || !template.includes('{')) return template
  let out = ''
  let i = 0
  while (i < template.length) {
    const ch = template[i]
    if (ch !== '{') {
      out += ch
      i += 1
      continue
    }
    let depth = 1
    let j = i + 1
    while (j < template.length && depth > 0) {
      if (template[j] === '{') depth += 1
      else if (template[j] === '}') depth -= 1
      j += 1
    }
    const inner = template.slice(i + 1, j - 1)
    out += resolveToken(inner, params, locale)
    i = j
  }
  return out
}

function resolveToken(inner: string, params: MessageParams, locale: Locale): string {
  const firstComma = inner.indexOf(',')
  if (firstComma === -1) {
    const name = inner.trim()
    return name in params ? String(params[name]) : `{${inner}}`
  }
  const name = inner.slice(0, firstComma).trim()
  const rest = inner.slice(firstComma + 1)
  const secondComma = rest.indexOf(',')
  const kind = (secondComma === -1 ? rest : rest.slice(0, secondComma)).trim()
  if (kind !== 'plural' || secondComma === -1 || !(name in params)) return `{${inner}}`
  const count = Number(params[name])
  const branches = parseBranches(rest.slice(secondComma + 1))
  const category = new Intl.PluralRules(INTL_LOCALES[locale]).select(count)
  const branch = branches[`=${count}`] ?? branches[category] ?? branches.other ?? ''
  return formatMessage(branch.replace(/#/g, new Intl.NumberFormat(INTL_LOCALES[locale]).format(count)), params, locale)
}

function parseBranches(source: string): Record<string, string> {
  const branches: Record<string, string> = {}
  let i = 0
  while (i < source.length) {
    const open = source.indexOf('{', i)
    if (open === -1) break
    const label = source.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < source.length && depth > 0) {
      if (source[j] === '{') depth += 1
      else if (source[j] === '}') depth -= 1
      j += 1
    }
    branches[label] = source.slice(open + 1, j - 1)
    i = j
  }
  return branches
}

/** Translate outside React (services, event handlers). Inside components prefer `useI18n().t`. */
export function translate(key: MessageKey, params?: MessageParams, locale: Locale = activeLocale): string {
  const template = locales[locale]?.[key] ?? locales.fr[key] ?? key
  return formatMessage(template, params, locale)
}

export default locales
