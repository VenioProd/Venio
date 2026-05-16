import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod = null

/**
 * Démarre un MongoDB en mémoire et y connecte Mongoose. À appeler dans le
 * beforeAll de chaque suite. Réutilise l'instance si elle existe déjà.
 *
 * Définit aussi quelques variables d'environnement requises par le code applicatif
 * (JWT_SECRET, ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS=0 pour autoriser les modifs
 * en test, NODE_ENV=test pour désactiver morgan dans createApp).
 */
export async function connectTestDb() {
  if (process.env.NODE_ENV !== 'test') process.env.NODE_ENV = 'test'
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test_jwt_secret_xxx'
  if (!process.env.ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS) {
    process.env.ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS = '0'
  }

  if (mongoose.connection.readyState === 1) {
    // déjà connecté (ex: première suite ayant tourné dans le même process)
    return
  }

  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  await mongoose.connect(process.env.MONGODB_URI)
}

/**
 * Ferme proprement la connexion Mongoose puis arrête mongod.
 * À appeler dans le afterAll de chaque suite.
 */
export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (mongod) {
    await mongod.stop()
    mongod = null
  }
}
