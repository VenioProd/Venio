import GradientMeshBackground from '../components/GradientMeshBackground'
import SEO from '../components/SEO'
import './Legal.css'

const CGV = () => {
  return (
    <>
      <SEO
        title="Conditions Generales de Vente"
        description="Conditions generales de vente de Venio. Modalites contractuelles pour les prestations de services."
        noindex={true}
      />
      <GradientMeshBackground />
      <div className="legal-page">
        <section className="legal-hero">
          <h1>CONDITIONS GENERALES DE VENTE</h1>
        </section>

        <section className="legal-content">
          <div className="legal-section">
            <h2>Preambule</h2>
            <p>
              Les presentes conditions generales de vente (ci-apres les "CGV") regissent les relations contractuelles
              entre Venio et ses clients. Toute commande ou acceptation de devis implique l'acceptation sans reserve
              des presentes CGV.
            </p>

            <h3>1. Objet</h3>
            <p>
              Les presentes CGV s'appliquent a toutes les prestations de services proposees par Venio, notamment
              dans les domaines de la communication, du developpement web et applicatif, et du conseil strategique.
            </p>

            <h3>2. Prestations</h3>
            <p>
              Venio propose des services de :
            </p>
            <ul>
              <li>Communication & Branding : identites visuelles, strategies editoriales, contenus premium</li>
              <li>Developpement : sites web, plateformes metier, SaaS, integration IA</li>
              <li>Conseil strategique : positionnement, transformation digitale, strategie IA</li>
            </ul>
            <p>
              Chaque prestation fait l'objet d'un devis detaille precisant les modalites d'execution, les delais
              et les tarifs. Le devis est valable 30 jours a compter de sa date d'emission.
            </p>

            <h3>3. Commande et acceptation</h3>
            <p>
              Toute commande suppose l'acceptation prealable d'un devis. L'acceptation du devis par le client
              vaut commande ferme et definitive. La commande est reputee acceptee par Venio des reception d'un bon
              de commande signe ou d'un email de confirmation du client.
            </p>

            <h3>4. Tarifs</h3>
            <p>
              Les tarifs sont indiques en euros, hors taxes (HT). Ils sont valables pour la duree
              indiquee sur le devis. Venio se reserve le droit de modifier ses tarifs a tout moment, etant entendu
              que les tarifs figurant sur le devis accepte restent applicables pour la prestation concernee.
            </p>

            <h3>5. Modalites de paiement</h3>
            <p>
              Les modalites de paiement sont definies dans chaque devis et contrat. Generalement :
            </p>
            <ul>
              <li>Un acompte de 30% a 50% peut etre demande a la commande</li>
              <li>Le solde est exigible a la livraison de la prestation ou selon un echeancier convenu</li>
              <li>Le paiement s'effectue par virement bancaire ou cheque</li>
            </ul>
            <p>
              En cas de retard de paiement, des penalites de retard au taux de 3 fois le taux legal peuvent etre
              appliquees, ainsi qu'une indemnite forfaitaire pour frais de recouvrement de 40 euros.
            </p>

            <h3>6. Execution des prestations</h3>
            <p>
              Venio s'engage a executer les prestations avec diligence et selon les regles de l'art. Les delais
              indiques dans le devis sont donnes a titre indicatif. Tout retard dans l'execution ne pourra donner
              lieu a annulation de la commande ou a dommages et interets, sauf si le retard excede 30 jours et
              resulte d'une faute lourde de Venio.
            </p>

            <h3>7. Reception et reclamations</h3>
            <p>
              Le client dispose d'un delai de 8 jours a compter de la livraison pour formuler des reclamations
              concernant la conformite de la prestation. Passe ce delai, la prestation est reputee conforme et
              acceptee sans reserve.
            </p>

            <h3>8. Propriete intellectuelle</h3>
            <p>
              Les droits de propriete intellectuelle sur les prestations realisees sont transferes au client
              apres paiement integral de la facture, sauf mention contraire dans le contrat. Les elements
              preexistants (bibliotheques, frameworks, etc.) restent soumis a leurs licences respectives.
            </p>

            <h3>9. Confidentialite</h3>
            <p>
              Venio s'engage a respecter la confidentialite de toutes les informations communiquees par le client
              dans le cadre de l'execution de la prestation. Cette obligation perdure apres la fin de la mission.
            </p>

            <h3>10. Responsabilite</h3>
            <p>
              La responsabilite de Venio est limitee au montant de la prestation facturee. Venio ne pourra etre
              tenu responsable des dommages indirects (perte de clientele, perte de chiffre d'affaires, etc.)
              resultant de l'utilisation ou de l'impossibilite d'utiliser la prestation.
            </p>

            <h3>11. Resiliation</h3>
            <p>
              En cas de manquement grave de l'une des parties a ses obligations, l'autre partie peut resilier
              le contrat de plein droit apres mise en demeure restee sans effet pendant 15 jours. En cas de
              resiliation a l'initiative du client, les prestations deja realisees restent dues.
            </p>

            <h3>12. Droit applicable et juridiction competente</h3>
            <p>
              Les presentes CGV sont regies par le droit francais. A defaut de resolution amiable, tout litige
              relatif a leur interpretation et/ou a leur execution releve des tribunaux competents de Paris.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default CGV
