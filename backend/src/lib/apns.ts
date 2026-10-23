import { connect, type ClientHttp2Session } from 'node:http2'
import { sign } from 'node:crypto'
import MobileDevice, { type ApnsEnvironment } from '../models/MobileDevice.js'
import type { PushPayload } from './webPush.js'
import logger from './logger.js'

const sessions = new Map<string, ClientHttp2Session>()
let cachedToken: { value: string; issuedAt: number } | undefined
let disabledLogged = false

function configuration() {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (keyId && teamId && bundleId && privateKey) return { keyId, teamId, bundleId, privateKey }
  if (!disabledLogged) {
    logger.info('[apns] Envoi désactivé : configuration incomplète')
    disabledLogged = true
  }
  return null
}

function providerToken(config: NonNullable<ReturnType<typeof configuration>>): string {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now - cachedToken.issuedAt < 50 * 60) return cachedToken.value
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now })).toString('base64url')
  const input = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(input), { key: config.privateKey, dsaEncoding: 'ieee-p1363' })
  cachedToken = { value: `${input}.${signature.toString('base64url')}`, issuedAt: now }
  return cachedToken.value
}

function sessionFor(environment: ApnsEnvironment): ClientHttp2Session {
  const host = environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const existing = sessions.get(host)
  if (existing && !existing.closed && !existing.destroyed) return existing
  const session = connect(`https://${host}`)
  sessions.set(host, session)
  const discard = () => {
    if (sessions.get(host) === session) sessions.delete(host)
  }
  session.on('error', () => {
    discard()
    session.destroy()
    logger.warn('[apns] Erreur de connexion')
  })
  session.on('goaway', () => {
    discard()
    session.close()
  })
  session.on('close', discard)
  return session
}

function send(session: ClientHttp2Session, token: string, bundleId: string, authorization: string, body: string) {
  return new Promise<{ status: number; reason?: string }>((resolve, reject) => {
    const stream = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${authorization}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
    })
    let status = 0
    let response = ''
    stream.setEncoding('utf8')
    stream.setTimeout(10000, () => {
      reject(new Error('Délai APNs dépassé'))
      stream.close()
    })
    stream.on('response', (headers) => { status = Number(headers[':status']) })
    stream.on('data', (chunk: string) => { response += chunk })
    stream.on('error', reject)
    stream.on('end', () => {
      let reason: string | undefined
      try {
        reason = JSON.parse(response).reason
      } catch {
        // Une réponse réussie est vide.
      }
      resolve({ status, reason })
    })
    stream.on('close', () => reject(new Error('Flux APNs fermé')))
    stream.end(body)
  })
}

export async function sendApnsToUser(userId: string, payload: PushPayload): Promise<void> {
  const config = configuration()
  if (!config) return
  const devices = await MobileDevice.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    apnsToken: { $type: 'string', $ne: '' },
  }).lean()
  if (!devices.length) return
  const authorization = providerToken(config)
  // Les métadonnées Web Push peuvent contenir des données personnelles : seul l'identifiant est repris.
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body || '' },
      sound: 'default',
      ...(typeof payload.unreadCount === 'number' ? { badge: payload.unreadCount } : {}),
      'thread-id': payload.tag,
    },
    type: payload.tag,
    link: payload.link || '/',
    notificationId: payload.data?.notificationId ?? null,
  })
  await Promise.all(
    devices.map(async (device) => {
      if (!device.apnsToken || !device.apnsEnvironment) return
      try {
        const { status, reason } = await send(
          sessionFor(device.apnsEnvironment), device.apnsToken, config.bundleId, authorization, body,
        )
        if (status === 410 || (status === 400 && ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason || ''))) {
          // Un jeton remplacé pendant l'envoi ne doit pas être effacé par une ancienne réponse.
          await MobileDevice.updateOne(
            { _id: device._id, apnsToken: device.apnsToken, apnsEnvironment: device.apnsEnvironment },
            { $set: { apnsToken: null, apnsEnvironment: null } },
          )
        } else if (status !== 200) {
          logger.warn({ data: { deviceId: String(device._id), status } }, '[apns] Envoi refusé')
        }
      } catch {
        logger.warn({ data: { deviceId: String(device._id) } }, '[apns] Échec envoi')
      }
    }),
  )
}
