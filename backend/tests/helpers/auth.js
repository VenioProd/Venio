import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import User from '../../src/models/User.js'

/**
 * Crée un utilisateur admin de test et renvoie le user doc + un JWT prêt à
 * être utilisé dans le header Authorization.
 *
 * @param {Object} options
 * @param {string} [options.role='SUPER_ADMIN'] — Rôle à attribuer (SUPER_ADMIN, ADMIN, VIEWER)
 * @param {string} [options.email] — email custom (par défaut généré)
 * @returns {Promise<{ user: object, token: string }>}
 */
export async function createTestAdmin({ role = 'SUPER_ADMIN', email } = {}) {
  // bcrypt rounds = 4 → tests rapides (le hash est jetable)
  const passwordHash = await bcrypt.hash('test1234', 4)
  const user = await User.create({
    email: email || `admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`,
    name: 'Test Admin',
    role,
    passwordHash,
  })
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role },
    process.env.JWT_SECRET
  )
  return { user, token }
}

/**
 * Helper pour construire l'objet `{ Authorization: 'Bearer …' }` à passer à
 * supertest via `.set(authHeader(token))`.
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}
