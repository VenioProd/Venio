import twilio from 'twilio'
import type { TelephonyConfig } from './index.js'

/** Appels sortants vers l'API REST de Twilio ; isolés pour être simulés dans les tests. */

/** Au-delà, l'audio n'est pas relu (une heure en MP3 32 kbit/s double piste ≈ 15 Mo). */
const MAX_AUDIO_BYTES = 64 * 1024 * 1024

function client(config: TelephonyConfig) {
  return twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    region: config.region,
    edge: config.edge,
  })
}

export async function hangupProviderCall(config: TelephonyConfig, callSid: string): Promise<void> {
  // Terminer la branche du navigateur (appel parent) coupe aussi la branche composée.
  await client(config).calls(callSid).update({ status: 'completed' })
}

/** Arrête l'enregistrement en cours ; `callSid` est l'appel parent, celui qui porte l'enregistrement de `<Dial>`. */
export async function stopProviderRecording(config: TelephonyConfig, callSid: string, recordingSid: string) {
  await client(config).calls(callSid).recordings(recordingSid).update({ status: 'stopped' })
}

/**
 * Efface l'enregistrement chez l'opérateur. Twilio ne supprime qu'un
 * enregistrement terminé (`completed`) ; un 404 vaut suppression déjà faite.
 */
export async function deleteProviderRecording(config: TelephonyConfig, recordingSid: string): Promise<void> {
  try {
    await client(config).recordings(recordingSid).remove()
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err
  }
}

/** Lit l'audio en mémoire (MP3, une piste par canal), jamais sur disque. */
export async function fetchProviderRecording(
  config: TelephonyConfig,
  recordingSid: string,
  channels: 1 | 2,
): Promise<Buffer> {
  const url =
    `https://api.${config.edge}.${config.region}.twilio.com/2010-04-01/Accounts/${config.accountSid}` +
    `/Recordings/${encodeURIComponent(recordingSid)}.mp3?RequestedChannels=${channels}`
  const auth = Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`).toString('base64')
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`RECORDING_FETCH_FAILED (HTTP ${res.status})`)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_AUDIO_BYTES) throw new Error('RECORDING_TOO_LARGE')
  const audio = Buffer.from(await res.arrayBuffer())
  if (audio.length > MAX_AUDIO_BYTES) throw new Error('RECORDING_TOO_LARGE')
  return audio
}

/**
 * Mode pont (lot P) : l'opérateur appelle le portable du commercial ; à la décroche il
 * demande `url` (signée), qui ne met en relation avec le prospect qu'après confirmation.
 */
export async function createBridgeCall(
  config: TelephonyConfig,
  input: { to: string; from: string; url: string; statusCallback: string },
): Promise<string> {
  const call = await client(config).calls.create({
    to: input.to,
    from: input.from,
    url: input.url,
    method: 'POST',
    statusCallback: input.statusCallback,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['completed'],
    timeout: 30,
  })
  return call.sid
}

/** Vérification du portable du mode pont : un appel qui lit le code, sans rien d'autre. */
export async function placeCodeCall(config: TelephonyConfig, input: { to: string; from: string; twiml: string }) {
  await client(config).calls.create({ to: input.to, from: input.from, twiml: input.twiml, timeout: 30 })
}
