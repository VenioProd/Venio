import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import './Legal.css'

const Legal = () => {
  return (
    <>
      <SEO
        title="Mentions Légales"
        description="Mentions légales du site Venio. Informations sur l'éditeur, l'hébergeur et les données personnelles."
        noindex={true}
      />
      <GradientMeshBackground />
      <div className="legal-page">
        <section className="legal-hero">
          <h1>MENTIONS LÉGALES</h1>
        </section>

        <NeonDivider />

        <section className="legal-content">
          <div className="legal-section">
            <h2>Informations légales</h2>
            <p>
              <strong>Raison sociale :</strong> Venio<br />
              <strong>Représentant légal :</strong> Raphaël BENTVELZEN<br />
              <strong>Siège social :</strong> 60 Rue François 1er, 75008 Paris, France<br />
              <strong>SIREN :</strong> 939549473<br />
              <strong>Code NAF / APE :</strong> 7022Z<br />
              <strong>Email :</strong> contact@venio.paris
            </p>
          </div>

          <div className="legal-section">
            <h2>Conditions générales de vente (CGV)</h2>
            <p>
              Les présentes conditions générales de vente (ci-après les «&nbsp;CGV&nbsp;») régissent les relations contractuelles
              entre Venio et ses clients. Toute commande ou acceptation de devis implique l&apos;acceptation sans réserve
              des présentes CGV.
            </p>

            <h3>1. Objet</h3>
            <p>
              Les présentes CGV s&apos;appliquent à toutes les prestations de services proposées par Venio, notamment
              dans les domaines de la communication, du développement web et applicatif, et du conseil stratégique.
            </p>

            <h3>2. Prestations</h3>
            <p>
              Venio propose des services de :
            </p>
            <ul>
              <li>Communication &amp; Branding : identités visuelles, stratégies éditoriales, contenus premium</li>
              <li>Développement : sites web, plateformes métier, SaaS, intégration IA</li>
              <li>Conseil stratégique : positionnement, transformation digitale, stratégie IA</li>
            </ul>
            <p>
              Chaque prestation fait l&apos;objet d&apos;un devis détaillé précisant les modalités d&apos;exécution, les délais
              et les tarifs. Le devis est valable 30 jours à compter de sa date d&apos;émission.
            </p>

            <h3>3. Commande et acceptation</h3>
            <p>
              Toute commande suppose l&apos;acceptation préalable d&apos;un devis. L&apos;acceptation du devis par le client
              vaut commande ferme et définitive. La commande est réputée acceptée par Venio dès réception d&apos;un bon
              de commande signé ou d&apos;un email de confirmation du client.
            </p>

            <h3>4. Tarifs</h3>
            <p>
              Les tarifs sont indiqués en euros, hors taxes (HT). Ils sont valables pour la durée
              indiquée sur le devis. Venio se réserve le droit de modifier ses tarifs à tout moment, étant entendu
              que les tarifs figurant sur le devis accepté restent applicables pour la prestation concernée.
            </p>

            <h3>5. Modalités de paiement</h3>
            <p>
              Les modalités de paiement sont définies dans chaque devis et contrat. Généralement :
            </p>
            <ul>
              <li>Un acompte de 30% à 50% peut être demandé à la commande</li>
              <li>Le solde est exigible à la livraison de la prestation ou selon un échéancier convenu</li>
              <li>Le paiement s&apos;effectue par virement bancaire ou chèque</li>
            </ul>
            <p>
              En cas de retard de paiement, des pénalités de retard au taux de 3 fois le taux légal peuvent être
              appliquées, ainsi qu&apos;une indemnité forfaitaire pour frais de recouvrement de 40&nbsp;euros.
            </p>

            <h3>6. Exécution des prestations</h3>
            <p>
              Venio s&apos;engage à exécuter les prestations avec diligence et selon les règles de l&apos;art. Les délais
              indiqués dans le devis sont donnés à titre indicatif. Tout retard dans l&apos;exécution ne pourra donner
              lieu à annulation de la commande ou à dommages et intérêts, sauf si le retard excède 30 jours et
              résulte d&apos;une faute lourde de Venio.
            </p>

            <h3>7. Réception et réclamations</h3>
            <p>
              Le client dispose d&apos;un délai de 8 jours à compter de la livraison pour formuler des réclamations
              concernant la conformité de la prestation. Passé ce délai, la prestation est réputée conforme et
              acceptée sans réserve.
            </p>

            <h3>8. Propriété intellectuelle</h3>
            <p>
              Les droits de propriété intellectuelle sur les prestations réalisées sont transférés au client
              après paiement intégral de la facture, sauf mention contraire dans le contrat. Les éléments
              préexistants (bibliothèques, frameworks, etc.) restent soumis à leurs licences respectives.
            </p>

            <h3>9. Confidentialité</h3>
            <p>
              Venio s&apos;engage à respecter la confidentialité de toutes les informations communiquées par le client
              dans le cadre de l&apos;exécution de la prestation. Cette obligation perdure après la fin de la mission.
            </p>

            <h3>10. Responsabilité</h3>
            <p>
              La responsabilité de Venio est limitée au montant de la prestation facturée. Venio ne pourra être
              tenu responsable des dommages indirects (perte de clientèle, perte de chiffre d&apos;affaires, etc.)
              résultant de l&apos;utilisation ou de l&apos;impossibilité d&apos;utiliser la prestation.
            </p>

            <h3>11. Résiliation</h3>
            <p>
              En cas de manquement grave de l&apos;une des parties à ses obligations, l&apos;autre partie peut résilier
              le contrat de plein droit après mise en demeure restée sans effet pendant 15 jours. En cas de
              résiliation à l&apos;initiative du client, les prestations déjà réalisées restent dues.
            </p>

            <h3>12. Droit applicable et juridiction compétente</h3>
            <p>
              Les présentes CGV sont régies par le droit français. À défaut de résolution amiable, tout litige
              relatif à leur interprétation et/ou à leur exécution relève des tribunaux compétents de Paris.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default Legal
