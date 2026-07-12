import React from 'react'
import ServicePageMono, { ServiceData } from '../components/ServicePageMono'
import VenioIcon from '../components/VenioIcon'

const DATA: ServiceData = {
  punch: `Le problème, ce n'est pas votre communication. Ce sont vos décisions. On est là pour vous dire ce que personne n'ose vous dire.`,
  probleme_titre: `Ce qu'on vous vend partout`,
  probleme: [
    `On vous vend de l'accompagnement : des conseillers qui hochent la tête, valident vos idées et organisent des réunions où tout le monde est d'accord.`,
    `Au bout, de belles présentations qui finissent dans un tiroir et que personne ne rouvre.`,
    `La plupart sont là pour facturer des mois, pas pour vous aider. Ils ne disent jamais non. Vous payez pour qu'on vous dise oui.`,
  ],
  offres_titre: `Ce qu'on fait, nous`,
  offres: [
    {
      nom: `Le bilan sans filtre`,
      desc: `On regarde tout ce que vous avez en place, on pointe les vraies failles, et si votre plan est mauvais on vous le dit en face.`,
    },
    {
      nom: `Le tri dans vos outils`,
      desc: `On fait le ménage dans les outils que vous utilisez et on dessine ce dont vous avez vraiment besoin. Que du concret, zéro grands mots.`,
    },
    {
      nom: `L'IA quand ça sert`,
      desc: `On repère ce qui peut tourner tout seul chez vous, et on vous dit aussi quand l'IA n'apporte rien. Pas de gadget.`,
    },
    {
      nom: `Une place claire face aux concurrents`,
      desc: `On clarifie ce que vous apportez vraiment et ce qui vous distingue, pour qu'on vous choisisse vous et pas le voisin.`,
    },
    {
      nom: `Des offres qui tiennent debout`,
      desc: `On revoit ce que vous vendez et à quel prix, en partant de ce que ça rapporte à votre client. Pas de ce que font les autres.`,
    },
  ],
  resultat_titre: `Ce que vous repartez avec`,
  resultat: [
    `Des décisions claires, des priorités et un plan que vous pouvez suivre dès demain.`,
    `Pas des présentations qui rassurent. Une direction nette, et de quoi la tenir jusqu'au bout.`,
  ],
  pourqui_titre: `Pour qui c'est`,
  pourqui: [
    `Pour les décideurs, pas les rêveurs.`,
    `Pour ceux qui veulent des réponses honnêtes, pas qu'on valide tout ce qu'ils disent.`,
    `Pour ceux qui préfèrent savoir maintenant que ça ne marchera pas, plutôt que dans six mois.`,
    `Si vous cherchez quelqu'un qui exécute sans réfléchir, ce n'est pas ici. Et si votre projet n'a pas de sens, on refuse.`,
  ],
  cta_titre: `Premier échange (30 min)`,
  cta_texte: `On parle de votre projet. Sans filtre. Si on peut vous aider, on vous le dit. Si on ne peut pas, on vous le dit aussi.`,
  cta_label: `Réserver un créneau`,
}

const ServicesConseil = () => (
  <ServicePageMono
    seoTitle="Conseil stratégique et audit digital"
    seoDescription="Conseil et audit pour votre digital à Paris. Un bilan sans détour, des décisions claires, des priorités. Si votre stratégie ne tient pas, on vous le dit."
    seoKeywords="conseil stratégique, audit digital, stratégie digitale, transformation digitale, conseil Paris"
    structuredDataType="service-conseil"
    eyebrow="Nos services · Conseil"
    title="Conseil stratégique"
    servicePath="/services/conseil"
    ctaTo="https://calendly.com"
    ctaExternal
    icon={<VenioIcon name="conseil" size={40} />}
    data={DATA}
  />
)

export default ServicesConseil
