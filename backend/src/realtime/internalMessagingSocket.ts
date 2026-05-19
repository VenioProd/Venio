import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import type { JwtPayload } from '../types/express.js'
import { isAdminRole } from '../lib/permissions.js'
import {
  canAccessConversation,
  createMessage,
  markConversationRead,
} from '../services/internalMessaging.js'
import { setIo } from './ioSingleton.js'

export function initInternalMessagingSocket(server: HttpServer, origin: string) {
  const io = new Server(server, {
    cors: {
      origin,
      credentials: true,
    },
    path: '/socket.io',
  })

  setIo(io)

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '')
    if (!token) return next(new Error('Unauthorized'))
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
      if (!isAdminRole(payload.role)) return next(new Error('Forbidden'))
      socket.data.user = payload
      return next()
    } catch {
      return next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload
    socket.join(`user:${user.id}`)

    socket.on('conversation:join', async ({ conversationId }: { conversationId: string }, ack?: (payload: { ok: boolean; error?: string }) => void) => {
      try {
        if (!(await canAccessConversation(conversationId, user))) {
          ack?.({ ok: false, error: 'Forbidden' })
          return
        }
        socket.join(`conversation:${conversationId}`)
        ack?.({ ok: true })
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message })
      }
    })

    socket.on('conversation:leave', ({ conversationId }: { conversationId: string }) => {
      socket.leave(`conversation:${conversationId}`)
    })

    socket.on('message:new', async (
      payload: { conversationId: string; content: string; parentMessage?: string | null },
      ack?: (payload: { ok: boolean; message?: unknown; error?: string }) => void
    ) => {
      try {
        const message = await createMessage(user, payload.conversationId, {
          content: payload.content,
          parentMessage: payload.parentMessage || null,
        })
        io.to(`conversation:${payload.conversationId}`).emit('message:created', { message })
        ack?.({ ok: true, message })
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message })
      }
    })

    socket.on('message:read', async ({ conversationId }: { conversationId: string }) => {
      try {
        await markConversationRead(user, conversationId)
        io.to(`conversation:${conversationId}`).emit('message:read', {
          conversationId,
          userId: user.id,
          readAt: new Date().toISOString(),
        })
      } catch {
        // Ignore transient socket read failures; REST endpoint remains source of truth.
      }
    })

    socket.on('typing:start', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId: user.id, name: user.name })
    })

    socket.on('typing:stop', ({ conversationId }: { conversationId: string }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId: user.id })
    })

    socket.broadcast.emit('presence:update', { userId: user.id, status: 'online' })
    socket.on('disconnect', () => {
      socket.broadcast.emit('presence:update', { userId: user.id, status: 'offline' })
    })
  })

  return io
}
