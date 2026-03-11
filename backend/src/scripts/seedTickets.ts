import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

import User from '../models/User.js'
import InternalTicket from '../models/InternalTicket.js'

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!)
  console.log('Connected to MongoDB')

  // Récupérer des admins existants
  const superAdmins = await User.find({ role: 'SUPER_ADMIN' }).limit(2)
  const admins = await User.find({ role: { $in: ['ADMIN', 'VIEWER', 'RH'] } }).limit(3)

  if (superAdmins.length === 0) {
    console.log('Aucun super admin trouvé, impossible de créer des tickets test')
    process.exit(1)
  }

  const allUsers = [...superAdmins, ...admins].filter(Boolean)
  const sa1 = superAdmins[0]
  const sa2 = superAdmins[1] || superAdmins[0]

  // Supprimer les anciens tickets test
  await InternalTicket.deleteMany({})
  console.log('Anciens tickets supprimés')

  const now = new Date()
  const ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const tickets = [
    // 1 — Ticket résolu avec réponse
    {
      title: 'Comment acceder aux maquettes Figma du projet Alyah ?',
      message: 'Bonjour, je travaille sur le projet Alyah et je n\'arrive pas a trouver le lien vers les maquettes Figma. Est-ce que quelqu\'un peut me donner l\'acces ?',
      category: 'QUESTION',
      priority: 'NORMALE',
      status: 'RESOLU',
      authorId: allUsers[Math.min(1, allUsers.length - 1)]._id,
      authorName: allUsers[Math.min(1, allUsers.length - 1)].name,
      createdAt: ago(5),
      updatedAt: ago(4),
      replies: [
        {
          authorId: sa1._id,
          authorName: sa1.name,
          message: 'Salut ! Je t\'ai envoye l\'invitation Figma sur ton email. Tu devrais recevoir le lien dans quelques minutes. N\'hesite pas si tu as besoin d\'autre chose.',
          createdAt: ago(4),
        },
      ],
    },
    // 2 — Ticket ouvert urgent
    {
      title: 'Bug critique sur la page de facturation',
      message: 'La page de facturation affiche une erreur 500 quand on essaie de generer un PDF pour les factures de plus de 10 lignes. Ca bloque la facturation du client TechnoVision. Merci de regarder en urgence.',
      category: 'PROBLEME',
      priority: 'URGENTE',
      status: 'OUVERT',
      authorId: allUsers[0]._id,
      authorName: allUsers[0].name,
      createdAt: ago(1),
      updatedAt: ago(1),
      replies: [],
    },
    // 3 — Ticket en cours avec discussion
    {
      title: 'Demande d\'ajout d\'un nouveau template de projet',
      message: 'Pour les projets de type "site vitrine", on repete toujours les memes etapes. Est-ce qu\'on pourrait creer un template avec les taches pre-remplies ?\n\nEtapes souhaitees :\n1. Brief client\n2. Maquettes\n3. Integration\n4. Tests\n5. Mise en ligne',
      category: 'DEMANDE',
      priority: 'HAUTE',
      status: 'EN_COURS',
      authorId: allUsers[Math.min(2, allUsers.length - 1)]._id,
      authorName: allUsers[Math.min(2, allUsers.length - 1)].name,
      createdAt: ago(3),
      updatedAt: ago(2),
      replies: [
        {
          authorId: sa1._id,
          authorName: sa1.name,
          message: 'Bonne idee ! Je vais regarder pour ajouter ca dans la section templates. Tu peux me lister les sous-taches pour chaque etape ?',
          createdAt: ago(2),
        },
        {
          authorId: allUsers[Math.min(2, allUsers.length - 1)]._id,
          authorName: allUsers[Math.min(2, allUsers.length - 1)].name,
          message: 'Pour le brief : reunion kickoff, questionnaire client, benchmark concurrence.\nPour les maquettes : wireframes, maquettes desktop, maquettes mobile, validation client.',
          createdAt: ago(2),
        },
      ],
    },
    // 4 — Ticket fermé
    {
      title: 'Probleme de connexion VPN',
      message: 'Je n\'arrive plus a me connecter au VPN depuis ce matin. J\'ai essaye de redemarrer et de reinstaller le client mais rien ne marche.',
      category: 'PROBLEME',
      priority: 'HAUTE',
      status: 'FERME',
      authorId: allUsers[Math.min(1, allUsers.length - 1)]._id,
      authorName: allUsers[Math.min(1, allUsers.length - 1)].name,
      createdAt: ago(10),
      updatedAt: ago(8),
      replies: [
        {
          authorId: sa2._id,
          authorName: sa2.name,
          message: 'Le certificat VPN a expire, je viens de le renouveler. Essaie de te reconnecter maintenant.',
          createdAt: ago(9),
        },
        {
          authorId: allUsers[Math.min(1, allUsers.length - 1)]._id,
          authorName: allUsers[Math.min(1, allUsers.length - 1)].name,
          message: 'Ca marche ! Merci beaucoup.',
          createdAt: ago(8),
        },
      ],
    },
    // 5 — Question simple ouverte
    {
      title: 'Ou trouver la documentation API ?',
      message: 'Je cherche la doc de l\'API pour integrer le webhook de notifications. C\'est sur Notion ou ailleurs ?',
      category: 'QUESTION',
      priority: 'BASSE',
      status: 'OUVERT',
      authorId: allUsers[Math.min(2, allUsers.length - 1)]._id,
      authorName: allUsers[Math.min(2, allUsers.length - 1)].name,
      createdAt: ago(0),
      updatedAt: ago(0),
      replies: [],
    },
    // 6 — Demande de matériel
    {
      title: 'Demande de deuxieme ecran',
      message: 'Bonjour, est-il possible d\'avoir un deuxieme ecran pour mon poste ? Ca m\'aiderait beaucoup pour le dev et le design en parallele.',
      category: 'DEMANDE',
      priority: 'BASSE',
      status: 'RESOLU',
      authorId: allUsers[0]._id,
      authorName: allUsers[0].name,
      createdAt: ago(15),
      updatedAt: ago(12),
      replies: [
        {
          authorId: sa1._id,
          authorName: sa1.name,
          message: 'Pas de souci, j\'ai commande un ecran 27" qui devrait arriver d\'ici vendredi. Je te previens quand il est la.',
          createdAt: ago(14),
        },
        {
          authorId: sa1._id,
          authorName: sa1.name,
          message: 'L\'ecran est arrive, tu peux le recuperer a l\'accueil.',
          createdAt: ago(12),
        },
      ],
    },
    // 7 — Ticket en cours
    {
      title: 'Mise a jour des accreditations Qualiopi',
      message: 'Il faut mettre a jour les documents de preuve pour le critere 4 (indicateurs 13 a 16) avant l\'audit du mois prochain. Qui s\'en occupe ?',
      category: 'QUESTION',
      priority: 'HAUTE',
      status: 'EN_COURS',
      authorId: allUsers[Math.min(1, allUsers.length - 1)]._id,
      authorName: allUsers[Math.min(1, allUsers.length - 1)].name,
      createdAt: ago(2),
      updatedAt: ago(1),
      replies: [
        {
          authorId: sa1._id,
          authorName: sa1.name,
          message: 'Je m\'en charge. Je vais uploader les documents sur la page Qualiopi cette semaine.',
          createdAt: ago(1),
        },
      ],
    },
  ]

  await InternalTicket.insertMany(tickets)
  console.log(`${tickets.length} tickets test crees avec succes !`)

  await mongoose.disconnect()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Erreur:', err)
  process.exit(1)
})
