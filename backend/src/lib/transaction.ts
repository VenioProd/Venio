import mongoose, { type ClientSession } from 'mongoose'

/**
 * Transactions Mongo. Elles exigent un replica set (mono-nœud suffit) : sur un
 * mongod autonome, on échoue tout de suite avec un message explicite plutôt que
 * d'écrire à moitié.
 *
 * Les collections et index des modèles utilisés doivent exister avant la
 * transaction (pas de création d'index à l'intérieur) : appeler `Model.init()`
 * au démarrage ou dans le setup des tests.
 */

let supportChecked: Promise<void> | null = null

async function checkSupport(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) throw transactionError('Transactions indisponibles : aucune connexion MongoDB')
  const hello = (await db.admin().command({ hello: 1 })) as { setName?: string; msg?: string }
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw transactionError('Transactions indisponibles : MongoDB doit tourner en replica set (mono-nœud suffit)')
  }
}

function transactionError(message: string): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number }
  err.status = 503
  return err
}

export async function assertTransactionsSupported(): Promise<void> {
  supportChecked ??= checkSupport().catch((err: unknown) => {
    supportChecked = null
    throw err
  })
  return supportChecked
}

/**
 * Exécute `fn` dans une transaction : tout est validé ensemble, ou rien.
 * Le pilote rejoue `fn` sur erreur transitoire : elle ne doit donc avoir aucun
 * effet hors base (e-mail, webhook) et passer `session` à chaque lecture et écriture.
 */
export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  await assertTransactionsSupported()
  return mongoose.connection.transaction(fn)
}

/** Réservé aux tests : oublie le résultat du contrôle après un changement de serveur. */
export function resetTransactionSupportCache(): void {
  supportChecked = null
}
