import mongoose from 'mongoose'
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server'

/**
 * Helpers de test pour démarrer une instance Mongo en mémoire pour un
 * fichier de tests. Les fichiers étant sérialisés via fileParallelism:false,
 * une seule instance vit à la fois — pas de saturation.
 *
 * Pattern d'usage :
 *
 *   beforeAll(setupMongo)
 *   afterAll(teardownMongo)
 *   beforeEach(clearDb)
 */

let server: MongoMemoryServer | MongoMemoryReplSet | null = null

export async function setupMongo(): Promise<void> {
  if (server) return
  server = await MongoMemoryServer.create()
  await mongoose.connect(server.getUri())
}

/**
 * Variante replica set mono-nœud, pour les tests qui ont besoin de transactions.
 * S'utilise à la place de setupMongo, avec le même teardownMongo.
 */
export async function setupMongoReplSet(): Promise<void> {
  if (server) return
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  // Mongoose tient la connexion pour morte quand `Date.now()` s'écarte de plus de
  // deux battements du dernier reçu : un test qui fige `Date` (vi.useFakeTimers)
  // la ferait « tomber » au premier battement reçu sous l'autre horloge.
  await mongoose.connect(server.getUri(), { heartbeatFrequencyMS: 365 * 86_400_000 })
}

export async function teardownMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (server) {
    await server.stop()
    server = null
  }
}

export async function clearDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return
  const collections = mongoose.connection.collections
  for (const name in collections) {
    await collections[name]!.deleteMany({})
  }
}
