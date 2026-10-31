/**
 * Source unique des questions fréquentes de la home.
 *
 * Elle alimente à la fois l'accordéon `<Faq>` et le JSON-LD `FAQPage` injecté
 * au runtime par `StructuredData`. Ne recopiez jamais ces textes ailleurs :
 * une question qui diverge de sa réponse balisée est une pénalité de
 * référencement, pas une coquille.
 *
 * Contraintes de contenu : aucun chiffre qui ne soit pas déjà tenu ailleurs
 * sur le site (seul « 48 h ouvrées » l'est), aucun numéro de téléphone, et
 * aucune promesse que le devis ne reprendrait pas.
 */
import { translate, type MessageKey } from '../i18n'

export interface FaqItem {
  question: string
  answer: string
}

/**
 * Les textes vivent dans `src/i18n/{fr,en}/pubHome.ts` ; chaque entrée expose
 * des accesseurs qui suivent la langue active, pour que les lecteurs hors
 * composant (JSON-LD, tests) gardent la même forme `{ question, answer }`.
 */
const faqItem = (question: MessageKey, answer: MessageKey): FaqItem => ({
  get question() {
    return translate(question)
  },
  get answer() {
    return translate(answer)
  },
})

const faqList = (prefix: string, count: number): FaqItem[] =>
  Array.from({ length: count }, (_, i) =>
    faqItem(`pubHome.faq.${prefix}${i + 1}Q` as MessageKey, `pubHome.faq.${prefix}${i + 1}A` as MessageKey),
  )

export const HOME_FAQ: FaqItem[] = faqList('home', 6)

/** /services/sites — ce que les visiteurs demandent avant de choisir un palier. */
export const SITES_FAQ: FaqItem[] = faqList('sites', 6)

/** /au-dela-du-site — trois métiers qu’on n’active que s’ils servent. */
export const AU_DELA_FAQ: FaqItem[] = faqList('auDela', 6)

/** /methode — ce qu’on attend du client, et ce qu’il reçoit. */
export const METHODE_FAQ: FaqItem[] = faqList('methode', 6)

/** /a-propos — les questions qui viennent quand on veut savoir à qui on parle. */
export const APROPOS_FAQ: FaqItem[] = faqList('apropos', 6)
