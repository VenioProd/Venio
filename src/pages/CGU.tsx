import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
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
          <h1>CONDITIONS GÉNÉRALES D'UTILISATION</h1>
        </section>

        <section className="cgu-content">
          <div className="cgu-section">
            <p>
              Les présentes conditions générales d'utilisation (ci-après les "CGU") ont pour objet de définir 
              les modalités et conditions d'utilisation du site web venio.paris (ci-après le "Site") édité par Venio.
            </p>
            
            <h3>1. Objet</h3>
            <p>
              Les présentes CGU régissent l'accès et l'utilisation du Site. L'accès et l'utilisation du Site 
              impliquent l'acceptation pleine et entière des présentes CGU par l'utilisateur.
            </p>

            <h3>2. Accès au Site</h3>
            <p>
              Le Site est accessible gratuitement à tout utilisateur disposant d'un accès à Internet. 
              Tous les frais nécessaires pour l'accès au Site (matériel informatique, connexion Internet, etc.) 
              sont à la charge de l'utilisateur.
            </p>

            <h3>3. Utilisation du Site</h3>
            <p>
              L'utilisateur s'engage à utiliser le Site de manière conforme à sa destination et dans le respect 
              des lois et règlements en vigueur. Il est strictement interdit d'utiliser le Site à des fins 
              illégales ou frauduleuses.
            </p>

            <h3>4. Propriété intellectuelle</h3>
            <p>
              L'ensemble des éléments du Site, qu'ils soient visuels ou sonores, y compris la technologie sous-jacente, 
              sont protégés par le droit d'auteur, des marques ou des brevets. Ils sont la propriété exclusive de Venio 
              ou de ses partenaires. Toute reproduction, représentation, modification, publication, adaptation de tout 
              ou partie des éléments du Site, quel que soit le moyen ou le procédé utilisé, est interdite, sauf 
              autorisation écrite préalable de Venio.
            </p>

            <h3>5. Responsabilité</h3>
            <p>
              Venio ne pourra être tenu responsable des dommages directs et indirects causés au matériel de l'utilisateur, 
              lors de l'accès au Site. Venio s'engage à sécuriser le Site au mieux, cependant sa responsabilité ne pourra 
              être mise en cause si des données indésirables sont importées et installées sur son Site à son insu.
            </p>

            <h3>6. Données personnelles</h3>
            <p>
              Les informations recueillies sur le Site sont enregistrées dans un fichier informatisé par Venio. 
              Conformément à la loi "informatique et libertés" et au RGPD, vous pouvez exercer votre droit d'accès 
              aux données vous concernant et les faire rectifier en contactant : contact@venio.paris
            </p>

            <h3>7. Cookies</h3>
            <p>
              Le Site peut être amené à utiliser des cookies techniques nécessaires au fonctionnement du site. 
              Aucun cookie de tracking ou de publicité n'est utilisé. L'utilisateur peut configurer son navigateur 
              pour refuser les cookies.
            </p>

            <h3>8. Modification des CGU</h3>
            <p>
              Venio se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur 
              dès leur publication sur le Site. Il est conseillé à l'utilisateur de consulter régulièrement les CGU.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default CGU

