import React from 'react'
import ServicePageMono, { ServiceData } from '../components/ServicePageMono'
import VenioIcon from '../components/VenioIcon'

const DATA: ServiceData = {
  punch: `Avoir un logo fait sur Canva, ce n'est pas avoir une marque. Une marque, c'est ce qui vous rend reconnaissable et vous fait tenir face aux autres.`,
  probleme_titre: `Ce qu'on vous vend, et pourquoi ça tombe à plat`,
  probleme: [
    `On vous vend un logo, un document de règles en PDF, trois posts Instagram, et des textes recopiés d'un client à l'autre.`,
    `Résultat : vous ressemblez à tout le monde, et votre marque ne repose sur rien de solide.`,
    `Un beau visuel sans réflexion derrière, c'est de la déco. Et les modes changent tous les six mois : si vous les suivez, vous êtes déjà en retard, et dans deux ans tout aura l'air vieux.`,
  ],
  offres_titre: `Ce qu'on construit`,
  offres: [
    {
      nom: `Une vraie identité, pas juste un logo`,
      desc: `On pose tout ce qui rend votre marque reconnaissable : les couleurs, la façon d'écrire votre nom, la mise en page. Un ensemble qui tient dans le temps, pas une image isolée.`,
    },
    {
      nom: `Quoi dire, et comment le dire`,
      desc: `On définit votre façon de parler et on organise vos publications : quoi raconter, sur quel ton, et à quel rythme, sans vous laisser improviser.`,
    },
    {
      nom: `Des contenus qui vous donnent une place`,
      desc: `Articles de fond, retours d'expérience, prises de position. Pas du remplissage : du contenu qui dit clairement qui vous êtes et pourquoi on vous choisit.`,
    },
    {
      nom: `Une cohérence partout`,
      desc: `On veille à ce que tout se ressemble et se tienne, du papier à l'écran jusqu'à la vidéo. Le même style sur chaque support.`,
    },
  ],
  resultat_titre: `Ce que vous obtenez`,
  resultat: [
    `Une marque qui se tient debout, qui ne court pas après les modes, et qui dure dans le temps.`,
    `Une voix qui est la vôtre, qui ne ressemble à personne, et la même cohérence sur tous vos supports.`,
  ],
  pourqui_titre: `Pour qui c'est, pour qui ça ne l'est pas`,
  pourqui: [
    `Pour vous si vous voulez une vraie marque, pas juste un logo.`,
    `Pour vous si vous refusez de ressembler à tous vos concurrents.`,
    `Pour vous si vous comprenez que la cohérence compte plus que la dernière tendance.`,
    `Si vous cherchez du vite fait et du tendance, ce n'est pas chez nous.`,
  ],
  cta_titre: `Parlons de votre projet`,
  cta_texte: `Vous avez un projet de marque ou de communication ? Dites-nous où vous en êtes, on vous répond en face, sans détour. Si ça n'a pas de sens, on vous le dit.`,
  cta_label: `Nous contacter`,
}

const ServicesCommunication = () => (
  <ServicePageMono
    seoTitle="Communication et identité de marque"
    seoDescription="Identité de marque et communication à Paris. Une vraie marque, pas juste un logo : cohérente, qui vous ressemble et qui dure dans le temps."
    seoKeywords="communication, identité de marque, branding, image de marque, agence communication Paris"
    structuredDataType="service-communication"
    eyebrow="Nos services · Marque"
    title="Communication & marque"
    ctaTo="/contact"
    icon={<VenioIcon name="communication" size={40} />}
    data={DATA}
  />
)

export default ServicesCommunication
