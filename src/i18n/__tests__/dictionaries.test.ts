import { describe, expect, it } from 'vitest'
import { formatMessage, translate } from '..'

type Dictionary = Record<string, string>

const frModules = import.meta.glob<{ default: Dictionary }>('../fr/*.ts', { eager: true })
const enModules = import.meta.glob<{ default: Dictionary }>('../en/*.ts', { eager: true })

const domainOf = (path: string) => path.split('/').pop()!.replace(/\.ts$/, '')
const domains = (modules: Record<string, unknown>) =>
  Object.keys(modules)
    .map(domainOf)
    .filter((name) => name !== 'index')
    .sort()

const placeholders = (message: string) =>
  [...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map((match) => match[1]).sort()

describe('dictionnaires i18n', () => {
  it('chaque domaine fr a son équivalent en, et inversement', () => {
    expect(domains(enModules)).toEqual(domains(frModules))
  })

  for (const domain of domains(frModules)) {
    const fr = frModules[`../fr/${domain}.ts`]?.default ?? {}
    const en = enModules[`../en/${domain}.ts`]?.default ?? {}

    it(`${domain} : mêmes clés en fr et en`, () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
    })

    it(`${domain} : textes non vides et mêmes paramètres`, () => {
      for (const [key, frText] of Object.entries(fr)) {
        const enText = en[key]
        expect(frText.trim(), `fr ${key} vide`).not.toBe('')
        expect(enText?.trim(), `en ${key} vide`).toBeTruthy()
        expect(placeholders(enText), `paramètres de ${key}`).toEqual(placeholders(frText))
      }
    })

    if (domain !== 'common') {
      it(`${domain} : clés préfixées par « ${domain}. »`, () => {
        for (const key of Object.keys(fr)) expect(key.startsWith(`${domain}.`), key).toBe(true)
      })
    }
  }

  it('aucune clé n’est définie dans deux domaines', () => {
    const seen = new Map<string, string>()
    for (const domain of domains(frModules)) {
      for (const key of Object.keys(frModules[`../fr/${domain}.ts`].default)) {
        expect(seen.get(key), `${key} dupliquée entre ${seen.get(key)} et ${domain}`).toBeUndefined()
        seen.set(key, domain)
      }
    }
  })
})

describe('formatMessage', () => {
  it('interpole les paramètres', () => {
    expect(formatMessage('Bonjour {name}', { name: 'Léa' }, 'fr')).toBe('Bonjour Léa')
  })

  it('gère les pluriels fr (0 et 1 au singulier) et en', () => {
    const template = '{count, plural, one {# élément} other {# éléments}}'
    expect(formatMessage(template, { count: 0 }, 'fr')).toBe('0 élément')
    expect(formatMessage(template, { count: 1 }, 'fr')).toBe('1 élément')
    expect(formatMessage(template, { count: 2 }, 'fr')).toBe('2 éléments')
    const en = '{count, plural, one {# item} other {# items}}'
    expect(formatMessage(en, { count: 0 }, 'en')).toBe('0 items')
    expect(formatMessage(en, { count: 1 }, 'en')).toBe('1 item')
  })

  it('accepte =0 et des paramètres dans une branche', () => {
    const template = '{n, plural, =0 {Aucun résultat pour {q}} one {# résultat} other {# résultats}}'
    expect(formatMessage(template, { n: 0, q: 'x' }, 'fr')).toBe('Aucun résultat pour x')
    expect(formatMessage(template, { n: 3, q: 'x' }, 'fr')).toBe('3 résultats')
  })

  it('translate lit la locale demandée', () => {
    expect(translate('nav.home', undefined, 'fr')).toBe('Accueil')
    expect(translate('nav.home', undefined, 'en')).toBe('Home')
  })
})
