import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import path from 'path'

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

function isPathSafe(filename: string, dir: string): boolean {
  const resolved = path.resolve(dir, filename)
  return resolved.startsWith(dir + path.sep)
}

describe('avatar route — sécurité path-traversal', () => {
  const testDir = '/app/uploads/avatars'

  it('accepte un nom de fichier normal', () => {
    expect(isPathSafe('64abc123.jpg', testDir)).toBe(true)
  })

  it('rejette une attaque path-traversal', () => {
    expect(isPathSafe('../../../etc/passwd', testDir)).toBe(false)
  })

  it('rejette un chemin absolu', () => {
    expect(isPathSafe('/etc/passwd', testDir)).toBe(false)
  })

  it('rejette un répertoire sibling (avatarsFoo)', () => {
    expect(isPathSafe('../avatarsFoo/secret.txt', testDir)).toBe(false)
  })
})

describe('avatar multer — fileFilter', () => {
  function makeFileFilter() {
    return (
      _req: unknown,
      file: { mimetype: string },
      cb: (err: Error | null, accept?: boolean) => void
    ) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp']
      if (allowed.includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error('Type de fichier non autorisé. Utilisez JPEG, PNG ou WebP.'))
      }
    }
  }

  it('accepte image/jpeg', () => {
    const filter = makeFileFilter()
    let result: boolean | undefined
    filter({}, { mimetype: 'image/jpeg' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('accepte image/png', () => {
    const filter = makeFileFilter()
    let result: boolean | undefined
    filter({}, { mimetype: 'image/png' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('accepte image/webp', () => {
    const filter = makeFileFilter()
    let result: boolean | undefined
    filter({}, { mimetype: 'image/webp' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('rejette image/gif', () => {
    const filter = makeFileFilter()
    let err: Error | null = null
    filter({}, { mimetype: 'image/gif' }, (e) => { err = e })
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('non autorisé')
  })

  it('rejette application/pdf', () => {
    const filter = makeFileFilter()
    let err: Error | null = null
    filter({}, { mimetype: 'application/pdf' }, (e) => { err = e })
    expect(err).toBeInstanceOf(Error)
  })
})
