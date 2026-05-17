import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

/**
 * Helpers de test pour démarrer une instance Mongo in-memory partagée par
 * une suite vitest. À utiliser pour les tests d'intégration des routes agent.
 *
 * Pattern d'usage :
 *
 *   import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
 *
 *   beforeAll(setupMongo)
 *   afterAll(teardownMongo)
 *   beforeEach(clearDb)
 */

let server: MongoMemoryServer | null = null

export async function setupMongo(): Promise<void> {
  if (server) return
  server = await MongoMemoryServer.create()
  await mongoose.connect(server.getUri())
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
