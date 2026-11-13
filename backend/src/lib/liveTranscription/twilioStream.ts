import twilio from 'twilio'
import type { TelephonyConfig } from '../telephony/index.js'

/** Arrête le flux chez Twilio (API REST) : l'audio cesse de quitter l'opérateur. Isolé pour être simulé dans les tests. */
export async function stopTwilioStream(config: TelephonyConfig, callSid: string, streamSid: string): Promise<void> {
  const client = twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    region: config.region,
    edge: config.edge,
  })
  await client.calls(callSid).streams(streamSid).update({ status: 'stopped' })
}
