import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import './CGU.css'

const CGU = () => {
  return (
    <>
      <SEO
        title="Conditions Générales d'Utilisation"
        description="Conditions générales d'utilisation du site Venio. Modalités et conditions d'utilisation du site web."
        noindex={true}
      />
      <GradientMeshBackground />
      <div className="cgu-page">
        <section className="cgu-hero">
          <h1>CONDITIONS GÉNÉRALES D&apos;UTILISATION</h1>
        </section>

        <NeonDivider />

        <section className="cgu-content">
          <div className="cgu-section">
            <p>
              Les présentes conditions générales d&apos;utilisation (ci-après les «&nbsp;CGU&nbsp;») ont pour objet de définir
              les modalités et conditions d&apos;utilisation du site web venio.paris (ci-après le «&nbsp;Site&nbsp;») édité par Venio.
            </p>

            <h3>1. Objet</h3>
            <p>
              Les présentes CGU régissent l&apos;accès et l&apos;utilisation du Site. L&apos;accès et l&apos;utilisation du Site
              impliquent l&apos;acceptation pleine et entière des présentes CGU par l&apos;utilisateur.
            </p>

            <h3>2. Accès au Site</h3>
            <p>
              Le Site est accessible gratuitement à tout utilisateur disposant d&apos;un accès à Internet.
              Tous les frais nécessaires pour l&apos;accès au Site (matériel informatique, connexion Internet, etc.)
              sont à la charge de l&apos;utilisateur.
            </p>

            <h3>3. Utilisation du Site</h3>
            <p>
              L&apos;utilisateur s&apos;engage à utiliser le Site de manière conforme à sa destination et dans le respect
              des lois et règlements en vigueur. Il est strictement interdit d&apos;utiliser le Site à des fins
              illégales ou frauduleuses.
            </p>

            <h3>4. Propriété intellectuelle</h3>
            <p>
              L&apos;ensemble des éléments du Site, qu&apos;ils soient visuels ou sonores, y compris la technologie sous-jacente,
              sont protégés par le droit d&apos;auteur, des marques ou des brevets. Ils sont la propriété exclusive de Venio
              ou de ses partenaires. Toute reproduction, représentation, modification, publication, adaptation de tout
              ou partie des éléments du Site, quel que soit le moyen ou le procédé utilisé, est interdite, sauf
              autorisation écrite préalable de Venio.
            </p>

            <h3>5. Responsabilité</h3>
            <p>
              Venio ne pourra être tenu responsable des dommages directs et indirects causés au matériel de l&apos;utilisateur,
              lors de l&apos;accès au Site. Venio s&apos;engage à sécuriser le Site au mieux, cependant sa responsabilité ne pourra
              être mise en cause si des données indésirables sont importées et installées sur son Site à son insu.
            </p>

            <h3>6. Données personnelles</h3>
            <p>
              Les informations recueillies sur le Site sont enregistrées dans un fichier informatisé par Venio.
              Conformément à la loi «&nbsp;informatique et libertés&nbsp;» et au RGPD, vous pouvez exercer votre droit d&apos;accès
              aux données vous concernant et les faire rectifier en contactant : contact@venio.paris
            </p>

            <h3>7. Cookies</h3>
            <p>
              Le Site peut être amené à utiliser des cookies techniques nécessaires au fonctionnement du site.
              Aucun cookie de tracking ou de publicité n&apos;est utilisé. L&apos;utilisateur peut configurer son navigateur
              pour refuser les cookies.
            </p>

            <h3>8. Modification des CGU</h3>
            <p>
              Venio se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur
              dès leur publication sur le Site. Il est conseillé à l&apos;utilisateur de consulter régulièrement les CGU.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default CGU
