import type { Request, Response, NextFunction } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import requireMfa from './mfa.js'
import User from '../models/User.js'

vi.mock('../models/User.js', () => ({
  default: {
    findById: vi.fn(),
  },
}))

function response() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
}

function findUser(twoFactorEnabled: boolean) {
  vi.mocked(User.findById).mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve({ twoFactorEnabled }),
    }),
  } as any)
}

describe('requireMfa middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows non-privileged roles without a step-up claim', async () => {
    const req = { user: { id: 'u1', role: 'MANAGER' } } as Partial<Request> as Request
    const res = response()
    const next = vi.fn() as NextFunction

    await requireMfa(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(User.findById).not.toHaveBeenCalled()
  })

  it('allows privileged roles with a recent step-up claim', async () => {
    const req = { user: { id: 'u1', role: 'SUPER_ADMIN', mfaVerifiedAt: Date.now() } } as Partial<Request> as Request
    const res = response()
    const next = vi.fn() as NextFunction

    await requireMfa(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(User.findById).not.toHaveBeenCalled()
  })

  it('requires step-up when MFA is configured but the claim is missing', async () => {
    findUser(true)
    const req = { user: { id: 'u1', role: 'ADMIN' } } as Partial<Request> as Request
    const res = response()
    const next = vi.fn() as NextFunction

    await requireMfa(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'MFA_STEP_UP_REQUIRED' }))
  })

  it('requires setup when MFA is not configured', async () => {
    findUser(false)
    const req = { user: { id: 'u1', role: 'SUPER_ADMIN' } } as Partial<Request> as Request
    const res = response()
    const next = vi.fn() as NextFunction

    await requireMfa(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'MFA_SETUP_REQUIRED' }))
  })
})
