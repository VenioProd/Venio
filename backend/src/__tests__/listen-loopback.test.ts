import { expect, it } from 'vitest'
import { createServer, type ListenOptions, type Server } from 'node:net'
import { promisify } from 'node:util'

it('réserve les ports implicites en IPv4 et conserve les hôtes explicites', async () => {
  const listeners: Array<(server: Server, ready: () => void) => void> = [
    (server, ready) => {
      server.listen()
      server.once('listening', ready)
    },
    (server, ready) => {
      server.listen(0)
      server.once('listening', ready)
    },
    (server, ready) => {
      server.listen(0, ready)
    },
    (server, ready) => {
      server.listen({ port: 0 }, ready)
    },
    (server, ready) => {
      server.listen(0, '127.0.0.1', ready)
    },
    (server, ready) => {
      server.listen({ port: 0, host: '127.0.0.1' }, ready)
    },
  ]
  for (const listen of listeners) {
    const server = createServer()
    try {
      await new Promise<void>((resolve) => listen(server, resolve))
      expect(server.address()).toMatchObject({ address: '127.0.0.1', family: 'IPv4' })
    } finally {
      await promisify(server.close.bind(server))()
    }
  }
  const server = createServer()
  try {
    await new Promise<void>((resolve) => server.listen({ port: 0, host: '0.0.0.0' } satisfies ListenOptions, resolve))
    expect(server.address()).toMatchObject({ address: '0.0.0.0' })
  } finally {
    await promisify(server.close.bind(server))()
  }
})
