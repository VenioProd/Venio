import { Server } from 'node:net'
import dns from 'node:dns'

const listen = Server.prototype.listen

// Le port réservé et la connexion Supertest doivent utiliser la même interface.
Server.prototype.listen = function (this: Server, ...args: unknown[]) {
  const options = args[0]
  let implicitHost = false
  if (options === undefined || typeof options === 'number') {
    args[0] ??= 0
    if (typeof args[1] !== 'string') {
      args.splice(1, 0, '127.0.0.1')
      implicitHost = true
    }
  } else if (options && typeof options === 'object' && 'port' in options && !('host' in options)) {
    args[0] = { ...options, host: '127.0.0.1' }
    implicitHost = true
  }
  if (!implicitHost) return Reflect.apply(listen, this, args) as Server

  // Node résout même une IP littérale au prochain tick ; Supertest lit le port immédiatement.
  const lookup = dns.lookup
  dns.lookup = ((
    hostname: string,
    options: dns.LookupAllOptions,
    callback: (err: null, addresses: dns.LookupAddress[]) => void,
  ) => {
    if (hostname === '127.0.0.1' && options.all) return callback(null, [{ address: hostname, family: 4 }])
    return Reflect.apply(lookup, dns, [hostname, options, callback])
  }) as typeof dns.lookup
  try {
    return Reflect.apply(listen, this, args) as Server
  } finally {
    dns.lookup = lookup
  }
} as typeof listen
