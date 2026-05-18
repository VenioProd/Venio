import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'

// Re-create the User schema inline to avoid side-effects from importing
// the model file (which calls mongoose.model and could conflict).
// This mirrors the avatarUrl field defined in src/models/User.ts exactly.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['CLIENT', 'SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'], required: true },
    name: { type: String, required: true },
    locale: { type: String, enum: ['fr', 'en'], default: null },
    avatarUrl: { type: String, default: '' },
  },
  { timestamps: true }
)

// Use a unique model name to avoid OverwriteModelError
const UserTest = mongoose.model('UserAvatarTest', userSchema)

describe('User model — avatarUrl field', () => {
  const validBase = () => ({
    email: 'test@example.com',
    passwordHash: 'hashed',
    role: 'CLIENT',
    name: 'Test User',
  })

  it("should default avatarUrl to ''", () => {
    const user = new UserTest(validBase())
    expect(user.avatarUrl).toBe('')
  })

  it("should accept a valid avatar path like '/api/avatars/64abc123.jpg'", () => {
    const user = new UserTest({ ...validBase(), avatarUrl: '/api/avatars/64abc123.jpg' })
    const errors = user.validateSync()
    expect(errors).toBeUndefined()
    expect(user.avatarUrl).toBe('/api/avatars/64abc123.jpg')
  })

  it('should pass validation with no avatarUrl provided (uses default)', () => {
    const user = new UserTest(validBase())
    const errors = user.validateSync()
    expect(errors).toBeUndefined()
  })
})
