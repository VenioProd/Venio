import type { IncomingMessage, Server } from 'http'
import type { Duplex } from 'stream'
import mongoose from 'mongoose'
import twilio from 'twilio'
import { WebSocketServer, type WebSocket } from 'ws'
import Call from '../../models/Call.js'
import { telephonyConfig, type TelephonyConfig } from '../telephony/index.js'
import logger from '../logger.js'
import { liveProviderConfig } from './assemblyai.js'
import { isValidStreamToken, LIVE_STREAM_PATH, liveEligible, liveStreamUrl, openLiveSession } from './index.js'

/**
 * Serveur WebSocket des flux Twilio (`<Start><Stream>`), branché sur le
 * serveur HTTP de l'API à côté de socket.io. Deux preuves sont exigées :
 * - à l'ouverture, `X-Twilio-Signature` (HMAC du jeton du compte sur l'URL du flux) ;
 * - au message `start`, le compte, l'appel parent attaché (`providerCallSid`)
 *   et un jeton propre à l'appel, car les `<Parameter>` ne sont pas signés.
 * Un flux qui ne prouve rien dans les 10 s est fermé. Aucun audio n'est écrit.
 */

const START_TIMEOUT_MS = 10_000

function validHandshake(config: TelephonyConfig, req: IncomingMessage): boolean {
  const signature = req.headers['x-twilio-signature']
  if (typeof signature !== 'string' || !signature) return false
  const wss = liveStreamUrl(config)
  const https = wss.replace(/^wss:/, 'https:')
  // La doc Twilio conseille d'essayer aussi avec une barre finale pour les poignées de main WebSocket.
  return [wss, `${wss}/`, https, `${https}/`].some((url) =>
    twilio.validateRequest(config.authToken, signature, url, {}),
  )
}

function refuse(socket: Duplex, status: string) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

interface TwilioStart {
  streamSid?: unknown
  accountSid?: unknown
  callSid?: unknown
  customParameters?: { callId?: unknown; token?: unknown }
}

function acceptStream(socket: WebSocket, config: TelephonyConfig) {
  let session: ReturnType<typeof openLiveSession> = null
  let starting = false
  const close = () => {
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) socket.close(1000)
  }
  const deadline = setTimeout(() => {
    if (!session) socket.terminate()
  }, START_TIMEOUT_MS)
  deadline.unref?.()

  async function start(data: TwilioStart) {
    const callId = data.customParameters?.callId
    const callSid = data.callSid
    const streamSid = data.streamSid
    if (
      data.accountSid !== config.accountSid ||
      typeof callSid !== 'string' ||
      typeof streamSid !== 'string' ||
      !mongoose.isObjectIdOrHexString(callId) ||
      !isValidStreamToken(config, String(callId), data.customParameters?.token)
    )
      return close()
    const call = await Call.findOne({ _id: callId, providerCallSid: callSid }).select('status recording').lean()
    if (!call || !(await liveEligible(call)) || socket.readyState !== socket.OPEN) return close()
    session = openLiveSession({ callId: String(callId), callSid, streamSid, close })
    if (!session) close()
  }

  socket.on('message', (raw, isBinary) => {
    if (isBinary) return
    let message: {
      event?: unknown
      streamSid?: unknown
      start?: TwilioStart
      media?: { track?: unknown; payload?: unknown }
    }
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }
    if (message.event === 'media') {
      if (session && message.streamSid === session.streamSid)
        session.onMedia(message.media?.track, message.media?.payload)
    } else if (message.event === 'start' && !starting) {
      starting = true
      void start({ ...message.start, streamSid: message.start?.streamSid ?? message.streamSid }).catch((err: Error) => {
        logger.warn({ detail: err.message.slice(0, 120) }, 'direct: ouverture du flux')
        close()
      })
    } else if (message.event === 'stop') {
      session?.stop('ENDED')
      close()
    }
  })
  socket.on('close', () => {
    clearTimeout(deadline)
    session?.stop('ENDED')
  })
  socket.on('error', () => socket.terminate())
}

/** Branche le serveur des flux sur le serveur HTTP ; les autres chemins (socket.io) ne sont pas touchés. */
export function attachLiveTranscriptionServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if ((req.url ?? '').split('?')[0]?.replace(/\/+$/, '') !== LIVE_STREAM_PATH) return
    const config = telephonyConfig()
    if (!config || !liveProviderConfig()) return refuse(socket, '503 Service Unavailable')
    if (!validHandshake(config, req)) return refuse(socket, '403 Forbidden')
    wss.handleUpgrade(req, socket, head, (ws) => acceptStream(ws, config))
  })
  return wss
}
