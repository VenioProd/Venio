import mongoose from 'mongoose'

/**
 * Hook global Jest : entre chaque test, on vide toutes les collections de la
 * base mémoire afin que les suites soient indépendantes les unes des autres.
 *
 * On NE déconnecte PAS Mongoose ici (chaque suite gère son cycle de vie via
 * connectTestDb / disconnectTestDb dans beforeAll / afterAll).
 */
afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return
  const collections = mongoose.connection.collections
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  )
})
