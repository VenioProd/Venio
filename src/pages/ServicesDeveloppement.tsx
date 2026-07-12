import React from 'react'
import ServicePageMono, { ServiceData } from '../components/ServicePageMono'
import VenioIcon from '../components/VenioIcon'

const DATA: ServiceData = {
  punch: `Un beau site ne sert à rien s'il ne marche pas. Le vôtre doit tenir, durer, et vous appartenir vraiment.`,
  probleme_titre: `Ce qu'on vous vend partout`,
  probleme: [
    `On vous vend un site beau et moderne, monté sur un modèle tout fait acheté en ligne, avec des petits modules ajoutés pour tout faire.`,
    `Ça marche six mois. Puis ça casse, ça rame dès que vous avez du monde, ou plus personne n'arrive à y toucher.`,
    `Normal : un modèle tout fait est pensé pour tout le monde, donc pour personne. Et le jour où vous voulez évoluer, il faut tout refaire.`,
  ],
  offres_titre: `Ce qu'on construit`,
  offres: [
    {
      nom: `Un site fait pour vous`,
      desc: `Pensé pour vos vrais besoins et écrit à la main, pas assemblé à partir d'un modèle. Vous en êtes propriétaire, du début à la fin.`,
    },
    {
      nom: `Vos outils de travail sur mesure`,
      desc: `Des outils internes qui font tourner votre activité presque tout seuls et qui évoluent à mesure que vous grandissez.`,
    },
    {
      nom: `Un logiciel qui grandit avec vous`,
      desc: `Conçu pour durer dix ans et encaisser la montée : de dix clients à dix mille, sans tout casser.`,
    },
    {
      nom: `L'IA quand elle est utile`,
      desc: `Branchée pour de vrai dans votre activité quand elle vous fait gagner du temps. Pas un robot de discussion collé pour faire joli.`,
    },
  ],
  resultat_titre: `Ce que vous obtenez`,
  resultat: [
    `Un site et des outils qui tiennent, que vous pouvez faire grandir, et que vous comprenez.`,
    `Des fondations saines que vos équipes peuvent reprendre quand elles veulent. Fait pour durer dix ans, pas six mois.`,
  ],
  pourqui_titre: `Pour qui c'est`,
  pourqui: [
    `Pour ceux qui veulent construire quelque chose qui dure.`,
    `Pour ceux qui ont déjà essayé les modèles tout faits et compris où ça coince.`,
    `Pour ceux qui préfèrent investir une bonne fois plutôt que tout refaire dans deux ans.`,
    `Si vous cherchez du vite fait et pas cher, ce n'est pas ici.`,
  ],
  cta_titre: `Parlons de votre projet`,
  cta_texte: `Vous avez un projet de site ou d'outil ? Dites-nous où vous en êtes. On vous répond en face, et si ça n'a pas de sens, on vous le dit.`,
  cta_label: `Nous contacter`,
}

const ServicesDeveloppement = () => (
  <ServicePageMono
    seoTitle="Développement web et applications sur mesure"
    seoDescription="Création de sites web et d'outils sur mesure à Paris. Un site qui vous appartient, fait pour durer dix ans, pas six mois. Pas de modèle tout fait."
    seoKeywords="développement web, site sur mesure, application web, logiciel sur mesure, développeur Paris"
    structuredDataType="service-developpement"
    eyebrow="Nos services · Développement"
    title="Développement web"
    servicePath="/services/developpement"
    ctaTo="/contact"
    icon={<VenioIcon name="developpement" size={40} />}
    data={DATA}
  />
)

export default ServicesDeveloppement
